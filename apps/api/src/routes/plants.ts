import type {
  PlantDetail,
  PlantSummary,
  PlantUserRecord,
  SeedProductAffiliateLink,
  SeedProductRecord,
  SeedProductType,
} from "@farm-in-pocket/shared";
import { isValidAffiliateLinks } from "@farm-in-pocket/shared";
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

interface PlantDetailRow extends PlantRow {
  genus: string | null;
  tags: string | null;
  description: string | null;
  thumbnail_url: string | null;
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

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((t) => typeof t === "string")) {
      return parsed as string[];
    }
    return [];
  } catch {
    return [];
  }
}

function toDetail(row: PlantDetailRow): PlantDetail {
  return {
    ...toSummary(row),
    genus: row.genus,
    tags: parseTags(row.tags),
    description: row.description,
    thumbnailUrl: row.thumbnail_url,
  };
}

const app = new Hono<{ Bindings: Bindings }>();

// ----------------------------------------------------------------------------
// GET /api/plants
//   q        : 部分一致（name / name_en）
//   family   : 完全一致
//   category : 完全一致
//   tag      : tags JSON 文字列に含まれているか（LIKE '%"<tag>"%'）
//   sort     : "name" (default, name ASC) / "id" (id ASC)
//   limit    : 1..200（既定 50）
//
// Issue: kako-jun/farm-in-pocket#38
// `/plants` 一覧ページのフィルタを支えるため、tag / sort / limit を加えた。
// Phase 1 までの単純検索 (q / family / category) との後方互換は維持する。
// ----------------------------------------------------------------------------
app.get("/", async (c) => {
  const q = c.req.query("q")?.trim() ?? "";
  const family = c.req.query("family")?.trim() ?? "";
  const category = c.req.query("category")?.trim() ?? "";
  const tag = c.req.query("tag")?.trim() ?? "";
  const sortRaw = c.req.query("sort")?.trim() ?? "";
  const limitRaw = c.req.query("limit")?.trim() ?? "";

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
  if (tag.length > 0) {
    // tags は JSON 配列文字列 ('["夏野菜","果菜"]')。
    // 文字列マッチで十分（SQLite に JSON 関数は使えるが Cloudflare D1 で互換性確保のため LIKE 使用）。
    where.push("tags LIKE ?");
    binds.push(`%"${tag}"%`);
  }

  let orderBy = "ORDER BY name";
  if (sortRaw === "id") orderBy = "ORDER BY id";
  else if (sortRaw === "name" || sortRaw === "") orderBy = "ORDER BY name";

  let limit = 50;
  if (limitRaw.length > 0) {
    const parsed = Number(limitRaw);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 200) {
      limit = parsed;
    }
  }

  const sql = `SELECT id, name, name_en, family, category FROM plants${
    where.length > 0 ? ` WHERE ${where.join(" AND ")}` : ""
  } ${orderBy} LIMIT ${limit}`;
  const result = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all<PlantRow>();
  const plants = (result.results ?? []).map(toSummary);
  return c.json({ plants });
});

// ----------------------------------------------------------------------------
// GET /api/plants/:id
// Issue #38 で詳細列（genus / tags / description / thumbnail_url）も返すよう拡張。
// 後方互換のため `plant` フィールドはそのまま継続（中身が広がる）。
// ----------------------------------------------------------------------------
app.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "invalid id" }, 400);
  }
  const row = await c.env.DB.prepare(
    "SELECT id, name, name_en, family, category, genus, tags, description, thumbnail_url FROM plants WHERE id = ?",
  )
    .bind(id)
    .first<PlantDetailRow>();
  if (!row) {
    return c.json({ error: "not found" }, 404);
  }
  return c.json({ plant: toDetail(row) });
});

// ----------------------------------------------------------------------------
// GET /api/plants/:id/seed-products
// その plant_id に紐付く seed_products 一覧（人気順、上限 50）。
// /api/seed-products?plantId=... と同じ集合だが、/plants/:id 詳細ページ専用の軽い口を切る。
// ----------------------------------------------------------------------------
interface SeedProductJoinRow {
  id: number;
  name: string;
  brand: string | null;
  plant_id: number;
  plant_name: string | null;
  type: SeedProductType;
  thumbnail_url: string | null;
  affiliate_links: string | null;
  use_count: number;
  user_count: number;
}

function parseAffiliateLinks(raw: string | null): SeedProductAffiliateLink[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (isValidAffiliateLinks(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

function toSeedProductRecord(row: SeedProductJoinRow): SeedProductRecord {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    plantId: row.plant_id,
    plantName: row.plant_name,
    type: row.type,
    thumbnailUrl: row.thumbnail_url,
    affiliateLinks: parseAffiliateLinks(row.affiliate_links),
    useCount: row.use_count,
    userCount: row.user_count,
  };
}

app.get("/:id/seed-products", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "invalid id" }, 400);
  }
  const sql = `SELECT sp.id, sp.name, sp.brand, sp.plant_id,
                      p.name AS plant_name, sp.type,
                      sp.thumbnail_url, sp.affiliate_links,
                      sp.use_count, sp.user_count
                 FROM seed_products sp
            LEFT JOIN plants p ON p.id = sp.plant_id
                WHERE sp.plant_id = ?
             ORDER BY sp.use_count DESC, sp.user_count DESC, sp.id DESC
                LIMIT 50`;
  const result = await c.env.DB.prepare(sql).bind(id).all<SeedProductJoinRow>();
  const products = (result.results ?? []).map(toSeedProductRecord);
  return c.json({ products });
});

// ----------------------------------------------------------------------------
// GET /api/plants/:id/users
//
// その植物 (plant_id) を育てている／いた ユーザー一覧を返す。
//
// plantings → cells → grids.user_pubkey で集計する。
// - plantingCount: plantings の総数（state 問わず：育てた経験を出したいので ended も含む）。
// - lastPlantedAt: MAX(COALESCE(seeding_date, planting_date, DATE(plantings.created_at)))。
//   全部 NULL かつ created_at が無いケースは無いが、安全側で coalesce 連鎖を組む。
// 並び順は lastPlantedAt 降順 → plantingCount 降順 → pubkey で安定化。上限 100。
//
// mypace の display_name / picture は別途クライアントが bulk で取りに行く。
// ----------------------------------------------------------------------------
interface PlantUserRow {
  pubkey: string;
  planting_count: number;
  last_planted_at: string | null;
}

app.get("/:id/users", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "invalid id" }, 400);
  }
  const sql = `SELECT g.user_pubkey AS pubkey,
                      COUNT(*) AS planting_count,
                      MAX(COALESCE(pl.seeding_date,
                                   pl.planting_date,
                                   substr(pl.created_at, 1, 10))) AS last_planted_at
                 FROM plantings pl
                 JOIN cells c ON c.id = pl.cell_id
                 JOIN grids g ON g.id = c.grid_id
                WHERE pl.plant_id = ?
             GROUP BY g.user_pubkey
             ORDER BY last_planted_at DESC, planting_count DESC, pubkey ASC
                LIMIT 100`;
  const result = await c.env.DB.prepare(sql).bind(id).all<PlantUserRow>();
  const users: PlantUserRecord[] = (result.results ?? []).map((row) => ({
    pubkey: row.pubkey,
    plantingCount: Number(row.planting_count ?? 0),
    lastPlantedAt: row.last_planted_at ?? null,
  }));
  return c.json({ users });
});

export default app;
