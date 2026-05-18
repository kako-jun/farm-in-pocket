// Nostr リレー読み取り用の最小型定義。
//
// Issue: kako-jun/farm-in-pocket#18
// ポケ農は nostr-tools を使わない方針なので、リレーから kind:1 等を読みに行く
// 最小限の REQ/EVENT/EOSE クライアントを自前で持つ。書き込みは扱わない（投稿は mypace 経由）。

import type { NostrEvent } from "../mypace/types";

export type { NostrEvent };

/**
 * NIP-01 REQ で送る filter。最小限のフィールドだけ。
 * 拡張タグフィルタ（例: "#farm-action"）は本クライアントの型では受けない。
 */
export interface RelayFilter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  "#e"?: string[];
  "#p"?: string[];
  "#t"?: string[];
  since?: number;
  until?: number;
  limit?: number;
}

export interface RelayQueryOptions {
  relays: string[];
  filter: RelayFilter;
  /** 既定 5000ms。EOSE が来なくても強制 close する。 */
  timeoutMs?: number;
  /** 各 EVENT 受信時に呼ぶ。dedup 前なので同一 id が複数回来うる。 */
  onEvent?: (event: NostrEvent, relay: string) => void;
  /** 外部からキャンセルする AbortSignal。abort 時は全 socket を閉じて即 resolve。 */
  signal?: AbortSignal;
}

export interface RelayQueryError {
  relay: string;
  error: string;
}

export interface RelayQueryResult {
  /** event.id で dedup 済み、created_at 降順。 */
  events: NostrEvent[];
  errors: RelayQueryError[];
}
