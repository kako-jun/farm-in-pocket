import type {
  CellRecord,
  ContainerType,
  GridEnvironment,
  GridLighting,
  GridRecord,
  GridSummary,
  SoilType,
} from "@farm-in-pocket/shared";
import { isValidPubkeyHex } from "@farm-in-pocket/shared";
import { Hono } from "hono";
import { requireGridOwner } from "../lib/auth";
import { newId } from "../lib/uuid";

type Bindings = {
  DB: D1Database;
};

// TODO(#16+): NIP-98 認可を導入する。現状は pubkey をクエリ/body で受ける Phase 1 範囲。

const VALID_ENVIRONMENTS: readonly GridEnvironment[] = [
  "outdoor_sunny",
  "outdoor_partial_shade",
  "outdoor_shade",
  "indoor",
  "greenhouse",
];
const VALID_LIGHTING: readonly GridLighting[] = ["natural_only", "grow_light", "fluorescent_led"];
const VALID_CONTAINERS: readonly ContainerType[] = [
  "jiue",
  "planter",
  "pot",
  "container",
  "board_mounted",
  "hanging",
  "hydroponics",
  "other",
  "void",
];
const VALID_SOILS: readonly SoilType[] = [
  "potting_mix",
  "akadama",
  "leafmold",
  "hydroball",
  "sphagnum",
  "coconut_chips",
  "pumice",
  "sand",
  "water_only",
  "hydroponics_nutrient",
  "none",
  "other",
];

interface GridRow {
  id: string;
  user_pubkey: string;
  name: string;
  environment: GridEnvironment;
  lighting: GridLighting | null;
  size_x: number;
  size_y: number;
  sort_order: number;
  archived_at: string | null;
}

interface CellRow {
  id: number;
  grid_id: string;
  x: number;
  y: number;
  container_type: ContainerType | null;
  soil_type: SoilType | null;
  current_planting_id: number | null;
  current_plant_id: number | null;
  current_plant_name: string | null;
  last_fertilized_at: string | null;
  last_pesticide_at: string | null;
}

function toGridRecord(row: GridRow, cells: CellRecord[], summary?: GridSummary): GridRecord {
  return {
    id: row.id,
    userPubkey: row.user_pubkey,
    name: row.name,
    environment: row.environment,
    lighting: row.lighting,
    sizeX: row.size_x,
    sizeY: row.size_y,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
    cells,
    ...(summary ? { summary } : {}),
  };
}

function toCellRecord(row: CellRow): CellRecord {
  return {
    id: row.id,
    gridId: row.grid_id,
    x: row.x,
    y: row.y,
    containerType: row.container_type,
    soilType: row.soil_type,
    currentPlantingId: row.current_planting_id,
    currentPlantId: row.current_plant_id,
    currentPlantName: row.current_plant_name,
    lastFertilizedAt: row.last_fertilized_at ?? null,
    lastPesticideAt: row.last_pesticide_at ?? null,
  };
}

async function fetchCellsForGrid(db: D1Database, gridId: string): Promise<CellRecord[]> {
  // Issue #15: 各セルの最新施肥/農薬日付を持ってくる（バッジ表示用）。
  // サブクエリで cell_id ごとに MAX(applied_at) を取り、LEFT JOIN する。
  const result = await db
    .prepare(
      `SELECT c.id AS id,
              c.grid_id AS grid_id,
              c.x AS x,
              c.y AS y,
              c.container_type AS container_type,
              c.soil_type AS soil_type,
              c.current_planting_id AS current_planting_id,
              p.plant_id AS current_plant_id,
              pl.name AS current_plant_name,
              n.last_applied AS last_fertilized_at,
              pe.last_applied AS last_pesticide_at
         FROM cells c
         LEFT JOIN plantings p ON p.id = c.current_planting_id
         LEFT JOIN plants pl ON pl.id = p.plant_id
         LEFT JOIN (
           SELECT cell_id, MAX(applied_at) AS last_applied
             FROM nutrient_records
            GROUP BY cell_id
         ) n ON n.cell_id = c.id
         LEFT JOIN (
           SELECT cell_id, MAX(applied_at) AS last_applied
             FROM pesticide_records
            GROUP BY cell_id
         ) pe ON pe.cell_id = c.id
        WHERE c.grid_id = ?
        ORDER BY c.y, c.x`,
    )
    .bind(gridId)
    .all<CellRow>();
  return (result.results ?? []).map(toCellRecord);
}

