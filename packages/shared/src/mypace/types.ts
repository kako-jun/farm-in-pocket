// mypace API クライアントの型定義。
// nostr-tools などの外部 Nostr ライブラリには依存せず、必要な最小サブセットを自前定義する。

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

// 後続 Issue #12 (nsec 生成・署名) で利用予定。署名前イベントを表現するため残す。
export type UnsignedNostrEvent = Omit<NostrEvent, "id" | "sig">;

export interface NostrProfile {
  name?: string;
  display_name?: string;
  picture?: string;
  banner?: string;
  about?: string;
  nip05?: string;
  lud16?: string;
  [key: string]: unknown;
}

export type UploadType = "image" | "audio";

export interface UploadRecord {
  url: string;
  filename: string;
  type: UploadType;
  // mypace 側は camelCase で返す (uploadedAt)。
  uploadedAt: number;
}

export interface OgpData {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  url?: string;
  fetched_at?: number;
}

export interface ViewCounts {
  detail: number;
  impression: number;
}

export interface ViewsAndSuperMentions {
  views: Record<string, ViewCounts>;
  superMentions: Record<string, string>;
}

export interface MypaceClientConfig {
  baseUrl: string;
  fetch?: typeof fetch; // テスト時に差し替え可能
  signer?: MypaceSigner; // 認証が必要なエンドポイント用
}

export interface MypaceSigner {
  // NIP-98 Authorization ヘッダを構築する。
  // 実装は呼び出し側（apps/web の Phase 1 #12）が提供する。
  buildNip98Header(method: string, url: string): Promise<string>;
}

export class MypaceApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    // endpoint: ルートパターン (例: "/api/events/:id")。ログ集計のグルーピング用。
    public readonly endpoint: string,
    // url: 実際に fetch した URL。デバッグ用に query string まで保持する。
    public readonly url: string,
    public readonly body?: unknown,
  ) {
    super(`mypace API ${status} ${statusText} @ ${endpoint}`);
    this.name = "MypaceApiError";
  }
}
