import {
  type PlantingEndTag,
  type PlantingRecord,
  type PlantingState,
  type RotationWarning,
  type Season,
  getWaitYears,
} from "@farm-in-pocket/shared";
import { Hono } from "hono";
import { requireGridOwner, requirePlantingOwner } from "../lib/auth";

type Bindings = {
  DB: D1Database;
};

// このルーターは 3 種類の prefix で mount される:
//   /api/grids/:gridId/cells/:x/:y/plantings  (POST)
//   /api/plantings/:id                        (GET / PATCH / DELETE)
// それぞれを別 Hono にして index 側で個別 mount する。

const createApp = new Hono<{ Bindings: Bindings }>();
const itemApp = new Hono<{ Bindings: Bindings }>();

const VALID_STATES: readonly PlantingState[] = ["planted", "growing", "ended"];
const VALID_END_TAGS: readonly PlantingEndTag[] = [
  "bloomed",
  "fruited",
  "died",
  "disease",
  "pest",
  "failed",
  "removed",
];

interface PlantingRow {
  id: number;
  cell_id: number;
  plant_id: number;
  seed_product_id: number | null;
  state: PlantingState;
  seeding_date: string | null;
  germination_date: string | null;
  planting_date: string | null;
  end_date: string | null;
  end_tag: PlantingEndTag | null;
  seeding_depth_cm: number | null;
  plant_spacing_cm: number | null;
  row_spacing_cm: number | null;
  failure_memo: string | null;
  note: string | null;
}

function toPlantingRecord(row: PlantingRow): PlantingRecord {
  return {
    id: row.id,
    cellId: row.cell_id,
    plantId: row.plant_id,
    seedProductId: row.seed_product_id,
    state: row.state,
    seedingDate: row.seeding_date,
    germinationDate: row.germination_date,
    plantingDate: row.planting_date,
    endDate: row.end_date,
    endTag: row.end_tag,
    seedingDepthCm: row.seeding_depth_cm,
    plantSpacingCm: row.plant_spacing_cm,
    rowSpacingCm: row.row_spacing_cm,
    failureMemo: row.failure_memo,
    note: row.note,
  };
}

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
    confirmRotation?: unknown;
  }>();
  // Issue #23: 連作障害警告フラグ。
  // - undefined / true → 警告条件成立でも planting を作る（"分かった上で植える"）。
  //   既定で true 扱いなのは、旧クライアント（フラグ未送信）の互換性を壊さないため。
  // - false → 警告条件成立時は planting を作らず警告だけ返す。
  const confirmRotation: boolean = body.confirmRotation !== false;

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
  // Issue #23: 同時に作物名（japanese_name）も先取りする。警告ペイロードに含める旧 plant 名は
  // crop_history.plant_id 経由で JOIN で引くため、ここではこの planting で植える側の名前は持たない。
  const plant = await c.env.DB.prepare("SELECT id, family FROM plants WHERE id = ?")
    .bind(plantId)
    .first<{ id: number; family: string }>();
  if (!plant) return c.json({ error: "plant not found" }, 404);

  // Issue #23: 連作障害警告チェック。
  // 同じ座標 (grid_id, x, y) の crop_history に同 family の最新行があれば、推奨待機年数と比較する。
  // ended_at が NULL の行（=今まさに植わっている）も対象に含めて良い: 同 family が継続中なら警告すべき。
  // ただし削除時の DELETE 経路で history は残るので、計算は planted_at を基準にする。
  // plant_name は plants 経由（JOIN）。plants 削除済みなら null になるが、その場合は family だけで警告できる。
  const lastSameFamily = await c.env.DB.prepare(
    `SELECT ch.planted_at AS planted_at, p.japanese_name AS plant_name
       FROM crop_history ch
       LEFT JOIN plants p ON p.id = ch.plant_id
      WHERE ch.grid_id = ?
        AND ch.x = ?
        AND ch.y = ?
        AND ch.plant_family = ?
      ORDER BY ch.planted_at DESC, (ch.ended_at IS NULL) DESC, ch.id DESC
      LIMIT 1`,
  )
    .bind(gridId, x, y, plant.family)
    .first<{ planted_at: string | null; plant_name: string | null }>();

  let rotationWarning: RotationWarning | null = null;
  if (lastSameFamily?.planted_at) {
    const recommendedWaitYears = getWaitYears(plant.family);
    // 経過年数 = (today - lastPlantedAt) / 365.25 日。
    // 同じ日に植え替え（同年内）は yearsElapsed = 0 になる。0 < recommended なので警告対象。
    const lastDate = new Date(`${lastSameFamily.planted_at.slice(0, 10)}T00:00:00Z`);
    const now = new Date();
    let yearsElapsed = 0;
    if (!Number.isNaN(lastDate.getTime())) {
      const ms = now.getTime() - lastDate.getTime();
      yearsElapsed = Math.max(0, Math.round((ms / (1000 * 60 * 60 * 24 * 365.25)) * 10) / 10);
    }
    if (yearsElapsed < recommendedWaitYears) {
      rotationWarning = {
        family: plant.family,
        lastPlantedAt: lastSameFamily.planted_at.slice(0, 10),
        // plants が消えていたら "(削除済み)" にフォールバック。連作の重要情報は family なので、
        // 名前が無くても警告自体は出す。
        lastPlantName: lastSameFamily.plant_name ?? "(削除済み)",
        recommendedWaitYears,
        yearsElapsed,
      };
    }
  }

  // 警告条件成立 + クライアントが「警告だけ欲しい」と明示 (confirmRotation=false) なら、
  // ここで打ち切って planting は作らない。
  if (rotationWarning && !confirmRotation) {
    return c.json({ ok: false, error: "rotation_warning", rotationWarning }, 200);
  }

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
      ok: true,
      planting: {
        id: newId,
        cellId: cell.id,
        plantId,
        seedingDate,
        plantingDate,
        note,
      },
      // Issue #23: 警告条件成立で確認済み（confirmRotation=true）の場合は警告ペイロードも返し、
      // クライアントは「警告は出ていたが進めた」ことを記録/表示できる。条件不成立なら省略。
      ...(rotationWarning ? { rotationWarning } : {}),
    },
    201,
  );
});

