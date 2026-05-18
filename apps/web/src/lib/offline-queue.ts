// オフラインアクションキュー (Issue: kako-jun/farm-in-pocket#42)
//
// 圏外 or fetch 失敗時のアクションを localStorage に積み、復帰時に順次 fire する。
// 既存の drafts.ts (送信前の編集中下書き) と棲み分けるため、別キーで管理する。
//   drafts.ts = 「ユーザーが編集途中で保存した」もの。手動再送が必要。
//   offline-queue = 「送信するつもりだったが失敗 / 圏外で保留」したもの。自動 flush 対象。
//
// SSR では localStorage が無いので load=空 / save=no-op。

import { type OfflineAction, isOfflineAction } from "@farm-in-pocket/shared";

export const OFFLINE_QUEUE_STORAGE_KEY = "fip:offline-actions-v1";
export const OFFLINE_QUEUE_MAX = 100;

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadQueue(): OfflineAction[] {
  if (!hasWindow()) return [];
  const raw = window.localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
  if (raw === null || raw.length === 0) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isOfflineAction);
  } catch {
    return [];
  }
}

export function saveQueue(queue: OfflineAction[]): void {
  if (!hasWindow()) return;
  // 古いものから trim（先頭が古い）
  const trimmed =
    queue.length > OFFLINE_QUEUE_MAX ? queue.slice(queue.length - OFFLINE_QUEUE_MAX) : queue;
  window.localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(trimmed));
}

/** キュー末尾に追加し、最新の永続化済みリストを返す。 */
export function pushAction(action: OfflineAction): OfflineAction[] {
  const queue = loadQueue();
  queue.push(action);
  saveQueue(queue);
  return loadQueue();
}

/** 先頭 1 件を取り除いて永続化し、最新リストを返す。 */
export function shiftAction(): OfflineAction[] {
  const queue = loadQueue();
  if (queue.length === 0) return queue;
  queue.shift();
  saveQueue(queue);
  return loadQueue();
}

export function clearQueue(): void {
  if (!hasWindow()) return;
  window.localStorage.removeItem(OFFLINE_QUEUE_STORAGE_KEY);
}

export function peekFirst(): OfflineAction | null {
  const queue = loadQueue();
  return queue[0] ?? null;
}

export function queueLength(): number {
  return loadQueue().length;
}
