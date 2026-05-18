// グリッドエディタが叩く REST API ラッパー。
// fetch ベース。エラー時は Error を throw。
//
// Phase 1 (#13): pubkey をクエリ/body で受ける。NIP-98 認可は #16+ で。
// TODO: ベース URL の出し分け（本番は同一オリジン /api、dev は VITE_API_BASE_URL）。

import type {
  CellRecord,
  ContainerType,
  CropHistoryRecord,
  GridEnvironment,
  GridLighting,
  GridRecord,
  NutrientRecord,
  NutrientType,
  PesticideRecord,
  PesticideType,
  PhRecord,
  PlantSummary,
  PlantingEndTag,
  PlantingRecord,
  PlantingState,
  RotationWarning,
  SoilType,
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

export async function listGrids(pubkey: string): Promise<GridRecord[]> {
  const data = await jsonFetch<{ grids: GridRecord[] }>(
    url(`/api/grids?pubkey=${encodeURIComponent(pubkey)}`),
  );
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

// ---- plantings ------------------------------------------------------------

export interface CreatePlantingInput {
  plantId: number;
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
