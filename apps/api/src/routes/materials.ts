// 資材マスター API (Issue: kako-jun/farm-in-pocket#35)
//
// 用土・肥料・農薬・道具など、栽培で使う「資材」のコミュニティ参加型マスタ。
// seed_products (#34) と同パターンで、当面は誰でも登録可能。
// 重複防止は (COALESCE(brand,''), name, category) の物理 UNIQUE INDEX
// (migrations/0010) と「INSERT 前に SELECT → 既存があれば返す」のハイブリッド。
// SELECT で空でも別の並行リクエストが先に INSERT 済みのケースは UNIQUE 違反として
// catch し、再 SELECT で既存行を返すので、レース時も重複が DB に入らない。
//
// エンドポイント:
//   GET  /api/materials?q=&category=&subcategory=&sort=&limit=50  検索
//   GET  /api/materials/:id                                       単体取得
//   POST /api/materials                                           新規登録
//   POST /api/materials/:id/use                                   利用カウント加算
//
// sort:
//   - popular (default) … use_count DESC, user_count DESC, id DESC
//   - recent           … created_at DESC, id DESC
//   - name             … name ASC, id DESC
//
// use_count は呼び出すたびに +1（のべ）。
// user_count は material_users に (material_id, pubkey) を INSERT OR IGNORE して
// 新規行が増えたら +1（DISTINCT）。

import type {
  MaterialCategory,
  MaterialDilution,
  MaterialRecord,
  SeedProductAffiliateLink,
} from "@farm-in-pocket/shared";
import {
  isValidAffiliateLinks,
  isValidMaterialCategory,
  isValidMaterialDilution,
  isValidPesticideSubcategory,
  isValidTagArray,
  normalizePubkey,
} from "@farm-in-pocket/shared";
import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
};

interface MaterialRow {
  id: number;
  name: string;
  brand: string | null;
  category: MaterialCategory;
  subcategory: string | null;
  target_tags: string | null;
  tags: string | null;
  dilution: string | null;
  description: string | null;
  thumbnail_url: string | null;
  affiliate_links: string | null;
  use_count: number;
  user_count: number;
}

function parseTagArray(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (isValidTagArray(parsed)) {
      return parsed.length > 0 ? parsed : null;
    }
    return null;
  } catch {
    return null;
  }
}

function parseDilution(raw: string | null): MaterialDilution | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (isValidMaterialDilution(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function parseAffiliateLinks(raw: string | null): SeedProductAffiliateLink[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (isValidAffiliateLinks(parsed)) {
      return parsed.length > 0 ? parsed : null;
    }
    return null;
  } catch {
    return null;
  }
}

function toRecord(row: MaterialRow): MaterialRecord {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    category: row.category,
    subcategory: row.subcategory,
    targetTags: parseTagArray(row.target_tags),
    tags: parseTagArray(row.tags),
    dilution: parseDilution(row.dilution),
    description: row.description,
    thumbnailUrl: row.thumbnail_url,
    affiliateLinks: parseAffiliateLinks(row.affiliate_links),
    useCount: row.use_count,
    userCount: row.user_count,
  };
}

const SELECT_BASE = `SELECT m.id              AS id,
                            m.name            AS name,
                            m.brand           AS brand,
                            m.category        AS category,
                            m.subcategory     AS subcategory,
                            m.target_tags     AS target_tags,
                            m.tags            AS tags,
                            m.dilution        AS dilution,
                            m.description     AS description,
                            m.thumbnail_url   AS thumbnail_url,
                            m.affiliate_links AS affiliate_links,
                            m.use_count       AS use_count,
                            m.user_count      AS user_count
                       FROM materials m`;

const app = new Hono<{ Bindings: Bindings }>();

