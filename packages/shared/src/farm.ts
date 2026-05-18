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

// =============================================================================
// 連作障害（rotation） / Issue #23
// =============================================================================
//
// 同じ科を続けて同じ座標に植えると連作障害（土壌の養分偏り・病害蓄積）が出やすい。
// ここでは科ごとに「最低どれくらい空けたいか（年）」を集計済みの参考値として持つ。
// 数値は園芸書・JA 等で広く流通している保守側の推奨年数を採用している:
//   - ナス科: 3-4 年 → 4
//   - ウリ科: 3 年 → 3
//   - アブラナ科: 2-3 年 → 3
//   - マメ科: 2-3 年 → 3
//   - キク科: 1-2 年 → 2
//   - セリ科: 1-2 年 → 2
//   - ヒルガオ科（さつまいも）: 2 年
//   - ヒガンバナ科（ねぎ）: 2 年
//   - その他: 1 年（DEFAULT_ROTATION_WAIT_YEARS）

/** 科ごとの連作回避推奨年数（years to wait before planting the same family again）。 */
export const ROTATION_WAIT_YEARS: Record<string, number> = {
  ナス科: 4,
  ウリ科: 3,
  アブラナ科: 3,
  マメ科: 3,
  キク科: 2,
  セリ科: 2,
  ヒルガオ科: 2, // さつまいも
  ヒガンバナ科: 2, // ねぎ
  シソ科: 1, // バジル・しそ
  ユリ科: 4, // チューリップ・にんにく
  サトイモ科: 3, // モンステラ等
  ヒユ科: 1, // ほうれん草等
  サボテン科: 1, // サボテン
};

/** 上記マップに含まれない科に対する既定値。 */
export const DEFAULT_ROTATION_WAIT_YEARS = 1;

/** 科名から推奨待機年数を引く。未知科は DEFAULT_ROTATION_WAIT_YEARS。 */
export function getWaitYears(family: string): number {
  if (!family) return DEFAULT_ROTATION_WAIT_YEARS;
  return ROTATION_WAIT_YEARS[family] ?? DEFAULT_ROTATION_WAIT_YEARS;
}

/**
 * 連作障害の警告ペイロード。
 *
 * API (`POST /api/grids/:gridId/cells/:x/:y/plantings`) は、対象座標の直近 crop_history で
 * 同 family の最新行を見つけたとき、これを返す。
 *
 * - `confirmRotation: false`（既定）: 警告条件が成立した場合は planting を作らず、
 *   `{ ok: false, error: "rotation_warning", rotationWarning }` を返す。
 * - `confirmRotation: true`: 警告条件が成立しても planting を作り、
 *   `{ ok: true, planting, rotationWarning }` を返す（警告は表示しつつ進めるため）。
 */
export interface RotationWarning {
  /** 直近で植えていた科（凍結値）。 */
  family: string;
  /** 直近で同 family を植えた日（YYYY-MM-DD）。 */
  lastPlantedAt: string;
  /** 直近で同 family として植えた作物名（凍結値）。 */
  lastPlantName: string;
  /** その family の推奨待機年数。 */
  recommendedWaitYears: number;
  /** 直近の植え付けから現在までの経過年数（小数 1 桁、365.25 日基準）。 */
  yearsElapsed: number;
}