// Issue #40: 各 grid のセル統計を 1 クエリで取得する（summary=true 用）。
// grid_id ごとに COUNT(*), planting 数, void 数を集計する。container 別件数は別クエリで取る。
async function fetchSummariesForUser(
  db: D1Database,
  pubkey: string,
): Promise<Map<string, GridSummary>> {
  const summaryRes = await db
    .prepare(
      `SELECT c.grid_id AS grid_id,
              COUNT(*) AS cell_count,
              SUM(CASE WHEN c.current_planting_id IS NOT NULL THEN 1 ELSE 0 END) AS planting_count,
              SUM(CASE WHEN c.container_type = 'void' THEN 1 ELSE 0 END) AS void_count
         FROM cells c
         JOIN grids g ON g.id = c.grid_id
        WHERE g.user_pubkey = ?
        GROUP BY c.grid_id`,
    )
    .bind(pubkey)
    .all<{
      grid_id: string;
      cell_count: number;
      planting_count: number;
      void_count: number;
    }>();
  const containerRes = await db
    .prepare(
      `SELECT c.grid_id AS grid_id,
              c.container_type AS container_type,
              COUNT(*) AS n
         FROM cells c
         JOIN grids g ON g.id = c.grid_id
        WHERE g.user_pubkey = ?
          AND c.container_type IS NOT NULL
        GROUP BY c.grid_id, c.container_type`,
    )
    .bind(pubkey)
    .all<{
      grid_id: string;
      container_type: string;
      n: number;
    }>();

  const byContainer = new Map<string, Record<string, number>>();
  for (const r of containerRes.results ?? []) {
    let m = byContainer.get(r.grid_id);
    if (!m) {
      m = {};
      byContainer.set(r.grid_id, m);
    }
    m[r.container_type] = r.n;
  }

  const out = new Map<string, GridSummary>();
  for (const r of summaryRes.results ?? []) {
    out.set(r.grid_id, {
      cellCount: r.cell_count ?? 0,
      plantingCount: r.planting_count ?? 0,
      voidCount: r.void_count ?? 0,
      cellsByContainer: byContainer.get(r.grid_id) ?? {},
    });
  }
  return out;
}

