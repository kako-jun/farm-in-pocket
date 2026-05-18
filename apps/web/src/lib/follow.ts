// Nostr kind:3 (Contact List) を介した follow / unfollow ロジック。
//
// Issue: kako-jun/farm-in-pocket#19
// 仕様 (NIP-02):
//   - kind:3 の event.tags は `["p", <pubkey hex>, <relay url?>, <petname?>]` の配列
//   - 上書き発行が contact list の正本（最新の created_at が勝つ）
//   - relay/petname は省略可（ここでは常に省略して 2 要素 `["p", pubkey]` で書く）
//
// 流れ:
//   1. 自分の最新 kind:3 を Nostr リレーから取得（無ければ空配列を初期値）
//   2. 既存 follow 集合に対し、引数の pubkey を add / remove
//   3. signEvent (kind:3) → mypace.publishEvent で D1 へ記録（リレーへの broadcast は mypace 側）
//   4. ローカルキャッシュ `fip:my-contacts-v1` を最新値で上書き
//
// テスト容易性のため、リレー I/O と mypace publish は引数 deps で差し替え可能にする。

import {
  DEFAULT_RELAYS,
  type NostrEvent,
  bytesToHex,
  queryRelays as defaultQueryRelays,
  getPublicKey,
  signEvent,
} from "@farm-in-pocket/shared";
import { createMypaceClient } from "./mypace";

export const MY_CONTACTS_STORAGE_KEY = "fip:my-contacts-v1";

interface CachedContacts {
  /** unix seconds */
  created_at: number;
  pubkeys: string[];
}

export interface FollowDeps {
  /** リレークライアントを差し替える（テスト用）。既定は shared の queryRelays。 */
  queryRelays?: typeof defaultQueryRelays;
  /** mypace.publishEvent を差し替える（テスト用）。既定は createMypaceClient().publishEvent。 */
  publishEvent?: (event: NostrEvent) => Promise<{ success: boolean }>;
  /** 現在時刻 (unix seconds)。テストで固定値を渡す。 */
  now?: () => number;
}

function nowSec(deps: FollowDeps | undefined): number {
  return deps?.now ? deps.now() : Math.floor(Date.now() / 1000);
}

function resolveQuery(deps: FollowDeps | undefined): typeof defaultQueryRelays {
  return deps?.queryRelays ?? defaultQueryRelays;
}

function resolvePublish(
  deps: FollowDeps | undefined,
): (event: NostrEvent) => Promise<{ success: boolean }> {
  if (deps?.publishEvent) return deps.publishEvent;
  return async (event: NostrEvent) => {
    const client = createMypaceClient();
    return client.publishEvent(event);
  };
}

/** event.tags から `["p", pubkey, ...]` の pubkey を抽出する。重複は dedup。 */
export function extractContacts(event: NostrEvent | null): string[] {
  if (!event) return [];
  const set = new Set<string>();
  for (const tag of event.tags) {
    if (tag[0] === "p" && typeof tag[1] === "string" && tag[1].length === 64) {
      set.add(tag[1]);
    }
  }
  return [...set];
}

/** kind:3 event の中で「最も新しい created_at」のものを返す。 */
function pickLatest(events: NostrEvent[]): NostrEvent | null {
  let latest: NostrEvent | null = null;
  for (const e of events) {
    if (!latest || e.created_at > latest.created_at) {
      latest = e;
    }
  }
  return latest;
}

function readCache(): CachedContacts | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MY_CONTACTS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "created_at" in parsed &&
      "pubkeys" in parsed
    ) {
      const c = parsed as CachedContacts;
      if (typeof c.created_at === "number" && Array.isArray(c.pubkeys)) {
        return c;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function writeCache(pubkeys: string[], createdAt: number): void {
  if (typeof window === "undefined") return;
  try {
    const payload: CachedContacts = { created_at: createdAt, pubkeys };
    window.localStorage.setItem(MY_CONTACTS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

/**
 * 自分の最新 kind:3 contact list（pubkey 配列）を取得する。
 * リレー失敗時はローカルキャッシュにフォールバックし、それも無ければ空配列。
 */
export async function getMyContacts(secretKey: Uint8Array, deps?: FollowDeps): Promise<string[]> {
  const myPubkey = bytesToHex(getPublicKey(secretKey));
  const queryRelays = resolveQuery(deps);
  try {
    const result = await queryRelays({
      relays: [...DEFAULT_RELAYS],
      filter: { kinds: [3], authors: [myPubkey], limit: 5 },
    });
    const latest = pickLatest(result.events);
    if (latest) {
      const contacts = extractContacts(latest);
      writeCache(contacts, latest.created_at);
      return contacts;
    }
  } catch {
    // fall through to cache
  }
  const cached = readCache();
  return cached?.pubkeys ?? [];
}

/**
 * kind:3 を「追加版 contact list」で再発行する。既に follow 中なら no-op。
 */
export async function followPubkey(
  secretKey: Uint8Array,
  pubkey: string,
  deps?: FollowDeps,
): Promise<void> {
  if (pubkey.length !== 64) {
    throw new Error("invalid pubkey: must be 64-char hex");
  }
  const current = await getMyContacts(secretKey, deps);
  if (current.includes(pubkey)) {
    return;
  }
  const next = [...current, pubkey];
  await publishContacts(secretKey, next, deps);
}

/**
 * kind:3 を「除外版 contact list」で再発行する。元から follow していなければ no-op。
 */
export async function unfollowPubkey(
  secretKey: Uint8Array,
  pubkey: string,
  deps?: FollowDeps,
): Promise<void> {
  if (pubkey.length !== 64) {
    throw new Error("invalid pubkey: must be 64-char hex");
  }
  const current = await getMyContacts(secretKey, deps);
  if (!current.includes(pubkey)) {
    return;
  }
  const next = current.filter((p) => p !== pubkey);
  await publishContacts(secretKey, next, deps);
}

async function publishContacts(
  secretKey: Uint8Array,
  pubkeys: string[],
  deps: FollowDeps | undefined,
): Promise<void> {
  const created_at = nowSec(deps);
  const tags: string[][] = pubkeys.map((pk) => ["p", pk]);
  const event = signEvent(
    {
      kind: 3,
      created_at,
      tags,
      content: "",
    },
    secretKey,
  );
  const publish = resolvePublish(deps);
  await publish(event);
  writeCache(pubkeys, created_at);
}
