import type { WorkRecordDraft } from "@farm-in-pocket/shared";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DRAFTS_MAX,
  DRAFTS_STORAGE_KEY,
  addDraft,
  loadDrafts,
  removeDraft,
  saveDrafts,
  updateDraft,
} from "./drafts";

function mkDraft(overrides: Partial<WorkRecordDraft> = {}): WorkRecordDraft {
  return {
    id: overrides.id ?? "draft-1",
    action: overrides.action ?? "watering",
    content: overrides.content ?? "朝の水やり",
    gridId: overrides.gridId ?? null,
    cellX: overrides.cellX ?? null,
    cellY: overrides.cellY ?? null,
    cropName: overrides.cropName ?? null,
    imageUrls: overrides.imageUrls ?? [],
    createdAt: overrides.createdAt ?? 1_700_000_000,
  };
}

describe("drafts (localStorage キュー)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loadDrafts は未保存なら空配列を返す", () => {
    expect(loadDrafts()).toEqual([]);
  });

  it("saveDrafts → loadDrafts でラウンドトリップする", () => {
    const drafts = [mkDraft({ id: "a" }), mkDraft({ id: "b", action: "harvest" })];
    saveDrafts(drafts);
    expect(loadDrafts()).toEqual(drafts);
  });

  it("addDraft は新規 id を末尾に積み、同じ id は上書きする", () => {
    addDraft(mkDraft({ id: "a", content: "first" }));
    addDraft(mkDraft({ id: "b", content: "second" }));
    addDraft(mkDraft({ id: "a", content: "updated" }));

    const stored = loadDrafts();
    expect(stored).toHaveLength(2);
    expect(stored.find((d) => d.id === "a")?.content).toBe("updated");
    expect(stored.find((d) => d.id === "b")?.content).toBe("second");
  });

  it("removeDraft は指定 id を消す（無い id なら何もしない）", () => {
    saveDrafts([mkDraft({ id: "a" }), mkDraft({ id: "b" })]);
    removeDraft("a");
    expect(loadDrafts().map((d) => d.id)).toEqual(["b"]);
    removeDraft("nope");
    expect(loadDrafts().map((d) => d.id)).toEqual(["b"]);
  });

  it("updateDraft は patch を適用し、id は変更しない", () => {
    saveDrafts([mkDraft({ id: "a", content: "old" })]);
    updateDraft("a", { content: "new", action: "fertilize", id: "hacked" });
    const stored = loadDrafts();
    expect(stored[0]?.id).toBe("a");
    expect(stored[0]?.content).toBe("new");
    expect(stored[0]?.action).toBe("fertilize");
  });

  it("saveDrafts は DRAFTS_MAX を超えたら古いものから切り捨てる", () => {
    const many: WorkRecordDraft[] = [];
    for (let i = 0; i < DRAFTS_MAX + 5; i++) {
      many.push(mkDraft({ id: `d${i}` }));
    }
    saveDrafts(many);
    const stored = loadDrafts();
    expect(stored).toHaveLength(DRAFTS_MAX);
    // 古い 5 件が落ちて d5 が先頭になる
    expect(stored[0]?.id).toBe("d5");
    expect(stored[stored.length - 1]?.id).toBe(`d${DRAFTS_MAX + 4}`);
  });

  it("壊れた JSON / 不正な形式は空配列にフォールバックする", () => {
    localStorage.setItem(DRAFTS_STORAGE_KEY, "{not json");
    expect(loadDrafts()).toEqual([]);

    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify([{ wrong: "shape" }]));
    expect(loadDrafts()).toEqual([]);
  });
});
