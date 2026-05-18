import type { Season } from "@farm-in-pocket/shared";
import { Hono } from "hono";
import { requireGridOwner, requirePlantingOwner } from "../lib/auth";

type Bindings = {
  DB: D1Database;
};

// このルーターは 2 種類の prefix で mount される:
//   /api/grids/:gridId/cells/:x/:y/plantings  (POST)
//   /api/plantings/:id                        (DELETE)
// それぞれを別 Hono にして index 側で個別 mount する。

const createApp = new Hono<{ Bindings: Bindings }>();
const deleteApp = new Hono<{ Bindings: Bindings }>();

// Issue #22: 座標ベース連作履歴
// 採用日（planting_date → seeding_date → today）から year と season を導出する。
// season: spring=3-5, summer=6-8, autumn=9-11, winter=12-2
function resolveYearAndSeason(
  plantingDate: string | null,
  seedingDate: string | null,
): { year: number; season: Season | null; plantedAt: string } {
  const source = plantingDate ?? seedingDate;
  let date: Date;
  if (source && /^\d{4}-\d{2}-\d{2}/.test(source)) {
    // 日付部分だけ抜く（時刻があっても OK）
    date = new Date(`${source.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) {
      date = new Date();
    }
  } else {
    date = new Date();
  }
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1; // 1..12
  let season: Season | null;
  if (month >= 3 && month <= 5) season = "spring";
  else if (month >= 6 && month <= 8) season = "summer";
  else if (month >= 9 && month <= 11) season = "autumn";
  else season = "winter"; // 12, 1, 2
  const plantedAt =
    source && source.length >= 10 ? source.slice(0, 10) : date.toISOString().slice(0, 10);
  return { year, season, plantedAt };
}

// POST /api/grids/:gridId/cells/:x/:y/plantings
createApp.post("/:gridId/cells/:x/:y/plantings", async (c) => {
  const gridId = c.req.param("gridId");
  const x = Number(c.req.param("x"));
  const y = Number(c.req.param("y"));
  if (!Number.isInteger(x) || x < 0 || x > 8) return c.json({ error: "invalid x" }, 400);
  if (!Number.isInteger(y) || y < 0 || y > 8) return c.json({ error: "invalid y" }, 400);

  const body = await c.req.json<{
    pubkey?: unknown;
    plantId?: unknown;
    seedingDate?: unknown;
    plantingDate?: unknown;
    note?: unknown;
  }>();

  const auth = await requireGridOwner(c.env.DB, gridId, body.pubkey);
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);

  const plantId = Number(body.plantId);
  if (!Number.isInteger(plantId) || plantId <= 0) {
    return c.json({ error: "invalid plantId" }, 400);
  }
  const seedingDate = typeof body.seedingDate === "string" ? body.seedingDate : null;
  const plantingDate = typeof body.plantingDate === "string" ? body.plantingDate : null;
  const note = typeof body.note === "string" ? body.note : null;

  // Issue #22: crop_history に固定保存するため family を denormalize で取る。
  const plant = await c.env.DB.prepare("SELECT id, family FROM plants WHERE id = ?")
    .bind(plantId)
    .first<{ id: number; family: string }>();
  if (!plant) return c.json({ error: "plant not found" }, 404);

  // cell が無ければ作る（grid 存在チェックも）
  const grid = await c.env.DB.prepare("SELECT id, size_x, size_y FROM grids WHERE id = ?")
    .bind(gridId)
    .first<{ id: string; size_x: number; size_y: number }>();
  if (!grid) return c.json({ error: "grid not found" }, 404);
  if (x >= grid.size_x || y >= grid.size_y) {
    return c.json({ error: "cell out of range" }, 400);
  }

  let cell = await c.env.DB.prepare(
    "SELECT id, current_planting_id FROM cells WHERE grid_id = ? AND x = ? AND y = ?",
  )
    .bind(gridId, x, y)
    .first<{ id: number; current_planting_id: number | null }>();
  if (!cell) {
    await c.env.DB.prepare("INSERT INTO cells (grid_id, x, y) VALUES (?, ?, ?)")
      .bind(gridId, x, y)
      .run();
    cell = await c.env.DB.prepare(
      "SELECT id, current_planting_id FROM cells WHERE grid_id = ? AND x = ? AND y = ?",
    )
      .bind(gridId, x, y)
      .first<{ id: number; current_planting_id: number | null }>();
  }
  if (!cell) return c.json({ error: "cell vanished" }, 500);

  // SHOULD #5: 既存 current_planting があれば ended にしてから新規 planting を作る。
  // ended にすれば history として残り、cells.current_planting_id は次の INSERT 後に上書きされる。
  if (cell.current_planting_id != null) {
    await c.env.DB.prepare(
      `UPDATE plantings
          SET state = 'ended',
              end_date = date('now'),
              updated_at = datetime('now')
        WHERE id = ?`,
    )
      .bind(cell.current_planting_id)
      .run();
    // Issue #22: 対応する crop_history の ended_at も更新する。
    // 同じ grid_id + x + y で ended_at IS NULL の最新行を ended にする
    // （複数あれば全て埋めて NULL を残さない）。
    await c.env.DB.prepare(
      `UPDATE crop_history
          SET ended_at = date('now')
        WHERE grid_id = ? AND x = ? AND y = ? AND ended_at IS NULL`,
    )
      .bind(gridId, x, y)
      .run();
  }

  const insertResult = await c.env.DB.prepare(
    `INSERT INTO plantings (cell_id, plant_id, seeding_date, planting_date, note)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(cell.id, plantId, seedingDate, plantingDate, note)
    .run();

  const newId = insertResult.meta.last_row_id;
  await c.env.DB.prepare(
    `UPDATE cells SET current_planting_id = ?, updated_at = datetime('now') WHERE id = ?`,
  )
    .bind(newId, cell.id)
    .run();

  // Issue #22: 座標ベース連作履歴を INSERT。
  // year / season は planting_date → seeding_date → today の優先順で決定。
  // plant_family は plants.family を凍結保存する（plants 改名/削除後も履歴を維持）。
  const { year, season, plantedAt } = resolveYearAndSeason(plantingDate, seedingDate);
  await c.env.DB.prepare(
    `INSERT INTO crop_history (grid_id, x, y, plant_id, plant_family, year, season, planted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(gridId, x, y, plantId, plant.family, year, season, plantedAt)
    .run();

  return c.json(
    {
      planting: {
        id: newId,
        cellId: cell.id,
        plantId,
        seedingDate,
        plantingDate,
        note,
      },
    },
    201,
  );
});

// DELETE /api/plantings/:id?pubkey=<hex64>
// NOTE: 当面は物理削除を維持する（破壊的変更回避）。state='ended' で論理削除に切り替える案は
// 別 Issue 化予定（kako-jun/farm-in-pocket#13 レビュー SHOULD #5）。
//
// Issue #22: planting 自体は物理削除するが、crop_history は残す（連作管理の正本のため）。
// 対応する crop_history は ended_at を date('now') にだけ更新する。
deleteApp.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "invalid id" }, 400);
  }

  const auth = await requirePlantingOwner(c.env.DB, id, c.req.query("pubkey"));
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);
  const cellId = auth.cellId ?? null;

  // 対応する crop_history の ended_at を埋める前に、cell の grid_id / x / y を取る。
  // history は座標ベース管理のため、planting からは cell を経由して座標を得る。
  if (cellId != null) {
    const cellRow = await c.env.DB.prepare("SELECT grid_id, x, y FROM cells WHERE id = ?")
      .bind(cellId)
      .first<{ grid_id: string; x: number; y: number }>();
    if (cellRow) {
      await c.env.DB.prepare(
        `UPDATE crop_history
            SET ended_at = date('now')
          WHERE grid_id = ? AND x = ? AND y = ? AND ended_at IS NULL`,
      )
        .bind(cellRow.grid_id, cellRow.x, cellRow.y)
        .run();
    }
  }

  await c.env.DB.prepare(
    `UPDATE cells SET current_planting_id = NULL, updated_at = datetime('now')
      WHERE id = ? AND current_planting_id = ?`,
  )
    .bind(cellId, id)
    .run();
  await c.env.DB.prepare("DELETE FROM plantings WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

export { createApp as plantingsCreateRouter, deleteApp as plantingsDeleteRouter };
