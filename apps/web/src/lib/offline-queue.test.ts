// offline-queue.ts のテスト (Issue: kako-jun/farm-in-pocket#42)

import type { OfflineAction } from "@farm-in-pocket/shared";
import { beforeEach, describe, expect, it } from "vitest";
import {
  OFFLINE_QUEUE_MAX,
  OFFLINE_QUEUE_STORAGE_KEY,
  clearQueue,
  loadQueue,
  pushAction,
  queueLength,
  saveQueue,
  shiftAction,
} from "./offline-queue";

function mkWatering(plantingId: number): OfflineAction {
  return {
    kind: "recordWatering",
    plantingId,
    pubkey: "a".repeat(64),
    queuedAt: 1_700_000_000_000 + plantingId,
  };
}

describe("offline-queue (localStorage)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("未保存なら loadQueue は空配列", () => {
    expect(loadQueue()).toEqual([]);
    expect(queueLength()).toBe(0);
  });

  it("pushAction で末尾に積まれ、shiftAction で先頭から取り除かれる", () => {
    pushAction(mkWatering(1));
    pushAction(mkWatering(2));
    pushAction(mkWatering(3));
    expect(loadQueue().map((a) => (a.kind === "recordWatering" ? a.plantingId : -1))).toEqual([
      1, 2, 3,
    ]);
    shiftAction();
    expect(loadQueue().map((a) => (a.kind === "recordWatering" ? a.plantingId : -1))).toEqual([
      2, 3,
    ]);
  });

  it("clearQueue で全消去される", () => {
    pushAction(mkWatering(1));
    pushAction(mkWatering(2));
    clearQueue();
    expect(loadQueue()).toEqual([]);
  });

  it("OFFLINE_QUEUE_MAX を超える保存は古いものから捨てる", () => {
    const many: OfflineAction[] = [];
    for (let i = 0; i < OFFLINE_QUEUE_MAX + 5; i++) {
      many.push(mkWatering(i));
    }
    saveQueue(many);
    const stored = loadQueue();
    expect(stored).toHaveLength(OFFLINE_QUEUE_MAX);
    expect(stored[0]?.kind).toBe("recordWatering");
    if (stored[0]?.kind === "recordWatering") {
      expect(stored[0].plantingId).toBe(5);
    }
  });

  it("壊れた JSON / 不正形式は空配列にフォールバックする", () => {
    localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, "{not json");
    expect(loadQueue()).toEqual([]);

    localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify([{ wrong: "shape" }]));
    expect(loadQueue()).toEqual([]);
  });
});
