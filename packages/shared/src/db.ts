// Phase 0 ではテーブル定義の TS 表現は最小限。実装は #9 以降で。

export type GridEnvironment =
  | "outdoor_sunny"
  | "outdoor_partial_shade"
  | "outdoor_shade"
  | "indoor"
  | "greenhouse";

export type GridLighting = "natural_only" | "grow_light" | "fluorescent_led";

export type ContainerType =
  | "jiue"
  | "planter"
  | "pot"
  | "container"
  | "board_mounted"
  | "hanging"
  | "hydroponics"
  | "other"
  | "void";

export type SoilType =
  | "potting_mix"
  | "akadama"
  | "leafmold"
  | "hydroball"
  | "sphagnum"
  | "coconut_chips"
  | "pumice"
  | "sand"
  | "water_only"
  | "hydroponics_nutrient"
  | "none"
  | "other";

export type PlantingState = "planted" | "growing" | "ended";

export type PlantingEndTag =
  | "bloomed"
  | "fruited"
  | "died"
  | "disease"
  | "pest"
  | "failed"
  | "removed";

/**
 * Issue #29: planting ライフサイクル UI 用ラベル。
 * 終了タグは「咲いた / 実った / 枯れた / 病気 / 虫害 / 失敗 / 抜いた」の 7 種。
 * UI セレクタの選択肢順は PLANTING_END_TAGS（下記）の正本順に従う。
 */
export const PLANTING_END_TAG_LABELS_JA: Record<PlantingEndTag, string> = {
  bloomed: "咲いた",
  fruited: "実った",
  died: "枯れた",
  disease: "病気",
  pest: "虫害",
  failed: "失敗（原因不明）",
  removed: "抜いた",
};

/** UI セレクタ順を兼ねた end_tag の正本順。 */
export const PLANTING_END_TAGS: readonly PlantingEndTag[] = [
  "bloomed",
  "fruited",
  "died",
  "disease",
  "pest",
  "failed",
  "removed",
] as const;

/** PlantingState 用 UI ラベル。 */
export const PLANTING_STATE_LABELS_JA: Record<PlantingState, string> = {
  planted: "植え付け",
  growing: "生育中",
  ended: "終了",
};

export type Season = "spring" | "summer" | "autumn" | "winter";

// ============================================================================
// DTO 型（API レスポンスで使う camelCase 表現）
// ============================================================================

export interface PlantSummary {
  id: number;
  name: string;
  nameEn: string | null;
  family: string;
  category: string;
}

export interface CellRecord {
  id: number;
  gridId: string;
  x: number;
  y: number;
  containerType: ContainerType | null;
  soilType: SoilType | null;
  currentPlantingId: number | null;
  currentPlantId: number | null;
  currentPlantName: string | null;
  // バッジ表示用: 最後にやった施肥/農薬の日付（無ければ null）
  // Issue: kako-jun/farm-in-pocket#15
  // Phase 2 (#26) で経過時間 fade を実装する。今は閾値（施肥 30 日 / 農薬 14 日）でバッジを出すかの判定にだけ使う
  lastFertilizedAt: string | null;
  lastPesticideAt: string | null;
}

// ============================================================================
// 養分・農薬記録 DTO (Issue #15)
// ============================================================================

export type NutrientType =
  | "nitrogen"
  | "phosphorus"
  | "potassium"
  | "calcium"
  | "magnesium"
  | "sulfur"
  | "iron"
  | "manganese"
  | "zinc"
  | "boron"
  | "organic"
  | "other";

export type PesticideType =
  | "insecticide"
  | "fungicide"
  | "herbicide"
  | "repellent"
  | "adhesive"
  | "other";

export interface NutrientRecord {
  id: number;
  cellId: number;
  appliedAt: string;
  nutrientType: NutrientType;
  materialId: number | null;
  amount: number | null;
  amountUnit: string | null;
  note: string | null;
}

export interface PesticideRecord {
  id: number;
  cellId: number;
  appliedAt: string;
  pesticideType: PesticideType;
  materialId: number | null;
  targetTags: string[] | null;
  amount: number | null;
  amountUnit: string | null;
  dilutionRatio: number | null;
  note: string | null;
}

// ============================================================================
// 座標ベース連作履歴 DTO (Issue #22)
//   * plantFamily は plants.family を凍結保存（denormalize）した値。
//     plants 改名/削除後も履歴の科分類は壊れない。
//   * season は month から導出: spring=3-5, summer=6-8, autumn=9-11, winter=12-2
//   * endedAt は撤去 or 上書き plant の発生で date('now') に書き込まれる。
// ============================================================================

export interface CropHistoryRecord {
  id: number;
  gridId: string;
  x: number;
  y: number;
  plantId: number;
  plantName: string;
  plantNameEn: string | null;
  plantFamily: string;
  year: number;
  season: "spring" | "summer" | "autumn" | "winter" | null;
  plantedAt: string;
  endedAt: string | null;
}

// ============================================================================
// pH 測定記録 DTO (Issue #24)
//   * value は 0-14 (実際の入力範囲は 3-10 を想定)
//   * measuredAt は ISO 文字列 (省略時は today)
// ============================================================================

export interface PhRecord {
  id: number;
  cellId: number;
  measuredAt: string;
  value: number;
  note: string | null;
}

// ============================================================================
// planting DTO (Issue #29)
//   * cells.current_planting_id が指す planting の詳細を camelCase で返す。
//   * state 遷移 (planted → growing → ended) と end_tag / failure_memo を含む。
// ============================================================================

export interface PlantingRecord {
  id: number;
  cellId: number;
  plantId: number;
  seedProductId: number | null;
  state: PlantingState;
  seedingDate: string | null;
  germinationDate: string | null;
  plantingDate: string | null;
  endDate: string | null;
  endTag: PlantingEndTag | null;
  seedingDepthCm: number | null;
  plantSpacingCm: number | null;
  rowSpacingCm: number | null;
  failureMemo: string | null;
  note: string | null;
}

export interface GridRecord {
  id: string;
  userPubkey: string;
  name: string;
  environment: GridEnvironment;
  lighting: GridLighting | null;
  sizeX: number;
  sizeY: number;
  sortOrder: number;
  cells: CellRecord[];
}
