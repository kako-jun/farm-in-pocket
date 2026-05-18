// BackgroundReplaceSettings のテスト (Issue: kako-jun/farm-in-pocket#43)

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BACKGROUND_REPLACE_PREF_KEY,
  setBackgroundReplaceEnabled,
} from "../lib/background-replace-prefs";
import BackgroundReplaceSettings from "./BackgroundReplaceSettings";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("BackgroundReplaceSettings", () => {
  it("初期表示では未保存=未チェック、説明文も出る", () => {
    render(<BackgroundReplaceSettings />);
    const toggle = screen.getByTestId("fip-background-replace-toggle") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(screen.getByTestId("fip-background-replace-note").textContent).toMatch(
      /今後\s*統合予定/,
    );
  });

  it("既に true が保存されていれば初期チェック状態になる", () => {
    setBackgroundReplaceEnabled(true);
    render(<BackgroundReplaceSettings />);
    const toggle = screen.getByTestId("fip-background-replace-toggle") as HTMLInputElement;
    expect(toggle.checked).toBe(true);
  });

  it("トグルを切り替えると localStorage に反映される", async () => {
    render(<BackgroundReplaceSettings />);
    const toggle = screen.getByTestId("fip-background-replace-toggle") as HTMLInputElement;
    const user = userEvent.setup();
    await user.click(toggle);
    expect(toggle.checked).toBe(true);
    expect(localStorage.getItem(BACKGROUND_REPLACE_PREF_KEY)).toBe("true");

    await user.click(toggle);
    expect(toggle.checked).toBe(false);
    expect(localStorage.getItem(BACKGROUND_REPLACE_PREF_KEY)).toBe("false");
  });
});
