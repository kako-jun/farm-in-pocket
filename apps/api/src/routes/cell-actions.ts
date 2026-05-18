// セルへのアクション (施肥・農薬・履歴取得)
// Issue: kako-jun/farm-in-pocket#15
//
// POST /api/grids/:gridId/cells/:x/:y/nutrient   施肥記録
// POST /api/grids/:gridId/cells/:x/:y/pesticide  農薬記録
// GET  /api/grids/:gridId/cells/:x/:y/records    直近 10 件ずつ
//
// セルは事前に PUT /api/grids/:gridId/cells/:x/:y で容器/用土が設定されている前提。
// 見つからなければ 404 を返す（自動 upsert はしない）。

import type {
  CropHistoryRecord,
  NutrientRecord,
  NutrientType,
  PesticideRecord,
  PesticideType,
  Season,
} from "@farm-in-pocket/shared";
import { Hono } from "hono";
import { requireGridOwner } from "../lib/auth";

type Bindings = {
  DB: D1Database;
};

const VALID_NUTRIENT_TYPES: readonly NutrientType[] = [
  "nitrogen",
  "phosphorus",
  "potassium",
  "calcium",
  "magnesium",
  "sulfur",
  "iron",
  "manganese",
  "zinc",
  "boron",
  "organic",
  "other",
];

const VALID_PESTICIDE_TYPES: readonly PesticideType[] = [
  "insecticide",
  "fungicide",
  "herbicide",
  "repellent",
  "adhesive",
  "other",
];

interface NutrientRow {
  id: number;
  cell_id: number;
  applied_at: string;
  nutrient_type: NutrientType;
  material_id: number | null;
  amount: number | null;
  amount_unit: string | null;
  note: string | null;
}

interface PesticideRow {
  id: number;
  cell_id: number;
  applied_at: string;
  pesticide_type: PesticideType;
  material_id: number | null;
  target_tags: string | null;
  amount: number | null;
  amount_unit: string | null;
  dilution_ratio: number | null;
  note: string | null;
}

function toNutrientRecord(row: NutrientRow): NutrientRecord {
  return {
    id: row.id,
    cellId: row.cell_id,
    appliedAt: row.applied_at,
    nutrientType: row.nutrient_type,
    materialId: row.material_id,
    amount: row.amount,
    amountUnit: row.amount_unit,
    note: row.note,
  };
}

function toPesticideRecord(row: PesticideRow): PesticideRecord {
  let targetTags: string[] | null = null;
  if (row.target_tags) {
    try {
      const parsed: unknown = JSON.parse(row.target_tags);
      if (Array.isArray(parsed)) {
        targetTags = parsed.filter((v): v is string => typeof v === "string");
      }
    } catch {
      // 不正な JSON は null 扱い
      targetTags = null;
    }
  }
  return {
    id: row.id,
    cellId: row.cell_id,
    appliedAt: row.applied_at,
    pesticideType: row.pesticide_type,
    materialId: row.material_id,
    targetTags,
    amount: row.amount,
    amountUnit: row.amount_unit,
    dilutionRatio: row.dilution_ratio,
    note: row.note,
  };
}

function parseCellCoords(
  rawX: string,
  rawY: string,
): { ok: true; x: number; y: number } | { ok: false; error: string } {
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isInteger(x) || x < 0 || x > 8) return { ok: false, error: "invalid x" };
  if (!Number.isInteger(y) || y < 0 || y > 8) return { ok: false, error: "invalid y" };
  return { ok: true, x, y };
}

async function findCellId(
  db: D1Database,
  gridId: string,
  x: number,
  y: number,
): Promise<number | null> {
  const row = await db
    .prepare("SELECT id FROM cells WHERE grid_id = ? AND x = ? AND y = ?")
    .bind(gridId, x, y)
    .first<{ id: number }>();
  return row?.id ?? null;
}

const app = new Hono<{ Bindings: Bindings }>();

