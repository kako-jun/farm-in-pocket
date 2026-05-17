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
} from "./types";

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
  async getProfiles(pubkeys: string[]): Promise<Record<string, NostrProfile>> {
    if (pubkeys.length === 0) return {};
    const url = `${this.baseUrl}/api/profiles?pubkeys=${pubkeys.join(",")}`;
    const res = await this.fetchImpl(url);
    if (!res.ok) throw new MypaceApiError(res.status, res.statusText, "/api/profiles");
    const data = (await res.json()) as { profiles: Record<string, NostrProfile> };
    return data.profiles;
  }

  // GET /api/events/:id
  async getEvent(id: string): Promise<NostrEvent | null> {
    const url = `${this.baseUrl}/api/events/${encodeURIComponent(id)}`;
    const res = await this.fetchImpl(url);
    if (res.status === 404) return null;
    if (!res.ok) throw new MypaceApiError(res.status, res.statusText, `/api/events/${id}`);
    return (await res.json()) as NostrEvent;
  }

  // POST /api/events/enrich - 複数イベントを著者プロフィール等で補完
  async enrichEvents(events: NostrEvent[]): Promise<NostrEvent[]> {
    const url = `${this.baseUrl}/api/events/enrich`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new MypaceApiError(res.status, res.statusText, "/api/events/enrich", body);
    }
    const data = (await res.json()) as { events: NostrEvent[] };
    return data.events ?? [];
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
      throw new MypaceApiError(res.status, res.statusText, "/api/publish", body);
    }
    return (await res.json()) as { success: boolean };
  }

  // POST /api/uploads - NIP-98 必須
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
      throw new MypaceApiError(res.status, res.statusText, "/api/uploads", body);
    }
    return (await res.json()) as { success: boolean };
  }

  // GET /api/uploads/:pubkey
  async getUploadHistory(pubkey: string): Promise<UploadRecord[]> {
    const url = `${this.baseUrl}/api/uploads/${encodeURIComponent(pubkey)}`;
    const res = await this.fetchImpl(url);
    if (!res.ok) throw new MypaceApiError(res.status, res.statusText, `/api/uploads/${pubkey}`);
    const data = (await res.json()) as { uploads: UploadRecord[] };
    return data.uploads ?? [];
  }

  // GET /api/ogp?url=...
  async getOgp(targetUrl: string): Promise<OgpData> {
    const url = `${this.baseUrl}/api/ogp?url=${encodeURIComponent(targetUrl)}`;
    const res = await this.fetchImpl(url);
    if (!res.ok) throw new MypaceApiError(res.status, res.statusText, "/api/ogp");
    return (await res.json()) as OgpData;
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
      throw new MypaceApiError(res.status, res.statusText, "/api/views/impressions", body);
    }
    return (await res.json()) as { success: boolean };
  }

  // GET /api/views?eventId=...
  async getViews(eventId: string): Promise<{ impressions: number; details: number }> {
    const url = `${this.baseUrl}/api/views?eventId=${encodeURIComponent(eventId)}`;
    const res = await this.fetchImpl(url);
    if (!res.ok) throw new MypaceApiError(res.status, res.statusText, "/api/views");
    return (await res.json()) as { impressions: number; details: number };
  }
}
