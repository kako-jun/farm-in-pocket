import type { PlantSummary } from "@farm-in-pocket/shared";
import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
};

interface PlantRow {
  id: number;
  name: string;
  name_en: string | null;
  family: string;
  category: string;
}

function toSummary(row: PlantRow): PlantSummary {
  return {
    id: row.id,
    name: row.name,
    nameEn: row.name_en,
    family: row.family,
    category: row.category,
  };
}

const app = new Hono<{ Bindings: Bindings }>();

// GET /api/plants?q=&family=&category=
app.get("/", async (c) => {
  const q = c.req.query("q")?.trim() ?? "";
  const family = c.req.query("family")?.trim() ?? "";
  const category = c.req.query("category")?.trim() ?? "";

  const where: string[] = [];
  const binds: unknown[] = [];
  if (q.length > 0) {
    where.push("(name LIKE ? OR name_en LIKE ?)");
    const like = `%${q}%`;
    binds.push(like, like);
  }
  if (family.length > 0) {
    where.push("family = ?");
    binds.push(family);
  }
  if (category.length > 0) {
    where.push("category = ?");
    binds.push(category);
  }
  const sql = `SELECT id, name, name_en, family, category FROM plants${
    where.length > 0 ? ` WHERE ${where.join(" AND ")}` : ""
  } ORDER BY id LIMIT 50`;
  const result = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all<PlantRow>();
  const plants = (result.results ?? []).map(toSummary);
  return c.json({ plants });
});

// GET /api/plants/:id
app.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "invalid id" }, 400);
  }
  const row = await c.env.DB.prepare(
    "SELECT id, name, name_en, family, category FROM plants WHERE id = ?",
  )
    .bind(id)
    .first<PlantRow>();
  if (!row) {
    return c.json({ error: "not found" }, 404);
  }
  return c.json({ plant: toSummary(row) });
});

export default app;