// GET /api/plantings/:id?pubkey=<hex64>
// 単一 planting の詳細を取得する。CellDetail で「現在の作物」セクションに seeding_date / state /
// end_tag / failure_memo を出すために必要。
// 認可: requirePlantingOwner（grid のオーナーだけ取得できる）。
itemApp.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "invalid id" }, 400);
  }
  const auth = await requirePlantingOwner(c.env.DB, id, c.req.query("pubkey"));
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);

  const row = await c.env.DB.prepare(
    `SELECT id, cell_id, plant_id, seed_product_id, state,
            seeding_date, germination_date, planting_date, end_date, end_tag,
            seeding_depth_cm, plant_spacing_cm, row_spacing_cm, failure_memo, note
       FROM plantings WHERE id = ?`,
  )
    .bind(id)
    .first<PlantingRow>();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ planting: toPlantingRecord(row) });
});

// PATCH /api/plantings/:id
// Issue #29: 作物ライフサイクル状態遷移。
//   * body: { pubkey, state?, endTag?, endDate?, failureMemo?, note?, plantingDate? }
//   * state を "ended" に遷移するときは endTag 必須。endDate 省略時 today。
//     対応する crop_history.ended_at も同じ日付で埋める。
//   * state が "planted" / "growing" に戻るときは endTag / endDate / failureMemo を NULL にリセット。
//   * 未指定フィールドは現状維持。
//   * 認可: requirePlantingOwner。
itemApp.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "invalid id" }, 400);
  }

  const body = await c.req.json<{
    pubkey?: unknown;
    state?: unknown;
    endTag?: unknown;
    endDate?: unknown;
    failureMemo?: unknown;
    note?: unknown;
    plantingDate?: unknown;
  }>();

  const auth = await requirePlantingOwner(c.env.DB, id, body.pubkey);
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);
  const cellId = auth.cellId ?? null;

  // 現在の planting を取って、未指定フィールドの fallback と state 遷移の判定に使う。
  const current = await c.env.DB.prepare(
    `SELECT id, cell_id, plant_id, seed_product_id, state,
            seeding_date, germination_date, planting_date, end_date, end_tag,
            seeding_depth_cm, plant_spacing_cm, row_spacing_cm, failure_memo, note
       FROM plantings WHERE id = ?`,
  )
    .bind(id)
    .first<PlantingRow>();
  if (!current) return c.json({ error: "not found" }, 404);

  // state 検証
  let nextState: PlantingState = current.state;
  if (body.state !== undefined) {
    if (typeof body.state !== "string" || !VALID_STATES.includes(body.state as PlantingState)) {
      return c.json({ error: "invalid state" }, 400);
    }
    nextState = body.state as PlantingState;
  }

  // endTag 検証
  let nextEndTag: PlantingEndTag | null = current.end_tag;
  if (body.endTag !== undefined) {
    if (body.endTag === null) {
      nextEndTag = null;
    } else if (
      typeof body.endTag !== "string" ||
      !VALID_END_TAGS.includes(body.endTag as PlantingEndTag)
    ) {
      return c.json({ error: "invalid endTag" }, 400);
    } else {
      nextEndTag = body.endTag as PlantingEndTag;
    }
  }

  // endDate / failureMemo / note / plantingDate
  let nextEndDate: string | null = current.end_date;
  if (body.endDate !== undefined) {
    if (body.endDate === null) {
      nextEndDate = null;
    } else if (typeof body.endDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(body.endDate)) {
      nextEndDate = body.endDate.slice(0, 10);
    } else {
      return c.json({ error: "invalid endDate" }, 400);
    }
  }

  let nextFailureMemo: string | null = current.failure_memo;
  if (body.failureMemo !== undefined) {
    if (body.failureMemo === null) {
      nextFailureMemo = null;
    } else if (typeof body.failureMemo === "string") {
      nextFailureMemo = body.failureMemo;
    } else {
      return c.json({ error: "invalid failureMemo" }, 400);
    }
  }

  let nextNote: string | null = current.note;
  if (body.note !== undefined) {
    if (body.note === null) {
      nextNote = null;
    } else if (typeof body.note === "string") {
      nextNote = body.note;
    } else {
      return c.json({ error: "invalid note" }, 400);
    }
  }

  let nextPlantingDate: string | null = current.planting_date;
  if (body.plantingDate !== undefined) {
    if (body.plantingDate === null) {
      nextPlantingDate = null;
    } else if (
      typeof body.plantingDate === "string" &&
      /^\d{4}-\d{2}-\d{2}/.test(body.plantingDate)
    ) {
      nextPlantingDate = body.plantingDate.slice(0, 10);
    } else {
      return c.json({ error: "invalid plantingDate" }, 400);
    }
  }

  // state 遷移ルール
  // - ended に遷移: endTag 必須、endDate 省略時 today で埋める。
  // - planted / growing に戻る: endTag/endDate/failureMemo は NULL リセット。
  let cropHistoryEndDate: string | null = null;
  if (nextState === "ended") {
    if (!nextEndTag) {
      return c.json({ error: "endTag is required when state is ended" }, 400);
    }
    if (!nextEndDate) {
      nextEndDate = new Date().toISOString().slice(0, 10);
    }
    cropHistoryEndDate = nextEndDate;
  } else {
    // ended から戻る or もともと ended でない場合: end_* / failure_memo を NULL に倒す。
    nextEndTag = null;
    nextEndDate = null;
    nextFailureMemo = null;
  }

  await c.env.DB.prepare(
    `UPDATE plantings
        SET state = ?,
            end_tag = ?,
            end_date = ?,
            failure_memo = ?,
            note = ?,
            planting_date = ?,
            updated_at = datetime('now')
      WHERE id = ?`,
  )
    .bind(nextState, nextEndTag, nextEndDate, nextFailureMemo, nextNote, nextPlantingDate, id)
    .run();

  // state=ended なら対応する crop_history.ended_at を埋める。
  // 座標は cells 経由で引く（plantings 単体には grid_id/x/y を持たないため）。
  if (nextState === "ended" && cellId != null && cropHistoryEndDate) {
    const cellRow = await c.env.DB.prepare("SELECT grid_id, x, y FROM cells WHERE id = ?")
      .bind(cellId)
      .first<{ grid_id: string; x: number; y: number }>();
    if (cellRow) {
      await c.env.DB.prepare(
        `UPDATE crop_history
            SET ended_at = ?
          WHERE grid_id = ? AND x = ? AND y = ? AND ended_at IS NULL`,
      )
        .bind(cropHistoryEndDate, cellRow.grid_id, cellRow.x, cellRow.y)
        .run();
    }
  }

  const updated = await c.env.DB.prepare(
    `SELECT id, cell_id, plant_id, seed_product_id, state,
            seeding_date, germination_date, planting_date, end_date, end_tag,
            seeding_depth_cm, plant_spacing_cm, row_spacing_cm, failure_memo, note
       FROM plantings WHERE id = ?`,
  )
    .bind(id)
    .first<PlantingRow>();
  if (!updated) return c.json({ error: "vanished" }, 500);
  return c.json({ ok: true, planting: toPlantingRecord(updated) });
});

// DELETE /api/plantings/:id?pubkey=<hex64>
// NOTE: 当面は物理削除を維持する（破壊的変更回避）。state='ended' で論理削除に切り替える案は
// 別 Issue 化予定（kako-jun/farm-in-pocket#13 レビュー SHOULD #5）。
// Issue #29 では UI 側で「終了する」（PATCH state=ended）を推奨し、DELETE は据え置き。
//
// Issue #22: planting 自体は物理削除するが、crop_history は残す（連作管理の正本のため）。
// 対応する crop_history は ended_at を date('now') にだけ更新する。
itemApp.delete("/:id", async (c) => {
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

export { createApp as plantingsCreateRouter, itemApp as plantingsItemRouter };
