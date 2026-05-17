import { FARM_IN_POCKET_VERSION } from "@farm-in-pocket/shared";
import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/health", (c) =>
  c.json({ status: "ok", service: "farm-in-pocket-api", version: FARM_IN_POCKET_VERSION }),
);

// D1 smoke endpoint: list user tables to confirm migration applied.
app.get("/db/health", async (c) => {
  const result = await c.env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name",
  ).all<{ name: string }>();
  const tables = (result.results ?? []).map((row) => row.name);
  return c.json({ status: "ok", tables, count: tables.length });
});

export default app;
