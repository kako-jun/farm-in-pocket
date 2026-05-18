// グリッドエディタが叩く REST API ラッパー。
// fetch ベース。エラー時は Error を throw。
//
// Phase 1 (#13): pubkey をクエリ/body で受ける。NIP-98 認可は #16+ で。
// TODO: ベース URL の出し分け（本番は同一オリジン /api、dev は VITE_API_BASE_URL）。

import type {
  CellRecord,
  ContainerType,
  CropHistoryRecord,
  DifficultyRecord,
  GridEnvironment,
  GridLighting,
  GridRecord,
  MaterialCategory,
  MaterialDilution,
  MaterialRecord,
  NutrientRecord,
  NutrientType,
  PesticideRecord,
  PesticideType,
  PhRecord,
  PlantDetail,
  PlantSummary,
  PlantUserRecord,
  PlantingEndTag,
  PlantingRecord,
  PlantingState,
  ProfileRecord,
  RankingEntry,
  RankingSlug,
  RotationWarning,
  SeedProductAffiliateLink,
  SeedProductRecord,
  SeedProductType,
  SoilType,
  WateringDueRecord,
  WateringSettings,
  WeatherCacheRecord,
} from "@farm-in-pocket/shared";

const API_BASE: string = (import.meta.env.PUBLIC_FARM_API_BASE as string | undefined) ?? "";

function url(path: string): string {
  return `${API_BASE}${path}`;
}

