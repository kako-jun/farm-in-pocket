// offline-flusher テスト (Issue: kako-jun/farm-in-pocket#42, #80)

import type { NostrEvent, OfflineAction } from "@farm-in-pocket/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FLUSH_INTERVAL_MS,
  OFFLINE_MAX_ATTEMPTS,
  flushQueue,
  startFlusher,
} from "./offline-flusher";
import { loadQueue, saveQueue } from "./offline-queue";

function mkEvent(id: string): NostrEvent {
  return {
    id: id.padEnd(64, "0"),
    pubkey: "b".repeat(64),
    created_at: 1_700_000_000,
    kind: 1,
    tags: [],
    content: id,
    sig: "c".repeat(128),
  };
}

function mkPublish(id: string, queuedAt: number): OfflineAction {
  return { kind: "publishEvent", event: mkEvent(id), queuedAt };
}

function mkWatering(plantingId: number, queuedAt: number): OfflineAction {
  return {
    kind: "recordWatering",
    plantingId,
    pubkey: "a".repeat(64),
    queuedAt,
  };
}

describe("flushQueue", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("online のときキュー全件を順に fire し、成功したぶんだけ shift する", async () => {
    saveQueue([mkPublish("p1", 1), mkWatering(7, 2), mkPublish("p2", 3)]);
    const publishEvent = vi.fn().mockResolvedValue({ success: true });
    const recordWatering = vi.fn().mockResolvedValue({});
    const result = await flushQueue({
      publishEvent,
      recordWatering,
      isOnline: () => true,
    });
    expect(result).toEqual({ attempted: 3, succeeded: 3, remaining: 0, dropped: 0 });
    expect(publishEvent).toHaveBeenCalledTimes(2);
    expect(recordWatering).toHaveBeenCalledTimes(1);
    expect(loadQueue()).toHaveLength(0);
  });

  it("offline のときは何もせず remaining を保つ", async () => {
    saveQueue([mkPublish("p1", 1)]);
    const publishEvent = vi.fn().mockResolvedValue({});
    const recordWatering = vi.fn().mockResolvedValue({});
    const result = await flushQueue({
      publishEvent,
      recordWatering,
      isOnline: () => false,
    });
    expect(result).toEqual({ attempted: 0, succeeded: 0, remaining: 1, dropped: 0 });
    expect(publishEvent).not.toHaveBeenCalled();
    expect(loadQueue()).toHaveLength(1);
  });

  it("1 件目が失敗したら以降は止めて残す", async () => {
    saveQueue([mkPublish("p1", 1), mkPublish("p2", 2)]);
    const publishEvent = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed"));
    const recordWatering = vi.fn();
    const result = await flushQueue({
      publishEvent,
      recordWatering,
      isOnline: () => true,
    });
    expect(result).toEqual({ attempted: 1, succeeded: 0, remaining: 2, dropped: 0 });
    expect(publishEvent).toHaveBeenCalledTimes(1);
    expect(loadQueue()).toHaveLength(2);
  });

  it("一部成功で止まったケースは shift 済みの分だけキューが縮む", async () => {
    saveQueue([mkPublish("p1", 1), mkPublish("p2", 2), mkPublish("p3", 3)]);
    const publishEvent = vi
      .fn()
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new TypeError("fetch failed"));
    const recordWatering = vi.fn();
    const result = await flushQueue({
      publishEvent,
      recordWatering,
      isOnline: () => true,
    });
    expect(result).toEqual({ attempted: 2, succeeded: 1, remaining: 2, dropped: 0 });
    const remaining = loadQueue();
    expect(remaining).toHaveLength(2);
    expect(remaining[0]?.kind).toBe("publishEvent");
    if (remaining[0]?.kind === "publishEvent") {
      expect(remaining[0].event.content).toBe("p2");
    }
  });

  // SHOULD-1: 永続失敗で詰まらない（attempts カウンタで drop）
  it("失敗時に attempts がインクリメントされ、5 回超で先頭を drop して次へ進む", async () => {
    // attempts=4 で 1 回目の失敗 → 5 になって drop されるケース
    const stuck: OfflineAction = { ...mkPublish("stuck", 1), attempts: 4 };
    const next = mkPublish("next", 2);
    saveQueue([stuck, next]);
    const publishEvent = vi
      .fn()
      // 先頭の "stuck" は失敗 → attempts=5 で drop
      .mockRejectedValueOnce(new TypeError("4xx Bad Request"))
      // drop 後に次の "next" を試して成功
      .mockResolvedValueOnce({ success: true });
    const recordWatering = vi.fn();
    const onDrop = vi.fn();
    const result = await flushQueue({
      publishEvent,
      recordWatering,
      isOnline: () => true,
      onDrop,
    });
    expect(result.dropped).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.remaining).toBe(0);
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop.mock.calls[0]?.[1]).toBe(OFFLINE_MAX_ATTEMPTS);
    expect(loadQueue()).toHaveLength(0);
  });

  it("失敗してもまだ attempts 閾値未満なら drop せず残して打ち切る", async () => {
    saveQueue([mkPublish("p1", 1)]);
    const publishEvent = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const recordWatering = vi.fn();
    const onDrop = vi.fn();
    const result = await flushQueue({
      publishEvent,
      recordWatering,
      isOnline: () => true,
      onDrop,
    });
    expect(result).toEqual({ attempted: 1, succeeded: 0, remaining: 1, dropped: 0 });
    expect(onDrop).not.toHaveBeenCalled();
    const remaining = loadQueue();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.attempts).toBe(1);
  });
});

