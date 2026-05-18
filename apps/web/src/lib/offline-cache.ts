// オフラインキャッシュ (Issue: kako-jun/farm-in-pocket#42)
//
// API 取得結果の最後の状態を localStorage に保存し、圏外時の fallback として使う。
// PWA precache はアプリの shell（HTML/JS/CSS）を担当し、こちらは「ユーザーデータの最後の状態」を担当する。
//
// 共通ヘルパ readCache / writeCache に加え、よく使う対象（grids / plants）に専用 wrapper を用意する。

import type { GridRecord, PlantSummary } from "@farm-in-pocket/shared";

export const CACHE_PREFIX = "fip:cache:";

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** 任意 JSON を `fip:cache:<key>` に保存する。SSR では no-op。 */
export function writeCache<T>(key: string, value: T): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // QuotaExceeded 等は無視（古いキャッシュが残るだけ）
  }
}

/** `fip:cache:<key>` を読み出す。存在しない / JSON 壊れていれば null。 */
export function readCache<T>(key: string): T | null {
  if (!hasWindow()) return null;
  const raw = window.localStorage.getItem(`${CACHE_PREFIX}${key}`);
  if (raw === null || raw.length === 0) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function removeCache(key: string): void {
  if (!hasWindow()) return;
  window.localStorage.removeItem(`${CACHE_PREFIX}${key}`);
}

// ---- grids ----------------------------------------------------------------

function gridsKey(pubkey: string): string {
  return `grids:${pubkey}`;
}

export function cacheGrids(pubkey: string, grids: GridRecord[]): void {
  writeCache(gridsKey(pubkey), grids);
}

export function loadCachedGrids(pubkey: string): GridRecord[] | null {
  return readCache<GridRecord[]>(gridsKey(pubkey));
}

// ---- plants ---------------------------------------------------------------

const PLANTS_KEY = "plants";

export function cachePlants(plants: PlantSummary[]): void {
  writeCache(PLANTS_KEY, plants);
}

export function loadCachedPlants(): PlantSummary[] | null {
  return readCache<PlantSummary[]>(PLANTS_KEY);
}
