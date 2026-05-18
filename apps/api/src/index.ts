import { FARM_IN_POCKET_VERSION } from "@farm-in-pocket/shared";
import { Hono } from "hono";
import cellActionsRouter from "./routes/cell-actions";
import gridsRouter from "./routes/grids";
import { plantingsCreateRouter, plantingsItemRouter } from "./routes/plantings";
import plantsRouter from "./routes/plants";
import profilesRouter from "./routes/profiles";
import retrospectiveRouter from "./routes/retrospective";
import seedProductsRouter from "./routes/seed-products";
import { wateringPlantingsRouter, wateringUsersRouter } from "./routes/watering";
import weatherRouter from "./routes/weather";

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
app.route("/api/grids", cellActionsRouter); // POST/GET /api/grids/:gridId/cells/:x/:y/{nutrient,pesticide,records}
app.route("/api/plants", plantsRouter);
app.route("/api/plantings", plantingsItemRouter);
// Issue #31: 水やりリマインダー
//   /api/plantings/:plantingId/watering (GET/PUT)
//   /api/plantings/:plantingId/water    (POST)
app.route("/api/plantings", wateringPlantingsRouter);
// Issue #30: 振り返りビュー (カレンダー / 作物別 / グリッド履歴 / 失敗ログ)
app.route("/api/users", retrospectiveRouter);
// Issue #31: 「今日水やりすべき」一覧
//   /api/users/:pubkey/watering-due
app.route("/api/users", wateringUsersRouter);
// Issue #32: プロフィール（地域設定）と気象データ取得
//   /api/profiles/me (GET/PUT)
//   /api/weather?region=&date= (GET)
app.route("/api/profiles", profilesRouter);
app.route("/api/weather", weatherRouter);
// Issue #34: 種・苗マスター（コミュニティ参加型）
//   /api/seed-products (GET 検索 / POST 登録)
//   /api/seed-products/:id (GET)
//   /api/seed-products/:id/use (POST 利用カウント)
app.route("/api/seed-products", seedProductsRouter);

export default app;