async function jsonFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: string };
      detail = body.error ?? "";
    } catch {
      // body 取得失敗は無視
    }
    throw new Error(`API ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return (await res.json()) as T;
}

// ---- grids ----------------------------------------------------------------

export interface ListGridsOptions {
  /** Issue #40: アーカイブ済みグリッドを含めて返すか（既定 false）。 */
  includeArchived?: boolean;
  /** Issue #40: 各 grid に summary（セル統計）を詰めて返すか（既定 false）。 */
  summary?: boolean;
}

export async function listGrids(
  pubkey: string,
  options: ListGridsOptions = {},
): Promise<GridRecord[]> {
  const sp = new URLSearchParams({ pubkey });
  if (options.includeArchived) sp.set("includeArchived", "true");
  if (options.summary) sp.set("summary", "true");
  const data = await jsonFetch<{ grids: GridRecord[] }>(url(`/api/grids?${sp.toString()}`));
  return data.grids;
}

export interface CreateGridInput {
  pubkey: string;
  name: string;
  environment: GridEnvironment;
  lighting?: GridLighting | null;
  sizeX: number;
  sizeY: number;
}

export async function createGrid(input: CreateGridInput): Promise<GridRecord> {
  const data = await jsonFetch<{ grid: GridRecord }>(url("/api/grids"), {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.grid;
}

export interface UpdateGridInput {
  name?: string;
  environment?: GridEnvironment;
  lighting?: GridLighting | null;
  sizeX?: number;
  sizeY?: number;
  sortOrder?: number;
  /** Issue #40: true で凍結、false で復元。 */
  archive?: boolean;
}

export interface UpdateGridResult {
  grid: GridRecord;
  cropHistoryResetWarning: boolean;
}

export async function updateGrid(
  id: string,
  pubkey: string,
  patch: UpdateGridInput,
): Promise<UpdateGridResult> {
  return jsonFetch<UpdateGridResult>(url(`/api/grids/${id}`), {
    method: "PATCH",
    body: JSON.stringify({ ...patch, pubkey }),
  });
}

export async function deleteGrid(id: string, pubkey: string): Promise<void> {
  await jsonFetch<{ ok: true }>(url(`/api/grids/${id}?pubkey=${encodeURIComponent(pubkey)}`), {
    method: "DELETE",
  });
}

// ---- cells ----------------------------------------------------------------

export interface PutCellInput {
  containerType?: ContainerType | null;
  soilType?: SoilType | null;
}

export async function putCell(
  gridId: string,
  pubkey: string,
  x: number,
  y: number,
  input: PutCellInput,
): Promise<CellRecord> {
  const data = await jsonFetch<{ cell: CellRecord }>(url(`/api/grids/${gridId}/cells/${x}/${y}`), {
    method: "PUT",
    body: JSON.stringify({ ...input, pubkey }),
  });
  return data.cell;
}

export async function deleteCell(
  gridId: string,
  pubkey: string,
  x: number,
  y: number,
): Promise<void> {
  await jsonFetch<{ ok: true }>(
    url(`/api/grids/${gridId}/cells/${x}/${y}?pubkey=${encodeURIComponent(pubkey)}`),
    { method: "DELETE" },
  );
}

// ---- plants ---------------------------------------------------------------

export async function searchPlants(q: string): Promise<PlantSummary[]> {
  const data = await jsonFetch<{ plants: PlantSummary[] }>(
    url(`/api/plants?q=${encodeURIComponent(q)}`),
  );
  return data.plants;
}

/**
 * Issue #38: `/plants` 一覧ページ用の拡張検索。
 *
 * 既存 `searchPlants(q)` を残しつつ、tag / category / family / sort / limit を受け取る
 * 新ラッパーを足す。フィールドはすべて任意で、未指定なら API 側の既定値で動く。
 */
export interface SearchPlantsParams {
  q?: string;
  family?: string;
  category?: string;
  tag?: string;
  sort?: "name" | "id";
  limit?: number;
}

export async function searchPlantsAdvanced(
  params: SearchPlantsParams = {},
): Promise<PlantSummary[]> {
  const sp = new URLSearchParams();
  if (params.q && params.q.length > 0) sp.set("q", params.q);
  if (params.family && params.family.length > 0) sp.set("family", params.family);
  if (params.category && params.category.length > 0) sp.set("category", params.category);
  if (params.tag && params.tag.length > 0) sp.set("tag", params.tag);
  if (params.sort) sp.set("sort", params.sort);
  if (typeof params.limit === "number") sp.set("limit", String(params.limit));
  const qs = sp.toString();
  const data = await jsonFetch<{ plants: PlantSummary[] }>(
    url(`/api/plants${qs.length > 0 ? `?${qs}` : ""}`),
  );
  return data.plants;
}

/**
 * Issue #38: 植物詳細を取得する（description / tags / genus / thumbnail を含む）。
 * 404 のときは Error が throw される。
 */
export async function fetchPlant(id: number): Promise<PlantDetail> {
  const data = await jsonFetch<{ plant: PlantDetail }>(url(`/api/plants/${id}`));
  return data.plant;
}

/**
 * Issue #38: その plant に紐付く seed_products（人気順、最大 50）を返す。
 */
export async function fetchPlantSeedProducts(id: number): Promise<SeedProductRecord[]> {
  const data = await jsonFetch<{ products: SeedProductRecord[] }>(
    url(`/api/plants/${id}/seed-products`),
  );
  return data.products;
}

/**
 * Issue #38: その plant を「育てている／いた」ユーザー一覧（lastPlantedAt 降順、最大 100）を返す。
 * mypace の display_name / picture は別途呼び出し側で bulk 取得する想定。
 */
export async function fetchPlantUsers(id: number): Promise<PlantUserRecord[]> {
  const data = await jsonFetch<{ users: PlantUserRecord[] }>(url(`/api/plants/${id}/users`));
  return data.users;
}

// ---- plantings ------------------------------------------------------------

export interface CreatePlantingInput {
  plantId: number;
  /** Issue #34: 種・苗マスター ID（任意）。指定するとその planting に紐付く。 */
  seedProductId?: number | null;
  seedingDate?: string | null;
  plantingDate?: string | null;
  note?: string | null;
  /**
   * Issue #23: 連作障害警告。
   * - `false`（既定）: 警告条件が成立すれば planting は作らず警告だけ返す。
   * - `true`: 警告条件が成立しても作る（"分かった上で植える"）。
   * - 未指定: API 側で `true` 扱い（旧クライアント互換）。
   *   新しいクライアントは「初回 false → 警告なら確認 → 再度 true」のフローで呼ぶ。
   */
  confirmRotation?: boolean;
}

export interface PlantingCreated {
  id: number;
  cellId: number;
  plantId: number;
  seedProductId: number | null;
  seedingDate: string | null;
  plantingDate: string | null;
  note: string | null;
}

/**
 * Issue #23: `createPlanting` の結果型。
 * - `planted: true` … planting が作成された。`rotationWarning` は警告を出した上で進めた場合のみ付与。
 * - `planted: false` … 連作警告が出て、`confirmRotation: false` で問い合わせていたため作成を保留した。
 *   呼び出し側は `rotationWarning` を見て確認ダイアログを出し、ユーザーが OK したら `confirmRotation: true` で再 POST する。
 */
export type CreatePlantingResult =
  | { planted: true; planting: PlantingCreated; rotationWarning?: RotationWarning }
  | { planted: false; rotationWarning: RotationWarning };

export async function createPlanting(
  gridId: string,
  pubkey: string,
  x: number,
  y: number,
  input: CreatePlantingInput,
): Promise<CreatePlantingResult> {
  const data = await jsonFetch<{
    ok?: boolean;
    error?: string;
    planting?: PlantingCreated;
    rotationWarning?: RotationWarning;
  }>(url(`/api/grids/${gridId}/cells/${x}/${y}/plantings`), {
    method: "POST",
    body: JSON.stringify({ ...input, pubkey }),
  });
  if (data.ok === false && data.error === "rotation_warning" && data.rotationWarning) {
    return { planted: false, rotationWarning: data.rotationWarning };
  }
  if (!data.planting) {
    throw new Error("createPlanting: planting missing in response");
  }
  return {
    planted: true,
    planting: data.planting,
    ...(data.rotationWarning ? { rotationWarning: data.rotationWarning } : {}),
  };
}

export async function deletePlanting(id: number, pubkey: string): Promise<void> {
  await jsonFetch<{ ok: true }>(url(`/api/plantings/${id}?pubkey=${encodeURIComponent(pubkey)}`), {
    method: "DELETE",
  });
}

/**
 * Issue #29: 単一 planting の詳細を取得する。CellDetail の「現在の作物」セクションで
 * state / end_tag / failure_memo を表示するために使う。
 */
export async function fetchPlanting(id: number, pubkey: string): Promise<PlantingRecord> {
  const data = await jsonFetch<{ planting: PlantingRecord }>(
    url(`/api/plantings/${id}?pubkey=${encodeURIComponent(pubkey)}`),
  );
  return data.planting;
}

/**
 * Issue #29: 作物ライフサイクル状態の更新。
 * - state="ended" のときは endTag 必須（API 側で 400）。endDate 省略時は API 側で today。
 * - state="planted"/"growing" に戻すと endTag/endDate/failureMemo は API 側で NULL リセット。
 */
export interface UpdatePlantingInput {
  state?: PlantingState;
  endTag?: PlantingEndTag | null;
  endDate?: string | null;
  failureMemo?: string | null;
  note?: string | null;
  plantingDate?: string | null;
}

export async function updatePlanting(
  id: number,
  pubkey: string,
  patch: UpdatePlantingInput,
): Promise<PlantingRecord> {
  const data = await jsonFetch<{ ok: boolean; planting: PlantingRecord }>(
    url(`/api/plantings/${id}`),
    {
      method: "PATCH",
      body: JSON.stringify({ ...patch, pubkey }),
    },
  );
  return data.planting;
}

// ---- cell actions (Issue #15) --------------------------------------------

export interface RecordNutrientInput {
  nutrientType: NutrientType;
  appliedAt?: string;
  amount?: number;
  amountUnit?: string;
  materialId?: number;
  note?: string;
}

export async function recordNutrient(
  gridId: string,
  pubkey: string,
  x: number,
  y: number,
  input: RecordNutrientInput,
): Promise<NutrientRecord> {
  const data = await jsonFetch<{ record: NutrientRecord }>(
    url(`/api/grids/${gridId}/cells/${x}/${y}/nutrient`),
    {
      method: "POST",
      body: JSON.stringify({ ...input, pubkey }),
    },
  );
  return data.record;
}

export interface RecordPesticideInput {
  pesticideType: PesticideType;
  appliedAt?: string;
  amount?: number;
  amountUnit?: string;
  materialId?: number;
  targetTags?: string[];
  dilutionRatio?: number;
  note?: string;
}

export async function recordPesticide(
  gridId: string,
  pubkey: string,
  x: number,
  y: number,
  input: RecordPesticideInput,
): Promise<PesticideRecord> {
  const data = await jsonFetch<{ record: PesticideRecord }>(
    url(`/api/grids/${gridId}/cells/${x}/${y}/pesticide`),
    {
      method: "POST",
      body: JSON.stringify({ ...input, pubkey }),
    },
  );
  return data.record;
}

export interface CellRecordsResult {
  nutrients: NutrientRecord[];
  pesticides: PesticideRecord[];
}

export async function fetchCellRecords(
  gridId: string,
  pubkey: string,
  x: number,
  y: number,
): Promise<CellRecordsResult> {
  return jsonFetch<CellRecordsResult>(
    url(`/api/grids/${gridId}/cells/${x}/${y}/records?pubkey=${encodeURIComponent(pubkey)}`),
  );
}

/**
 * セルの養分投入記録を時系列昇順で全件取得する (Issue #25)。
 * /records は最新 10 件専用 (Phase 1)。タイムライン表示にはこちらを使う。
 */
export async function fetchCellNutrients(
  gridId: string,
  x: number,
  y: number,
  pubkey: string,
): Promise<NutrientRecord[]> {
  const data = await jsonFetch<{ records: NutrientRecord[] }>(
    url(`/api/grids/${gridId}/cells/${x}/${y}/nutrients?pubkey=${encodeURIComponent(pubkey)}`),
  );
  return data.records;
}

// ---- crop history (Issue #22) --------------------------------------------

export interface CellHistoryResult {
  records: CropHistoryRecord[];
}

export async function fetchCellHistory(
  gridId: string,
  x: number,
  y: number,
  pubkey: string,
): Promise<CellHistoryResult> {
  return jsonFetch<CellHistoryResult>(
    url(`/api/grids/${gridId}/cells/${x}/${y}/history?pubkey=${encodeURIComponent(pubkey)}`),
  );
}

// ---- pH records (Issue #24) ----------------------------------------------

export interface RecordPhInput {
  pubkey: string;
  value: number;
  measuredAt?: string;
  note?: string;
}

/**
 * pH 測定値を記録する。
 * - value は 0-14 (実用 3-10) を想定。範囲外は API 側で 400。
 * - measuredAt は YYYY-MM-DD。省略時は API 側で今日が入る。
 */
export async function recordPh(
  gridId: string,
  x: number,
  y: number,
  input: RecordPhInput,
): Promise<PhRecord> {
  const data = await jsonFetch<{ record: PhRecord }>(
    url(`/api/grids/${gridId}/cells/${x}/${y}/ph`),
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return data.record;
}

/**
 * セルの pH 測定記録を時系列昇順で全件取得する。
 */
export async function fetchCellPh(
  gridId: string,
  x: number,
  y: number,
  pubkey: string,
): Promise<PhRecord[]> {
  const data = await jsonFetch<{ records: PhRecord[] }>(
    url(`/api/grids/${gridId}/cells/${x}/${y}/ph?pubkey=${encodeURIComponent(pubkey)}`),
  );
  return data.records;
}

// ---- watering reminder (Issue #31) ---------------------------------------

/**
 * planting の水やり間隔設定を取得する。未設定なら null を返す。
 */
export async function fetchWateringSettings(
  plantingId: number,
  pubkey: string,
): Promise<WateringSettings | null> {
  const data = await jsonFetch<{ settings: WateringSettings | null }>(
    url(`/api/plantings/${plantingId}/watering?pubkey=${encodeURIComponent(pubkey)}`),
  );
  return data.settings;
}

/**
 * planting の水やり間隔を設定する。intervalDays を null / 0 にすると DELETE（解除）。
 * - 設定後の next_due_at は API 側で last_watered_at + interval（無ければ today + interval）。
 */
export async function setWateringInterval(
  plantingId: number,
  intervalDays: number | null,
  pubkey: string,
): Promise<WateringSettings | null> {
  const data = await jsonFetch<{ settings: WateringSettings | null }>(
    url(`/api/plantings/${plantingId}/watering`),
    {
      method: "PUT",
      body: JSON.stringify({ pubkey, intervalDays }),
    },
  );
  return data.settings;
}

/**
 * 水やりを実施した記録を POST する。
 * - settings が無ければ watering_log だけ残し、settings は更新しない（戻り値 settings=null）。
 * - settings があれば last_watered_at / next_due_at を更新して返す。
 */
export async function recordWatering(
  plantingId: number,
  pubkey: string,
  wateredAt?: string,
  note?: string,
): Promise<{ wateredAt: string; settings: WateringSettings | null }> {
  return jsonFetch<{ wateredAt: string; settings: WateringSettings | null }>(
    url(`/api/plantings/${plantingId}/water`),
    {
      method: "POST",
      body: JSON.stringify({
        pubkey,
        ...(wateredAt !== undefined ? { wateredAt } : {}),
        ...(note !== undefined ? { note } : {}),
      }),
    },
  );
}

/**
 * 指定日に水やり期日を迎える plantings 一覧を取得する。
 * - on 省略時は API 側で今日 (UTC YYYY-MM-DD)。
 * - state="ended" の planting は除外される。
 */
export async function fetchWateringDue(pubkey: string, on?: string): Promise<WateringDueRecord[]> {
  const q = new URLSearchParams({ pubkey });
  if (on) q.set("on", on);
  const data = await jsonFetch<{ records: WateringDueRecord[] }>(
    url(`/api/users/${encodeURIComponent(pubkey)}/watering-due?${q.toString()}`),
  );
  return data.records;
}

// ---- profile / weather (Issue #32) ---------------------------------------

/**
 * 自分のプロフィールを取得する。未作成なら null。
 * Phase 2 は pubkey をクエリで渡すだけ（NIP-98 認可は Phase 3+ の Issue で）。
 */
export async function fetchProfile(pubkey: string): Promise<ProfileRecord | null> {
  const data = await jsonFetch<{ profile: ProfileRecord | null }>(
    url(`/api/profiles/me?pubkey=${encodeURIComponent(pubkey)}`),
  );
  return data.profile;
}

export interface UpdateProfileInput {
  /** 表示名（null で削除、undefined で据え置き） */
  displayName?: string | null;
  /** 地域文字列（市区町村レベル: 例「石川県金沢市」、null で削除） */
  region?: string | null;
  /** locale: "ja" / "en" 等。null/undefined は据え置き */
  locale?: string | null;
}

/**
 * プロフィール upsert。指定したフィールドだけ反映する。
 */
export async function updateProfile(
  pubkey: string,
  patch: UpdateProfileInput,
): Promise<ProfileRecord> {
  const data = await jsonFetch<{ ok: boolean; profile: ProfileRecord }>(url("/api/profiles/me"), {
    method: "PUT",
    body: JSON.stringify({ pubkey, ...patch }),
  });
  return data.profile;
}

export interface WeatherFetchResult {
  record: WeatherCacheRecord | null;
  /** 取得失敗時は record=null + error にコードが入る */
  error?: string;
}

/**
 * 指定地域 / 指定日の気象データを取得する。
 * - API 側で weather_cache を見て、なければ Open-Meteo へ問い合わせ → INSERT。
 * - 取得失敗は 200 + { record: null, error } で返るので throw しない。
 */
export async function fetchWeather(region: string, date: string): Promise<WeatherFetchResult> {
  const q = new URLSearchParams({ region, date });
  return jsonFetch<WeatherFetchResult>(url(`/api/weather?${q.toString()}`));
}

// ---- seed products (Issue #34) -------------------------------------------

export type SearchSeedProductsSort = "popular" | "recent" | "name";

export interface SearchSeedProductsParams {
  q?: string;
  plantId?: number;
  type?: SeedProductType;
  /** 並び替え。省略時は API 側 default の "popular" (use_count DESC) */
  sort?: SearchSeedProductsSort;
  limit?: number;
}

/**
 * 種・苗マスター検索。
 * - q は name/brand 部分一致。
 * - plantId / type は完全一致。
 * - 並びは use_count DESC（人気順）。
 */
export async function searchSeedProducts(
  params: SearchSeedProductsParams,
): Promise<SeedProductRecord[]> {
  const q = new URLSearchParams();
  if (params.q && params.q.length > 0) q.set("q", params.q);
  if (typeof params.plantId === "number") q.set("plantId", String(params.plantId));
  if (params.type) q.set("type", params.type);
  if (params.sort) q.set("sort", params.sort);
  if (typeof params.limit === "number") q.set("limit", String(params.limit));
  const qs = q.toString();
  const data = await jsonFetch<{ products: SeedProductRecord[] }>(
    url(`/api/seed-products${qs.length > 0 ? `?${qs}` : ""}`),
  );
  return data.products;
}

export async function fetchSeedProduct(id: number): Promise<SeedProductRecord> {
  const data = await jsonFetch<{ product: SeedProductRecord }>(url(`/api/seed-products/${id}`));
  return data.product;
}

export interface CreateSeedProductInput {
  pubkey: string;
  name: string;
  brand?: string | null;
  plantId: number;
  type: SeedProductType;
  thumbnailUrl?: string | null;
  affiliateLinks?: SeedProductAffiliateLink[] | null;
}

export interface CreateSeedProductResult {
  product: SeedProductRecord;
  /** 既存 (brand, name, type) と重複していた場合 true。新規 INSERT なら false。 */
  duplicated: boolean;
}

/**
 * 種・苗マスターに新規登録する。
 * - 認証は現時点で pubkey の hex64 形式チェックのみ（コミュニティ参加型）。
 * - (brand, name, type) が既存と重複したら、既存レコードを返す（duplicated=true）。
 */
export async function createSeedProduct(
  input: CreateSeedProductInput,
): Promise<CreateSeedProductResult> {
  return jsonFetch<CreateSeedProductResult>(url("/api/seed-products"), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * 種・苗マスターの利用カウントを加算する。
 * - use_count は毎回 +1。
 * - user_count は同一 pubkey での初回利用のみ +1。
 * - fire-and-forget で呼んで良い（戻り値は無視可）。
 */
export async function recordSeedProductUsage(
  id: number,
  pubkey: string,
): Promise<{ product: SeedProductRecord; firstUse: boolean }> {
  const data = await jsonFetch<{ ok: boolean; product: SeedProductRecord; firstUse: boolean }>(
    url(`/api/seed-products/${id}/use`),
    {
      method: "POST",
      body: JSON.stringify({ pubkey }),
    },
  );
  return { product: data.product, firstUse: data.firstUse };
}

// ---- materials (Issue #35) -----------------------------------------------

export type SearchMaterialsSort = "popular" | "recent" | "name";

export interface SearchMaterialsParams {
  q?: string;
  category?: MaterialCategory;
  subcategory?: string;
  /** 並び替え。省略時は API 側 default の "popular" (use_count DESC) */
  sort?: SearchMaterialsSort;
  limit?: number;
}

/**
 * 資材マスター検索。
 * - q は name/brand 部分一致。
 * - category / subcategory は完全一致。
 * - 並びは use_count DESC（人気順）。
 */
export async function searchMaterials(params: SearchMaterialsParams): Promise<MaterialRecord[]> {
  const q = new URLSearchParams();
  if (params.q && params.q.length > 0) q.set("q", params.q);
  if (params.category) q.set("category", params.category);
  if (params.subcategory && params.subcategory.length > 0) q.set("subcategory", params.subcategory);
  if (params.sort) q.set("sort", params.sort);
  if (typeof params.limit === "number") q.set("limit", String(params.limit));
  const qs = q.toString();
  const data = await jsonFetch<{ materials: MaterialRecord[] }>(
    url(`/api/materials${qs.length > 0 ? `?${qs}` : ""}`),
  );
  return data.materials;
}

export async function fetchMaterial(id: number): Promise<MaterialRecord> {
  const data = await jsonFetch<{ material: MaterialRecord }>(url(`/api/materials/${id}`));
  return data.material;
}

export interface CreateMaterialInput {
  pubkey: string;
  name: string;
  brand?: string | null;
  category: MaterialCategory;
  subcategory?: string | null;
  targetTags?: string[] | null;
  tags?: string[] | null;
  dilution?: MaterialDilution | null;
  description?: string | null;
  thumbnailUrl?: string | null;
  affiliateLinks?: SeedProductAffiliateLink[] | null;
}

export interface CreateMaterialResult {
  material: MaterialRecord;
  /** 既存 (brand, name, category) と重複していた場合 true。新規 INSERT なら false。 */
  duplicated: boolean;
}

/**
 * 資材マスターに新規登録する。
 * - 認証は pubkey の hex64 形式チェックのみ（コミュニティ参加型）。
 * - (brand, name, category) が既存と重複したら、既存レコードを返す（duplicated=true）。
 */
export async function createMaterial(input: CreateMaterialInput): Promise<CreateMaterialResult> {
  return jsonFetch<CreateMaterialResult>(url("/api/materials"), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * 資材マスターの利用カウントを加算する。
 * - use_count は毎回 +1。
 * - user_count は同一 pubkey での初回利用のみ +1。
 * - fire-and-forget で呼んで良い（戻り値は無視可）。
 */
export async function recordMaterialUsage(
  id: number,
  pubkey: string,
): Promise<{ material: MaterialRecord; firstUse: boolean }> {
  const data = await jsonFetch<{ ok: boolean; material: MaterialRecord; firstUse: boolean }>(
    url(`/api/materials/${id}/use`),
    {
      method: "POST",
      body: JSON.stringify({ pubkey }),
    },
  );
  return { material: data.material, firstUse: data.firstUse };
}

// ---- rankings (Issue #39) -------------------------------------------------

/**
 * 運営テーマ別ランキング、または自動算出「植物難易度」を取得する。
 *
 * - 投票テーマ slug (`fun-to-grow` 等) は `RankingEntry[]` を返す。
 * - `auto-difficulty` は `DifficultyRecord[]` を返す。
 *
 * 呼び出し側はどちらを期待しているか slug で判別できるため、戻り値はユニオン。
 */
export interface FetchRankingResultVote {
  slug: Exclude<RankingSlug, "auto-difficulty">;
  entries: RankingEntry[];
  warning?: string;
}

export interface FetchRankingResultAuto {
  slug: "auto-difficulty";
  entries: DifficultyRecord[];
}

export type FetchRankingResult = FetchRankingResultVote | FetchRankingResultAuto;

export async function fetchRanking(slug: RankingSlug, limit?: number): Promise<FetchRankingResult> {
  const q = new URLSearchParams();
  if (typeof limit === "number") q.set("limit", String(limit));
  const qs = q.toString();
  const data = await jsonFetch<{
    slug: RankingSlug;
    entries: RankingEntry[] | DifficultyRecord[];
    warning?: string;
  }>(url(`/api/rankings/${slug}${qs.length > 0 ? `?${qs}` : ""}`));
  if (slug === "auto-difficulty") {
    return { slug: "auto-difficulty", entries: data.entries as DifficultyRecord[] };
  }
  return {
    slug: slug as Exclude<RankingSlug, "auto-difficulty">,
    entries: data.entries as RankingEntry[],
    ...(data.warning ? { warning: data.warning } : {}),
  };
}

export interface VoteRankingResult {
  ok: true;
  slug: RankingSlug;
  plantId: number;
  alreadyVoted: boolean;
  /** Nostalgic 上の score。token 未設定 dev では null */
  score: number | null;
}

/**
 * 指定植物に投票する。同一 (slug, pubkey, plantId) の重複投票は API 側で抑制され、
 * `alreadyVoted: true` で返る（HTTP 200）。
 */
export async function voteRanking(
  slug: RankingSlug,
  plantId: number,
  pubkey: string,
): Promise<VoteRankingResult> {
  const data = await jsonFetch<{
    ok: true;
    slug: RankingSlug;
    plantId: number;
    alreadyVoted: boolean;
    score?: number | null;
  }>(url(`/api/rankings/${slug}/vote`), {
    method: "POST",
    body: JSON.stringify({ pubkey, plantId }),
  });
  return {
    ok: true,
    slug: data.slug,
    plantId: data.plantId,
    alreadyVoted: data.alreadyVoted,
    score: data.score ?? null,
  };
}
