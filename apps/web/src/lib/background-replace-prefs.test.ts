// background-replace-prefs のテスト (Issue: kako-jun/farm-in-pocket#43)

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BACKGROUND_REPLACE_PREF_KEY,
  getBackgroundReplaceEnabled,
  setBackgroundReplaceEnabled,
} from "./background-replace-prefs";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("background-replace-prefs", () => {
  it("既定では false を返す（未保存）", () => {
    expect(getBackgroundReplaceEnabled()).toBe(false);
  });

  it("setBackgroundReplaceEnabled(true) → getBackgroundReplaceEnabled が true を返す", () => {
    setBackgroundReplaceEnabled(true);
    expect(localStorage.getItem(BACKGROUND_REPLACE_PREF_KEY)).toBe("true");
    expect(getBackgroundReplaceEnabled()).toBe(true);
  });

  it("setBackgroundReplaceEnabled(false) で off に戻せる", () => {
    setBackgroundReplaceEnabled(true);
    setBackgroundReplaceEnabled(false);
    expect(localStorage.getItem(BACKGROUND_REPLACE_PREF_KEY)).toBe("false");
    expect(getBackgroundReplaceEnabled()).toBe(false);
  });
});
