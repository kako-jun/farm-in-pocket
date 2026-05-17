// MypaceClient: mypace の HTTP API を叩く薄いラッパー。
// 署名や nsec 管理は持たず、認証が必要なエンドポイントは呼び出し側から MypaceSigner を受ける。

import {
  MypaceApiError,
  type MypaceClientConfig,
  type MypaceSigner,
  type NostrEvent,
  type NostrProfile,
  type OgpData,
  type UploadRecord,
  type UploadType,
  type ViewsAndSuperMentions,
} from "./types";

// pubkey は Nostr 仕様で 64 文字 (32byte hex)。mypace 側も同じ制約を入れているので揃える。
const PUBKEY_HEX_LENGTH = 64;

export class MypaceClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly signer: MypaceSigner | undefined;

  constructor(config: MypaceClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.fetchImpl = config.fetch ?? fetch;
    this.signer = config.signer;
  }

  // GET /api/profiles?pubkeys=...
  // - 64 文字以外の pubkey はラッパー側で弾く (mypace 側の検証と揃える)
  // - 空配列は fetch せずに {} を返す
  // - ハードリミット 10 件は mypace 側で適用される。ラッパー側では絞らない
  async getProfiles(pubkeys: string[]): Promise<Record<string, NostrProfile>> {
    const valid = pubkeys.filter((pk) => pk.length === PUBKEY_HEX_LENGTH);
    if (valid.length === 0) return {};
    const url = `${this.baseUrl}/api/profiles?pubkeys=${valid.join(",")}`;
    const res = await this.fetchImpl(url);
    if (!res.ok) {
      throw new MypaceApiError(res.status, res.statusText, "/api/profiles", url);
    }
    const data = (await res.json()) as { profiles: Record<string, NostrProfile> };
    return data.profiles;
  }

  // GET /api/events/:id
  // mypace は { event: NostrEvent } で返す。null は 404 で表現される。
  async getEvent(id: string): Promise<NostrEvent | null> {
    const url = `${this.baseUrl}/api/events/${encodeURIComponent(id)}`;
    const res = await this.fetchImpl(url);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new MypaceApiError(res.status, res.statusText, "/api/events/:id", url);
    }
    const data = (await res.json()) as { event: NostrEvent | null };
    return data.event ?? null;
  }

  // POST /api/events/enrich
  // - body: { eventIds?: string[], superMentionPaths?: string[] }
  // - response: { views: Record<eventId, ViewCounts>, superMentions: Record<path, string> }
  async getViewsAndSuperMentions(input: {
    eventIds?: string[];
    superMentionPaths?: string[];
  }): Promise<ViewsAndSuperMentions> {
    const url = `${this.baseUrl}/api/events/enrich`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new MypaceApiError(res.status, res.statusText, "/api/events/enrich", url, body);
    }
    const data = (await res.json()) as Partial<ViewsAndSuperMentions>;
    return {
      views: data.views ?? {},
      superMentions: data.superMentions ?? {},
    };
  }

  // POST /api/publish - 署名済みイベントを D1 に記録（リレー送信は別途必要）
  async publishEvent(event: NostrEvent): Promise<{ success: boolean }> {
    const url = `${this.baseUrl}/api/publish`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new MypaceApiError(res.status, res.statusText, "/api/publish", url, body);
    }
    return (await res.json()) as { success: boolean };
  }

  /**
   * POST /api/uploads with NIP-98 Authorization.
   *
   * IMPORTANT: signer.buildNip98Header に渡す URL は、実際に fetch する URL と
   * 完全一致させる必要がある（mypace 側で URL 完全一致検証）。
   * query string を後付けした場合に静かに 401 になる罠あり。
   */
  async recordUpload(input: {
    pubkey: string;
    url: string;
    filename: string;
    type: UploadType;
  }): Promise<{ success: boolean }> {
    if (!this.signer) {
      throw new Error("MypaceClient.recordUpload requires a signer (NIP-98)");
    }
    const apiUrl = `${this.baseUrl}/api/uploads`;
    const auth = await this.signer.buildNip98Header("POST", apiUrl);
    const res = await this.fetchImpl(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new MypaceApiError(res.status, res.statusText, "/api/uploads", apiUrl, body);
    }
    return (await res.json()) as { success: boolean };
  }

  // GET /api/uploads/:pubkey
  async getUploadHistory(pubkey: string): Promise<UploadRecord[]> {
    const url = `${this.baseUrl}/api/uploads/${encodeURIComponent(pubkey)}`;
    const res = await this.fetchImpl(url);
    if (!res.ok) {
      throw new MypaceApiError(res.status, res.statusText, "/api/uploads/:pubkey", url);
    }
    const data = (await res.json()) as { uploads: UploadRecord[] };
    return data.uploads ?? [];
  }

  // POST /api/ogp/by-urls
  // - body: { urls: string[] }
  // - response: Record<url, OgpData>（不在 URL はキー無し）
  async getOgpBatch(urls: string[]): Promise<Record<string, OgpData>> {
    if (urls.length === 0) return {};
    const apiUrl = `${this.baseUrl}/api/ogp/by-urls`;
    const res = await this.fetchImpl(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new MypaceApiError(res.status, res.statusText, "/api/ogp/by-urls", apiUrl, body);
    }
    return (await res.json()) as Record<string, OgpData>;
  }

  // POST /api/views/impressions
  async recordImpressions(input: {
    events: Array<{ eventId: string; authorPubkey: string }>;
    type: "impression" | "detail";
    viewerPubkey: string;
  }): Promise<{ success: boolean }> {
    const url = `${this.baseUrl}/api/views/impressions`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new MypaceApiError(res.status, res.statusText, "/api/views/impressions", url, body);
    }
    return (await res.json()) as { success: boolean };
  }
}
