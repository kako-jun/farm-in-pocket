import { describe, expect, it } from "vitest";
import { buildWorkRecordEvent } from "./farm-events";

describe("buildWorkRecordEvent", () => {
  it("kind=1 / content / 必須タグ（t=mypace, t=farm-in-pocket, farm-action）が入る", () => {
    const ev = buildWorkRecordEvent({
      action: "watering",
      content: "朝の水やり完了",
      createdAt: 1_700_000_000,
    });
    expect(ev.kind).toBe(1);
    expect(ev.content).toBe("朝の水やり完了");
    expect(ev.tags).toContainEqual(["t", "mypace"]);
    expect(ev.tags).toContainEqual(["t", "farm-in-pocket"]);
    expect(ev.tags).toContainEqual(["farm-action", "watering"]);
    // 並びは t=mypace / t=farm-in-pocket / farm-action の順
    expect(ev.tags[0]).toEqual(["t", "mypace"]);
    expect(ev.tags[1]).toEqual(["t", "farm-in-pocket"]);
    expect(ev.tags[2]).toEqual(["farm-action", "watering"]);
  });

  it("tags に t=mypace が含まれる（mypace タイムライン連携のため必須）", () => {
    // kako-jun 製アプリの投稿は mypace の1投稿として発行する設計のため、
    // どの action でも t=mypace が必ず含まれている必要がある。
    for (const action of ["watering", "seeding", "harvest", "fertilize", "other"] as const) {
      const ev = buildWorkRecordEvent({
        action,
        content: "テスト",
        createdAt: 1_700_000_000,
      });
      expect(ev.tags).toContainEqual(["t", "mypace"]);
    }
  });

  it("cropName 指定時に farm-crop タグが入る", () => {
    const ev = buildWorkRecordEvent({
      action: "harvest",
      content: "トマト収穫",
      cropName: "トマト",
      createdAt: 1_700_000_000,
    });
    expect(ev.tags).toContainEqual(["farm-crop", "トマト"]);
  });

  it("cropName が undefined / 空文字なら farm-crop タグは入らない", () => {
    const ev1 = buildWorkRecordEvent({
      action: "seeding",
      content: "種まき",
      createdAt: 1_700_000_000,
    });
    expect(ev1.tags.some((t) => t[0] === "farm-crop")).toBe(false);

    const ev2 = buildWorkRecordEvent({
      action: "seeding",
      content: "種まき",
      cropName: "",
      createdAt: 1_700_000_000,
    });
    expect(ev2.tags.some((t) => t[0] === "farm-crop")).toBe(false);
  });

  it("farm-cell は gridId + cellX + cellY が揃ったときだけ 3 要素タグで入る", () => {
    const ev = buildWorkRecordEvent({
      action: "fertilize",
      content: "施肥",
      gridId: "g1",
      cellX: 2,
      cellY: 3,
      createdAt: 1_700_000_000,
    });
    expect(ev.tags).toContainEqual(["farm-cell", "g1", "2", "3"]);
  });

  it("farm-cell は部分指定（cellY が null）なら入らない", () => {
    const ev = buildWorkRecordEvent({
      action: "fertilize",
      content: "施肥",
      gridId: "g1",
      cellX: 2,
      cellY: null,
      createdAt: 1_700_000_000,
    });
    expect(ev.tags.some((t) => t[0] === "farm-cell")).toBe(false);
  });

  it("imageUrls が image タグとして複数入る（空文字はスキップ）", () => {
    const ev = buildWorkRecordEvent({
      action: "observation",
      content: "観察",
      imageUrls: ["https://r2.example/a.jpg", "https://r2.example/b.jpg", ""],
      createdAt: 1_700_000_000,
    });
    const imageTags = ev.tags.filter((t) => t[0] === "image");
    expect(imageTags).toEqual([
      ["image", "https://r2.example/a.jpg"],
      ["image", "https://r2.example/b.jpg"],
    ]);
  });

  it("createdAt 既定値は現在時刻（unix 秒）", () => {
    const before = Math.floor(Date.now() / 1000);
    const ev = buildWorkRecordEvent({ action: "other", content: "" });
    const after = Math.floor(Date.now() / 1000);
    expect(ev.created_at).toBeGreaterThanOrEqual(before);
    expect(ev.created_at).toBeLessThanOrEqual(after);
    expect(Number.isInteger(ev.created_at)).toBe(true);
  });

  it("createdAt 指定値はそのまま入る（整数化）", () => {
    const ev = buildWorkRecordEvent({
      action: "ph_measure",
      content: "pH 6.5",
      createdAt: 1_700_000_123.7,
    });
    expect(ev.created_at).toBe(1_700_000_123);
  });

  // Issue #27 — 節目イベントの farm-milestone タグ
  it("milestone 指定時に farm-milestone タグが入る", () => {
    const ev = buildWorkRecordEvent({
      action: "harvest",
      content: "今年初収穫！",
      milestone: "harvest_complete",
      createdAt: 1_700_000_000,
    });
    expect(ev.tags).toContainEqual(["farm-milestone", "harvest_complete"]);
  });

  it("milestone が未指定（undefined / null）なら farm-milestone タグは入らない", () => {
    const ev1 = buildWorkRecordEvent({
      action: "watering",
      content: "水やり",
      createdAt: 1_700_000_000,
    });
    expect(ev1.tags.some((t) => t[0] === "farm-milestone")).toBe(false);

    const ev2 = buildWorkRecordEvent({
      action: "watering",
      content: "水やり",
      milestone: null,
      createdAt: 1_700_000_000,
    });
    expect(ev2.tags.some((t) => t[0] === "farm-milestone")).toBe(false);
  });
});
