// Issue: kako-jun/farm-in-pocket#17

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MypaceSigner } from "../mypace/types";
import {
  DEFAULT_UPLOAD_LIMITS,
  NOSTR_BUILD_DELETE_API_BASE,
  NOSTR_BUILD_UPLOAD_URL,
  deleteFromNostrBuild,
  extractHashFromUrl,
  uploadToNostrBuild,
} from "./nostr-build";

type FetchMock = ReturnType<typeof vi.fn>;

const signer: MypaceSigner = {
  buildNip98Header: async (method: string, url: string) =>
    `Nostr testtoken-${method}-${url.length}`,
};

const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });

const SHA = "a".repeat(64); // 64 文字 hex

describe("uploadToNostrBuild", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  it("画像サイズが上限を超えると error を返し fetch しない", async () => {
    // 11MB ダミー (実体は 0 埋めで OK、size だけ大事)
    const big = new File([new Uint8Array(11 * 1024 * 1024)], "big.png", { type: "image/png" });
    const res = await uploadToNostrBuild({
      signer,
      file: big,
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/less than 10 MB/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("画像以外の上限を超えると別のサイズメッセージを出す", async () => {
    // audio 上限は 1MB
    const audioBig = new File([new Uint8Array(2 * 1024 * 1024)], "x.mp3", { type: "audio/mpeg" });
    const res = await uploadToNostrBuild({
      signer,
      file: audioBig,
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/less than 1 MB/);
  });

  it("対応外 mime は Unsupported file type", async () => {
    const f = new File(["x"], "x.txt", { type: "text/plain" });
    const res = await uploadToNostrBuild({
      signer,
      file: f,
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Unsupported file type");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("成功すると url を返し、NIP-98 Authorization が乗る", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: "success",
        data: [{ url: `https://image.nostr.build/${SHA}.png` }],
      }),
    );
    const f = new File([new Uint8Array(100)], "small.png", { type: "image/png" });
    const res = await uploadToNostrBuild({
      signer,
      file: f,
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(res.success).toBe(true);
    expect(res.url).toBe(`https://image.nostr.build/${SHA}.png`);

    // fetch 呼び出し検証
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(NOSTR_BUILD_UPLOAD_URL);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Nostr /);
    // body は FormData
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("API が non-2xx を返すと error", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    const f = new File([new Uint8Array(100)], "x.png", { type: "image/png" });
    const res = await uploadToNostrBuild({
      signer,
      file: f,
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/status 500/);
  });

  it("status!=success のレスポンスは message を error に詰める", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: "error", message: "too lewd" }));
    const f = new File([new Uint8Array(100)], "x.png", { type: "image/png" });
    const res = await uploadToNostrBuild({
      signer,
      file: f,
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe("too lewd");
  });

  it("fetch が throw した場合も throw せず error 返却", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network failure"));
    const f = new File([new Uint8Array(100)], "x.png", { type: "image/png" });
    const res = await uploadToNostrBuild({
      signer,
      file: f,
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe("network failure");
  });

  it("カスタム limits が反映される", async () => {
    const tiny = { maxImageBytes: 50, maxVideoBytes: 50, maxAudioBytes: 50 };
    const f = new File([new Uint8Array(100)], "x.png", { type: "image/png" });
    const res = await uploadToNostrBuild({
      signer,
      file: f,
      limits: tiny,
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/less than 0 MB/);
  });

  it("DEFAULT_UPLOAD_LIMITS は 10MB / 10MB / 1MB", () => {
    expect(DEFAULT_UPLOAD_LIMITS.maxImageBytes).toBe(10 * 1024 * 1024);
    expect(DEFAULT_UPLOAD_LIMITS.maxVideoBytes).toBe(10 * 1024 * 1024);
    expect(DEFAULT_UPLOAD_LIMITS.maxAudioBytes).toBe(1 * 1024 * 1024);
  });
});

describe("extractHashFromUrl", () => {
  it("image.nostr.build 形式から hash を抜く", () => {
    expect(extractHashFromUrl(`https://image.nostr.build/${SHA}.png`)).toBe(SHA);
  });

  it("nostr.build/i/ 形式からも抜く", () => {
    expect(extractHashFromUrl(`https://nostr.build/i/${SHA}.jpg`)).toBe(SHA);
  });

  it("video.nostr.build 形式からも抜く", () => {
    expect(extractHashFromUrl(`https://video.nostr.build/${SHA}.mp4`)).toBe(SHA);
  });

  it("拡張子が無いと null", () => {
    // 拡張子が無いと replace で無変化、64 文字でなければ null（hash 単体は 64 文字なので true になるケースもあるが、
    // ここでは拡張子無し+不正長で確認）
    expect(extractHashFromUrl("https://image.nostr.build/notahash")).toBe(null);
  });

  it("hash 部分が 64 文字 hex でないと null", () => {
    expect(extractHashFromUrl("https://image.nostr.build/zzz.png")).toBe(null);
  });

  it("不正 URL は null", () => {
    expect(extractHashFromUrl("not a url")).toBe(null);
  });
});

describe("deleteFromNostrBuild", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  it("hash 抜き出し失敗時は error", async () => {
    const res = await deleteFromNostrBuild({
      signer,
      url: "https://image.nostr.build/badname.png",
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/extract file hash/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("200 OK で success", async () => {
    fetchMock.mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const res = await deleteFromNostrBuild({
      signer,
      url: `https://image.nostr.build/${SHA}.png`,
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(res.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${NOSTR_BUILD_DELETE_API_BASE}/${SHA}`);
    expect(init.method).toBe("DELETE");
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Nostr /);
  });

  it("403 は permission denied", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 403 }));
    const res = await deleteFromNostrBuild({
      signer,
      url: `https://image.nostr.build/${SHA}.png`,
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/403/);
  });

  it("404 は file not found", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));
    const res = await deleteFromNostrBuild({
      signer,
      url: `https://image.nostr.build/${SHA}.png`,
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/404/);
  });

  it("401 は unauthorized", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 401 }));
    const res = await deleteFromNostrBuild({
      signer,
      url: `https://image.nostr.build/${SHA}.png`,
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/401/);
  });

  it("その他 5xx は status を error に詰める", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 502 }));
    const res = await deleteFromNostrBuild({
      signer,
      url: `https://image.nostr.build/${SHA}.png`,
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/status 502/);
  });

  it("fetch が throw しても error 返却", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    const res = await deleteFromNostrBuild({
      signer,
      url: `https://image.nostr.build/${SHA}.png`,
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe("offline");
  });
});