async function upsertProfile(db: D1Database, pubkey: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO profiles (pubkey) VALUES (?)
       ON CONFLICT(pubkey) DO NOTHING`,
    )
    .bind(pubkey)
    .run();
}

const app = new Hono<{ Bindings: Bindings }>();

// GET /api/grids?pubkey=<hex64>&includeArchived=true|false&summary=true|false
app.get("/", async (c) => {
  const pubkey = c.req.query("pubkey")?.toLowerCase();
  if (!pubkey || !isValidPubkeyHex(pubkey)) {
    return c.json({ error: "invalid pubkey" }, 400);
  }
  // Issue #40: 既定はアーカイブ非表示。?includeArchived=true で混ぜる。
  const includeArchived = c.req.query("includeArchived") === "true";
  // Issue #40: ?summary=true で各 grid に統計を詰めて返す。
  const withSummary = c.req.query("summary") === "true";

  const whereArchived = includeArchived ? "" : "AND archived_at IS NULL";
  const gridsRes = await c.env.DB.prepare(
    `SELECT id, user_pubkey, name, environment, lighting, size_x, size_y, sort_order, archived_at
       FROM grids WHERE user_pubkey = ? ${whereArchived} ORDER BY sort_order, created_at`,
  )
    .bind(pubkey)
    .all<GridRow>();
  const grids = gridsRes.results ?? [];
  const summaries = withSummary ? await fetchSummariesForUser(c.env.DB, pubkey) : null;
  const out: GridRecord[] = [];
  // TODO(Phase 2): N+1 解消。grids 取得後に IN(...) で全 cells を一括取得し JS 側で group_by する。
  // 現状は 1 ユーザー 1〜数 grid 想定なので問題なし。
  for (const g of grids) {
    const cells = await fetchCellsForGrid(c.env.DB, g.id);
    out.push(toGridRecord(g, cells, summaries?.get(g.id)));
  }
  return c.json({ grids: out });
});

// POST /api/grids
app.post("/", async (c) => {
  const body = await c.req.json<{
    pubkey?: unknown;
    name?: unknown;
    environment?: unknown;
    lighting?: unknown;
    sizeX?: unknown;
    sizeY?: unknown;
  }>();
  const pubkey = typeof body.pubkey === "string" ? body.pubkey.toLowerCase() : null;
  if (!pubkey || !isValidPubkeyHex(pubkey)) {
    return c.json({ error: "invalid pubkey" }, 400);
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length === 0 || name.length > 100) {
    return c.json({ error: "invalid name" }, 400);
  }
  const environment = body.environment as GridEnvironment;
  if (!VALID_ENVIRONMENTS.includes(environment)) {
    return c.json({ error: "invalid environment" }, 400);
  }
  let lighting: GridLighting | null = null;
  if (body.lighting !== undefined && body.lighting !== null) {
    if (!VALID_LIGHTING.includes(body.lighting as GridLighting)) {
      return c.json({ error: "invalid lighting" }, 400);
    }
    lighting = body.lighting as GridLighting;
  }
  const sizeX = Number(body.sizeX);
  const sizeY = Number(body.sizeY);
  if (!Number.isInteger(sizeX) || sizeX < 1 || sizeX > 9) {
    return c.json({ error: "invalid sizeX" }, 400);
  }
  if (!Number.isInteger(sizeY) || sizeY < 1 || sizeY > 9) {
    return c.json({ error: "invalid sizeY" }, 400);
  }

  await upsertProfile(c.env.DB, pubkey);
  const id = newId();
  await c.env.DB.prepare(
    `INSERT INTO grids (id, user_pubkey, name, environment, lighting, size_x, size_y)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, pubkey, name, environment, lighting, sizeX, sizeY)
    .run();

  const cells = await fetchCellsForGrid(c.env.DB, id);
  const grid: GridRecord = {
    id,
    userPubkey: pubkey,
    name,
    environment,
    lighting,
    sizeX,
    sizeY,
    sortOrder: 0,
    archivedAt: null,
    cells,
  };
  return c.json({ grid }, 201);
});

