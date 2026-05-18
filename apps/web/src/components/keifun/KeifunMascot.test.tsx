// KeifunMascot テスト (Issue: kako-jun/farm-in-pocket#21)
//
// Web Speech API のモック注入は useTts.test.ts と同じ作り。
// 文言は KEIFUN_MESSAGES からランダムだが、kind ごとに候補集合は固定なので
// 「いずれかの候補と一致する」で検査する（Math.random をモックしない設計）。

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KeifunMascot from "./KeifunMascot";
import { KEIFUN_MESSAGES } from "./messages";

function installSpeechMock(): void {
  class MockUtterance {
    text: string;
    lang = "";
    constructor(text: string) {
      this.text = text;
    }
  }
  (window as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance =
    MockUtterance as unknown as typeof SpeechSynthesisUtterance;
  (window as unknown as { speechSynthesis?: unknown }).speechSynthesis = {
    speak: vi.fn(),
    cancel: vi.fn(),
  };
}

function uninstallSpeechMock(): void {
  (window as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance =
    undefined;
  (window as unknown as { speechSynthesis?: unknown }).speechSynthesis = undefined;
}

beforeEach(() => {
  installSpeechMock();
  localStorage.clear();
});

afterEach(() => {
  uninstallSpeechMock();
  vi.restoreAllMocks();
});

describe("KeifunMascot", () => {
  it("render で吹き出しテキストと表情アイコンが表示される", () => {
    render(<KeifunMascot kind="welcome" autoDismissMs={0} />);
    const mascot = screen.getByTestId("fip-keifun-mascot");
    expect(mascot).toBeInTheDocument();
    const bubble = screen.getByTestId("fip-keifun-mascot-bubble");
    const text = bubble.textContent ?? "";
    const candidates = KEIFUN_MESSAGES.welcome.map((m) => m.text);
    expect(candidates.some((c) => text.includes(c))).toBe(true);
    // 表情 SVG が含まれている（welcome カテゴリは happy 表情）
    expect(screen.getByLabelText("けいふんくん（嬉しい）")).toBeInTheDocument();
  });

  it("アイコンクリックで閉じる（onClose が呼ばれる）", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<KeifunMascot kind="idle" onClose={onClose} autoDismissMs={0} />);
    await user.click(screen.getByTestId("fip-keifun-mascot-icon"));
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByTestId("fip-keifun-mascot")).not.toBeInTheDocument();
  });

  it("ESC キーで閉じる", () => {
    const onClose = vi.fn();
    render(<KeifunMascot kind="idle" onClose={onClose} autoDismissMs={0} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByTestId("fip-keifun-mascot")).not.toBeInTheDocument();
  });

  it("スピーカーボタンで mute がトグルされる", async () => {
    const user = userEvent.setup();
    render(<KeifunMascot kind="idle" autoDismissMs={0} />);
    const mute = await screen.findByTestId("fip-keifun-mascot-mute");
    expect(mute.getAttribute("aria-pressed")).toBe("false");
    await user.click(mute);
    expect(mute.getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem("fip:keifun-mute-v1")).toBe("true");
  });

  it("kind を変えると別カテゴリの文言になる", () => {
    const { rerender } = render(<KeifunMascot kind="welcome" autoDismissMs={0} />);
    const welcomeText = screen.getByTestId("fip-keifun-mascot-bubble").textContent ?? "";
    rerender(<KeifunMascot kind="encourage" autoDismissMs={0} />);
    const encourageText = screen.getByTestId("fip-keifun-mascot-bubble").textContent ?? "";
    const encourageCandidates = KEIFUN_MESSAGES.encourage.map((m) => m.text);
    expect(encourageCandidates.some((c) => encourageText.includes(c))).toBe(true);
    // welcome の候補とは別カテゴリ
    const welcomeCandidates = KEIFUN_MESSAGES.welcome.map((m) => m.text);
    expect(welcomeCandidates.some((c) => welcomeText.includes(c))).toBe(true);
  });

  it("placement=inline では fixed クラスが付かない", () => {
    render(<KeifunMascot kind="idle" placement="inline" autoDismissMs={0} />);
    const mascot = screen.getByTestId("fip-keifun-mascot");
    expect(mascot.getAttribute("data-placement")).toBe("inline");
    expect(mascot.className).not.toMatch(/\bfixed\b/);
  });
});
