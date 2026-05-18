// 作業記録（Work Record）の型・定数。
//
// Issue: kako-jun/farm-in-pocket#16
// 作業種別はフロント UI のボタンと Nostr イベントの `farm-action` タグ値の両方で共有する。
// 表示用ラベル・アイコンも単一の正本としてここに置き、ボタン配置・タグ仕様の二重管理を防ぐ。

export type FarmAction =
  | "seeding" // 種まき
  | "watering" // 水やり
  | "harvest" // 収穫
  | "fertilize" // 施肥
  | "ph_measure" // pH測定
  | "pesticide" // 農薬
  | "observation" // 観察
  | "other"; // その他

/** UI ボタン順を兼ねた action の正本順。 */
export const FARM_ACTIONS: readonly FarmAction[] = [
  "seeding",
  "watering",
  "harvest",
  "fertilize",
  "ph_measure",
  "pesticide",
  "observation",
  "other",
] as const;

export const FARM_ACTION_LABELS_JA: Record<FarmAction, string> = {
  seeding: "種まき",
  watering: "水やり",
  harvest: "収穫",
  fertilize: "施肥",
  ph_measure: "pH測定",
  pesticide: "農薬",
  observation: "観察",
  other: "その他",
};

export const FARM_ACTION_ICONS: Record<FarmAction, string> = {
  seeding: "🌰",
  watering: "💧",
  harvest: "🌾",
  fertilize: "🍃",
  pesticide: "🛡️",
  ph_measure: "🧪",
  observation: "👀",
  other: "📝",
};

/**
 * 作業記録の下書きエントリ。
 *
 * - `id` は uuid（フロントで生成）。再投稿時の冪等キーとして使う。
 * - `imageUrls` は Issue #17（写真アップロード）が埋める。本 Issue では常に `[]`。
 * - `createdAt` は draft 作成時刻（unix seconds）。投稿時の `created_at` とは別扱い。
 */
export interface WorkRecordDraft {
  id: string;
  action: FarmAction;
  content: string;
  gridId: string | null;
  cellX: number | null;
  cellY: number | null;
  cropName: string | null;
  imageUrls: string[];
  createdAt: number;
}

/** 投稿テキストの最大文字数。Twitter 互換で 280。 */
export const WORK_RECORD_MAX_CONTENT_LENGTH = 280;
