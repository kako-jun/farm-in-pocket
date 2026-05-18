// 日付ユーティリティ。retro #62 / #63 で API・UI 双方が必要としたため shared に集約する。
//
// - isValidYmdString: "YYYY-MM-DD" 形式バリデーション。月/日の範囲チェック + Date 再構築で
//   2026-13-99 のような不正値（フォーマットだけ正でも月日が範囲外）を弾く。
// - todayJstYmd: JST (Asia/Tokyo) の「今日」を YYYY-MM-DD で返す。サーバが UTC の
//   Cloudflare Workers でも、JP ユーザーの「今日」がズレないようにする。
//
// API ハンドラ (cell-actions.ts) / UI (CellDetail.tsx 等) の二重実装を避けるため、
// `new Date().toISOString().slice(0, 10)` のローカル関数は全てこちらに寄せる。

/**
 * "YYYY-MM-DD" 形式バリデーション（緩い、月/日の範囲もチェック）
 * 2026-13-99 のような不正値を弾く
 */
export function isValidYmdString(s: unknown): s is string {
  if (typeof s !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map((p) => Number.parseInt(p, 10));
  if (!y || !m || !d) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  // 厳密なら Date 再構築で確認
  const dt = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return false;
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d)
    return false;
  return true;
}

/** JST (Asia/Tokyo) の「今日」を YYYY-MM-DD で返す */
export function todayJstYmd(now: Date = new Date()): string {
  // toLocaleDateString sv-SE で YYYY-MM-DD 形式の TZ shift
  return now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}
