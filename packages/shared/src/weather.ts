// WMO weather code 表示用ラベル (Issue #32)
//
// Open-Meteo の daily.weather_code は WMO 4677/4680 に基づく数値 (0-99)。
// UI で「☀️ 晴れ」「☔ 雨」のような短いラベルを出すための簡易マッピング。
//
// 参考: https://open-meteo.com/en/docs#weather_variable_documentation

/**
 * WMO weather_code を簡易ラベル + 絵文字に変換する。
 * - 0       … 快晴
 * - 1-3     … 晴れ〜曇り
 * - 45, 48  … 霧
 * - 51-67   … 雨（霧雨・凍結雨を含む）
 * - 71-77   … 雪
 * - 80-86   … にわか雨/にわか雪
 * - 95-99   … 雷雨
 * 範囲外（null や不正値）は「不明」を返す。
 */
export interface WmoLabel {
  emoji: string;
  label: string;
  /** 雨カテゴリ（屋外の水やり不要サジェスト判定に使う） */
  isRain: boolean;
}

export function wmoToLabel(code: number | string | null | undefined): WmoLabel {
  const n = typeof code === "string" ? Number.parseInt(code, 10) : code;
  if (n === null || n === undefined || Number.isNaN(n)) {
    return { emoji: "❔", label: "不明", isRain: false };
  }
  if (n === 0) return { emoji: "☀️", label: "快晴", isRain: false };
  if (n >= 1 && n <= 3) return { emoji: "🌤️", label: "晴れ〜曇り", isRain: false };
  if (n === 45 || n === 48) return { emoji: "🌫️", label: "霧", isRain: false };
  if (n >= 51 && n <= 67) return { emoji: "☔", label: "雨", isRain: true };
  if (n >= 71 && n <= 77) return { emoji: "🌨️", label: "雪", isRain: false };
  if (n >= 80 && n <= 86) {
    // 85/86 はにわか雪、80-82 はにわか雨。屋外水やりサジェストの観点では
    // 「にわか雨」は雨扱い、にわか雪は別カテゴリにする。
    if (n >= 85) return { emoji: "🌨️", label: "にわか雪", isRain: false };
    return { emoji: "🌦️", label: "にわか雨", isRain: true };
  }
  if (n >= 95 && n <= 99) return { emoji: "⛈️", label: "雷雨", isRain: true };
  return { emoji: "❔", label: "不明", isRain: false };
}
