// 連作障害（rotation）定数・関数のテスト (Issue kako-jun/farm-in-pocket#23)

import { describe, expect, it } from "vitest";
import { DEFAULT_ROTATION_WAIT_YEARS, ROTATION_WAIT_YEARS, getWaitYears } from "./farm";

describe("getWaitYears", () => {
  it("既知の科（ナス科）に対しては ROTATION_WAIT_YEARS の値を返す", () => {
    expect(getWaitYears("ナス科")).toBe(4);
    expect(getWaitYears("ナス科")).toBe(ROTATION_WAIT_YEARS.ナス科);
    // 他の代表的な科の値も spec 通りに固定されているか確認する。
    expect(getWaitYears("ウリ科")).toBe(3);
    expect(getWaitYears("アブラナ科")).toBe(3);
    expect(getWaitYears("マメ科")).toBe(3);
    expect(getWaitYears("キク科")).toBe(2);
    expect(getWaitYears("セリ科")).toBe(2);
    expect(getWaitYears("ヒルガオ科")).toBe(2);
    expect(getWaitYears("ヒガンバナ科")).toBe(2);
  });

  it("未知の科（マップに無い）に対しては DEFAULT_ROTATION_WAIT_YEARS を返す", () => {
    expect(getWaitYears("シソ科")).toBe(DEFAULT_ROTATION_WAIT_YEARS);
    expect(getWaitYears("バショウ科")).toBe(DEFAULT_ROTATION_WAIT_YEARS);
    expect(DEFAULT_ROTATION_WAIT_YEARS).toBe(1);
  });

  it("空文字の科に対しても DEFAULT_ROTATION_WAIT_YEARS を返す（NPE せず）", () => {
    expect(getWaitYears("")).toBe(DEFAULT_ROTATION_WAIT_YEARS);
  });
});
