import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PrivacyNotice, { resetPrivacyAcceptance, STORAGE_KEY } from "./PrivacyNotice";

/**
 * 一定の scrollHeight / clientHeight をモックしてスクロール可能な状態にする。
 * デフォルトでは未スクロール(scrollTop=0)状態。
 */
function setupScrollableContent(scrollHeight = 800, clientHeight = 200): void {
  const scrollEl = screen.getByTestId("fip-privacy-scroll") as HTMLDivElement;
  Object.defineProperty(scrollEl, "scrollHeight", {
    configurable: true,
    value: scrollHeight,
  });
  Object.defineProperty(scrollEl, "clientHeight", {
    configurable: true,
    value: clientHeight,
  });
  Object.defineProperty(scrollEl, "scrollTop", {
    configurable: true,
    writable: true,
    value: 0,
  });
}

function scrollToBottom(): void {
  const scrollEl = screen.getByTestId("fip-privacy-scroll") as HTMLDivElement;
  // scrollHeight - scrollTop - clientHeight < 4 を満たすよう設定
  Object.defineProperty(scrollEl, "scrollTop", {
    configurable: true,
    writable: true,
    value: 800 - 200, // = 600
  });
  fireEvent.scroll(scrollEl);
}

describe("PrivacyNotice", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("初回(localStorage 空)はモーダルが表示される", () => {
    render(<PrivacyNotice />);
    expect(screen.getByTestId("fip-privacy-overlay")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  it('既に accepted ("true") ならモーダルは表示されない', () => {
    localStorage.setItem(STORAGE_KEY, "true");
    render(<PrivacyNotice />);
    expect(screen.queryByTestId("fip-privacy-overlay")).not.toBeInTheDocument();
  });

  it("チェックなし & スクロール未完了なら進めるボタンは disabled", () => {
    render(<PrivacyNotice />);
    setupScrollableContent();
    const proceed = screen.getByTestId("fip-privacy-proceed") as HTMLButtonElement;
    expect(proceed).toBeDisabled();
  });

  it("チェック ON でもスクロール未完了なら disabled のまま", async () => {
    const user = userEvent.setup();
    render(<PrivacyNotice />);
    setupScrollableContent();
    await user.click(screen.getByTestId("fip-privacy-check"));
    expect(screen.getByTestId("fip-privacy-proceed")).toBeDisabled();
  });

  it("スクロール完了でもチェック OFF なら disabled のまま", () => {
    render(<PrivacyNotice />);
    setupScrollableContent();
    scrollToBottom();
    expect(screen.getByTestId("fip-privacy-proceed")).toBeDisabled();
  });

  it("チェック ON & スクロール完了で進めるボタンが enabled になる", async () => {
    const user = userEvent.setup();
    render(<PrivacyNotice />);
    setupScrollableContent();
    scrollToBottom();
    await user.click(screen.getByTestId("fip-privacy-check"));
    expect(screen.getByTestId("fip-privacy-proceed")).toBeEnabled();
  });

  it("進めるボタンをクリックすると localStorage がセットされモーダルが消える", async () => {
    const user = userEvent.setup();
    render(<PrivacyNotice />);
    setupScrollableContent();
    scrollToBottom();
    await user.click(screen.getByTestId("fip-privacy-check"));
    await user.click(screen.getByTestId("fip-privacy-proceed"));
    expect(localStorage.getItem(STORAGE_KEY)).toBe("true");
    expect(screen.queryByTestId("fip-privacy-overlay")).not.toBeInTheDocument();
  });

  it("ESC キーではモーダルは閉じない", async () => {
    const user = userEvent.setup();
    render(<PrivacyNotice />);
    setupScrollableContent();
    await user.keyboard("{Escape}");
    expect(screen.getByTestId("fip-privacy-overlay")).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("背景(オーバーレイ)クリックではモーダルは閉じない", async () => {
    const user = userEvent.setup();
    render(<PrivacyNotice />);
    setupScrollableContent();
    await user.click(screen.getByTestId("fip-privacy-overlay"));
    expect(screen.getByTestId("fip-privacy-overlay")).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("resetPrivacyAcceptance", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("localStorage から fip:privacy-accepted-v1 を消す", () => {
    localStorage.setItem(STORAGE_KEY, "true");
    // location.reload を mock
    const reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    });
    resetPrivacyAcceptance();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
