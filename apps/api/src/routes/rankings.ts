// Issue: kako-jun/farm-in-pocket#39
//
// /api/rankings/:slug — Nostalgic Ranking 連携 + 自動難易度集計。
//
// 投票テーマ 5 種は Nostalgic Ranking に proxy する。
//   - GET  /api/rankings/:slug              … Nostalgic に get、plant_name でデコレート
//   - POST /api/rankings/:slug/vote         … 重複投票チェック → Nostalgic に submit
//
// 自動算出「植物難易度」（slug = "auto-difficulty"）は Nostalgic を使わず、
// D1 の plantings.end_tag を集計して失敗率順に返す。投票口は持たない。
//
// 認可:
//   Nostalgic への submit/create/update は url + token が必要なので、
//   Workers Secret `NOSTALGIC_TOKEN` 経由でサーバ側だけが叩く。
//   トークンは絶対にレスポンスに出さない。

import {
  type DifficultyRecord,
  RANKING_VOTABLE_SLUGS,
  type RankingEntry,
  type RankingSlug,
  isRankingSlug,
  plantIdFromRankingName,
  rankingNameForPlant,
} from "@farm-in-pocket/shared";
import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
  /** Nostalgic Ranking owner token。wrangler secret put NOSTALGIC_TOKEN で本番に投入。 */
  NOSTALGIC_TOKEN: string;
  /**
   * Nostalgic API base。未設定なら本番の https://api.nostalgic.llll-ll.com を使う。
   * テスト/開発時にモックエンドポイントへ向けるための差込口。
   */
  NOSTALGIC_API_BASE?: string;
};

const NOSTALGIC_DEFAULT_BASE = "https://api.nostalgic.llll-ll.com";

/** Nostalgic ranking の url 識別子。slug ごとに固定。 */
function rankingUrl(slug: RankingSlug): string {
  return `https://farm-in-pocket.llll-ll.com/rankings/${slug}`;
}

interface NostalgicEntry {
  rank: number;
  name: string;
  score: number;
  displayScore?: string;
  createdAt?: string;
}

interface NostalgicGetResponse {
  success?: boolean;
  data?: {
    id?: string;
    entries?: NostalgicEntry[];
    title?: string;
    sortOrder?: string;
    maxEntries?: number;
  };
  error?: string;
}

interface NostalgicSubmitResponse {
  success?: boolean;
  data?: { id?: string; entries?: NostalgicEntry[] };
  error?: string;
}

/**
 * Nostalgic の get を叩く。public mode (?action=get&id=...) は ID を必要とするが、
 * ここでは「url から逆引きしたい」ので owner mode (POST body) を使う。
 *
 * 失敗時は entries=[] を返す（UI 側で「まだ投票がありません」と出す）。
 */
async function fetchNostalgicEntries(
  base: string,
  token: string,
  slug: RankingSlug,
  limit: number,
): Promise<NostalgicEntry[]> {
  const url = `${base}/api/ranking?action=get`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: rankingUrl(slug), token, limit }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as NostalgicGetResponse;
  return data.data?.entries ?? [];
}

/**
 * Nostalgic に submit する。ランキングが存在しなければ create してから submit する。
 *
 * Nostalgic の submit は UPSERT（既存 name の score を上書き）。
 * 「+1 する」のために、まず現在 score を取得してから score+1 で submit する。
 */
async function submitNostalgicVote(
  base: string,
  token: string,
  slug: RankingSlug,
  plantId: number,
): Promise<{ score: number; created: boolean }> {
  const url = rankingUrl(slug);
  const name = rankingNameForPlant(plantId);

  // まず get（owner mode）で現在のエントリ一覧を取得し、対象 name の score を拾う。
  const getRes = await fetch(`${base}/api/ranking?action=get`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, token, limit: 100 }),
  });

  let created = false;
  let entries: NostalgicEntry[] = [];
  if (getRes.status === 404) {
    // ランキング自体がまだ無い → create する
    const createRes = await fetch(`${base}/api/ranking?action=create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, token, maxEntries: 200 }),
    });
    if (!createRes.ok && createRes.status !== 400) {
      // 400 は「既に存在」のときも返り得るので、それは無視して進める
      const errText = await safeText(createRes);
      throw new Error(`nostalgic create failed: ${createRes.status} ${errText}`);
    }
    created = true;
  } else if (getRes.ok) {
    const data = (await getRes.json()) as NostalgicGetResponse;
    entries = data.data?.entries ?? [];
  }

  const current = entries.find((e) => e.name === name)?.score ?? 0;
  const nextScore = current + 1;

  const submitRes = await fetch(`${base}/api/ranking?action=submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, token, name, score: nextScore }),
  });
  if (!submitRes.ok) {
    const errText = await safeText(submitRes);
    throw new Error(`nostalgic submit failed: ${submitRes.status} ${errText}`);
  }
  const submitData = (await submitRes.json()) as NostalgicSubmitResponse;
  if (!submitData.success) {
    throw new Error(`nostalgic submit error: ${submitData.error ?? "unknown"}`);
  }
  return { score: nextScore, created };
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "";
  }
}