// ----------------------------------------------------------------------------
// GET /api/materials?q=&category=&subcategory=&limit=
// ----------------------------------------------------------------------------
app.get("/", async (c) => {
  const q = c.req.query("q")?.trim() ?? "";
  const categoryRaw = c.req.query("category")?.trim() ?? "";
  const subcategoryRaw = c.req.query("subcategory")?.trim() ?? "";
  const limitRaw = c.req.query("limit")?.trim() ?? "";
  const sortRaw = c.req.query("sort")?.trim() ?? "";

  const where: string[] = [];
  const binds: unknown[] = [];

  if (q.length > 0) {
    where.push("(m.name LIKE ? OR m.brand LIKE ?)");
    const like = `%${q}%`;
    binds.push(like, like);
  }
  if (categoryRaw.length > 0) {
    if (!isValidMaterialCategory(categoryRaw)) {
      return c.json({ error: "invalid category" }, 400);
    }
    where.push("m.category = ?");
    binds.push(categoryRaw);
  }
  if (subcategoryRaw.length > 0) {
    where.push("m.subcategory = ?");
    binds.push(subcategoryRaw);
  }

  let limit = 50;
  if (limitRaw.length > 0) {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 200) {
      return c.json({ error: "invalid limit" }, 400);
    }
    limit = parsed;
  }

  let orderBy = "m.use_count DESC, m.user_count DESC, m.id DESC";
  if (sortRaw.length > 0) {
    if (sortRaw === "popular") {
      orderBy = "m.use_count DESC, m.user_count DESC, m.id DESC";
    } else if (sortRaw === "recent") {
      orderBy = "m.created_at DESC, m.id DESC";
    } else if (sortRaw === "name") {
      orderBy = "m.name ASC, m.id DESC";
    } else {
      return c.json({ error: "invalid sort" }, 400);
    }
  }

  const sql = `${SELECT_BASE}${
    where.length > 0 ? ` WHERE ${where.join(" AND ")}` : ""
  } ORDER BY ${orderBy} LIMIT ?`;

  const result = await c.env.DB.prepare(sql)
    .bind(...binds, limit)
    .all<MaterialRow>();
  const materials = (result.results ?? []).map(toRecord);
  return c.json({ materials });
});

// ----------------------------------------------------------------------------
// GET /api/materials/:id
// ----------------------------------------------------------------------------
app.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "invalid id" }, 400);
  }
  const row = await c.env.DB.prepare(`${SELECT_BASE} WHERE m.id = ?`).bind(id).first<MaterialRow>();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ material: toRecord(row) });
});

