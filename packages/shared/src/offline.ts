// オフラインアクションキューの共通型 (Issue: kako-jun/farm-in-pocket#42)
//
// 圏外 / fetch 失敗時に積むアクションのスキーマを shared に集約する。
// 永続化（localStorage 等）は apps/web 側で行う。ここでは型と type guard のみ。
//
// kind は将来追加できるよう discriminated union。
// - publishEvent: 署名済みの NostrEvent を mypace `/api/publish` に POST する予定のアクション。
// - recordWatering: 水やりログを D1 `/api/plantings/:id/water` に POST する予定のアクション。

import type { NostrEvent } from "./mypace/types";

export interface OfflineActionPublishEvent {
  kind: "publishEvent";
  event: NostrEvent;
  /** キューに積んだ時刻 (Date.now()). 重複検知や TTL に使う想定 */
  queuedAt: number;
  /** flusher が fire を試みた回数。閾値超で drop する (SHOULD-1: 4xx 詰まり対策) */
  attempts?: number;
}

export interface OfflineActionRecordWatering {
  kind: "recordWatering";
  plantingId: number;
  pubkey: string;
  /** ISO 日付 (YYYY-MM-DD)。省略時は flush 時に API 側で今日が入る */
  wateredAt?: string;
  note?: string;
  queuedAt: number;
  /** flusher が fire を試みた回数。閾値超で drop する (SHOULD-1: 4xx 詰まり対策) */
  attempts?: number;
}

export type OfflineAction = OfflineActionPublishEvent | OfflineActionRecordWatering;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNostrEvent(value: unknown): value is NostrEvent {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.pubkey === "string" &&
    typeof value.created_at === "number" &&
    typeof value.kind === "number" &&
    Array.isArray(value.tags) &&
    typeof value.content === "string" &&
    typeof value.sig === "string"
  );
}

export function isOfflineAction(value: unknown): value is OfflineAction {
  if (!isPlainObject(value)) return false;
  if (typeof value.queuedAt !== "number") return false;
  // attempts は optional だが、あれば number でなければならない
  if (value.attempts !== undefined && typeof value.attempts !== "number") return false;
  if (value.kind === "publishEvent") {
    return isNostrEvent(value.event);
  }
  if (value.kind === "recordWatering") {
    if (typeof value.plantingId !== "number") return false;
    if (typeof value.pubkey !== "string") return false;
    if (value.wateredAt !== undefined && typeof value.wateredAt !== "string") return false;
    if (value.note !== undefined && typeof value.note !== "string") return false;
    return true;
  }
  return false;
}