// POST /api/grids/:gridId/cells/:x/:y/nutrient
app.post("/:gridId/cells/:x/:y/nutrient", async (c) => {
  const gridId = c.req.param("gridId");
  const coords = parseCellCoords(c.req.param("x"), c.req.param("y"));
  if (!coords.ok) return c.json({ error: coords.error }, 400);

  const body = await c.req.json<{
    pubkey?: unknown;
    nutrientType?: unknown;
    appliedAt?: unknown;
    amount?: unknown;
    amountUnit?: unknown;
    materialId?: unknown;
    note?: unknown;
  }>();

  const auth = await requireGridOwner(c.env.DB, gridId, body.pubkey);
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);

  const nutrientType = body.nutrientType as NutrientType;
  if (!VALID_NUTRIENT_TYPES.includes(nutrientType)) {
    return c.json({ error: "invalid nutrientType" }, 400);
  }

  const cellId = await findCellId(c.env.DB, gridId, coords.x, coords.y);
  if (cellId == null) {
    return c.json({ error: "cell not found. configure container/soil first." }, 404);
  }

  // appliedAt: ISO 文字列。省略時は now()
  const appliedAt =
    typeof body.appliedAt === "string" && body.appliedAt.length > 0
      ? body.appliedAt
      : new Date().toISOString();
  const amount =
    typeof body.amount === "number" && Number.isFinite(body.amount) ? body.amount : null;
  const amountUnit = typeof body.amountUnit === "string" ? body.amountUnit : null;
  const materialId =
    typeof body.materialId === "number" && Number.isInteger(body.materialId)
      ? body.materialId
      : null;
  const note = typeof body.note === "string" ? body.note : null;

  const ins = await c.env.DB.prepare(
    `INSERT INTO nutrient_records (cell_id, applied_at, nutrient_type, material_id, amount, amount_unit, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(cellId, appliedAt, nutrientType, materialId, amount, amountUnit, note)
    .run();

  const row = await c.env.DB.prepare(
    `SELECT id, cell_id, applied_at, nutrient_type, material_id, amount, amount_unit, note
       FROM nutrient_records WHERE id = ?`,
  )
    .bind(ins.meta.last_row_id)
    .first<NutrientRow>();
  if (!row) return c.json({ error: "record vanished" }, 500);
  return c.json({ record: toNutrientRecord(row) }, 201);
});

// POST /api/grids/:gridId/cells/:x/:y/pesticide
app.post("/:gridId/cells/:x/:y/pesticide", async (c) => {
  const gridId = c.req.param("gridId");
  const coords = parseCellCoords(c.req.param("x"), c.req.param("y"));
  if (!coords.ok) return c.json({ error: coords.error }, 400);

  const body = await c.req.json<{
    pubkey?: unknown;
    pesticideType?: unknown;
    appliedAt?: unknown;
    amount?: unknown;
    amountUnit?: unknown;
    materialId?: unknown;
    targetTags?: unknown;
    dilutionRatio?: unknown;
    note?: unknown;
  }>();

  const auth = await requireGridOwner(c.env.DB, gridId, body.pubkey);
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);

  const pesticideType = body.pesticideType as PesticideType;
  if (!VALID_PESTICIDE_TYPES.includes(pesticideType)) {
    return c.json({ error: "invalid pesticideType" }, 400);
  }

  const cellId = await findCellId(c.env.DB, gridId, coords.x, coords.y);
  if (cellId == null) {
    return c.json({ error: "cell not found. configure container/soil first." }, 404);
  }

  const appliedAt =
    typeof body.appliedAt === "string" && body.appliedAt.length > 0
      ? body.appliedAt
      : new Date().toISOString();
  const amount =
    typeof body.amount === "number" && Number.isFinite(body.amount) ? body.amount : null;
  const amountUnit = typeof body.amountUnit === "string" ? body.amountUnit : null;
  const materialId =
    typeof body.materialId === "number" && Number.isInteger(body.materialId)
      ? body.materialId
      : null;
  const dilutionRatio =
    typeof body.dilutionRatio === "number" && Number.isInteger(body.dilutionRatio)
      ? body.dilutionRatio
      : null;
  const note = typeof body.note === "string" ? body.note : null;
  let targetTagsJson: string | null = null;
  if (Array.isArray(body.targetTags)) {
    const arr = body.targetTags.filter((v): v is string => typeof v === "string");
    targetTagsJson = arr.length > 0 ? JSON.stringify(arr) : null;
  }

  const ins = await c.env.DB.prepare(
    `INSERT INTO pesticide_records
       (cell_id, applied_at, pesticide_type, material_id, target_tags, amount, amount_unit, dilution_ratio, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      cellId,
      appliedAt,
      pesticideType,
      materialId,
      targetTagsJson,
      amount,
      amountUnit,
      dilutionRatio,
      note,
    )
    .run();

  const row = await c.env.DB.prepare(
    `SELECT id, cell_id, applied_at, pesticide_type, material_id, target_tags,
            amount, amount_unit, dilution_ratio, note
       FROM pesticide_records WHERE id = ?`,
  )
    .bind(ins.meta.last_row_id)
    .first<PesticideRow>();
  if (!row) return c.json({ error: "record vanished" }, 500);
  return c.json({ record: toPesticideRecord(row) }, 201);
});

