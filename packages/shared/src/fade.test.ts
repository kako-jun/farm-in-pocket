// fade ヘルパのテスト (Issue kako-jun/farm-in-pocket#26)

import { describe, expect, it } from "vitest";
import { daysSince, fadeOpacity } from "./fade";

describe("fadeOpacity", () => {
  it("fertilize: 0 日で opacity 1.0", () => {
    expect(fadeOpacity(0, "fertilize")).toBe(1.0);
  });

  it("fertilize: 7 日で 1.0 (plateau)", () => {
    expect(fadeOpacity(7, "fertilize")).toBe(1.0);
  });

  it("fertilize: 30 日で 0.5", () => {
    expect(fadeOpacity(30, "fertilize")).toBeCloseTo(0.5, 6);
  });

  it("fertilize: 90 日で 0.15", () => {
    expect(fadeOpacity(90, "fertilize")).toBeCloseTo(0.15, 6);
  });

  it("fertilize: 90 日超でも 0.15 を維持（透明にしすぎない）", () => {
    expect(fadeOpacity(200, "fertilize")).toBeCloseTo(0.15, 6);
    expect(fadeOpacity(10_000, "fertilize")).toBeCloseTo(0.15, 6);
  });

  it("pesticide: 14 日で 0.5", () => {
    expect(fadeOpacity(14, "pesticide")).toBeCloseTo(0.5, 6);
  });

  it("pesticide: 線形補間 (10.5 日は plateau 終端 7 日と 14 日 0.5 の中間)", () => {
    // 7→14 区間、t=(10.5-7)/(14-7)=0.5、1.0 + (0.5-1.0)*0.5 = 0.75
    expect(fadeOpacity(10.5, "pesticide")).toBeCloseTo(0.75, 6);
  });

  it("ph: 1 ヶ月以内なら濃い、3 ヶ月で 0.5、6 ヶ月以上で 0.2", () => {
    expect(fadeOpacity(15, "ph")).toBe(1.0);
    expect(fadeOpacity(30, "ph")).toBe(1.0);
    expect(fadeOpacity(90, "ph")).toBeCloseTo(0.5, 6);
    expect(fadeOpacity(180, "ph")).toBeCloseTo(0.2, 6);
    expect(fadeOpacity(365, "ph")).toBeCloseTo(0.2, 6);
  });

  it("負値（=未来日）は 1.0", () => {
    expect(fadeOpacity(-5, "fertilize")).toBe(1.0);
    expect(fadeOpacity(-100, "ph")).toBe(1.0);
  });

  it("Infinity は最後の stop（最も透明）に倒れる", () => {
    expect(fadeOpacity(Number.POSITIVE_INFINITY, "fertilize")).toBeCloseTo(0.15, 6);
    expect(fadeOpacity(Number.POSITIVE_INFINITY, "pesticide")).toBeCloseTo(0.15, 6);
    expect(fadeOpacity(Number.POSITIVE_INFINITY, "ph")).toBeCloseTo(0.2, 6);
  });
});

describe("daysSince", () => {
  const now = new Date("2026-05-17T12:00:00Z");

  it("null / undefined / 空文字は Infinity", () => {
    expect(daysSince(null, now)).toBe(Number.POSITIVE_INFINITY);
    expect(daysSince(undefined, now)).toBe(Number.POSITIVE_INFINITY);
    expect(daysSince("", now)).toBe(Number.POSITIVE_INFINITY);
  });

  it("parse 不能な文字列は Infinity", () => {
    expect(daysSince("not-a-date", now)).toBe(Number.POSITIVE_INFINITY);
  });

  it("同じ日（数時間前）は 0 日", () => {
    expect(daysSince("2026-05-17T00:00:00Z", now)).toBe(0);
  });

  it("1 日前は 1", () => {
    expect(daysSince("2026-05-16T12:00:00Z", now)).toBe(1);
  });

  it("30 日前は 30", () => {
    expect(daysSince("2026-04-17T12:00:00Z", now)).toBe(30);
  });

  it("未来日は 0 にクランプ", () => {
    expect(daysSince("2026-06-01T12:00:00Z", now)).toBe(0);
  });

  it("YYYY-MM-DD だけでも parse できる", () => {
    // 2026-04-17 は UTC 00:00 として解釈。now=2026-05-17T12:00Z との差は 30 日 12 時間 → floor 30
    expect(daysSince("2026-04-17", now)).toBe(30);
  });
});
