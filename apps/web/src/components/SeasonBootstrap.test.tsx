// SeasonBootstrap のテスト (Issue: kako-jun/farm-in-pocket#41)
//
// 副作用専用コンポーネントなので、テストの主役は document.body の CSS 変数 / data-* 属性。

import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SeasonBootstrap, { resolveActiveSeason, SEASON_OVERRIDE_KEY } from "./SeasonBootstrap";

describe("SeasonBootstrap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    document.body.removeAttribute("style");
    delete document.body.dataset.fipSeason;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.removeAttribute("style");
    delete document.body.dataset.fipSeason;
  });

  it("4月にマウントすると body に春テーマの CSS 変数 / data-fip-season=spring が当たる", () => {
    vi.setSystemTime(new Date(2026, 3, 10)); // 4月

    render(<SeasonBootstrap />);

    expect(document.body.dataset.fipSeason).toBe("spring");
    const gradient = document.body.style.getPropertyValue("--fip-body-gradient");
    expect(gradient).toContain("linear-gradient");
    // 春は #ffe9ec (薄ピンク) を含む。
    expect(gradient.toLowerCase()).toContain("#ffe9ec");
    expect(document.body.style.getPropertyValue("--fip-accent-color").toLowerCase()).toBe(
      "#ec4899",
    );
  });

  it("localStorage の override が優先される（実時刻が春でも winter テーマを当てる）", () => {
    vi.setSystemTime(new Date(2026, 3, 10)); // 4月だが…
    localStorage.setItem(SEASON_OVERRIDE_KEY, "winter");

    render(<SeasonBootstrap />);

    expect(document.body.dataset.fipSeason).toBe("winter");
    expect(document.body.style.getPropertyValue("--fip-accent-color").toLowerCase()).toBe(
      "#6366f1",
    );
    expect(resolveActiveSeason()).toBe("winter");
  });

  it("unmount で body の CSS 変数と data-fip-season が掃除される", () => {
    vi.setSystemTime(new Date(2026, 6, 1)); // 7月 (summer)
    const { unmount } = render(<SeasonBootstrap />);
    expect(document.body.dataset.fipSeason).toBe("summer");

    unmount();

    expect(document.body.dataset.fipSeason).toBeUndefined();
    expect(document.body.style.getPropertyValue("--fip-body-gradient")).toBe("");
    expect(document.body.style.getPropertyValue("--fip-accent-color")).toBe("");
  });
});
