// Issue: kako-jun/farm-in-pocket#21
// けいふんくんの定型文ライブラリ。
//
// Phase 1 は LLM 連携なしの定型文。Phase 2 以降で LLM 連携の口を
// `KeifunMascot.tsx` に増やすときに、ここの形は維持したまま「kind=llm」を足す形にする。
//
// kind ごとに複数の候補を持ち、`pickRandom(kind)` でランダムに 1 つ返す。
// 候補が空配列だった場合の防御として `?? candidates[0]!` を付けている
// （TypeScript の noUncheckedIndexedAccess に対応）。

export type KeifunMessageKind =
  | "welcome" // 初回起動、アカウント設定完了後の歓迎
  | "grid_created" // グリッド作成完了
  | "record_posted" // 作業記録投稿完了
  | "follow_done" // フォロー完了
  | "watering_due" // 水やり期日（Phase 2 で発火、Phase 1 は API のみ）
  | "encourage" // 失敗・枯れた報告への慰め
  | "tip" // 雑学・育てるコツ
  | "idle"; // タップしたとき

export interface KeifunMessage {
  text: string;
  expression: "normal" | "happy" | "worried";
}

export const KEIFUN_MESSAGES: Record<KeifunMessageKind, KeifunMessage[]> = {
  welcome: [
    { text: "ようこそポケ農へ！畑の準備、一緒にやりましょう。", expression: "happy" },
    { text: "やあ、けいふんくんです。これから一緒にやっていきましょう。", expression: "happy" },
  ],
  grid_created: [
    { text: "畑ができましたね！何を植えますか？", expression: "happy" },
    { text: "立派な畑です。ゆっくり育てていきましょう。", expression: "normal" },
  ],
  record_posted: [
    { text: "記録、おつかれさまでした。", expression: "happy" },
    { text: "今日もよくがんばりましたね。", expression: "happy" },
  ],
  follow_done: [{ text: "新しい畑仲間ができましたね！", expression: "happy" }],
  watering_due: [
    { text: "そろそろ水やりの時間かもしれません。", expression: "normal" },
    { text: "土の様子、見てあげてください。", expression: "normal" },
  ],
  encourage: [
    { text: "うまくいかない日もあります。気を落とさないで。", expression: "worried" },
    { text: "枯らしてしまっても、それも経験。次に活かしましょう。", expression: "worried" },
  ],
  tip: [
    { text: "連作障害は同じ科の植物を続けて植えると起きやすいです。", expression: "normal" },
    { text: "水やりは朝が基本。夜に与えると根腐れの原因になります。", expression: "normal" },
    { text: "枯れた葉は早めに取り除くと病気の予防になります。", expression: "normal" },
    { text: "葉の色が黄色くなってきたら、肥料切れのサインかも。", expression: "normal" },
  ],
  idle: [
    { text: "けいふんくんです。何かお手伝いできることはありますか？", expression: "normal" },
    { text: "畑の調子はどうですか？", expression: "normal" },
    { text: "今日もありがとうございます。", expression: "happy" },
  ],
};

// 安全側の fallback。Phase 1 では KEIFUN_MESSAGES の各 kind に最低 1 件は
// 候補があるが、TypeScript の noUncheckedIndexedAccess で型を絞るため
// `pickRandom` が空集合に遭遇した場合の最終フォールバックを定数として用意する。
const FALLBACK_MESSAGE: KeifunMessage = {
  text: "けいふんくんです。",
  expression: "normal",
};

export function pickRandom(kind: KeifunMessageKind): KeifunMessage {
  const candidates = KEIFUN_MESSAGES[kind];
  if (candidates.length === 0) return FALLBACK_MESSAGE;
  const idx = Math.floor(Math.random() * candidates.length);
  return candidates[idx] ?? candidates[0] ?? FALLBACK_MESSAGE;
}
