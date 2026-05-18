// Offline queue flusher (Issue: kako-jun/farm-in-pocket#42)
//
// オンライン復帰時 (online event) + 定期 (60s) でキューを順次 fire する。
// 失敗したら先頭に残し次回に持ち越す（中断）。テストしやすいよう依存を注入できる形にしてある。

import type { NostrEvent, OfflineAction } from "@farm-in-pocket/shared";
import { loadQueue, shiftAction } from "./offline-queue";

export interface FlusherDeps {
  /** mypace `/api/publish` 相当。失敗時は throw する */
  publishEvent: (event: NostrEvent) => Promise<unknown>;
  /** D1 `/api/plantings/:id/water` 相当。失敗時は throw する */
  recordWatering: (
    plantingId: number,
    pubkey: string,
    wateredAt?: string,
    note?: string,
  ) => Promise<unknown>;
  /** オンライン判定 (navigator.onLine) */
  isOnline?: () => boolean;
}

export interface FlushResult {
  attempted: number;
  succeeded: number;
  remaining: number;
}

async function fireOne(action: OfflineAction, deps: FlusherDeps): Promise<void> {
  if (action.kind === "publishEvent") {
    await deps.publishEvent(action.event);
    return;
  }
  if (action.kind === "recordWatering") {
    await deps.recordWatering(action.plantingId, action.pubkey, action.wateredAt, action.note);
    return;
  }
  // 想定外 kind は drop（type guard で弾かれているはずだが保険）。
  // ここに来ても shift で消すために何もしないで return。
}

/** キューを 1 周だけ flush する。途中 1 件失敗したら以降は止めて残す。 */
export async function flushQueue(deps: FlusherDeps): Promise<FlushResult> {
  const isOnline = deps.isOnline ?? (() => true);
  if (!isOnline()) {
    return { attempted: 0, succeeded: 0, remaining: loadQueue().length };
  }
  let attempted = 0;
  let succeeded = 0;
  // ループ中も毎回 loadQueue() で最新を読む（他タブ更新やテスト中の同時 push に追随）。
  while (true) {
    const queue = loadQueue();
    if (queue.length === 0) break;
    const head = queue[0];
    if (!head) break;
    attempted += 1;
    try {
      await fireOne(head, deps);
      shiftAction();
      succeeded += 1;
    } catch {
      // 1 件失敗 → 残して打ち切る（オンラインに見えても実は届かないケースを想定）。
      break;
    }
  }
  return { attempted, succeeded, remaining: loadQueue().length };
}

export interface FlusherHandle {
  stop: () => void;
  /** 手動 flush（テスト・即時投稿後の追従用） */
  flushNow: () => Promise<FlushResult>;
}

export const FLUSH_INTERVAL_MS = 60_000;

/**
 * online イベント + setInterval(60s) でキュー flush を行う購読を始める。
 * SSR では何もせず stop() だけ返す。
 */
export function startFlusher(deps: FlusherDeps): FlusherHandle {
  if (typeof window === "undefined") {
    return {
      stop: () => undefined,
      flushNow: async () => ({ attempted: 0, succeeded: 0, remaining: 0 }),
    };
  }
  let stopped = false;
  let inflight: Promise<FlushResult> | null = null;

  const run = async (): Promise<FlushResult> => {
    if (stopped) return { attempted: 0, succeeded: 0, remaining: loadQueue().length };
    if (inflight) return inflight;
    inflight = flushQueue(deps).finally(() => {
      inflight = null;
    });
    return inflight;
  };

  const onOnline = (): void => {
    void run();
  };
  window.addEventListener("online", onOnline);
  const timer = window.setInterval(() => {
    void run();
  }, FLUSH_INTERVAL_MS);
  // 起動時に 1 回（オンラインなら即 flush）
  void run();

  return {
    stop: () => {
      stopped = true;
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
    },
    flushNow: run,
  };
}