// GET /api/grids/:gridId/cells/:x/:y/records?pubkey=<hex64>
// 直近 nutrient / pesticide を各 10 件返す
app.get("/:gridId/cells/:x/:y/records", async (c) => {
  const gridId = c.req.param("gridId");
  const coords = parseCellCoords(c.req.param("x"), c.req.param("y"));
  if (!coords.ok) return c.json({ error: coords.error }, 400);

  const auth = await requireGridOwner(c.env.DB, gridId, c.req.query("pubkey"));
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);

  const cellId = await findCellId(c.env.DB, gridId, coords.x, coords.y);
  if (cellId == null) {
    // セルが無ければ空配列で返す（履歴 UI 側で「まだ記録がありません」を出す）
    return c.json({ nutrients: [], pesticides: [] });
  }

  const nutrientsRes = await c.env.DB.prepare(
    `SELECT id, cell_id, applied_at, nutrient_type, material_id, amount, amount_unit, note
       FROM nutrient_records
      WHERE cell_id = ?
      ORDER BY applied_at DESC
      LIMIT 10`,
  )
    .bind(cellId)
    .all<NutrientRow>();
  const pesticidesRes = await c.env.DB.prepare(
    `SELECT id, cell_id, applied_at, pesticide_type, material_id, target_tags,
            amount, amount_unit, dilution_ratio, note
       FROM pesticide_records
      WHERE cell_id = ?
      ORDER BY applied_at DESC
      LIMIT 10`,
  )
    .bind(cellId)
    .all<PesticideRow>();

  return c.json({
    nutrients: (nutrientsRes.results ?? []).map(toNutrientRecord),
    pesticides: (pesticidesRes.results ?? []).map(toPesticideRecord),
  });
});

// GET /api/grids/:gridId/cells/:x/:y/history?pubkey=<hex64>
// Issue #22: 座標ベース連作履歴の取得。直近 10 件、時系列降順。
// plants と JOIN するが、plant が削除されても history は残る前提なので LEFT JOIN ではなく
// crop_history.plant_family（凍結値）を正本として使う。name は plants から取れれば取る。
interface CropHistoryRow {
  id: number;
  grid_id: string;
  x: number;
  y: number;
  plant_id: number;
  plant_family: string;
  year: number;
  season: Season | null;
  planted_at: string;
  ended_at: string | null;
  plant_name: string | null;
  plant_name_en: string | null;
}

function toCropHistoryRecord(row: CropHistoryRow): CropHistoryRecord {
  return {
    id: row.id,
    gridId: row.grid_id,
    x: row.x,
    y: row.y,
    plantId: row.plant_id,
    plantName: row.plant_name ?? "(削除済み作物)",
    plantNameEn: row.plant_name_en,
    plantFamily: row.plant_family,
    year: row.year,
    season: row.season,
    plantedAt: row.planted_at,
    endedAt: row.ended_at,
  };
}

app.get("/:gridId/cells/:x/:y/history", async (c) => {
  const gridId = c.req.param("gridId");
  const coords = parseCellCoords(c.req.param("x"), c.req.param("y"));
  if (!coords.ok) return c.json({ error: coords.error }, 400);

  const auth = await requireGridOwner(c.env.DB, gridId, c.req.query("pubkey"));
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);

  const res = await c.env.DB.prepare(
    `SELECT h.id, h.grid_id, h.x, h.y, h.plant_id, h.plant_family,
            h.year, h.season, h.planted_at, h.ended_at,
            p.name AS plant_name, p.name_en AS plant_name_en
       FROM crop_history h
       LEFT JOIN plants p ON p.id = h.plant_id
      WHERE h.grid_id = ? AND h.x = ? AND h.y = ?
      ORDER BY h.planted_at DESC, h.id DESC
      LIMIT 10`,
  )
    .bind(gridId, coords.x, coords.y)
    .all<CropHistoryRow>();

  return c.json({ records: (res.results ?? []).map(toCropHistoryRecord) });
});

export default app;
