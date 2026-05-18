// Issue: kako-jun/farm-in-pocket#41
// 季節UI（春夏秋冬で背景・カラー変化）の判定・テーマ正本。
//
// - 月→季節判定は日本基準（北半球）。境界月は明示的に列挙して曖昧さを排除する。
// - body 背景グラデと UI アクセントカラーは Tailwind の `oklch` 風味を避け、
//   既存 soil ベース (#fefcf7) と馴染む控えめなパステルに統一する。
// - 旬判定は plants.tags（JSON 配列）の文字列を素朴に部分一致で拾う。
//   seed データに正規化された季節タグは現状ないので、表現揺れに耐える形に振り切る。
//   ・「春まき / 春植え / 春先」→ spring
//   ・「夏野菜 / 夏まき / 夏植え」→ summer
//   ・「秋まき / 秋植え / 秋野菜」→ autumn
//   ・「冬野菜 / 冬まき」→ winter
//   どの語にも当たらないものは null（＝旬バッジ非表示）にする。

import type { Season } from "./db";

export interface SeasonTheme {
  season: Season;
  label: string;
  icon: string;
  bodyGradient: string;
  accentColor: string;
  accentColorSoft: string;
}

const SEASON_THEMES: Record<Season, SeasonTheme> = {
  spring: {
    season: "spring",
    label: "春",
    icon: "🌸",
    bodyGradient: "linear-gradient(180deg, #fefcf7 0%, #ffe9ec 100%)",
    accentColor: "#ec4899", // pink-500
    accentColorSoft: "#fbcfe8", // pink-200
  },
  summer: {
    season: "summer",
    label: "夏",
    icon: "☀️",
    bodyGradient: "linear-gradient(180deg, #fefcf7 0%, #dbeafe 100%)",
    accentColor: "#0ea5e9", // sky-500
    accentColorSoft: "#bae6fd", // sky-200
  },
  autumn: {
    season: "autumn",
    label: "秋",
    icon: "🍁",
    bodyGradient: "linear-gradient(180deg, #fefcf7 0%, #fed7aa 100%)",
    accentColor: "#ea580c", // orange-600
    accentColorSoft: "#fed7aa", // orange-200
  },
  winter: {
    season: "winter",
    label: "冬",
    icon: "❄️",
    bodyGradient: "linear-gradient(180deg, #fefcf7 0%, #e0e7ff 100%)",
    accentColor: "#6366f1", // indigo-500
    accentColorSoft: "#c7d2fe", // indigo-200
  },
};

/**
 * 月 (1..12) → 季節。範囲外は winter にフォールバック。
 * - 春: 3, 4, 5
 * - 夏: 6, 7, 8
 * - 秋: 9, 10, 11
 * - 冬: 12, 1, 2
 */
export function seasonFromMonth(month: number): Season {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

/** 今この瞬間の季節（端末ローカル日付ベース）。 */
export function seasonNow(now: Date = new Date()): Season {
  return seasonFromMonth(now.getMonth() + 1);
}

/** 季節テーマ（背景グラデ・アクセント色・ラベル等）を返す。 */
export function seasonTheme(season: Season): SeasonTheme {
  return SEASON_THEMES[season];
}

/**
 * plant.tags から「春まき」「夏野菜」等のキーワードを拾って、その作物の季節を推定する。
 * 該当なしは null。複数該当した場合は spring > summer > autumn > winter の優先順。
 */
export function inferSeasonForPlant(tags: string[]): Season | null {
  const has = (...needles: string[]): boolean =>
    needles.some((n) => tags.some((t) => t.includes(n)));
  if (has("春まき", "春植え", "春先")) return "spring";
  if (has("夏野菜", "夏まき", "夏植え")) return "summer";
  if (has("秋まき", "秋植え", "秋野菜")) return "autumn";
  if (has("冬野菜", "冬まき")) return "winter";
  return null;
}

/**
 * 今の季節と plant.tags から推定した季節が一致するか。
 * - タグから推定できないもの (null) は常に false。
 * - 旬バッジ表示・「今が旬」バナーの判定に使う共通関数。
 */
export function isSeasonalPlantForNow(tags: string[], now: Date = new Date()): boolean {
  const inferred = inferSeasonForPlant(tags);
  if (!inferred) return false;
  return inferred === seasonNow(now);
}
