// オーナー認可ヘルパ
// Issue: kako-jun/farm-in-pocket#13 レビュー対応 (MUST #2)
//
// Phase 1 範囲では NIP-98 認可は未実装で、ミューテーション系エンドポイントは
// body/query から渡された pubkey と grids.user_pubkey を照合して 403 を返す。
// NIP-98 への置き換えは Issue #16+ で行う。

import { isValidPubkeyHex } from "@farm-in-pocket/shared";

export type OwnerCheckResult =
  | { ok: true; pubkey: string }
  | { ok: false; status: 400 | 403 | 404; error: string };

/**
 * 与えられた pubkey が指定 grid のオーナーかを検証する。
 * - pubkey が空 or hex64 不正なら 400
 * - grid が存在しなければ 404
 * - grid.user_pubkey と pubkey が一致しなければ 403
 */
export async function requireGridOwner(
  db: D1Database,
  gridId: string,
  rawPubkey: unknown,
): Promise<OwnerCheckResult> {
  const pubkey =
    typeof rawPubkey === "string" && rawPubkey.length > 0 ? rawPubkey.toLowerCase() : null;
  if (!pubkey || !isValidPubkeyHex(pubkey)) {
    return { ok: false, status: 400, error: "invalid pubkey" };
  }
  const row = await db
    .prepare("SELECT user_pubkey FROM grids WHERE id = ?")
    .bind(gridId)
    .first<{ user_pubkey: string }>();
  if (!row) {
    return { ok: false, status: 404, error: "not found" };
  }
  if (row.user_pubkey !== pubkey) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  return { ok: true, pubkey };
}

/**
 * planting id からセル → グリッドを辿ってオーナー検証する。
 * 戻り値には planting_id と cell_id を含めてハンドラ側の後続処理に渡す。
 */
export async function requirePlantingOwner(
  db: D1Database,
  plantingId: number,
  rawPubkey: unknown,
): Promise<OwnerCheckResult & { plantingId?: number; cellId?: number }> {
  const pubkey =
    typeof rawPubkey === "string" && rawPubkey.length > 0 ? rawPubkey.toLowerCase() : null;
  if (!pubkey || !isValidPubkeyHex(pubkey)) {
    return { ok: false, status: 400, error: "invalid pubkey" };
  }
  const row = await db
    .prepare(
      `SELECT p.id AS planting_id, p.cell_id AS cell_id, g.user_pubkey AS user_pubkey
         FROM plantings p
         JOIN cells c ON c.id = p.cell_id
         JOIN grids g ON g.id = c.grid_id
        WHERE p.id = ?`,
    )
    .bind(plantingId)
    .first<{ planting_id: number; cell_id: number; user_pubkey: string }>();
  if (!row) {
    return { ok: false, status: 404, error: "not found" };
  }
  if (row.user_pubkey !== pubkey) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  return { ok: true, pubkey, plantingId: row.planting_id, cellId: row.cell_id };
}
