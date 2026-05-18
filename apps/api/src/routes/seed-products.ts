// 種・苗マスター API (Issue: kako-jun/farm-in-pocket#34)
//
// 市販の種袋・苗パック・球根の商品マスタ。コミュニティ参加型なので
// 当面は誰でも登録可能（pubkey の存在チェックは行うが、認可は無い）。
// 重複防止は (COALESCE(brand,''), name, type) の物理 UNIQUE INDEX
// (migrations/0010) と「INSERT 前に SELECT → 既存があれば返す」のハイブリッド。
// SELECT で空でも別の並行リクエストが先に INSERT 済みのケースは UNIQUE 違反として
// catch し、再 SELECT で既存行を返すので、レース時も重複が DB に入らない。
//
// エンドポイント:
//   GET  /api/seed-products?q=&plantId=&type=&sort=&limit=50  検索
//   GET  /api/seed-products/:id                                単体取得
//   POST /api/seed-products                                    新規登録（誰でも可）
//   POST /api/seed-products/:id/use                            利用カウント加算
//
// sort:
//   - popular (default) … use_count DESC, user_count DESC, id DESC
//   - recent           … created_at DESC, id DESC
//   - name             … name ASC, id DESC
//
// use_count は呼び出すたびに +1（のべ）。
// user_count は seed_product_users に (seed_product_id, pubkey) を INSERT OR IGNORE して、
// 新規行が増えたら +1（DISTINCT）。

import type {
  SeedProductAffiliateLink,
  SeedProductRecord,
  SeedProductType,
} from "@farm-in-pocket/shared";
import {
  isValidAffiliateLinks,
  isValidSeedProductType,
  normalizePubkey,
} from "@farm-in-pocket/shared";
import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
};

interface SeedProductRow {
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
    if (isValidAffiliateLinks(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function toRecord(row: SeedProductRow): SeedProductRecord {
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

const SELECT_BASE = `SELECT sp.id          AS id,
                            sp.name        AS name,
                            sp.brand       AS brand,
                            sp.plant_id    AS plant_id,
                            p.name         AS plant_name,
                            sp.type        AS type,
                            sp.thumbnail_url   AS thumbnail_url,
                            sp.affiliate_links AS affiliate_links,
                            sp.use_count   AS use_count,
                            sp.user_count  AS user_count
                       FROM seed_products sp
                  LEFT JOIN plants p ON p.id = sp.plant_id`;

const app = new Hono<{ Bindings: Bindings }>();

// ----------------------------------------------------------------------------
// GET /api/seed-products?q=&plantId=&type=&limit=
// ----------------------------------------------------------------------------
app.get("/", async (c) => {
  const q = c.req.query("q")?.trim() ?? "";
  const plantIdRaw = c.req.query("plantId")?.trim() ?? "";
  const typeRaw = c.req.query("type")?.trim() ?? "";
  const limitRaw = c.req.query("limit")?.trim() ?? "";
  const sortRaw = c.req.query("sort")?.trim() ?? "";

  const where: string[] = [];
  const binds: unknown[] = [];

  if (q.length > 0) {
    where.push("(sp.name LIKE ? OR sp.brand LIKE ?)");
    const like = `%${q}%`;
    binds.push(like, like);
  }
  if (plantIdRaw.length > 0) {
    const plantId = Number(plantIdRaw);
    if (!Number.isInteger(plantId) || plantId <= 0) {
      return c.json({ error: "invalid plantId" }, 400);
    }
    where.push("sp.plant_id = ?");
    binds.push(plantId);
  }
  if (typeRaw.length > 0) {
    if (!isValidSeedProductType(typeRaw)) {
      return c.json({ error: "invalid type" }, 400);
    }
    where.push("sp.type = ?");
    binds.push(typeRaw);
  }

  let limit = 50;
  if (limitRaw.length > 0) {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 200) {
      return c.json({ error: "invalid limit" }, 400);
    }
    limit = parsed;
  }

  let orderBy = "sp.use_count DESC, sp.user_count DESC, sp.id DESC";
  if (sortRaw.length > 0) {
    if (sortRaw === "popular") {
      orderBy = "sp.use_count DESC, sp.user_count DESC, sp.id DESC";
    } else if (sortRaw === "recent") {
      orderBy = "sp.created_at DESC, sp.id DESC";
    } else if (sortRaw === "name") {
      orderBy = "sp.name ASC, sp.id DESC";
    } else {
      return c.json({ error: "invalid sort" }, 400);
    }
  }

  const sql = `${SELECT_BASE}${
    where.length > 0 ? ` WHERE ${where.join(" AND ")}` : ""
  } ORDER BY ${orderBy} LIMIT ?`;

  const result = await c.env.DB.prepare(sql)
    .bind(...binds, limit)
    .all<SeedProductRow>();
  const products = (result.results ?? []).map(toRecord);
  return c.json({ products });
});

// ----------------------------------------------------------------------------
// GET /api/seed-products/:id
// ----------------------------------------------------------------------------
app.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "invalid id" }, 400);
  }
  const row = await c.env.DB.prepare(`${SELECT_BASE} WHERE sp.id = ?`)
    .bind(id)
    .first<SeedProductRow>();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ product: toRecord(row) });
});