/** plantId 配列を D1 で plant_name に解決する。N が小さい (~limit 50) ので IN で OK。 */
async function fetchPlantNames(db: D1Database, plantIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (plantIds.length === 0) return map;
  const placeholders = plantIds.map(() => "?").join(",");
  const sql = `SELECT id, name FROM plants WHERE id IN (${placeholders})`;
  const result = await db
    .prepare(sql)
    .bind(...plantIds)
    .all<{ id: number; name: string }>();
  for (const row of result.results ?? []) {
    map.set(row.id, row.name);
  }
  return map;
}

const app = new Hono<{ Bindings: Bindings }>();

// ----------------------------------------------------------------------------
// GET /api/rankings/:slug
// ----------------------------------------------------------------------------
app.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!isRankingSlug(slug)) {
    return c.json({ error: "invalid slug" }, 400);
  }
  const limitRaw = c.req.query("limit");
  let limit = 20;
  if (limitRaw) {
    const parsed = Number(limitRaw);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 100) limit = parsed;
  }

  if (slug === "auto-difficulty") {
    const entries = await computeAutoDifficulty(c.env.DB, limit);
    return c.json({ slug, entries });
  }

  const base = c.env.NOSTALGIC_API_BASE ?? NOSTALGIC_DEFAULT_BASE;
  const token = c.env.NOSTALGIC_TOKEN;
  if (!token) {
    // token 未設定環境では空配列を返して UI を壊さない（dev 等）。
    return c.json({ slug, entries: [], warning: "NOSTALGIC_TOKEN not configured" });
  }

  const rawEntries = await fetchNostalgicEntries(base, token, slug, limit);
  const decorated: RankingEntry[] = [];
  const plantIds: number[] = [];
  for (const e of rawEntries) {
    const pid = plantIdFromRankingName(e.name);
    if (pid === null) continue;
    plantIds.push(pid);
  }
  const nameMap = await fetchPlantNames(c.env.DB, plantIds);

  let rank = 0;
  let lastScore: number | null = null;
  let tied = 0;
  for (const e of rawEntries) {
    const pid = plantIdFromRankingName(e.name);
    if (pid === null) continue;
    // Nostalgic 側の rank を尊重しつつ、欠番（不正 name で除外）が出ても順位を詰める。
    if (lastScore === null || e.score !== lastScore) {
      rank = rank + 1 + tied;
      tied = 0;
    } else {
      tied += 1;
    }
    lastScore = e.score;
    decorated.push({
      rank,
      plantId: pid,
      score: e.score,
      plantName: nameMap.get(pid) ?? null,
    });
  }

  return c.json({ slug, entries: decorated });
});

// ----------------------------------------------------------------------------
// POST /api/rankings/:slug/vote
//   body: { pubkey, plantId }
// ----------------------------------------------------------------------------
interface VoteBody {
  pubkey?: unknown;
  plantId?: unknown;
}