// ----------------------------------------------------------------------------
// POST /api/materials
// body: { pubkey, name, brand?, category, subcategory?, targetTags?, tags?,
//         dilution?, description?, thumbnailUrl?, affiliateLinks? }
// 認可: 当面誰でも登録可能（pubkey の hex64 形式だけは検証）。
// 重複: (brand, name, category) で擬似ユニーク。既存があれば既存レコードを返す。
// ----------------------------------------------------------------------------
app.post("/", async (c) => {
  const body = await c.req.json<{
    pubkey?: unknown;
    name?: unknown;
    brand?: unknown;
    category?: unknown;
    subcategory?: unknown;
    targetTags?: unknown;
    tags?: unknown;
    dilution?: unknown;
    description?: unknown;
    thumbnailUrl?: unknown;
    affiliateLinks?: unknown;
  }>();

  // Issue #34 レビュー MUST-4: pubkey は normalizePubkey で hex64 小文字に正規化する。
  // 形式不正なら 400。各エンドポイントで個別に toLowerCase していると大文字混入の余地が
  // 残るため、共有ユーティリティに集約。
  const pubkey = normalizePubkey(body.pubkey);
  if (pubkey === null) {
    return c.json({ error: "invalid pubkey" }, 400);
  }
  // pubkey は今後 INSERT 時点では使わない（material_users 側で記録）が、形式チェックは
  // 後段で扱う API のために維持する。将来 created_by を追加する余地も残しておく。
  void pubkey;
  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    return c.json({ error: "invalid name" }, 400);
  }
  if (!isValidMaterialCategory(body.category)) {
    return c.json({ error: "invalid category" }, 400);
  }
  const name = body.name.trim();
  const category: MaterialCategory = body.category;

  let brand: string | null = null;
  if (body.brand !== undefined && body.brand !== null) {
    if (typeof body.brand !== "string") {
      return c.json({ error: "invalid brand" }, 400);
    }
    const trimmed = body.brand.trim();
    brand = trimmed.length > 0 ? trimmed : null;
  }

  let subcategory: string | null = null;
  if (body.subcategory !== undefined && body.subcategory !== null) {
    if (typeof body.subcategory !== "string") {
      return c.json({ error: "invalid subcategory" }, 400);
    }
    const trimmed = body.subcategory.trim();
    if (trimmed.length > 0) {
      // pesticide のときは列挙チェック
      if (category === "pesticide" && !isValidPesticideSubcategory(trimmed)) {
        return c.json({ error: "invalid subcategory" }, 400);
      }
      subcategory = trimmed;
    }
  }

  let targetTags: string[] | null = null;
  if (body.targetTags !== undefined && body.targetTags !== null) {
    if (!isValidTagArray(body.targetTags)) {
      return c.json({ error: "invalid targetTags" }, 400);
    }
    targetTags = body.targetTags.length > 0 ? body.targetTags : null;
  }

  let tags: string[] | null = null;
  if (body.tags !== undefined && body.tags !== null) {
    if (!isValidTagArray(body.tags)) {
      return c.json({ error: "invalid tags" }, 400);
    }
    tags = body.tags.length > 0 ? body.tags : null;
  }

  let dilution: MaterialDilution | null = null;
  if (body.dilution !== undefined && body.dilution !== null) {
    if (!isValidMaterialDilution(body.dilution)) {
      return c.json({ error: "invalid dilution" }, 400);
    }
    dilution = body.dilution;
  }

  let description: string | null = null;
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== "string") {
      return c.json({ error: "invalid description" }, 400);
    }
    const trimmed = body.description.trim();
    description = trimmed.length > 0 ? trimmed : null;
  }

  let thumbnailUrl: string | null = null;
  if (body.thumbnailUrl !== undefined && body.thumbnailUrl !== null) {
    if (typeof body.thumbnailUrl !== "string") {
      return c.json({ error: "invalid thumbnailUrl" }, 400);
    }
    const trimmed = body.thumbnailUrl.trim();
    if (trimmed.length > 0) {
      if (!/^https?:\/\//i.test(trimmed)) {
        return c.json({ error: "invalid thumbnailUrl" }, 400);
      }
      thumbnailUrl = trimmed;
    }
  }

  let affiliateLinks: SeedProductAffiliateLink[] | null = null;
  if (body.affiliateLinks !== undefined && body.affiliateLinks !== null) {
    if (!isValidAffiliateLinks(body.affiliateLinks)) {
      return c.json({ error: "invalid affiliateLinks" }, 400);
    }
    affiliateLinks = body.affiliateLinks.length > 0 ? body.affiliateLinks : null;
  }

  // 擬似ユニーク (brand, name, category)。brand=NULL は IS NULL で比較する必要がある。
  // Issue #34 レビュー MUST-2: ここの SELECT は「先勝ち」を返すだけで、レースで両方 SELECT が
  // 空ヒットすると INSERT が両方走るので、最終防衛として UNIQUE INDEX (migrations/0010) を
  // 敷き、INSERT を try/catch して UNIQUE 違反は再 SELECT で既存行を返す。
  const dupSql =
    brand === null
      ? `${SELECT_BASE} WHERE m.name = ? AND m.category = ? AND m.brand IS NULL`
      : `${SELECT_BASE} WHERE m.name = ? AND m.category = ? AND m.brand = ?`;
  const dupBinds: unknown[] = brand === null ? [name, category] : [name, category, brand];
  const existing = await c.env.DB.prepare(dupSql)
    .bind(...dupBinds)
    .first<MaterialRow>();
  if (existing) {
    return c.json({ material: toRecord(existing), duplicated: true });
  }

  const targetTagsJson = targetTags ? JSON.stringify(targetTags) : null;
  const tagsJson = tags ? JSON.stringify(tags) : null;
  const dilutionJson = dilution ? JSON.stringify(dilution) : null;
  const affiliateLinksJson = affiliateLinks ? JSON.stringify(affiliateLinks) : null;

  let newId: number;
  try {
    const insertResult = await c.env.DB.prepare(
      `INSERT INTO materials (
         name, brand, category, subcategory,
         target_tags, tags, dilution, description,
         thumbnail_url, affiliate_links
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        name,
        brand,
        category,
        subcategory,
        targetTagsJson,
        tagsJson,
        dilutionJson,
        description,
        thumbnailUrl,
        affiliateLinksJson,
      )
      .run();
    const id = insertResult.meta?.last_row_id;
    if (typeof id !== "number") {
      return c.json({ error: "insert failed" }, 500);
    }
    newId = id;
  } catch (e) {
    // D1 / SQLite の UNIQUE 違反メッセージは "UNIQUE constraint failed" を含む。
    // 並行 INSERT で勝った側のレコードを SELECT して duplicated:true で返す。
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE constraint failed")) {
      const race = await c.env.DB.prepare(dupSql)
        .bind(...dupBinds)
        .first<MaterialRow>();
      if (race) {
        return c.json({ material: toRecord(race), duplicated: true });
      }
    }
    return c.json({ error: "insert failed" }, 500);
  }
  const row = await c.env.DB.prepare(`${SELECT_BASE} WHERE m.id = ?`)
    .bind(newId)
    .first<MaterialRow>();
  if (!row) return c.json({ error: "vanished" }, 500);
  return c.json({ material: toRecord(row), duplicated: false }, 201);
});

// ----------------------------------------------------------------------------
// POST /api/materials/:id/use
// body: { pubkey }
//   - use_count は毎回 +1（のべ）。
//   - user_count は material_users に INSERT OR IGNORE して
//     行が増えたら +1（DISTINCT）。
// ----------------------------------------------------------------------------
app.post("/:id/use", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "invalid id" }, 400);
  }
  const body = await c.req.json<{ pubkey?: unknown }>().catch(() => ({}) as { pubkey?: unknown });
  // Issue #34 レビュー MUST-4: pubkey は normalizePubkey 経由で hex64 小文字に正規化する。
  const pubkey = normalizePubkey(body.pubkey);
  if (pubkey === null) {
    return c.json({ error: "invalid pubkey" }, 400);
  }

  const exists = await c.env.DB.prepare("SELECT id FROM materials WHERE id = ?")
    .bind(id)
    .first<{ id: number }>();
  if (!exists) return c.json({ error: "not found" }, 404);

  const insertUser = await c.env.DB.prepare(
    "INSERT OR IGNORE INTO material_users (material_id, pubkey) VALUES (?, ?)",
  )
    .bind(id, pubkey)
    .run();

  const changed = insertUser.meta?.changes ?? 0;
  if (changed > 0) {
    await c.env.DB.prepare(
      `UPDATE materials
          SET use_count = use_count + 1,
              user_count = user_count + 1,
              updated_at = datetime('now')
        WHERE id = ?`,
    )
      .bind(id)
      .run();
  } else {
    await c.env.DB.prepare(
      `UPDATE materials
          SET use_count = use_count + 1,
              updated_at = datetime('now')
        WHERE id = ?`,
    )
      .bind(id)
      .run();
  }

  const row = await c.env.DB.prepare(`${SELECT_BASE} WHERE m.id = ?`).bind(id).first<MaterialRow>();
  if (!row) return c.json({ error: "vanished" }, 500);
  return c.json({ ok: true, material: toRecord(row), firstUse: changed > 0 });
});

export default app;
