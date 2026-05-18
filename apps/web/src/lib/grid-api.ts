// グリッドエディタが叩く REST API ラッパー。
// fetch ベース。エラー時は Error を throw。
//
// Phase 1 (#13): pubkey をクエリ/body で受ける。NIP-98 認可は #16+ で。
// TODO: ベース URL の出し分け（本番は同一オリジン /api、dev は VITE_API_BASE_URL）。

import type {
  CellRecord,
  ContainerType,
  GridEnvironment,
  GridLighting,
  GridRecord,
  PlantSummary,
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

export async function updateGrid(id: string, patch: UpdateGridInput): Promise<UpdateGridResult> {
  return jsonFetch<UpdateGridResult>(url(`/api/grids/${id}`), {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteGrid(id: string): Promise<void> {
  await jsonFetch<{ ok: true }>(url(`/api/grids/${id}`), { method: "DELETE" });
}

// ---- cells ----------------------------------------------------------------

export interface PutCellInput {
  containerType?: ContainerType | null;
  soilType?: SoilType | null;
}

export async function putCell(
  gridId: string,
  x: number,
  y: number,
  input: PutCellInput,
): Promise<CellRecord> {
  const data = await jsonFetch<{ cell: CellRecord }>(url(`/api/grids/${gridId}/cells/${x}/${y}`), {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return data.cell;
}

export async function deleteCell(gridId: string, x: number, y: number): Promise<void> {
  await jsonFetch<{ ok: true }>(url(`/api/grids/${gridId}/cells/${x}/${y}`), {
    method: "DELETE",
  });
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
}

export interface PlantingCreated {
  id: number;
  cellId: number;
  plantId: number;
  seedingDate: string | null;
  plantingDate: string | null;
  note: string | null;
}

export async function createPlanting(
  gridId: string,
  x: number,
  y: number,
  input: CreatePlantingInput,
): Promise<PlantingCreated> {
  const data = await jsonFetch<{ planting: PlantingCreated }>(
    url(`/api/grids/${gridId}/cells/${x}/${y}/plantings`),
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return data.planting;
}

export async function deletePlanting(id: number): Promise<void> {
  await jsonFetch<{ ok: true }>(url(`/api/plantings/${id}`), { method: "DELETE" });
}
