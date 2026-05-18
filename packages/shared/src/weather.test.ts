// WMO weather_code ラベル変換テスト (Issue kako-jun/farm-in-pocket#32)

import { describe, expect, it } from "vitest";
import { isOutdoorEnvironment } from "./db";
import { wmoToLabel } from "./weather";

describe("wmoToLabel", () => {
  it("0 は快晴 / isRain=false", () => {
    const r = wmoToLabel(0);
    expect(r.label).toBe("快晴");
    expect(r.isRain).toBe(false);
  });

  it("1-3 は晴れ〜曇り、45/48 は霧、71-77 は雪（いずれも isRain=false）", () => {
    for (const n of [1, 2, 3]) {
      expect(wmoToLabel(n).label).toBe("晴れ〜曇り");
      expect(wmoToLabel(n).isRain).toBe(false);
    }
    expect(wmoToLabel(45).label).toBe("霧");
    expect(wmoToLabel(48).label).toBe("霧");
    expect(wmoToLabel(45).isRain).toBe(false);
    for (const n of [71, 73, 75, 77]) {
      expect(wmoToLabel(n).label).toBe("雪");
      expect(wmoToLabel(n).isRain).toBe(false);
    }
  });

  it("51-67 / 80-82 / 95-99 は雨カテゴリで isRain=true", () => {
    for (const n of [51, 55, 61, 65, 67]) {
      expect(wmoToLabel(n).label).toBe("雨");
      expect(wmoToLabel(n).isRain).toBe(true);
    }
    for (const n of [80, 81, 82]) {
      expect(wmoToLabel(n).label).toBe("にわか雨");
      expect(wmoToLabel(n).isRain).toBe(true);
    }
    for (const n of [95, 96, 99]) {
      expect(wmoToLabel(n).label).toBe("雷雨");
      expect(wmoToLabel(n).isRain).toBe(true);
    }
    // 85-86 はにわか雪扱いで isRain=false
    expect(wmoToLabel(85).label).toBe("にわか雪");
    expect(wmoToLabel(85).isRain).toBe(false);
  });

  it("文字列 / null / 範囲外は「不明」", () => {
    expect(wmoToLabel("0").label).toBe("快晴"); // 数値文字列はパースして処理
    expect(wmoToLabel("61").isRain).toBe(true);
    expect(wmoToLabel(null).label).toBe("不明");
    expect(wmoToLabel(undefined).label).toBe("不明");
    expect(wmoToLabel(123).label).toBe("不明");
    expect(wmoToLabel("xyz").label).toBe("不明");
  });
});

describe("isOutdoorEnvironment", () => {
  it("outdoor_* は true、indoor / greenhouse は false", () => {
    expect(isOutdoorEnvironment("outdoor_sunny")).toBe(true);
    expect(isOutdoorEnvironment("outdoor_partial_shade")).toBe(true);
    expect(isOutdoorEnvironment("outdoor_shade")).toBe(true);
    expect(isOutdoorEnvironment("indoor")).toBe(false);
    expect(isOutdoorEnvironment("greenhouse")).toBe(false);
  });
});