// ----------------------------------------------------------------------------
// POST /api/seed-products
// body: { pubkey, name, brand?, plantId, type, thumbnailUrl?, affiliateLinks? }
// 認可: 当面誰でも登録可能（pubkey の hex64 形式だけは検証）。
// 重複: (brand, name, type) で擬似ユニーク。既存があれば既存レコードを返す。
// ----------------------------------------------------------------------------
app.post("/", async (c) => {
  const body = await c.req.json<{
    pubkey?: unknown;
    name?: unknown;
    brand?: unknown;
    plantId?: unknown;
    type?: unknown;
    thumbnailUrl?: unknown;
    affiliateLinks?: unknown;
  }>();

  // Issue #34 レビュー MUST-4: pubkey は normalizePubkey 経由で hex64 小文字に正規化する。
  const pubkey = normalizePubkey(body.pubkey);
  if (pubkey === null) {
    return c.json({ error: "invalid pubkey" }, 400);
  }
  void pubkey; // 現状 INSERT 時点では使わない（seed_product_users 側で記録）が、形式チェックは維持。
  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    return c.json({ error: "invalid name" }, 400);
  }
  if (typeof body.plantId !== "number" || !Number.isInteger(body.plantId) || body.plantId <= 0) {
    return c.json({ error: "invalid plantId" }, 400);
  }
  if (!isValidSeedProductType(body.type)) {
    return c.json({ error: "invalid type" }, 400);
  }
  const name = body.name.trim();
  const type: SeedProductType = body.type;
  const plantId = body.plantId;

  let brand: string | null = null;
  if (body.brand !== undefined && body.brand !== null) {
    if (typeof body.brand !== "string") {
      return c.json({ error: "invalid brand" }, 400);
    }
    const trimmed = body.brand.trim();
    brand = trimmed.length > 0 ? trimmed : null;
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

  // plant 存在チェック
  const plant = await c.env.DB.prepare("SELECT id FROM plants WHERE id = ?")
    .bind(plantId)
    .first<{ id: number }>();
  if (!plant) return c.json({ error: "plant not found" }, 400);

  // 擬似ユニーク (brand, name, type)。brand=NULL は IS NULL で比較する必要がある。
  const dupSql =
    brand === null
      ? `${SELECT_BASE} WHERE sp.name = ? AND sp.type = ? AND sp.brand IS NULL`
      : `${SELECT_BASE} WHERE sp.name = ? AND sp.type = ? AND sp.brand = ?`;
  const dupBinds: unknown[] = brand === null ? [name, type] : [name, type, brand];
  const existing = await c.env.DB.prepare(dupSql)
    .bind(...dupBinds)
    .first<SeedProductRow>();
  if (existing) {
    return c.json({ product: toRecord(existing), duplicated: true });
  }

  const affiliateLinksJson = affiliateLinks ? JSON.stringify(affiliateLinks) : null;
  // Issue #34 レビュー MUST-2: 並行 INSERT のレース耐性。UNIQUE INDEX 違反は catch して
  // 既存行を SELECT し直し duplicated:true で返す。
  let newId: number;
  try {
    const insertResult = await c.env.DB.prepare(
      `INSERT INTO seed_products (name, brand, plant_id, type, thumbnail_url, affiliate_links)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(name, brand, plantId, type, thumbnailUrl, affiliateLinksJson)
      .run();
    const id = insertResult.meta?.last_row_id;
    if (typeof id !== "number") {
      return c.json({ error: "insert failed" }, 500);
    }
    newId = id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE constraint failed")) {
      const race = await c.env.DB.prepare(dupSql)
        .bind(...dupBinds)
        .first<SeedProductRow>();
      if (race) {
        return c.json({ product: toRecord(race), duplicated: true });
      }
    }
    return c.json({ error: "insert failed" }, 500);
  }
  const row = await c.env.DB.prepare(`${SELECT_BASE} WHERE sp.id = ?`)
    .bind(newId)
    .first<SeedProductRow>();
  if (!row) return c.json({ error: "vanished" }, 500);
  return c.json({ product: toRecord(row), duplicated: false }, 201);
});

// ----------------------------------------------------------------------------
// POST /api/seed-products/:id/use
// body: { pubkey }
//   - use_count は毎回 +1（のべ）。
//   - user_count は seed_product_users に INSERT OR IGNORE して
//     RETURNING で行が増えたら +1。D1 は RETURNING に対応しているが、
//     互換のため changes() で判定する。
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

  const exists = await c.env.DB.prepare("SELECT id FROM seed_products WHERE id = ?")
    .bind(id)
    .first<{ id: number }>();
  if (!exists) return c.json({ error: "not found" }, 404);

  const insertUser = await c.env.DB.prepare(
    "INSERT OR IGNORE INTO seed_product_users (seed_product_id, pubkey) VALUES (?, ?)",
  )
    .bind(id, pubkey)
    .run();

  // changes / meta.changes は環境差を吸収する。D1 は meta.changes を返す。
  const changed = insertUser.meta?.changes ?? 0;
  if (changed > 0) {
    await c.env.DB.prepare(
      `UPDATE seed_products
          SET use_count = use_count + 1,
              user_count = user_count + 1,
              updated_at = datetime('now')
        WHERE id = ?`,
    )
      .bind(id)
      .run();
  } else {
    await c.env.DB.prepare(
      `UPDATE seed_products
          SET use_count = use_count + 1,
              updated_at = datetime('now')
        WHERE id = ?`,
    )
      .bind(id)
      .run();
  }

  const row = await c.env.DB.prepare(`${SELECT_BASE} WHERE sp.id = ?`)
    .bind(id)
    .first<SeedProductRow>();
  if (!row) return c.json({ error: "vanished" }, 500);
  return c.json({ ok: true, product: toRecord(row), firstUse: changed > 0 });
});

export default app;
