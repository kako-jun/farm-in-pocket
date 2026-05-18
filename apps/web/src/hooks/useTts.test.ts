// useTts テスト (Issue: kako-jun/farm-in-pocket#21)
//
// happy-dom には window.speechSynthesis が無いので、必要に応じてモック注入する。
// localStorage は test-setup の afterEach で毎回 clear される。

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KEIFUN_MUTE_STORAGE_KEY, useTts } from "./useTts";

interface MockUtteranceInstance {
  text: string;
  lang: string;
}

let speakCalls: MockUtteranceInstance[];
let cancelCount: number;

function installSpeechMock(): void {
  speakCalls = [];
  cancelCount = 0;
  class MockUtterance implements MockUtteranceInstance {
    text: string;
    lang = "";
    constructor(text: string) {
      this.text = text;
    }
  }
  (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance =
    MockUtterance as unknown as typeof SpeechSynthesisUtterance;
  (window as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance =
    MockUtterance as unknown as typeof SpeechSynthesisUtterance;
  (window as unknown as { speechSynthesis?: unknown }).speechSynthesis = {
    speak: (u: MockUtteranceInstance) => {
      speakCalls.push(u);
    },
    cancel: () => {
      cancelCount += 1;
    },
  };
}

function uninstallSpeechMock(): void {
  (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = undefined;
  (window as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance =
    undefined;
  (window as unknown as { speechSynthesis?: unknown }).speechSynthesis = undefined;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  uninstallSpeechMock();
  vi.restoreAllMocks();
});

describe("useTts", () => {
  it("初期状態は unmute", () => {
    installSpeechMock();
    const { result } = renderHook(() => useTts());
    expect(result.current.muted).toBe(false);
    expect(result.current.supported).toBe(true);
  });

  it("toggleMute で localStorage が 'true' に更新される", () => {
    installSpeechMock();
    const { result } = renderHook(() => useTts());
    act(() => {
      result.current.toggleMute();
    });
    expect(result.current.muted).toBe(true);
    expect(localStorage.getItem(KEIFUN_MUTE_STORAGE_KEY)).toBe("true");
    act(() => {
      result.current.toggleMute();
    });
    expect(result.current.muted).toBe(false);
    expect(localStorage.getItem(KEIFUN_MUTE_STORAGE_KEY)).toBe("false");
  });

  it("speechSynthesis が未定義なら supported=false で speak は no-op", () => {
    // モック入れない
    uninstallSpeechMock();
    const { result } = renderHook(() => useTts());
    expect(result.current.supported).toBe(false);
    // 例外を投げないこと
    expect(() => {
      result.current.speak("テスト");
    }).not.toThrow();
  });

  it("speak で utterance.text と lang=ja-JP が入り synth.speak が呼ばれる", () => {
    installSpeechMock();
    const { result } = renderHook(() => useTts());
    act(() => {
      result.current.speak("こんにちは");
    });
    expect(speakCalls).toHaveLength(1);
    expect(speakCalls[0]?.text).toBe("こんにちは");
    expect(speakCalls[0]?.lang).toBe("ja-JP");
    // 直前に cancel が走る
    expect(cancelCount).toBeGreaterThanOrEqual(1);
  });

  it("muted 状態では speak しても synth.speak が呼ばれない", () => {
    installSpeechMock();
    localStorage.setItem(KEIFUN_MUTE_STORAGE_KEY, "true");
    const { result } = renderHook(() => useTts());
    // 初期化後 muted=true
    expect(result.current.muted).toBe(true);
    act(() => {
      result.current.speak("読み上げない");
    });
    expect(speakCalls).toHaveLength(0);
  });
});
