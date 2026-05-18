// 季節判定ヘルパのテスト (Issue: kako-jun/farm-in-pocket#41)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  inferSeasonForPlant,
  isSeasonalPlantForNow,
  seasonFromMonth,
  seasonNow,
  seasonTheme,
} from "./season";

describe("seasonFromMonth", () => {
  it("3-5月は春", () => {
    expect(seasonFromMonth(3)).toBe("spring");
    expect(seasonFromMonth(5)).toBe("spring");
  });

  it("6-8月は夏", () => {
    expect(seasonFromMonth(6)).toBe("summer");
    expect(seasonFromMonth(8)).toBe("summer");
  });

  it("9-11月は秋", () => {
    expect(seasonFromMonth(9)).toBe("autumn");
    expect(seasonFromMonth(11)).toBe("autumn");
  });

  it("12, 1, 2月は冬", () => {
    expect(seasonFromMonth(12)).toBe("winter");
    expect(seasonFromMonth(1)).toBe("winter");
    expect(seasonFromMonth(2)).toBe("winter");
  });

  it("境界: 2/28 と 3/1 は winter→spring 切替", () => {
    // 2/28 (month=2) → winter
    expect(seasonFromMonth(new Date(2025, 1, 28).getMonth() + 1)).toBe("winter");
    // 3/1 (month=3) → spring
    expect(seasonFromMonth(new Date(2025, 2, 1).getMonth() + 1)).toBe("spring");
  });
});

describe("seasonNow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("4月の任意日は春", () => {
    vi.setSystemTime(new Date(2026, 3, 15, 12, 0, 0)); // 2026-04-15
    expect(seasonNow()).toBe("spring");
  });

  it("引数で渡した Date でも動く", () => {
    expect(seasonNow(new Date(2026, 6, 1))).toBe("summer"); // 7月
  });
});

describe("seasonTheme", () => {
  it("4 種類すべてに label / icon / bodyGradient / accentColor が揃っている", () => {
    for (const s of ["spring", "summer", "autumn", "winter"] as const) {
      const t = seasonTheme(s);
      expect(t.season).toBe(s);
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.icon.length).toBeGreaterThan(0);
      expect(t.bodyGradient).toMatch(/linear-gradient/);
      expect(t.accentColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(t.accentColorSoft).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("inferSeasonForPlant", () => {
  it("春タグ → spring", () => {
    expect(inferSeasonForPlant(["春まき"])).toBe("spring");
    expect(inferSeasonForPlant(["春植え", "果菜"])).toBe("spring");
    expect(inferSeasonForPlant(["春先まき"])).toBe("spring");
  });

  it("夏タグ → summer", () => {
    expect(inferSeasonForPlant(["夏野菜"])).toBe("summer");
    expect(inferSeasonForPlant(["夏まき"])).toBe("summer");
    expect(inferSeasonForPlant(["夏植え"])).toBe("summer");
  });

  it("秋タグ → autumn", () => {
    expect(inferSeasonForPlant(["秋まき"])).toBe("autumn");
    expect(inferSeasonForPlant(["秋植え"])).toBe("autumn");
    expect(inferSeasonForPlant(["秋野菜"])).toBe("autumn");
  });

  it("冬タグ → winter", () => {
    expect(inferSeasonForPlant(["冬野菜"])).toBe("winter");
    expect(inferSeasonForPlant(["冬まき"])).toBe("winter");
  });

  it("該当タグなしは null", () => {
    expect(inferSeasonForPlant([])).toBeNull();
    expect(inferSeasonForPlant(["果菜", "実もの"])).toBeNull();
  });

  it("優先順: 春 > 夏 > 秋 > 冬（複数該当時）", () => {
    expect(inferSeasonForPlant(["春まき", "夏野菜"])).toBe("spring");
    expect(inferSeasonForPlant(["夏野菜", "秋まき"])).toBe("summer");
  });
});

describe("isSeasonalPlantForNow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("春に「春まき」タグは true", () => {
    vi.setSystemTime(new Date(2026, 3, 10)); // 4月
    expect(isSeasonalPlantForNow(["春まき"])).toBe(true);
  });

  it("春に「夏野菜」タグは false（季節違い）", () => {
    vi.setSystemTime(new Date(2026, 3, 10)); // 4月
    expect(isSeasonalPlantForNow(["夏野菜"])).toBe(false);
  });

  it("タグから推定できない場合は false（季節判定不能）", () => {
    vi.setSystemTime(new Date(2026, 3, 10));
    expect(isSeasonalPlantForNow([])).toBe(false);
    expect(isSeasonalPlantForNow(["果菜"])).toBe(false);
  });

  it("引数 now で別の月を指定するとそちらで判定", () => {
    // システム時間に依存せず、winter (12月) として判定
    expect(isSeasonalPlantForNow(["冬野菜"], new Date(2026, 11, 15))).toBe(true);
    expect(isSeasonalPlantForNow(["春まき"], new Date(2026, 11, 15))).toBe(false);
  });
});
