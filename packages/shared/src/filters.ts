// 写真フィルタプリセット（Issue: kako-jun/farm-in-pocket#28）
//
// mypace の FILTER_PRESETS と互換の CSS filter 文字列を 7 種類用意する。
// PhotoPicker で写真選択時にランダム抽選 → canvas で本体に焼き込んでアップロードする
// ガチャ感のあるフロー用。`color` は UI のドット表示・ハイライト用の代表色。

export interface FilterPreset {
  /** UI ラベル。fall-back の比較キーとしても使う。 */
  name: string;
  /** CSS の `filter` プロパティに渡す文字列。`"none"` で無加工。 */
  filter: string;
  /** プリセットを表す代表色（ドット UI のハイライトなどに使用）。 */
  color: string;
}

export const FILTER_PRESETS: readonly FilterPreset[] = [
  {
    name: "Fuji",
    filter: "brightness(1.1) contrast(1.3) saturate(1.2) hue-rotate(-5deg)",
    color: "#00a86b",
  },
  {
    name: "Kodak",
    filter: "brightness(1.05) contrast(1.2) saturate(0.9) sepia(0.15)",
    color: "#e6a817",
  },
  {
    name: "Wash",
    filter: "brightness(1.15) contrast(0.85) saturate(0.7)",
    color: "#b8a9c9",
  },
  {
    name: "Xpro",
    filter: "brightness(1.05) contrast(1.4) saturate(1.3) hue-rotate(15deg)",
    color: "#e04070",
  },
  {
    name: "Mono",
    filter: "brightness(1.1) contrast(1.4) grayscale(1)",
    color: "#606060",
  },
  {
    name: "Cool",
    filter: "brightness(1.05) contrast(1.2) saturate(0.85) hue-rotate(20deg)",
    color: "#4a90d9",
  },
  {
    name: "Vivid",
    filter: "contrast(1.2) saturate(1.4)",
    color: "#ff6b35",
  },
] as const;

/** フィルタなしを表す擬似プリセット。UI 上の「フィルタを選ぶ」リストで使う。 */
export const FILTER_NONE: FilterPreset = {
  name: "なし",
  filter: "none",
  color: "#9ca3af",
};

/**
 * FILTER_PRESETS から 1 つランダムに返す。
 * 0 件の状況は想定していないが、TypeScript の `noUncheckedIndexedAccess` を満たすため
 * 先頭にフォールバックする。
 */
export function pickRandomFilter(): FilterPreset {
  const idx = Math.floor(Math.random() * FILTER_PRESETS.length);
  // 配列長と一致しない場合 (Math.random が 1 を返すブラウザ実装の極端ケース) も先頭で吸収
  const picked = FILTER_PRESETS[idx] ?? FILTER_PRESETS[0];
  // FILTER_PRESETS は const 配列なので空にならない。型上の undefined のみガード。
  if (!picked) {
    throw new Error("FILTER_PRESETS is empty");
  }
  return picked;
}
