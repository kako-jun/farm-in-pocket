import { describe, expect, it } from "vitest";
import { FILTER_NONE, FILTER_PRESETS, pickRandomFilter } from "./filters";

describe("FILTER_PRESETS", () => {
  it("7 種のプリセットを順序固定で提供する", () => {
    expect(FILTER_PRESETS).toHaveLength(7);
    expect(FILTER_PRESETS.map((p) => p.name)).toEqual([
      "Fuji",
      "Kodak",
      "Wash",
      "Xpro",
      "Mono",
      "Cool",
      "Vivid",
    ]);
    // 全プリセットが filter / color を持つ
    for (const preset of FILTER_PRESETS) {
      expect(preset.filter).toMatch(/\S/);
      expect(preset.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("FILTER_NONE は filter='none' で UI 用のフラグとして使える", () => {
    expect(FILTER_NONE.filter).toBe("none");
    expect(FILTER_NONE.name).toBe("なし");
  });
});

describe("pickRandomFilter", () => {
  it("常に FILTER_PRESETS のどれかを返す", () => {
    const names = new Set(FILTER_PRESETS.map((p) => p.name));
    for (let i = 0; i < 50; i++) {
      const picked = pickRandomFilter();
      expect(names.has(picked.name)).toBe(true);
    }
  });
});
