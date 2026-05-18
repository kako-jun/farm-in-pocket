// useImageUpload テスト (Issue: kako-jun/farm-in-pocket#17)
//
// fetch を globalThis.fetch ごと差し替えて nostr.build と mypace 両方を捕捉する。
// 鍵は localStorage に hex で仕込む（apps/web の getMyKeyPair 経由で読まれる）。

import { bytesToHex, generateSecretKey } from "@farm-in-pocket/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SECRET_KEY_STORAGE_KEY } from "../lib/keys";
import { useImageUpload } from "./useImageUpload";

interface FetchCall {
  url: string;
  method: string;
}

let fetchMock: ReturnType<typeof vi.fn>;
let calls: FetchCall[];

function seedKey(): void {
  const sk = generateSecretKey();
  localStorage.setItem(SECRET_KEY_STORAGE_KEY, bytesToHex(sk));
}

function makeImageFile(name = "x.png", size = 100): File {
  return new File([new Uint8Array(size)], name, { type: "image/png" });
}

beforeEach(() => {
  localStorage.clear();
  calls = [];
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ url, method });
    if (url.startsWith("https://nostr.build/api/v2/upload/files")) {
      return new Response(
        JSON.stringify({
          status: "success",
          data: [{ url: `https://image.nostr.build/${"a".repeat(64)}.png` }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (/\/api\/uploads$/.test(url) && method === "POST") {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "no route" }), { status: 500 });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useImageUpload", () => {
  it("鍵未保存なら { success: false, error } を返し fetch しない", async () => {
    const { result } = renderHook(() => useImageUpload());
    let res: Awaited<ReturnType<typeof result.current.uploadFile>> | undefined;
    await act(async () => {
      res = await result.current.uploadFile(makeImageFile());
    });
    expect(res?.success).toBe(false);
    expect(res?.error).toBe("アカウント設定が必要です");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.uploading).toBe(false);
  });

  it("成功時に url を返し、uploading が false に戻る", async () => {
    seedKey();
    const { result } = renderHook(() => useImageUpload());
    let res: Awaited<ReturnType<typeof result.current.uploadFile>> | undefined;
    await act(async () => {
      res = await result.current.uploadFile(makeImageFile());
    });
    expect(res?.success).toBe(true);
    expect(res?.url).toMatch(/^https:\/\/image\.nostr\.build\//);
    expect(result.current.uploading).toBe(false);
  });

  it("成功時に mypace /api/uploads へ POST して履歴記録する", async () => {
    seedKey();
    const { result } = renderHook(() => useImageUpload());
    await act(async () => {
      await result.current.uploadFile(makeImageFile("photo.png"));
    });
    // recordUpload は fire-and-forget なので明示的に完了を待つ
    await waitFor(() => {
      const post = calls.find((c) => c.method === "POST" && /\/api\/uploads$/.test(c.url));
      expect(post).toBeDefined();
    });
  });

  it("nostr.build が失敗すると error を返し、mypace 履歴は呼ばない", async () => {
    seedKey();
    // 上書き: nostr.build を 500 で返す
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method });
      if (url.startsWith("https://nostr.build/")) {
        return new Response("nope", { status: 500 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    const { result } = renderHook(() => useImageUpload());
    let res: Awaited<ReturnType<typeof result.current.uploadFile>> | undefined;
    await act(async () => {
      res = await result.current.uploadFile(makeImageFile());
    });
    expect(res?.success).toBe(false);
    expect(res?.error).toMatch(/status 500/);
    // mypace は叩かれていない
    const post = calls.find((c) => c.method === "POST" && /\/api\/uploads$/.test(c.url));
    expect(post).toBeUndefined();
  });
});
