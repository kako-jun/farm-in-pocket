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

/**
 * 植物マスター詳細 DTO (Issue #38)。
 *
 * `/plants` 一覧ページや `/plants/:id` 詳細ページで使う。
 * - `genus` / `description` / `thumbnailUrl` は NULL 許容（マスタによって持っていないものがある）。
 * - `tags` は plants.tags（JSON 文字列）をパースした文字列配列。パース失敗は `[]`。
 */
export interface PlantDetail extends PlantSummary {
  genus: string | null;
  tags: string[];
  description: string | null;
  thumbnailUrl: string | null;
}

/**
 * 「この植物を育てているユーザー」レコード (Issue #38)。
 *
 * `/api/plants/:id/users` のレスポンス要素。
 * - `pubkey` は hex（64 文字）。mypace の bulk profile API でアイコン等を取りに行く。
 * - `plantingCount` はその plant を含む plantings の総数（state 問わず）。
 * - `lastPlantedAt` は seeding_date / planting_date / created_at の中で最も新しい日付（YYYY-MM-DD）。
 *   全部 NULL の planting だけだと NULL になり得る。
 */
export interface PlantUserRecord {
  pubkey: string;
  plantingCount: number;
  lastPlantedAt: string | null;
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

// ============================================================================
// 振り返りビュー DTO (Issue #30)
//   * RetrospectiveDayActivity: ある 1 日の活動件数。
//     - plantings: その日に新しく start した planting の件数
//     - endings: その日に ended になった planting の件数
//     - care: nutrient_records + pesticide_records + ph_records の件数の合計
//   * RetrospectiveActivityMonth: YYYY-MM-DD をキーにしたマップ。値が無い日（活動ゼロ）は
//     キー自体が無い前提で、UI 側で fallback して 0 表示にする。
//   * PlantingsByPlantGroup: plant_id でグルーピングした PlantingRecord の集まり。
//     plant が削除されていた場合は API 側で plantName="(削除済み作物)" のフォールバックを当てる。
//   * FailurePlantingRecord: PlantingRecord に plantName / plantFamily を添えた一覧用拡張。
//     失敗ログでは作物名と科を必ず出すので、JOIN 結果を凍結して返す。
// ============================================================================

export interface RetrospectiveDayActivity {
  plantings: number;
  endings: number;
  care: number;
}

export type RetrospectiveActivityMonth = Record<string, RetrospectiveDayActivity>;

export interface PlantingsByPlantGroup {
  plantId: number;
  plantName: string;
  plantFamily: string;
  plantings: PlantingRecord[];
}

export interface FailurePlantingRecord extends PlantingRecord {
  plantName: string;
  plantFamily: string;
}

// ============================================================================
// 水やりリマインダー DTO (Issue #31)
//   * デフォルトは「なし」（リマインダー対象外）。settings 行が存在しなければ未設定。
//   * 「やった」を記録すると last_watered_at = today、next_due_at = today + interval_days。
//   * 「今日水やりすべき」リスト = next_due_at <= today AND interval_days IS NOT NULL。
// ============================================================================

export interface WateringSettings {
  plantingId: number;
  intervalDays: number;
  lastWateredAt: string | null;
  nextDueAt: string | null;
}

export interface WateringDueRecord {
  plantingId: number;
  cellId: number;
  gridId: string;
  gridName: string;
  x: number;
  y: number;
  plantId: number;
  plantName: string;
  intervalDays: number;
  lastWateredAt: string | null;
  nextDueAt: string;
  /** 0 = today, positive = overdue (今日より過去の next_due_at) */
  daysOverdue: number;
}

// ============================================================================
// プロフィール DTO (Issue #32)
//   * 地域は市区町村レベル（例: 「石川県金沢市」）。Open-Meteo geocoding API へ
//     そのまま投げる前提。NIP-98 認可未導入のため pubkey は body/query で受ける。
// ============================================================================

export interface ProfileRecord {
  pubkey: string;
  displayName: string | null;
  region: string | null;
  locale: string;
}

// ============================================================================
// 気象データキャッシュ DTO (Issue #32)
//   * (region, date) UNIQUE。過去日は再取得しない、当日は fetched_at から 6 時間
//     経過すれば再取得を許容する。
//   * weather_code は WMO 数値の文字列表現（既存スキーマが TEXT なのに合わせる）。
//   * 室内グリッド（GridEnvironment in ('indoor','greenhouse')）には付与しない。
// ============================================================================

export interface WeatherCacheRecord {
  region: string;
  date: string;
  tempMax: number | null;
  tempMin: number | null;
  tempAvg: number | null;
  /** WMO weather interpretation code（0-99）を文字列で保持する */
  weatherCode: string | null;
  sunshineHours: number | null;
  fetchedAt: string;
}

/**
 * 屋外グリッドかどうか（気象データを使うか）の判定。
 * indoor / greenhouse は気象 UI を非表示にする。
 */
export function isOutdoorEnvironment(env: GridEnvironment): boolean {
  return env !== "indoor" && env !== "greenhouse";
}

/**
 * Issue #40: グリッド統計（summary=true で取得した場合に詰める）。
 * - cellCount     : cells テーブルに登録済みのセル総数（VOID も含む）
 * - plantingCount : 現在 planting が紐付いているセル数（current_planting_id IS NOT NULL）
 * - voidCount     : container_type='void' のセル数
 * - cellsByContainer : container_type ごとの件数（NULL は集計しない）
 */
export interface GridSummary {
  cellCount: number;
  plantingCount: number;
  voidCount: number;
  cellsByContainer: Record<string, number>;
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
  /** Issue #40: アーカイブ（凍結）タイムスタンプ。NULL ならアクティブ。 */
  archivedAt: string | null;
  /** Issue #40: summary=true 指定時のみ詰める。通常一覧では undefined。 */
  summary?: GridSummary;
}

// ============================================================================
// 種・苗マスター DTO (Issue #34)
//   * type: seed_products.type と一致（seed / seedling / bulb / other）
//   * affiliateLinks は JSON 文字列で永続化、API レスポンスではパース済み配列で返す。
//   * useCount は「のべ利用回数」、userCount は「使ったユーザー数（DISTINCT pubkey）」。
//   * plantName は GET 結果の利便性のため plants から JOIN して埋める。
// ============================================================================

export type SeedProductType = "seed" | "seedling" | "bulb" | "other";

export const SEED_PRODUCT_TYPES: readonly SeedProductType[] = [
  "seed",
  "seedling",
  "bulb",
  "other",
] as const;

export const SEED_PRODUCT_TYPE_LABELS_JA: Record<SeedProductType, string> = {
  seed: "種",
  seedling: "苗",
  bulb: "球根",
  other: "その他",
};

export interface SeedProductAffiliateLink {
  shop: string;
  url: string;
}

export interface SeedProductRecord {
  id: number;
  name: string;
  brand: string | null;
  plantId: number;
  plantName: string | null;
  type: SeedProductType;
  thumbnailUrl: string | null;
  affiliateLinks: SeedProductAffiliateLink[] | null;
  useCount: number;
  userCount: number;
}

/**
 * Issue #34: affiliate_links のバリデーション。
 * - 配列で、各要素が `{ shop: string, url: string }` の形であること。
 * - URL は http(s) スキームのみ許容（ローカル参照や javascript: を弾く）。
 * - 空配列も OK（その場合 API では NULL として保存する想定）。
 */
export function isValidAffiliateLinks(value: unknown): value is SeedProductAffiliateLink[] {
  if (!Array.isArray(value)) return false;
  for (const item of value) {
    if (!item || typeof item !== "object") return false;
    const rec = item as { shop?: unknown; url?: unknown };
    if (typeof rec.shop !== "string" || rec.shop.length === 0) return false;
    if (typeof rec.url !== "string" || rec.url.length === 0) return false;
    if (!/^https?:\/\//i.test(rec.url)) return false;
  }
  return true;
}

/**
 * Issue #34: SeedProductType の文字列検証。
 */
export function isValidSeedProductType(value: unknown): value is SeedProductType {
  return typeof value === "string" && (SEED_PRODUCT_TYPES as readonly string[]).includes(value);
}

// ============================================================================
// 資材マスター DTO (Issue #35)
//   * category: soil / fertilizer_solid / fertilizer_liquid / pesticide / tool
//   * subcategory: category=pesticide のとき insecticide/fungicide/herbicide/repellent/adhesive
//     その他 category の subcategory は自由文字列（将来拡張）
//   * targetTags / tags: JSON 配列文字列で永続化、API レスポンスではパース済み配列
//   * dilution: 希釈倍率定義（液体肥料/農薬向け）。JSON 形式で永続化
//     `{ unit: "倍液", ratios: [{ purpose: "野菜全般", ratio: 500 }, ...] }`
//   * affiliateLinks: seed_products と同じ `[{shop, url}]` 形式
//   * useCount は「のべ利用回数」、userCount は「使ったユーザー数（DISTINCT pubkey）」
// ============================================================================

export type MaterialCategory =
  | "soil"
  | "fertilizer_solid"
  | "fertilizer_liquid"
  | "pesticide"
  | "tool";

export const MATERIAL_CATEGORIES: readonly MaterialCategory[] = [
  "soil",
  "fertilizer_solid",
  "fertilizer_liquid",
  "pesticide",
  "tool",
] as const;

export const MATERIAL_CATEGORY_LABELS_JA: Record<MaterialCategory, string> = {
  soil: "用土",
  fertilizer_solid: "肥料（固形）",
  fertilizer_liquid: "肥料（液体）",
  pesticide: "農薬",
  tool: "資材・道具",
};

export type PesticideSubcategory =
  | "insecticide"
  | "fungicide"
  | "herbicide"
  | "repellent"
  | "adhesive";

export const PESTICIDE_SUBCATEGORIES: readonly PesticideSubcategory[] = [
  "insecticide",
  "fungicide",
  "herbicide",
  "repellent",
  "adhesive",
] as const;

export const PESTICIDE_SUBCATEGORY_LABELS_JA: Record<PesticideSubcategory, string> = {
  insecticide: "殺虫剤",
  fungicide: "殺菌剤",
  herbicide: "除草剤",
  repellent: "忌避剤",
  adhesive: "展着剤",
};

export interface MaterialDilutionRatio {
  purpose: string;
  ratio: number;
}

export interface MaterialDilution {
  unit: string;
  ratios: MaterialDilutionRatio[];
}

export interface MaterialRecord {
  id: number;
  name: string;
  brand: string | null;
  category: MaterialCategory;
  subcategory: string | null;
  targetTags: string[] | null;
  tags: string[] | null;
  dilution: MaterialDilution | null;
  description: string | null;
  thumbnailUrl: string | null;
  affiliateLinks: Array<{ shop: string; url: string }> | null;
  useCount: number;
  userCount: number;
}

/**
 * Issue #35: MaterialCategory 検証。
 */
export function isValidMaterialCategory(value: unknown): value is MaterialCategory {
  return typeof value === "string" && (MATERIAL_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Issue #35: pesticide の subcategory 検証。
 * pesticide 以外の category では subcategory は任意の文字列で許容するため、
 * この関数は pesticide 用の厳格チェックにのみ使う。
 */
export function isValidPesticideSubcategory(value: unknown): value is PesticideSubcategory {
  return (
    typeof value === "string" && (PESTICIDE_SUBCATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * Issue #35: tags / targetTags の JSON 配列形式チェック。
 * - 配列で、各要素が空でない文字列であること
 * - 空配列も OK（API では NULL として保存）
 */
export function isValidTagArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  for (const t of value) {
    if (typeof t !== "string" || t.length === 0) return false;
  }
  return true;
}

/**
 * Issue #35: dilution JSON の形式チェック。
 * - `{ unit: string, ratios: [{ purpose: string, ratio: number }] }`
 * - ratio は正の有限数。
 */
export function isValidMaterialDilution(value: unknown): value is MaterialDilution {
  if (!value || typeof value !== "object") return false;
  const obj = value as { unit?: unknown; ratios?: unknown };
  if (typeof obj.unit !== "string" || obj.unit.length === 0) return false;
  if (!Array.isArray(obj.ratios)) return false;
  for (const r of obj.ratios) {
    if (!r || typeof r !== "object") return false;
    const rec = r as { purpose?: unknown; ratio?: unknown };
    if (typeof rec.purpose !== "string" || rec.purpose.length === 0) return false;
    if (typeof rec.ratio !== "number" || !Number.isFinite(rec.ratio) || rec.ratio <= 0) {
      return false;
    }
  }
  return true;
}
