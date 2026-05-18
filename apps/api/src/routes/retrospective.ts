// Issue: kako-jun/farm-in-pocket#30
// 振り返りビュー (カレンダー / 作物別 / グリッド履歴 / 失敗ログ) 用の集計エンドポイント。
//
// 認可方針:
//   - すべて `?pubkey=<hex64>` 必須。
//   - URL path の `:pubkey` と query の `pubkey` が一致しない場合は 403。
//   - 「pubkey から見て自分の plantings / crop_history / nutrient_records / pesticide_records /
//     ph_records だけを集計する」前提なので、grids.user_pubkey で常に絞り込む。
//
// Phase 2 範囲。Nostr に投稿された kind:1 のタイムラインは対象外（コミュニティ系で別管理）。

import type {
  CropHistoryRecord,
  PlantingEndTag,
  PlantingRecord,
  PlantingState,
  PlantingsByPlantGroup,
  RetrospectiveActivityMonth,
  Season,
} from "@farm-in-pocket/shared";
import { isValidPubkeyHex } from "@farm-in-pocket/shared";
import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
};

const FAILURE_END_TAGS: readonly PlantingEndTag[] = ["died", "disease", "pest", "failed"];

interface PlantingFullRow {
  id: number;
  cell_id: number;
  plant_id: number;
  seed_product_id: number | null;
  // Issue #34 レビュー MUST-1: 振り返りビューでも seed_product 名を返す。
  // 各クエリで LEFT JOIN seed_products するので、ここでは row 型として保持するだけ。
  seed_product_name: string | null;
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

function toPlantingRecord(row: PlantingFullRow): PlantingRecord {
  return {
    id: row.id,
    cellId: row.cell_id,
    plantId: row.plant_id,
    seedProductId: row.seed_product_id,
    seedProductName: row.seed_product_name,
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

interface CropHistoryFullRow {
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

function toCropHistoryRecord(row: CropHistoryFullRow): CropHistoryRecord {
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

const app = new Hono<{ Bindings: Bindings }>();

/**
 * pubkey の正規化 + path/query 一致チェックを 1 箇所にまとめる。
 * - query.pubkey 必須。path.pubkey と一致しなければ 403。
 *   （path に書かせて UX を分かりやすくしつつ、Phase 1 と整合する query 必須も維持）
 */
function resolvePubkey(
  pathPubkey: string,
  queryPubkey: string | undefined,
): { ok: true; pubkey: string } | { ok: false; status: 400 | 403; error: string } {
  const normalizedPath = pathPubkey.toLowerCase();
  const normalizedQuery =
    typeof queryPubkey === "string" && queryPubkey.length > 0 ? queryPubkey.toLowerCase() : null;
  if (!normalizedQuery) {
    return { ok: false, status: 400, error: "pubkey query required" };
  }
  if (!isValidPubkeyHex(normalizedPath) || !isValidPubkeyHex(normalizedQuery)) {
    return { ok: false, status: 400, error: "invalid pubkey" };
  }
  if (normalizedPath !== normalizedQuery) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  return { ok: true, pubkey: normalizedPath };
}

// ============================================================================
// GET /api/users/:pubkey/activity?month=YYYY-MM&pubkey=<hex64>
//
// カレンダー heatmap 用。指定月の各日の活動件数を集計する。
//   - plantings: その日に planting_date or seeding_date が一致するもの
//   - endings:   その日に end_date が一致するもの (state='ended')
//   - care:      nutrient_records.applied_at / pesticide_records.applied_at /
//                ph_records.measured_at をすべて足し上げる
//
// applied_at は ISO 文字列 (YYYY-MM-DDTHH:MM:SS) の可能性があるので date() 関数で
// 日付部分だけ取って比較する。
// ============================================================================
app.get("/:pubkey/activity", async (c) => {
  const pathPubkey = c.req.param("pubkey");
  const auth = resolvePubkey(pathPubkey, c.req.query("pubkey"));
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);

  const month = c.req.query("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "month must be YYYY-MM" }, 400);
  }
  const monthStart = `${month}-01`;
  // 月末を出す: YYYY-MM-01 から +1 month -1 day。SQLite では date('YYYY-MM-01','+1 month','-1 day')
  // を使うが、bind に渡せる string で組み立てる方が予測可能なので、JS 側で算出する。
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  // monthNum: 1..12。次の月の 0 日 = 今月末。
  const lastDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;

  // plantings (start): planting_date or seeding_date が当月にあるもの。
  // どちらかが当月にあれば 1 件として数える。planting_date 優先で、それが NULL なら seeding_date。
  const plantingsStartRes = await c.env.DB.prepare(
    `SELECT COALESCE(p.planting_date, p.seeding_date) AS day
       FROM plantings p
       JOIN cells c ON c.id = p.cell_id
       JOIN grids g ON g.id = c.grid_id
      WHERE g.user_pubkey = ?
        AND COALESCE(p.planting_date, p.seeding_date) IS NOT NULL
        AND substr(COALESCE(p.planting_date, p.seeding_date), 1, 10) BETWEEN ? AND ?`,
  )
    .bind(auth.pubkey, monthStart, monthEnd)
    .all<{ day: string | null }>();

  const endingsRes = await c.env.DB.prepare(
    `SELECT p.end_date AS day
       FROM plantings p
       JOIN cells c ON c.id = p.cell_id
       JOIN grids g ON g.id = c.grid_id
      WHERE g.user_pubkey = ?
        AND p.state = 'ended'
        AND p.end_date IS NOT NULL
        AND substr(p.end_date, 1, 10) BETWEEN ? AND ?`,
  )
    .bind(auth.pubkey, monthStart, monthEnd)
    .all<{ day: string | null }>();

  const nutrientRes = await c.env.DB.prepare(
    `SELECT n.applied_at AS day
       FROM nutrient_records n
       JOIN cells c ON c.id = n.cell_id
       JOIN grids g ON g.id = c.grid_id
      WHERE g.user_pubkey = ?
        AND substr(n.applied_at, 1, 10) BETWEEN ? AND ?`,
  )
    .bind(auth.pubkey, monthStart, monthEnd)
    .all<{ day: string | null }>();

  const pesticideRes = await c.env.DB.prepare(
    `SELECT pr.applied_at AS day
       FROM pesticide_records pr
       JOIN cells c ON c.id = pr.cell_id
       JOIN grids g ON g.id = c.grid_id
      WHERE g.user_pubkey = ?
        AND substr(pr.applied_at, 1, 10) BETWEEN ? AND ?`,
  )
    .bind(auth.pubkey, monthStart, monthEnd)
    .all<{ day: string | null }>();

  const phRes = await c.env.DB.prepare(
    `SELECT ph.measured_at AS day
       FROM ph_records ph
       JOIN cells c ON c.id = ph.cell_id
       JOIN grids g ON g.id = c.grid_id
      WHERE g.user_pubkey = ?
        AND substr(ph.measured_at, 1, 10) BETWEEN ? AND ?`,
  )
    .bind(auth.pubkey, monthStart, monthEnd)
    .all<{ day: string | null }>();

  const days: RetrospectiveActivityMonth = {};
  function bump(day: string | null, key: "plantings" | "endings" | "care"): void {
    if (!day || day.length < 10) return;
    const k = day.slice(0, 10);
    const cur = days[k] ?? { plantings: 0, endings: 0, care: 0 };
    cur[key] += 1;
    days[k] = cur;
  }
  for (const row of plantingsStartRes.results ?? []) bump(row.day, "plantings");
  for (const row of endingsRes.results ?? []) bump(row.day, "endings");
  for (const row of nutrientRes.results ?? []) bump(row.day, "care");
  for (const row of pesticideRes.results ?? []) bump(row.day, "care");
  for (const row of phRes.results ?? []) bump(row.day, "care");

  return c.json({ days });
});

// ============================================================================
// GET /api/users/:pubkey/plantings-by-plant?pubkey=<hex64>
//
// 育てたことのある作物 (plant_id) でグルーピングした plantings 一覧。
// plant が削除されていた場合は plantName="(削除済み作物)" / plantFamily は crop_history
// から拾えず "unknown" にフォールバック。Phase 2 では「とりあえず plants にまだ存在する
// もの」だけ拾えていれば十分なので、INNER JOIN にする。
// ============================================================================
app.get("/:pubkey/plantings-by-plant", async (c) => {
  const pathPubkey = c.req.param("pubkey");
  const auth = resolvePubkey(pathPubkey, c.req.query("pubkey"));
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);

  const res = await c.env.DB.prepare(
    `SELECT p.id, p.cell_id, p.plant_id, p.seed_product_id, p.state,
            p.seeding_date, p.germination_date, p.planting_date, p.end_date, p.end_tag,
            p.seeding_depth_cm, p.plant_spacing_cm, p.row_spacing_cm,
            p.failure_memo, p.note,
            pl.name AS plant_name, pl.family AS plant_family,
            sp.name AS seed_product_name
       FROM plantings p
       JOIN cells c ON c.id = p.cell_id
       JOIN grids g ON g.id = c.grid_id
       JOIN plants pl ON pl.id = p.plant_id
       LEFT JOIN seed_products sp ON sp.id = p.seed_product_id
      WHERE g.user_pubkey = ?
      ORDER BY p.plant_id ASC, p.id DESC`,
  )
    .bind(auth.pubkey)
    .all<PlantingFullRow & { plant_name: string; plant_family: string }>();

  const groupsMap = new Map<number, PlantingsByPlantGroup>();
  for (const row of res.results ?? []) {
    let g = groupsMap.get(row.plant_id);
    if (!g) {
      g = {
        plantId: row.plant_id,
        plantName: row.plant_name,
        plantFamily: row.plant_family,
        plantings: [],
      };
      groupsMap.set(row.plant_id, g);
    }
    g.plantings.push(toPlantingRecord(row));
  }
  const groups = Array.from(groupsMap.values()).sort((a, b) =>
    a.plantName.localeCompare(b.plantName, "ja"),
  );
  return c.json({ groups });
});

// ============================================================================
// GET /api/users/:pubkey/cell-histories?pubkey=<hex64>
//
// 全グリッド × 全セル × 全 crop_history（直近 200 件）。
// クライアント側で grid_id ごとに group_by して表示する。
// ============================================================================
app.get("/:pubkey/cell-histories", async (c) => {
  const pathPubkey = c.req.param("pubkey");
  const auth = resolvePubkey(pathPubkey, c.req.query("pubkey"));
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);

  const res = await c.env.DB.prepare(
    `SELECT h.id, h.grid_id, h.x, h.y, h.plant_id, h.plant_family,
            h.year, h.season, h.planted_at, h.ended_at,
            pl.name AS plant_name, pl.name_en AS plant_name_en
       FROM crop_history h
       JOIN grids g ON g.id = h.grid_id
       LEFT JOIN plants pl ON pl.id = h.plant_id
      WHERE g.user_pubkey = ?
      ORDER BY h.planted_at DESC, h.id DESC
      LIMIT 200`,
  )
    .bind(auth.pubkey)
    .all<CropHistoryFullRow>();

  const records = (res.results ?? []).map(toCropHistoryRecord);
  return c.json({ records });
});

// ============================================================================
// GET /api/users/:pubkey/failures?pubkey=<hex64>
//
// state='ended' で end_tag が died/disease/pest/failed のものを一覧。
// 経過日数（plantingDate or seedingDate → endDate）の計算はクライアント側で行う。
// ============================================================================
app.get("/:pubkey/failures", async (c) => {
  const pathPubkey = c.req.param("pubkey");
  const auth = resolvePubkey(pathPubkey, c.req.query("pubkey"));
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);

  // SQL の IN (...) を bind するため placeholders を組み立てる
  const placeholders = FAILURE_END_TAGS.map(() => "?").join(",");
  const res = await c.env.DB.prepare(
    `SELECT p.id, p.cell_id, p.plant_id, p.seed_product_id, p.state,
            p.seeding_date, p.germination_date, p.planting_date, p.end_date, p.end_tag,
            p.seeding_depth_cm, p.plant_spacing_cm, p.row_spacing_cm,
            p.failure_memo, p.note,
            pl.name AS plant_name, pl.family AS plant_family,
            sp.name AS seed_product_name
       FROM plantings p
       JOIN cells c ON c.id = p.cell_id
       JOIN grids g ON g.id = c.grid_id
       LEFT JOIN plants pl ON pl.id = p.plant_id
       LEFT JOIN seed_products sp ON sp.id = p.seed_product_id
      WHERE g.user_pubkey = ?
        AND p.state = 'ended'
        AND p.end_tag IN (${placeholders})
      ORDER BY p.end_date DESC, p.id DESC
      LIMIT 200`,
  )
    .bind(auth.pubkey, ...FAILURE_END_TAGS)
    .all<
      PlantingFullRow & {
        plant_name: string | null;
        plant_family: string | null;
      }
    >();

  const failures = (res.results ?? []).map((row) => ({
    ...toPlantingRecord(row),
    plantName: row.plant_name ?? "(削除済み作物)",
    plantFamily: row.plant_family ?? "unknown",
    cellId: row.cell_id,
  }));
  return c.json({ failures });
});

export default app;
