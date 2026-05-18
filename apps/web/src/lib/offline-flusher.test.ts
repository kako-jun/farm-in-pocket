// offline-flusher テスト (Issue: kako-jun/farm-in-pocket#42)

import type { NostrEvent, OfflineAction } from "@farm-in-pocket/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushQueue } from "./offline-flusher";
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
    expect(result).toEqual({ attempted: 3, succeeded: 3, remaining: 0 });
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
    expect(result).toEqual({ attempted: 0, succeeded: 0, remaining: 1 });
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
    expect(result).toEqual({ attempted: 1, succeeded: 0, remaining: 2 });
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
    expect(result).toEqual({ attempted: 2, succeeded: 1, remaining: 2 });
    const remaining = loadQueue();
    expect(remaining).toHaveLength(2);
    expect(remaining[0]?.kind).toBe("publishEvent");
    if (remaining[0]?.kind === "publishEvent") {
      expect(remaining[0].event.content).toBe("p2");
    }
  });
});