// PATCH /api/grids/:id
app.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    pubkey?: unknown;
    name?: unknown;
    environment?: unknown;
    lighting?: unknown;
    sizeX?: unknown;
    sizeY?: unknown;
    sortOrder?: unknown;
    archive?: unknown;
  }>();

  const auth = await requireGridOwner(c.env.DB, id, body.pubkey);
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);

  const existing = await c.env.DB.prepare(
    `SELECT id, user_pubkey, name, environment, lighting, size_x, size_y, sort_order, archived_at
       FROM grids WHERE id = ?`,
  )
    .bind(id)
    .first<GridRow>();
  if (!existing) {
    return c.json({ error: "not found" }, 404);
  }

  const sets: string[] = [];
  const binds: unknown[] = [];
  let cropHistoryResetWarning = false;

  if (typeof body.name === "string") {
    const v = body.name.trim();
    if (v.length === 0 || v.length > 100) return c.json({ error: "invalid name" }, 400);
    sets.push("name = ?");
    binds.push(v);
  }
  if (body.environment !== undefined) {
    if (!VALID_ENVIRONMENTS.includes(body.environment as GridEnvironment)) {
      return c.json({ error: "invalid environment" }, 400);
    }
    sets.push("environment = ?");
    binds.push(body.environment);
  }
  if (body.lighting !== undefined) {
    if (body.lighting !== null && !VALID_LIGHTING.includes(body.lighting as GridLighting)) {
      return c.json({ error: "invalid lighting" }, 400);
    }
    sets.push("lighting = ?");
    binds.push(body.lighting);
  }
  if (body.sizeX !== undefined) {
    const v = Number(body.sizeX);
    if (!Number.isInteger(v) || v < 1 || v > 9) return c.json({ error: "invalid sizeX" }, 400);
    if (v !== existing.size_x) cropHistoryResetWarning = true;
    sets.push("size_x = ?");
    binds.push(v);
  }
  if (body.sizeY !== undefined) {
    const v = Number(body.sizeY);
    if (!Number.isInteger(v) || v < 1 || v > 9) return c.json({ error: "invalid sizeY" }, 400);
    if (v !== existing.size_y) cropHistoryResetWarning = true;
    sets.push("size_y = ?");
    binds.push(v);
  }
  if (body.sortOrder !== undefined) {
    const v = Number(body.sortOrder);
    if (!Number.isInteger(v)) return c.json({ error: "invalid sortOrder" }, 400);
    sets.push("sort_order = ?");
    binds.push(v);
  }
  // Issue #40: archive: true で archived_at=now、false で archived_at=NULL に切り替える。
  // 物理削除とは独立した「凍結」操作。
  if (body.archive !== undefined) {
    if (typeof body.archive !== "boolean") {
      return c.json({ error: "invalid archive" }, 400);
    }
    if (body.archive) {
      sets.push("archived_at = datetime('now')");
    } else {
      sets.push("archived_at = NULL");
    }
  }

  if (sets.length === 0) {
    return c.json({ error: "no fields to update" }, 400);
  }

  sets.push("updated_at = datetime('now')");
  await c.env.DB.prepare(`UPDATE grids SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds, id)
    .run();

  const reloaded = await c.env.DB.prepare(
    `SELECT id, user_pubkey, name, environment, lighting, size_x, size_y, sort_order, archived_at
       FROM grids WHERE id = ?`,
  )
    .bind(id)
    .first<GridRow>();
  if (!reloaded) {
    return c.json({ error: "vanished after update" }, 500);
  }
  const cells = await fetchCellsForGrid(c.env.DB, id);
  return c.json({
    grid: toGridRecord(reloaded, cells),
    cropHistoryResetWarning,
  });
});

// DELETE /api/grids/:id?pubkey=<hex64>
app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const auth = await requireGridOwner(c.env.DB, id, c.req.query("pubkey"));
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);
  // D1 では外部キーが enforce されないため、依存テーブルを手動でカスケード削除する。
  await c.env.DB.prepare(
    "DELETE FROM plantings WHERE cell_id IN (SELECT id FROM cells WHERE grid_id = ?)",
  )
    .bind(id)
    .run();
  // Issue #15: 養分・農薬記録もカスケード（cells を消す前に cell_id 経由で削除）
  await c.env.DB.prepare(
    "DELETE FROM nutrient_records WHERE cell_id IN (SELECT id FROM cells WHERE grid_id = ?)",
  )
    .bind(id)
    .run();
  await c.env.DB.prepare(
    "DELETE FROM pesticide_records WHERE cell_id IN (SELECT id FROM cells WHERE grid_id = ?)",
  )
    .bind(id)
    .run();
  await c.env.DB.prepare("DELETE FROM cells WHERE grid_id = ?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM crop_history WHERE grid_id = ?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM grids WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

// ============================================================================
// セル CRUD（grids 配下にぶら下げる）
// ============================================================================

// PUT /api/grids/:gridId/cells/:x/:y
// PATCH セマンティクス: body 内で undefined のフィールドは既存値を保持する
app.put("/:gridId/cells/:x/:y", async (c) => {
  const gridId = c.req.param("gridId");
  const x = Number(c.req.param("x"));
  const y = Number(c.req.param("y"));
  if (!Number.isInteger(x) || x < 0 || x > 8) return c.json({ error: "invalid x" }, 400);
  if (!Number.isInteger(y) || y < 0 || y > 8) return c.json({ error: "invalid y" }, 400);

  const body = await c.req.json<{
    pubkey?: unknown;
    containerType?: unknown;
    soilType?: unknown;
  }>();

  const auth = await requireGridOwner(c.env.DB, gridId, body.pubkey);
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);

  // バリデーション: 渡されたフィールドだけチェック。undefined は「未指定 = 既存値保持」、
  // null は明示クリアとして扱う。
  const containerProvided = Object.hasOwn(body, "containerType");
  const soilProvided = Object.hasOwn(body, "soilType");
  let containerType: ContainerType | null | undefined;
  let soilType: SoilType | null | undefined;
  if (containerProvided) {
    if (body.containerType === null) {
      containerType = null;
    } else if (!VALID_CONTAINERS.includes(body.containerType as ContainerType)) {
      return c.json({ error: "invalid containerType" }, 400);
    } else {
      containerType = body.containerType as ContainerType;
    }
  }
  if (soilProvided) {
    if (body.soilType === null) {
      soilType = null;
    } else if (!VALID_SOILS.includes(body.soilType as SoilType)) {
      return c.json({ error: "invalid soilType" }, 400);
    } else {
      soilType = body.soilType as SoilType;
    }
  }

  const grid = await c.env.DB.prepare("SELECT id, size_x, size_y FROM grids WHERE id = ?")
    .bind(gridId)
    .first<{ id: string; size_x: number; size_y: number }>();
  if (!grid) return c.json({ error: "grid not found" }, 404);
  if (x >= grid.size_x || y >= grid.size_y) {
    return c.json({ error: "cell out of range" }, 400);
  }

  // 既存セルを取って、未指定フィールドは既存値で埋めてから UPSERT する。
  const existing = await c.env.DB.prepare(
    "SELECT container_type, soil_type FROM cells WHERE grid_id = ? AND x = ? AND y = ?",
  )
    .bind(gridId, x, y)
    .first<{ container_type: ContainerType | null; soil_type: SoilType | null }>();

  const finalContainer: ContainerType | null = containerProvided
    ? (containerType as ContainerType | null)
    : (existing?.container_type ?? null);
  const finalSoil: SoilType | null = soilProvided
    ? (soilType as SoilType | null)
    : (existing?.soil_type ?? null);

  await c.env.DB.prepare(
    `INSERT INTO cells (grid_id, x, y, container_type, soil_type)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(grid_id, x, y) DO UPDATE SET
       container_type = excluded.container_type,
       soil_type = excluded.soil_type,
       updated_at = datetime('now')`,
  )
    .bind(gridId, x, y, finalContainer, finalSoil)
    .run();

  const row = await c.env.DB.prepare(
    `SELECT c.id AS id, c.grid_id AS grid_id, c.x AS x, c.y AS y,
            c.container_type AS container_type, c.soil_type AS soil_type,
            c.current_planting_id AS current_planting_id,
            p.plant_id AS current_plant_id,
            pl.name AS current_plant_name,
            n.last_applied AS last_fertilized_at,
            pe.last_applied AS last_pesticide_at
       FROM cells c
       LEFT JOIN plantings p ON p.id = c.current_planting_id
       LEFT JOIN plants pl ON pl.id = p.plant_id
       LEFT JOIN (
         SELECT cell_id, MAX(applied_at) AS last_applied
           FROM nutrient_records GROUP BY cell_id
       ) n ON n.cell_id = c.id
       LEFT JOIN (
         SELECT cell_id, MAX(applied_at) AS last_applied
           FROM pesticide_records GROUP BY cell_id
       ) pe ON pe.cell_id = c.id
      WHERE c.grid_id = ? AND c.x = ? AND c.y = ?`,
  )
    .bind(gridId, x, y)
    .first<CellRow>();
  if (!row) return c.json({ error: "cell vanished" }, 500);
  return c.json({ cell: toCellRecord(row) });
});

// DELETE /api/grids/:gridId/cells/:x/:y?pubkey=<hex64>
app.delete("/:gridId/cells/:x/:y", async (c) => {
  const gridId = c.req.param("gridId");
  const x = Number(c.req.param("x"));
  const y = Number(c.req.param("y"));
  if (!Number.isInteger(x) || x < 0 || x > 8) return c.json({ error: "invalid x" }, 400);
  if (!Number.isInteger(y) || y < 0 || y > 8) return c.json({ error: "invalid y" }, 400);

  const auth = await requireGridOwner(c.env.DB, gridId, c.req.query("pubkey"));
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);

  const cell = await c.env.DB.prepare("SELECT id FROM cells WHERE grid_id = ? AND x = ? AND y = ?")
    .bind(gridId, x, y)
    .first<{ id: number }>();
  if (!cell) return c.json({ ok: true });

  // 依存 plantings / nutrient_records / pesticide_records も手動カスケード
  await c.env.DB.prepare("DELETE FROM plantings WHERE cell_id = ?").bind(cell.id).run();
  await c.env.DB.prepare("DELETE FROM nutrient_records WHERE cell_id = ?").bind(cell.id).run();
  await c.env.DB.prepare("DELETE FROM pesticide_records WHERE cell_id = ?").bind(cell.id).run();
  await c.env.DB.prepare("DELETE FROM cells WHERE id = ?").bind(cell.id).run();
  return c.json({ ok: true });
});

export default app;
