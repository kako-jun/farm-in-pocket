import { beforeEach, describe, expect, it, vi } from "vitest";
import { MypaceClient } from "./client";
import { MypaceApiError, type MypaceSigner } from "./types";

type FetchMock = ReturnType<typeof vi.fn>;

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
    await client.getProfiles(["abc"]);
    expect(fetchMock).toHaveBeenCalledWith("https://mypace.example.com/api/profiles?pubkeys=abc");
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

  it("getProfiles は ?pubkeys=a,b を組み立てて profiles を返す", async () => {
    const profiles = { a: { name: "Alice" }, b: { name: "Bob" } };
    fetchMock.mockResolvedValueOnce(jsonResponse({ profiles }));
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await client.getProfiles(["a", "b"]);
    expect(fetchMock).toHaveBeenCalledWith("https://mypace.example.com/api/profiles?pubkeys=a,b");
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

  it("getEvent は 200 ならイベントを返す", async () => {
    const event = {
      id: "abc",
      pubkey: "pk",
      created_at: 1,
      kind: 1,
      tags: [],
      content: "hello",
      sig: "s",
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(event));
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await client.getEvent("abc");
    expect(result).toEqual(event);
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

  it("recordUpload は signer 有りで Authorization ヘッダを付与する", async () => {
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
    expect(signer.buildNip98Header).toHaveBeenCalledWith(
      "POST",
      "https://mypace.example.com/api/uploads",
    );
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe("https://mypace.example.com/api/uploads");
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

  it("getOgp は url を URL エンコードする", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ title: "T" }));
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await client.getOgp("https://example.com/path?q=1");
    expect(result).toEqual({ title: "T" });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://mypace.example.com/api/ogp?url=${encodeURIComponent("https://example.com/path?q=1")}`,
    );
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

  it("getViews は ?eventId=... を組み立てて回数を返す", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ impressions: 3, details: 1 }));
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await client.getViews("abc/def");
    expect(result).toEqual({ impressions: 3, details: 1 });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://mypace.example.com/api/views?eventId=${encodeURIComponent("abc/def")}`,
    );
  });

  it("MypaceApiError は status / endpoint を保持する", async () => {
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
    expect(err.body).toBe("boom");
  });

  it("enrichEvents は POST /api/events/enrich に events を送る", async () => {
    const events = [
      { id: "a", pubkey: "p", created_at: 1, kind: 1, tags: [], content: "x", sig: "s" },
    ];
    fetchMock.mockResolvedValueOnce(jsonResponse({ events }));
    const client = new MypaceClient({
      baseUrl: "https://mypace.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await client.enrichEvents(events);
    expect(result).toEqual(events);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe("https://mypace.example.com/api/events/enrich");
    expect(calledInit.method).toBe("POST");
    expect(JSON.parse(calledInit.body as string)).toEqual({ events });
  });
});