// SHOULD-7: startFlusher の interval / online / abort / 二重呼び出し
describe("startFlusher (interval / online / abort)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("setInterval (FLUSH_INTERVAL_MS) で flush が走る", async () => {
    saveQueue([mkPublish("p1", 1)]);
    const publishEvent = vi.fn().mockResolvedValue({ success: true });
    const recordWatering = vi.fn();
    const handle = startFlusher({
      publishEvent,
      recordWatering,
      isOnline: () => true,
    });
    try {
      // 起動直後の即時 run() で 1 回呼ばれる
      await vi.runOnlyPendingTimersAsync();
      expect(publishEvent).toHaveBeenCalledTimes(1);
      // もう 1 件積んで interval 進行
      saveQueue([mkPublish("p2", 2)]);
      publishEvent.mockClear();
      await vi.advanceTimersByTimeAsync(FLUSH_INTERVAL_MS);
      expect(publishEvent).toHaveBeenCalledTimes(1);
    } finally {
      handle.stop();
    }
  });

  it("online イベント発火で flush が呼ばれる", async () => {
    saveQueue([mkPublish("p1", 1)]);
    const publishEvent = vi.fn().mockResolvedValue({ success: true });
    const recordWatering = vi.fn();
    const handle = startFlusher({
      publishEvent,
      recordWatering,
      isOnline: () => true,
    });
    try {
      // 起動時 run の inflight を消化
      await vi.runOnlyPendingTimersAsync();
      publishEvent.mockClear();
      saveQueue([mkPublish("p2", 2)]);
      window.dispatchEvent(new Event("online"));
      await vi.runOnlyPendingTimersAsync();
      expect(publishEvent).toHaveBeenCalledTimes(1);
    } finally {
      handle.stop();
    }
  });

  it("stop() 後は interval も online も走らない", async () => {
    saveQueue([mkPublish("p1", 1)]);
    const publishEvent = vi.fn().mockResolvedValue({ success: true });
    const recordWatering = vi.fn();
    const handle = startFlusher({
      publishEvent,
      recordWatering,
      isOnline: () => true,
    });
    await vi.runOnlyPendingTimersAsync();
    publishEvent.mockClear();
    handle.stop();
    // stop 後にキュー追加 + interval/online を発火させても呼ばれない
    saveQueue([mkPublish("p2", 2)]);
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(FLUSH_INTERVAL_MS * 2);
    expect(publishEvent).not.toHaveBeenCalled();
  });

  it("inflight 中の二重呼び出しは同じ Promise を返す", async () => {
    saveQueue([mkPublish("p1", 1)]);
    // publish は手動で resolve できるよう deferred を作る
    let resolveFirst: (v: unknown) => void = () => undefined;
    const publishEvent = vi.fn().mockImplementationOnce(
      () =>
        new Promise<unknown>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const recordWatering = vi.fn();
    const handle = startFlusher({
      publishEvent,
      recordWatering,
      isOnline: () => true,
    });
    try {
      // 起動時 run() が走って inflight になっているはず
      const p1 = handle.flushNow();
      const p2 = handle.flushNow();
      expect(p1).toBe(p2);
      // 1 件目を解放して inflight を終わらせる
      resolveFirst({});
      await Promise.all([p1, p2]);
      // 起動 run + 明示 flushNow ×2（同 Promise）= 実際の publishEvent 呼び出しは 1 回
      expect(publishEvent).toHaveBeenCalledTimes(1);
    } finally {
      handle.stop();
    }
  });
});
