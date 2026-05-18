// date utility (retro fixes #62/#63) のテスト。

import { describe, expect, it } from "vitest";
import { isValidYmdString, todayJstYmd } from "./date";

describe("isValidYmdString", () => {
  it("正しい YYYY-MM-DD は true", () => {
    expect(isValidYmdString("2026-05-17")).toBe(true);
    expect(isValidYmdString("2000-01-01")).toBe(true);
    expect(isValidYmdString("2026-02-28")).toBe(true);
    // うるう年 (2024 は閏)
    expect(isValidYmdString("2024-02-29")).toBe(true);
  });

  it("非文字列・形式違反は false", () => {
    expect(isValidYmdString(undefined)).toBe(false);
    expect(isValidYmdString(null)).toBe(false);
    expect(isValidYmdString(20260517)).toBe(false);
    expect(isValidYmdString("2026/05/17")).toBe(false);
    expect(isValidYmdString("2026-5-17")).toBe(false);
    expect(isValidYmdString("2026-05-17T00:00:00Z")).toBe(false);
    expect(isValidYmdString("")).toBe(false);
  });

  it("月の範囲外は false", () => {
    expect(isValidYmdString("2026-00-15")).toBe(false);
    expect(isValidYmdString("2026-13-99")).toBe(false);
    expect(isValidYmdString("2026-13-01")).toBe(false);
  });

  it("日の範囲外は false", () => {
    expect(isValidYmdString("2026-05-00")).toBe(false);
    expect(isValidYmdString("2026-05-32")).toBe(false);
    // 2 月 30 日 (再構築で 3/2 にズレるので弾く)
    expect(isValidYmdString("2026-02-30")).toBe(false);
    // 平年 2/29 (2026 は閏ではない)
    expect(isValidYmdString("2026-02-29")).toBe(false);
    // 4 月 31 日 (4 月は 30 まで)
    expect(isValidYmdString("2026-04-31")).toBe(false);
  });
});

describe("todayJstYmd", () => {
  it("UTC 朝の値も JST 日付で返す (UTC で日が変わる前)", () => {
    // 2026-05-17 00:30 UTC = 2026-05-17 09:30 JST → JST 17 日
    const now = new Date("2026-05-17T00:30:00Z");
    expect(todayJstYmd(now)).toBe("2026-05-17");
  });

  it("UTC 23:30 / JST 翌 08:30 は JST 翌日として返す", () => {
    // 2026-05-17 23:30 UTC = 2026-05-18 08:30 JST → JST 18 日
    const now = new Date("2026-05-17T23:30:00Z");
    expect(todayJstYmd(now)).toBe("2026-05-18");
  });
});
