// PhotoPicker テスト (Issue: kako-jun/farm-in-pocket#17)

import { bytesToHex, generateSecretKey } from "@farm-in-pocket/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SECRET_KEY_STORAGE_KEY } from "../lib/keys";
import PhotoPicker from "./PhotoPicker";

const SHA = "a".repeat(64);
const FAKE_URL = `https://image.nostr.build/${SHA}.png`;

function seedKey(): void {
  const sk = generateSecretKey();
  localStorage.setItem(SECRET_KEY_STORAGE_KEY, bytesToHex(sk));
}

interface FetchCall {
  url: string;
  method: string;
}

let fetchMock: ReturnType<typeof vi.fn>;
let calls: FetchCall[];

function setupHappyFetch(): void {
  calls = [];
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ url, method });
    if (url.startsWith("https://nostr.build/api/v2/upload/files")) {
      return new Response(JSON.stringify({ status: "success", data: [{ url: FAKE_URL }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
}

beforeEach(() => {
  localStorage.clear();
  setupHappyFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PhotoPicker", () => {
  it("初期 urls がサムネとして表示される", () => {
    const url1 = `https://image.nostr.build/${"b".repeat(64)}.png`;
    const url2 = `https://image.nostr.build/${"c".repeat(64)}.png`;
    render(<PhotoPicker urls={[url1, url2]} onChange={() => {}} />);
    expect(screen.getByTestId(`fip-photo-picker-thumb-${url1}`)).toBeInTheDocument();
    expect(screen.getByTestId(`fip-photo-picker-thumb-${url2}`)).toBeInTheDocument();
    expect(screen.getByTestId("fip-photo-picker-add").textContent).toContain("2/4");
  });

  it("ファイル選択 → uploadFile が走り、onChange に新しい url が渡される", async () => {
    seedKey();
    const onChange = vi.fn();
    render(<PhotoPicker urls={[]} onChange={onChange} />);

    const input = screen.getByTestId("fip-photo-picker-input") as HTMLInputElement;
    const file = new File([new Uint8Array(50)], "test.png", { type: "image/png" });
    const user = userEvent.setup();
    await user.upload(input, file);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([FAKE_URL]);
    });
  });

  it("サムネ × ボタンで onChange から該当 url が除外される", async () => {
    const onChange = vi.fn();
    const urls = [`https://image.nostr.build/${"d".repeat(64)}.png`, FAKE_URL];
    render(<PhotoPicker urls={urls} onChange={onChange} />);

    const removeBtn = screen.getByTestId(`fip-photo-picker-remove-${FAKE_URL}`);
    const user = userEvent.setup();
    await user.click(removeBtn);

    expect(onChange).toHaveBeenCalledWith([urls[0]]);
  });

  it("maxFiles に到達していると追加ボタンが disabled、超過選択は警告が出る", async () => {
    seedKey();
    const onChange = vi.fn();
    const urls = ["a", "b", "c", "d"].map((c) => `https://image.nostr.build/${c.repeat(64)}.png`);
    render(<PhotoPicker urls={urls} onChange={onChange} />);

    const add = screen.getByTestId("fip-photo-picker-add") as HTMLButtonElement;
    expect(add.disabled).toBe(true);

    // 直接 input にファイルを流して onChange ハンドラを発火させる
    const input = screen.getByTestId("fip-photo-picker-input") as HTMLInputElement;
    // disabled 要素には user.upload できないので、disabled を一時的に外して挙動を検証する。
    // (実運用では add ボタンの disabled が UI 側のガード、本処理は内部のガードを確認するためのテスト)
    input.disabled = false;
    const user = userEvent.setup();
    const extra = new File([new Uint8Array(10)], "extra.png", { type: "image/png" });
    await user.upload(input, extra);

    await waitFor(() => {
      expect(screen.getByTestId("fip-photo-picker-warning")).toBeInTheDocument();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("アップロード中は進捗 UI が表示される", async () => {
    seedKey();

    // nostr.build 応答を一時保留にして「アップロード中」を観察する
    let resolveUpload: (() => void) | undefined;
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://nostr.build/api/v2/upload/files")) {
        await new Promise<void>((r) => {
          resolveUpload = r;
        });
        return new Response(JSON.stringify({ status: "success", data: [{ url: FAKE_URL }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const onChange = vi.fn();
    render(<PhotoPicker urls={[]} onChange={onChange} />);
    const input = screen.getByTestId("fip-photo-picker-input") as HTMLInputElement;
    const file = new File([new Uint8Array(10)], "p.png", { type: "image/png" });

    const user = userEvent.setup();
    // 待ち合わせを await しないでアップロードを開始させる
    void user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByTestId("fip-photo-picker-progress")).toBeInTheDocument();
    });
    expect(screen.getByTestId("fip-photo-picker-progress").textContent).toContain("(1/1)");

    // 解放して完了させる
    resolveUpload?.();

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([FAKE_URL]);
    });
  });
});
