import { beforeEach, describe, expect, it, vi } from "vitest";
import { MypaceClient } from "./client";
import { MypaceApiError, type MypaceSigner } from "./types";

type FetchMock = ReturnType<typeof vi.fn>;

const PK = "a".repeat(64); // 有効な 64 文字 pubkey
const PK2 = "b".repeat(64);

const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });

const textResponse = (body: string, init: ResponseInit = {}): Response =>
  new Response(body, { status: 200, ...init });

describe("MypaceClient", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  it("baseUrl の末尾スラッシュを取り除く", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ profiles: {} }));
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com/",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await client.getProfiles([PK]);
    expect(fetchMock).toHaveBeenCalledWith(`https://mypace.example.com/api/profiles?pubkeys=${PK}`);
  });

  it("getProfiles は空配列なら fetch を呼ばずに {} を返す", async () => {
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await client.getProfiles([]);
    expect(result).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("getProfiles は 64 文字以外の pubkey を弾く", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ profiles: { [PK]: { name: "Alice" } } }));
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await client.getProfiles([PK, "tooshort", "x".repeat(65)]);
    expect(fetchMock).toHaveBeenCalledWith(`https://mypace.example.com/api/profiles?pubkeys=${PK}`);
    expect(result).toEqual({ [PK]: { name: "Alice" } });
  });

  it("getProfiles は 全て不正なら fetch を呼ばずに {} を返す", async () => {
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await client.getProfiles(["short", "alsoshort"]);
    expect(result).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("getProfiles は ?pubkeys=a,b を組み立てて profiles を返す", async () => {
    const profiles = { [PK]: { name: "Alice" }, [PK2]: { name: "Bob" } };
    fetchMock.mockResolvedValueOnce(jsonResponse({ profiles }));
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await client.getProfiles([PK, PK2]);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://mypace.example.com/api/profiles?pubkeys=${PK},${PK2}`,
    );
    expect(result).toEqual(profiles);
  });

  it("getEvent は 404 なら null を返す", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await client.getEvent("missing-id");
    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("https://mypace.example.com/api/events/missing-id");
  });

  it("getEvent は { event } で包まれたレスポンスを unwrap する", async () => {
    const event = {
      id: "abc",
      pubkey: "pk",
      created_at: 1,
      kind: 1,
      tags: [],
      content: "hello",
      sig: "s",
    };
    fetchMock.mockResolvedValueOnce(jsonResponse({ event }));
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await client.getEvent("abc");
    expect(result).toEqual(event);
  });

  it("getEvent は { event: null } なら null を返す", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ event: null }));
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await client.getEvent("abc");
    expect(result).toBeNull();
  });

  it("publishEvent は POST /api/publish に { event } を送る", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const event = {
      id: "abc",
      pubkey: "pk",
      created_at: 1,
      kind: 1,
      tags: [],
      content: "hi",
      sig: "s",
    };
    const result = await client.publishEvent(event);

    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe("https://mypace.example.com/api/publish");
    expect(calledInit.method).toBe("POST");
    expect(calledInit.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(calledInit.body as string)).toEqual({ event });
  });

  it("recordUpload は signer 無しなら throw する", async () => {
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(
      client.recordUpload({
        pubkey: "pk",
        url: "https://r2.example/a.png",
        filename: "a.png",
        type: "image",
      }),
    ).rejects.toThrow(/signer/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recordUpload は signer 有りで Authorization ヘッダを付与し signer URL == fetch URL を保証する", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
    const signer: MypaceSigner = {
      buildNip98Header: vi.fn().mockResolvedValue("Nostr deadbeef"),
    };
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com",
      fetch: fetchMock as unknown as typeof fetch,
      signer,
    });
    const input = {
      pubkey: "pk",
      url: "https://r2.example/a.png",
      filename: "a.png",
      type: "image" as const,
    };
    const result = await client.recordUpload(input);

    expect(result).toEqual({ success: true });
    const expectedUrl = "https://mypace.example.com/api/uploads";
    expect(signer.buildNip98Header).toHaveBeenCalledWith("POST", expectedUrl);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    // signer に渡した URL と実際の fetch URL が完全一致していること
    expect(calledUrl).toBe(expectedUrl);
    const signerCall = (signer.buildNip98Header as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(signerCall?.[1]).toBe(calledUrl);
    expect(calledInit.method).toBe("POST");
    expect(calledInit.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Nostr deadbeef",
    });
    expect(JSON.parse(calledInit.body as string)).toEqual(input);
  });

  it("getUploadHistory は配列を返す（uploads 無しなら []）", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await client.getUploadHistory("pk");
    expect(result).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith("https://mypace.example.com/api/uploads/pk");
  });

  it("getUploadHistory は camelCase の uploadedAt を保持する", async () => {
    const uploads = [
      {
        url: "https://r2.example/a.png",
        filename: "a.png",
        type: "image" as const,
        uploadedAt: 1700000000,
      },
      {
        url: "https://r2.example/b.mp3",
        filename: "b.mp3",
        type: "audio" as const,
        uploadedAt: 1700001000,
      },
    ];
    fetchMock.mockResolvedValueOnce(jsonResponse({ uploads }));
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await client.getUploadHistory("pk");
    expect(result).toEqual(uploads);
    expect(result[0]?.uploadedAt).toBe(1700000000);
    expect(result[1]?.uploadedAt).toBe(1700001000);
  });

  it("getOgpBatch は POST /api/ogp/by-urls に { urls } を送り Record を返す", async () => {
    const response = {
      "https://example.com/a": { title: "A", description: "first" },
      "https://example.com/b": { title: "B" },
      // "https://example.com/missing" は応答にキー無し
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(response));
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const urls = ["https://example.com/a", "https://example.com/b", "https://example.com/missing"];
    const result = await client.getOgpBatch(urls);
    expect(result).toEqual(response);
    expect(result["https://example.com/missing"]).toBeUndefined();
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe("https://mypace.example.com/api/ogp/by-urls");
    expect(calledInit.method).toBe("POST");
    expect(calledInit.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(calledInit.body as string)).toEqual({ urls });
  });

  it("getOgpBatch は空配列なら fetch せずに {} を返す", async () => {
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await client.getOgpBatch([]);
    expect(result).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recordImpressions は POST /api/views/impressions に body を送る", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const input = {
      events: [{ eventId: "e1", authorPubkey: "pk1" }],
      type: "impression" as const,
      viewerPubkey: "vpk",
    };
    const result = await client.recordImpressions(input);
    expect(result).toEqual({ success: true });
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe("https://mypace.example.com/api/views/impressions");
    expect(calledInit.method).toBe("POST");
    expect(JSON.parse(calledInit.body as string)).toEqual(input);
  });

  it("getViewsAndSuperMentions は POST /api/events/enrich に body を送り展開する", async () => {
    const response = {
      views: {
        e1: { detail: 3, impression: 10 },
        e2: { detail: 0, impression: 5 },
      },
      superMentions: {
        "alice/note1": "event-id-1",
        "bob/photo": "event-id-2",
      },
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(response));
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const input = {
      eventIds: ["e1", "e2"],
      superMentionPaths: ["alice/note1", "bob/photo"],
    };
    const result = await client.getViewsAndSuperMentions(input);
    expect(result).toEqual(response);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe("https://mypace.example.com/api/events/enrich");
    expect(calledInit.method).toBe("POST");
    expect(calledInit.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(calledInit.body as string)).toEqual(input);
  });

  it("getViewsAndSuperMentions は片方のみの問い合わせも通る", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ views: { e1: { detail: 1, impression: 2 } } }));
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await client.getViewsAndSuperMentions({ eventIds: ["e1"] });
    expect(result.views).toEqual({ e1: { detail: 1, impression: 2 } });
    expect(result.superMentions).toEqual({});
  });

  it("MypaceApiError は status / endpoint / url を保持する", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("boom", { status: 500, statusText: "Boom" }));
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    let caught: unknown;
    try {
      await client.publishEvent({
        id: "x",
        pubkey: "y",
        created_at: 0,
        kind: 1,
        tags: [],
        content: "",
        sig: "",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(MypaceApiError);
    const err = caught as MypaceApiError;
    expect(err.status).toBe(500);
    expect(err.statusText).toBe("Boom");
    expect(err.endpoint).toBe("/api/publish");
    expect(err.url).toBe("https://mypace.example.com/api/publish");
    expect(err.body).toBe("boom");
  });

  it("MypaceApiError の endpoint はルートパターン、url は実 URL（query 込み）", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("err", { status: 500, statusText: "Internal" }));
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    let caught: unknown;
    try {
      await client.getEvent("abc/def");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(MypaceApiError);
    const err = caught as MypaceApiError;
    expect(err.endpoint).toBe("/api/events/:id");
    expect(err.url).toBe(`https://mypace.example.com/api/events/${encodeURIComponent("abc/def")}`);
  });

  it("ネットワーク失敗（fetch の reject）はそのまま素通しする", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(client.getEvent("abc")).rejects.toThrow(/fetch failed/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
