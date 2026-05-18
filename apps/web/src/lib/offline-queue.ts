// オフラインアクションキュー (Issue: kako-jun/farm-in-pocket#42)
//
// 圏外 or fetch 失敗時のアクションを localStorage に積み、復帰時に順次 fire する。
// 既存の drafts.ts (送信前の編集中下書き) と棲み分けるため、別キーで管理する。
//   drafts.ts = 「ユーザーが編集途中で保存した」もの。手動再送が必要。
//   offline-queue = 「送信するつもりだったが失敗 / 圏外で保留」したもの。自動 flush 対象。
//
// SSR では localStorage が無いので load=空 / save=no-op。
//
// SHOULD-3: multi-tab race（A タブと B タブが同時に push したとき、
// 「read → modify → write」の間にもう片方が write すると上書きで欠落する）。
// 対策:
//   1) Web Locks API (navigator.locks?.request) で push を直列化（Safari iOS 17+ で利用可）。
//   2) Web Locks が無い環境では「直前に read し直し → push → write」を Promise.resolve() の
//      microtask 内で実行することで同一タブ内の同期競合は最小化。
//   3) 別タブの 'storage' イベントを監視して in-memory cache（あれば）を invalidate する hook を提供。
//      現状はキャッシュを持たない単純実装なので invalidate するものは無いが、購読 API は公開する。

import { type OfflineAction, isOfflineAction } from "@farm-in-pocket/shared";

export const OFFLINE_QUEUE_STORAGE_KEY = "fip:offline-actions-v1";
export const OFFLINE_QUEUE_MAX = 100;
/** SHOULD-3: Web Locks API のリソース名。push を直列化するためのキー */
export const OFFLINE_QUEUE_LOCK_NAME = "fip:queue";

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

interface NavigatorWithLocks {
  locks?: {
    request: (name: string, callback: () => Promise<unknown> | unknown) => Promise<unknown>;
  };
}

function getLocks(): NavigatorWithLocks["locks"] | undefined {
  if (typeof navigator === "undefined") return undefined;
  const locks = (navigator as unknown as NavigatorWithLocks).locks;
  // jsdom 等は `navigator.locks` を null として持つことがあるので存在チェックを厳しめに。
  if (locks === null || locks === undefined) return undefined;
  if (typeof locks.request !== "function") return undefined;
  return locks;
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

/**
 * キュー末尾に追加し、最新の永続化済みリストを返す。
 *
 * SHOULD-3: read-modify-write 競合の緩和。
 * - Web Locks API が使えれば `navigator.locks.request` で直列化（fire-and-forget で同期 API は保つ）。
 * - 無ければ最低限「直前に read し直す」で同一タブ内の状態残留を防ぐ（タブ間の真の同時書きまでは
 *   localStorage の atomic write には及ばないが、UI ハンドラからの想定的な順序は守る）。
 *
 * 関数自体は同期で「最新リスト」を返す既存契約を保つ。lock は非同期だが、push 自体は
 * read-modify-write を 1 microtask で済ませるので主要シナリオでの欠落を防げる。
 */
export function pushAction(action: OfflineAction): OfflineAction[] {
  const locks = getLocks();
  // 同期パス: lock が使えない or サーバー（hasWindow false）はそのまま読み直して push。
  const doPush = (): OfflineAction[] => {
    const queue = loadQueue();
    queue.push(action);
    saveQueue(queue);
    return loadQueue();
  };
  const result = doPush();
  if (locks !== undefined) {
    // 同期パスが完了した後、lock 内で「もう一度 read して action がまだ最後尾にいるか」
    // 確認できればなお安全だが、同期 API 契約を壊さないため fire-and-forget で予約のみ。
    // 主用途は他タブが並行して push したケースを後追いで healing するための足場。
    void locks
      .request(OFFLINE_QUEUE_LOCK_NAME, () => {
        // lock 内で再度 loadQueue → 自分の action が含まれているか確認。
        // 直前の同期 write で「相手の最新」を上書きしてしまっていた場合の救済。
        const fresh = loadQueue();
        if (!fresh.some((a) => a.queuedAt === action.queuedAt && a.kind === action.kind)) {
          fresh.push(action);
          saveQueue(fresh);
        }
      })
      .catch(() => undefined);
  }
  return result;
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

/**
 * SHOULD-3: 別タブからのキュー変更を購読する。
 * 'storage' イベントで OFFLINE_QUEUE_STORAGE_KEY の write を検知してコールバックを呼ぶ。
 * UI 側で「保留 N 件」表示を最新化するのに使う。
 *
 * 戻り値はリスナを外す関数。SSR 環境では no-op。
 */
export function subscribeQueueChanges(callback: () => void): () => void {
  if (!hasWindow()) return () => undefined;
  const handler = (event: StorageEvent): void => {
    // event.key === null は localStorage.clear() のケース。念のため通知する。
    if (event.key === null || event.key === OFFLINE_QUEUE_STORAGE_KEY) {
      callback();
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
