// 振り返りビュー (Issue #30) 用の API ラッパー。
//
// すべての endpoint は `?pubkey=<hex64>` 必須。Phase 1 と同じ「query で受ける」方式。
// path にも :pubkey を含む（API 側で path == query を 403 で守る）。
//
// fetch ベース。エラー時は Error を throw。

import type {
  CropHistoryRecord,
  FailurePlantingRecord,
  PlantingsByPlantGroup,
  RetrospectiveActivityMonth,
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

/**
 * カレンダー heatmap 用に「指定月の各日の活動件数」を取得する。
 * 戻り値の `days` は YYYY-MM-DD をキーにしたマップ。値が無い日（活動ゼロ）はキーが無い。
 */
export async function fetchActivity(
  pubkey: string,
  month: string,
): Promise<RetrospectiveActivityMonth> {
  const data = await jsonFetch<{ days: RetrospectiveActivityMonth }>(
    url(
      `/api/users/${encodeURIComponent(pubkey)}/activity?pubkey=${encodeURIComponent(
        pubkey,
      )}&month=${encodeURIComponent(month)}`,
    ),
  );
  return data.days;
}

/**
 * 育てたことのある作物 (plant_id) でグルーピングした plantings 一覧を取得する。
 */
export async function fetchPlantingsByPlant(pubkey: string): Promise<PlantingsByPlantGroup[]> {
  const data = await jsonFetch<{ groups: PlantingsByPlantGroup[] }>(
    url(
      `/api/users/${encodeURIComponent(pubkey)}/plantings-by-plant?pubkey=${encodeURIComponent(
        pubkey,
      )}`,
    ),
  );
  return data.groups;
}

/**
 * 全グリッド × 全セル × 全 crop_history（直近 200 件）。
 * クライアント側で grid_id ごとに group_by して表示する。
 */
export async function fetchCellHistories(pubkey: string): Promise<CropHistoryRecord[]> {
  const data = await jsonFetch<{ records: CropHistoryRecord[] }>(
    url(
      `/api/users/${encodeURIComponent(pubkey)}/cell-histories?pubkey=${encodeURIComponent(
        pubkey,
      )}`,
    ),
  );
  return data.records;
}

/**
 * 失敗 (died / disease / pest / failed) で ended した plantings 一覧。
 */
export async function fetchFailures(pubkey: string): Promise<FailurePlantingRecord[]> {
  const data = await jsonFetch<{ failures: FailurePlantingRecord[] }>(
    url(`/api/users/${encodeURIComponent(pubkey)}/failures?pubkey=${encodeURIComponent(pubkey)}`),
  );
  return data.failures;
}
