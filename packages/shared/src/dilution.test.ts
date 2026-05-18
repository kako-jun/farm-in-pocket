// 希釈計算サポーターのテスト (Issue: kako-jun/farm-in-pocket#36)

import { describe, expect, it } from "vitest";
import { calcDilution, hasDilution } from "./dilution";

describe("calcDilution", () => {
  it("1000 倍液 2L → 原液 2ml + 水 1998ml", () => {
    const r = calcDilution({ ratio: 1000, targetVolumeLiters: 2 });
    expect(r.targetVolumeMl).toBe(2000);
    expect(r.concentrateMl).toBe(2);
    expect(r.waterMl).toBe(1998);
    expect(r.ratio).toBe(1000);
    expect(r.targetVolumeLiters).toBe(2);
  });

  it("500 倍液 5L → 原液 10ml + 水 4990ml", () => {
    const r = calcDilution({ ratio: 500, targetVolumeLiters: 5 });
    expect(r.concentrateMl).toBe(10);
    expect(r.waterMl).toBe(4990);
  });

  it("targetVolumeLiters=0 なら原液・水とも 0", () => {
    const r = calcDilution({ ratio: 1000, targetVolumeLiters: 0 });
    expect(r.targetVolumeMl).toBe(0);
    expect(r.concentrateMl).toBe(0);
    expect(r.waterMl).toBe(0);
  });

  it("負の量・負の倍率はガードして 0 / 1 にクランプ", () => {
    const r = calcDilution({ ratio: -5, targetVolumeLiters: -2 });
    expect(r.targetVolumeLiters).toBe(0);
    expect(r.ratio).toBe(1);
    expect(r.concentrateMl).toBe(0);
    expect(r.waterMl).toBe(0);
  });

  it("ratio=1（原液そのまま）→ 水 0、原液は targetMl と同じ", () => {
    const r = calcDilution({ ratio: 1, targetVolumeLiters: 1.5 });
    expect(r.concentrateMl).toBe(1500);
    expect(r.waterMl).toBe(0);
  });
});

describe("hasDilution", () => {
  it("ratios が 1 件以上で true、null / 空配列で false", () => {
    expect(hasDilution(null)).toBe(false);
    expect(hasDilution(undefined)).toBe(false);
    expect(hasDilution({ unit: "倍液", ratios: [] })).toBe(false);
    expect(hasDilution({ unit: "倍液", ratios: [{ purpose: "通常", ratio: 1000 }] })).toBe(true);
  });
});
