// Issue: kako-jun/farm-in-pocket#39
//
// 運営テーマ別ランキング 5 種 + 自動算出「植物難易度ランキング」の型と定数。
//
// 5 種類のユーザー投票テーマは Nostalgic Ranking 経由で運用する
// （url = https://farm-in-pocket.llll-ll.com/rankings/{slug}, name = "p{plantId}",
//  score は累計投票数）。
// `auto-difficulty` は Nostalgic を使わず D1 の plantings.end_tag 集計から計算する。

/** 投票テーマ (5) + 自動算出 (1)。 */
export const RANKING_SLUGS = [
  "fun-to-grow",
  "beginner-friendly",
  "difficult",
  "balcony-friendly",
  "indoor-photogenic",
  "auto-difficulty",
] as const;

export type RankingSlug = (typeof RANKING_SLUGS)[number];

/** 投票で運営する 5 種（auto-difficulty は除く）。 */
export const RANKING_VOTABLE_SLUGS: readonly RankingSlug[] = [
  "fun-to-grow",
  "beginner-friendly",
  "difficult",
  "balcony-friendly",
  "indoor-photogenic",
] as const;

/** UI ラベル（日本語）。 */
export const RANKING_LABELS_JA: Record<RankingSlug, string> = {
  "fun-to-grow": "育ててて楽しい作物",
  "beginner-friendly": "初心者におすすめ",
  difficult: "失敗しやすい",
  "balcony-friendly": "ベランダで育てやすい",
  "indoor-photogenic": "室内映え",
  "auto-difficulty": "植物難易度（自動算出）",
} as const;

/** ランキングの一エントリ（投票テーマ用）。 */
export interface RankingEntry {
  /** 1 始まりの順位 */
  rank: number;
  /** 投票対象の植物 id */
  plantId: number;
  /** 投票数（Nostalgic 上の score） */
  score: number;
  /** プラント名（API 側で plants との JOIN で埋めて返す。取れなかったら null） */
  plantName: string | null;
}

/** 自動算出「植物難易度」エントリ。
 *
 * 成功率は (1 - 失敗 / total)。total === 0 のときは null（順位対象外）。
 * 失敗扱いの end_tag: died / disease / pest / failed。
 */
export interface DifficultyRecord {
  rank: number;
  plantId: number;
  plantName: string | null;
  /** その植物の plantings 総数（state 問わず） */
  total: number;
  /** 失敗扱いの plantings 数 */
  failed: number;
  /** 0..1 の失敗率。難易度ランキングは大きい順に並ぶ。total=0 は null */
  failureRate: number | null;
}

/**
 * Nostalgic Ranking で使う name（公開識別子）を植物 id から組み立てる。
 *
 * Nostalgic 側は name 20 文字以内。`p${plantId}` なら 6 桁の id でも 7 文字で収まる。
 */
export function rankingNameForPlant(plantId: number): string {
  return `p${plantId}`;
}

/**
 * Nostalgic 上の name から plantId を取り出す。`p123` → 123。
 * パース失敗時は null。
 */
export function plantIdFromRankingName(name: string): number | null {
  if (!name.startsWith("p")) return null;
  const n = Number(name.slice(1));
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/** 与えられた文字列が RankingSlug かどうかを返す。 */
export function isRankingSlug(s: string): s is RankingSlug {
  return (RANKING_SLUGS as readonly string[]).includes(s);
}
