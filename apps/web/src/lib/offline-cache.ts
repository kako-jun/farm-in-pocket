// オフラインキャッシュ (Issue: kako-jun/farm-in-pocket#42)
//
// API 取得結果の最後の状態を localStorage に保存し、圏外時の fallback として使う。
// PWA precache はアプリの shell（HTML/JS/CSS）を担当し、こちらは「ユーザーデータの最後の状態」を担当する。
//
// 共通ヘルパ readCache / writeCache に加え、よく使う対象（grids / plants）に専用 wrapper を用意する。
//
// SHOULD-2: 保存形式は { at, value } のエンベロープ。
// at = 書き込み時刻 (Date.now())。読み出し時に 7 日超なら null を返して expired 扱いにする。
// 旧形式（直接 array が入っているもの）は最初の read 時に新形式に書き直す migration を入れて
// 後方互換を保つ。

import type { GridRecord, PlantSummary } from "@farm-in-pocket/shared";

export const CACHE_PREFIX = "fip:cache:";
/** SHOULD-2: 7 日 (ms)。これを超えたキャッシュは expired 扱い */
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CacheEnvelope<T> {
  at: number;
  value: T;
}

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isEnvelope<T>(value: unknown): value is CacheEnvelope<T> {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  // value は任意型なので存在チェックだけ。at は number 必須。
  return typeof v.at === "number" && "value" in v;
}

/** 任意 JSON を `fip:cache:<key>` に保存する。SSR では no-op。 */
export function writeCache<T>(key: string, value: T): void {
  if (!hasWindow()) return;
  try {
    const envelope: CacheEnvelope<T> = { at: Date.now(), value };
    window.localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(envelope));
  } catch {
    // QuotaExceeded 等は無視（古いキャッシュが残るだけ）
  }
}

/**
 * `fip:cache:<key>` を読み出す。存在しない / JSON 壊れている / TTL 超過なら null。
 * SHOULD-2: 旧形式（直接 array 等）は最初の read で新形式に書き直す migration を行う。
 */
export function readCache<T>(key: string): T | null {
  if (!hasWindow()) return null;
  const fullKey = `${CACHE_PREFIX}${key}`;
  const raw = window.localStorage.getItem(fullKey);
  if (raw === null || raw.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (isEnvelope<T>(parsed)) {
    // TTL チェック
    if (Date.now() - parsed.at > CACHE_TTL_MS) {
      // expired はそのまま消す（次回 write で新鮮なものに書き換わる）
      window.localStorage.removeItem(fullKey);
      return null;
    }
    return parsed.value;
  }
  // 旧形式（envelope ではない生データ）。一度だけ読めるように扱い、新形式に migration する。
  // 既存ユーザーの「圏外時に何も見えない」を避ける救済。新鮮さは保証されないので at=now() で書き直す。
  const legacyValue = parsed as T;
  try {
    const envelope: CacheEnvelope<T> = { at: Date.now(), value: legacyValue };
    window.localStorage.setItem(fullKey, JSON.stringify(envelope));
  } catch {
    // migration 失敗は無視（読み出し自体は成功扱いにする）
  }
  return legacyValue;
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
