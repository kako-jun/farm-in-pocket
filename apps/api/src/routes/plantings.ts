import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
};

// このルーターは 2 種類の prefix で mount される:
//   /api/grids/:gridId/cells/:x/:y/plantings  (POST)
//   /api/plantings/:id                        (DELETE)
// それぞれを別 Hono にして index 側で個別 mount する。

const createApp = new Hono<{ Bindings: Bindings }>();
const deleteApp = new Hono<{ Bindings: Bindings }>();

// POST /api/grids/:gridId/cells/:x/:y/plantings
createApp.post("/:gridId/cells/:x/:y/plantings", async (c) => {
  const gridId = c.req.param("gridId");
  const x = Number(c.req.param("x"));
  const y = Number(c.req.param("y"));
  if (!Number.isInteger(x) || x < 0 || x > 8) return c.json({ error: "invalid x" }, 400);
  if (!Number.isInteger(y) || y < 0 || y > 8) return c.json({ error: "invalid y" }, 400);

  const body = await c.req.json<{
    plantId?: unknown;
    seedingDate?: unknown;
    plantingDate?: unknown;
    note?: unknown;
  }>();
  const plantId = Number(body.plantId);
  if (!Number.isInteger(plantId) || plantId <= 0) {
    return c.json({ error: "invalid plantId" }, 400);
  }
  const seedingDate = typeof body.seedingDate === "string" ? body.seedingDate : null;
  const plantingDate = typeof body.plantingDate === "string" ? body.plantingDate : null;
  const note = typeof body.note === "string" ? body.note : null;

  const plant = await c.env.DB.prepare("SELECT id FROM plants WHERE id = ?")
    .bind(plantId)
    .first<{ id: number }>();
  if (!plant) return c.json({ error: "plant not found" }, 404);

  // cell が無ければ作る（grid 存在チェックも）
  const grid = await c.env.DB.prepare("SELECT id, size_x, size_y FROM grids WHERE id = ?")
    .bind(gridId)
    .first<{ id: string; size_x: number; size_y: number }>();
  if (!grid) return c.json({ error: "grid not found" }, 404);
  if (x >= grid.size_x || y >= grid.size_y) {
    return c.json({ error: "cell out of range" }, 400);
  }

  let cell = await c.env.DB.prepare("SELECT id FROM cells WHERE grid_id = ? AND x = ? AND y = ?")
    .bind(gridId, x, y)
    .first<{ id: number }>();
  if (!cell) {
    await c.env.DB.prepare("INSERT INTO cells (grid_id, x, y) VALUES (?, ?, ?)")
      .bind(gridId, x, y)
      .run();
    cell = await c.env.DB.prepare("SELECT id FROM cells WHERE grid_id = ? AND x = ? AND y = ?")
      .bind(gridId, x, y)
      .first<{ id: number }>();
  }
  if (!cell) return c.json({ error: "cell vanished" }, 500);

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

// DELETE /api/plantings/:id
deleteApp.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "invalid id" }, 400);
  }
  const row = await c.env.DB.prepare("SELECT id, cell_id FROM plantings WHERE id = ?")
    .bind(id)
    .first<{ id: number; cell_id: number }>();
  if (!row) return c.json({ error: "not found" }, 404);

  await c.env.DB.prepare(
    `UPDATE cells SET current_planting_id = NULL, updated_at = datetime('now')
      WHERE id = ? AND current_planting_id = ?`,
  )
    .bind(row.cell_id, id)
    .run();
  await c.env.DB.prepare("DELETE FROM plantings WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

export { createApp as plantingsCreateRouter, deleteApp as plantingsDeleteRouter };