app.post("/:slug/vote", async (c) => {
  const slug = c.req.param("slug");
  if (!isRankingSlug(slug)) {
    return c.json({ error: "invalid slug" }, 400);
  }
  if (slug === "auto-difficulty") {
    return c.json({ error: "auto-difficulty is not votable" }, 400);
  }
  // 5 種以外（型上は来ないが念のため）
  if (!(RANKING_VOTABLE_SLUGS as readonly string[]).includes(slug)) {
    return c.json({ error: "slug is not votable" }, 400);
  }

  let body: VoteBody;
  try {
    body = await c.req.json<VoteBody>();
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }
  const pubkey = typeof body.pubkey === "string" ? body.pubkey.trim() : "";
  const plantId =
    typeof body.plantId === "number"
      ? body.plantId
      : typeof body.plantId === "string"
        ? Number(body.plantId)
        : Number.NaN;

  if (pubkey.length === 0) {
    return c.json({ error: "pubkey is required" }, 400);
  }
  if (!Number.isInteger(plantId) || plantId <= 0) {
    return c.json({ error: "plantId must be a positive integer" }, 400);
  }

  // plant の存在チェック（不在の id への投票はエラー）
  const plant = await c.env.DB.prepare("SELECT id FROM plants WHERE id = ?")
    .bind(plantId)
    .first<{ id: number }>();
  if (!plant) {
    return c.json({ error: "plant not found" }, 404);
  }

  // 重複投票チェック → ranking_votes に INSERT OR IGNORE
  const insert = await c.env.DB.prepare(
    "INSERT OR IGNORE INTO ranking_votes (slug, pubkey, plant_id) VALUES (?, ?, ?)",
  )
    .bind(slug, pubkey, plantId)
    .run();
  // D1 の changes はメタ情報の `meta.changes` に乗る
  const changes = (insert.meta?.changes ?? insert.meta?.changed_db ?? 0) as number;
  if (!changes) {
    return c.json({ ok: true, slug, plantId, alreadyVoted: true });
  }

  // Nostalgic にも反映
  const base = c.env.NOSTALGIC_API_BASE ?? NOSTALGIC_DEFAULT_BASE;
  const token = c.env.NOSTALGIC_TOKEN;
  if (!token) {
    // token 未設定環境では D1 にだけ票を残す（dev では Nostalgic を叩かない）
    return c.json({
      ok: true,
      slug,
      plantId,
      alreadyVoted: false,
      score: null,
      warning: "NOSTALGIC_TOKEN not configured",
    });
  }
  try {
    const { score } = await submitNostalgicVote(base, token, slug, plantId);
    return c.json({ ok: true, slug, plantId, alreadyVoted: false, score });
  } catch (e) {
    // Nostalgic 失敗時はローカル投票履歴をロールバックして 502 を返す。
    await c.env.DB.prepare(
      "DELETE FROM ranking_votes WHERE slug = ? AND pubkey = ? AND plant_id = ?",
    )
      .bind(slug, pubkey, plantId)
      .run();
    return c.json(
      { error: "nostalgic upstream failed", detail: e instanceof Error ? e.message : String(e) },
      502,
    );
  }
});

// ----------------------------------------------------------------------------
// 自動難易度集計
// ----------------------------------------------------------------------------
interface DifficultyRow {
  plant_id: number;
  plant_name: string | null;
  total: number;
  failed: number;
}

async function computeAutoDifficulty(db: D1Database, limit: number): Promise<DifficultyRecord[]> {
  // died / disease / pest / failed を failed としてカウント。
  // state を問わず plantings 全件を total に入れる（途中の失敗も含めたいので）。
  const sql = `
    SELECT pl.plant_id AS plant_id,
           p.name      AS plant_name,
           COUNT(*)    AS total,
           SUM(CASE WHEN pl.end_tag IN ('died','disease','pest','failed') THEN 1 ELSE 0 END) AS failed
      FROM plantings pl
      JOIN plants p ON p.id = pl.plant_id
  GROUP BY pl.plant_id, p.name
    HAVING total > 0
  ORDER BY (CAST(failed AS REAL) / total) DESC, failed DESC, total DESC, pl.plant_id ASC
     LIMIT ?
  `;
  const result = await db.prepare(sql).bind(limit).all<DifficultyRow>();
  const rows = result.results ?? [];
  return rows.map((row, idx) => {
    const total = Number(row.total ?? 0);
    const failed = Number(row.failed ?? 0);
    const failureRate = total > 0 ? failed / total : null;
    return {
      rank: idx + 1,
      plantId: row.plant_id,
      plantName: row.plant_name,
      total,
      failed,
      failureRate,
    };
  });
}

export default app;
