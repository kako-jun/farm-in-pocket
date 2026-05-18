// useOnlineStatus テスト (Issue: kako-jun/farm-in-pocket#42)

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOnlineStatus } from "./useOnlineStatus";

describe("useOnlineStatus", () => {
  const originalOnLine = Object.getOwnPropertyDescriptor(window.navigator, "onLine");

  beforeEach(() => {
    // 初期は online
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      get: () => true,
    });
  });

  afterEach(() => {
    if (originalOnLine) {
      Object.defineProperty(window.navigator, "onLine", originalOnLine);
    }
    vi.restoreAllMocks();
  });

  it("初期値は navigator.onLine を反映する", () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.online).toBe(true);
  });

  it("offline イベントで false になる", () => {
    const { result } = renderHook(() => useOnlineStatus());
    Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => false });
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current.online).toBe(false);
  });

  it("online イベントで true に戻る", () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => false });
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.online).toBe(false);
    Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => true });
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current.online).toBe(true);
  });
});
