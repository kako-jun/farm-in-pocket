import { FARM_IN_POCKET_VERSION } from "@farm-in-pocket/shared";
import { Hono } from "hono";
import gridsRouter from "./routes/grids";
import { plantingsCreateRouter, plantingsDeleteRouter } from "./routes/plantings";
import plantsRouter from "./routes/plants";

type Bindings = {
  DB: D1Database;
  MYPACE_API_URL: string;
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

// Phase 1 routes (Issue #13)
// TODO(#16+): NIP-98 認可を導入する。現状は pubkey をクエリ/body で受ける Phase 1 範囲。
app.route("/api/grids", gridsRouter);
app.route("/api/grids", plantingsCreateRouter); // POST /api/grids/:gridId/cells/:x/:y/plantings
app.route("/api/plants", plantsRouter);
app.route("/api/plantings", plantingsDeleteRouter);

export default app;
