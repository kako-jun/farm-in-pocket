// Offline queue flusher (Issue: kako-jun/farm-in-pocket#42)
//
// オンライン復帰時 (online event) + 定期 (60s) でキューを順次 fire する。
// 失敗したら先頭に残し次回に持ち越す（中断）。テストしやすいよう依存を注入できる形にしてある。

import type { NostrEvent, OfflineAction } from "@farm-in-pocket/shared";
import { loadQueue, saveQueue, shiftAction } from "./offline-queue";

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
  /** SHOULD-1: attempts 超で drop した action の通知 (console.warn 等。テストでは spy する) */
  onDrop?: (action: OfflineAction, attempts: number) => void;
}

export interface FlushResult {
  attempted: number;
  succeeded: number;
  remaining: number;
  /** SHOULD-1: 永続失敗で drop した件数 */
  dropped: number;
}

/** SHOULD-1: この回数失敗したら drop（5 回まで再試行 = attempts=5 で drop）。 */
export const OFFLINE_MAX_ATTEMPTS = 5;

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

/**
 * 先頭アクションの attempts を +1 して永続化する。
 * SHOULD-1: 失敗を 1 周ごとにカウントし、閾値超で drop する。
 */
function incrementHeadAttempts(): { attempts: number; action: OfflineAction } | null {
  const queue = loadQueue();
  const head = queue[0];
  if (!head) return null;
  const nextAttempts = (head.attempts ?? 0) + 1;
  // 型ガードを保ったまま attempts を差し替える
  const updated: OfflineAction = { ...head, attempts: nextAttempts };
  const nextQueue = [updated, ...queue.slice(1)];
  saveQueue(nextQueue);
  return { attempts: nextAttempts, action: updated };
}

/** キューを 1 周だけ flush する。途中 1 件失敗したら以降は止めて残す。 */
export async function flushQueue(deps: FlusherDeps): Promise<FlushResult> {
  const isOnline = deps.isOnline ?? (() => true);
  if (!isOnline()) {
    return { attempted: 0, succeeded: 0, remaining: loadQueue().length, dropped: 0 };
  }
  let attempted = 0;
  let succeeded = 0;
  let dropped = 0;
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
      // SHOULD-1: 失敗時は attempts をインクリメント。閾値超なら drop して次へ。
      const bumped = incrementHeadAttempts();
      if (bumped !== null && bumped.attempts >= OFFLINE_MAX_ATTEMPTS) {
        shiftAction();
        dropped += 1;
        deps.onDrop?.(bumped.action, bumped.attempts);
        // drop した分は再試行しないが、次の head は別アクション。続行する。
        continue;
      }
      // 閾値未満なら従来どおり打ち切り（一過性の障害を想定して即座に再試行はしない）。
      break;
    }
  }
  return { attempted, succeeded, remaining: loadQueue().length, dropped };
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
      flushNow: async () => ({ attempted: 0, succeeded: 0, remaining: 0, dropped: 0 }),
    };
  }
  let stopped = false;
  let inflight: Promise<FlushResult> | null = null;

  // SHOULD-7: inflight 中の二重呼び出しは「同じ Promise」を返す契約。
  // async 関数を介すと毎回新しい Promise が出てしまうので、敢えて async は付けない。
  const run = (): Promise<FlushResult> => {
    if (stopped) {
      return Promise.resolve({
        attempted: 0,
        succeeded: 0,
        remaining: loadQueue().length,
        dropped: 0,
      });
    }
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
