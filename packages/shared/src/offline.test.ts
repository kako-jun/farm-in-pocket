// offline.ts のテスト (Issue: kako-jun/farm-in-pocket#42)

import { describe, expect, it } from "vitest";
import { type OfflineAction, isOfflineAction } from "./offline";

function makePublishEvent(): OfflineAction {
  return {
    kind: "publishEvent",
    queuedAt: 1_700_000_000_000,
    event: {
      id: "a".repeat(64),
      pubkey: "b".repeat(64),
      created_at: 1_700_000_000,
      kind: 1,
      tags: [["t", "farm-in-pocket"]],
      content: "test",
      sig: "c".repeat(128),
    },
  };
}

describe("offline action type guard", () => {
  it("publishEvent 形式の値を判定する", () => {
    expect(isOfflineAction(makePublishEvent())).toBe(true);
  });

  it("recordWatering 形式の値を判定する", () => {
    const action: OfflineAction = {
      kind: "recordWatering",
      plantingId: 7,
      pubkey: "a".repeat(64),
      wateredAt: "2026-05-17",
      note: "朝の水やり",
      queuedAt: 1_700_000_000_000,
    };
    expect(isOfflineAction(action)).toBe(true);
    // wateredAt / note は省略可
    expect(
      isOfflineAction({
        kind: "recordWatering",
        plantingId: 7,
        pubkey: "a".repeat(64),
        queuedAt: 1_700_000_000_000,
      }),
    ).toBe(true);
  });

  it("不正な値 (null / 別 kind / 欠損フィールド / 壊れた event) を弾く", () => {
    expect(isOfflineAction(null)).toBe(false);
    expect(isOfflineAction(undefined)).toBe(false);
    expect(isOfflineAction("string")).toBe(false);
    expect(isOfflineAction({})).toBe(false);
    expect(isOfflineAction({ kind: "unknown", queuedAt: 0 })).toBe(false);
    // queuedAt 欠損
    expect(
      isOfflineAction({
        kind: "recordWatering",
        plantingId: 7,
        pubkey: "a".repeat(64),
      }),
    ).toBe(false);
    // event 内部欠損
    expect(
      isOfflineAction({
        kind: "publishEvent",
        queuedAt: 0,
        event: { id: "a", pubkey: "b" },
      }),
    ).toBe(false);
  });
});
