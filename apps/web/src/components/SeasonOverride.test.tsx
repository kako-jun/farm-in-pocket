// SeasonOverride のテスト (Issue: kako-jun/farm-in-pocket#41)

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SEASON_OVERRIDE_KEY } from "./SeasonBootstrap";
import SeasonOverride from "./SeasonOverride";

describe("SeasonOverride", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("初期状態は localStorage 未設定 → 自動が選択されている", () => {
    render(<SeasonOverride />);
    const autoInput = screen
      .getByTestId("fip-season-override-auto")
      .querySelector("input") as HTMLInputElement;
    expect(autoInput.checked).toBe(true);
    expect(localStorage.getItem(SEASON_OVERRIDE_KEY)).toBeNull();
  });

  it("春のラジオを選ぶと localStorage に保存される", () => {
    render(<SeasonOverride />);
    const springInput = screen
      .getByTestId("fip-season-override-spring")
      .querySelector("input") as HTMLInputElement;

    fireEvent.click(springInput);

    expect(localStorage.getItem(SEASON_OVERRIDE_KEY)).toBe("spring");
    expect(springInput.checked).toBe(true);
  });

  it("自動に戻すと localStorage からキーが消える", () => {
    localStorage.setItem(SEASON_OVERRIDE_KEY, "summer");
    render(<SeasonOverride />);

    const autoInput = screen
      .getByTestId("fip-season-override-auto")
      .querySelector("input") as HTMLInputElement;
    // マウント時点では summer が選択されているはず
    const summerInput = screen
      .getByTestId("fip-season-override-summer")
      .querySelector("input") as HTMLInputElement;
    expect(summerInput.checked).toBe(true);

    fireEvent.click(autoInput);

    expect(localStorage.getItem(SEASON_OVERRIDE_KEY)).toBeNull();
    expect(autoInput.checked).toBe(true);
  });
});
