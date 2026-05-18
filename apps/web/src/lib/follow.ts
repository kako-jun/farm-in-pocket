// Nostr kind:3 (Contact List) を介した follow / unfollow ロジック。
//
// Issue: kako-jun/farm-in-pocket#19
// 仕様 (NIP-02):
//   - kind:3 の event.tags は `["p", <pubkey hex>, <relay url?>, <petname?>]` の配列
//   - 上書き発行が contact list の正本（最新の created_at が勝つ）
//   - relay/petname は他クライアントが付けている可能性があるため、自分の add/remove
//     操作では「該当 pubkey の行以外は元のタグ配列をそのまま温存する」ことで破壊を回避する
//   - 新規 follow を追加するときは relay/petname 不明なので 2 要素 `["p", pubkey]` でよい
//
// 流れ:
//   1. 自分の最新 kind:3 を Nostr リレーから取得（無ければ空タグ配列を初期値）
//   2. 既存 tags 配列に対し、引数の pubkey 行を add / remove
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

/**
 * event.tags から `["p", ...]` の行をタグ配列のまま保持して返す。
 * NIP-02 の 4 要素 `["p", pubkey, relay, petname]` を破壊しないために使う。
 * tag[1] が string でない行は除外する。
 */
export function extractContactTags(event: NostrEvent | null): string[][] {
  if (!event) return [];
  const out: string[][] = [];
  for (const tag of event.tags) {
    if (tag[0] === "p" && typeof tag[1] === "string") {
      out.push([...tag]);
    }
  }
  return out;
}

/**
 * tags 配列に該当 pubkey の `["p", pubkey]` 行が無ければ末尾に追加する。
 * 既にあれば no-op（元の 4 要素タグを保持）。
 */
export function addContactTag(tags: string[][], pubkey: string): string[][] {
  if (tags.some((t) => t[0] === "p" && t[1] === pubkey)) {
    return tags;
  }
  return [...tags, ["p", pubkey]];
}

/**
 * tags 配列から該当 pubkey の `["p", pubkey, ...]` 行を除外する。
 * 同じ pubkey が複数行あれば全削除（NIP-02 的に重複は禁止）。
 */
export function removeContactTag(tags: string[][], pubkey: string): string[][] {
  return tags.filter((t) => !(t[0] === "p" && t[1] === pubkey));
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
 * 自分の最新 kind:3 event をリレーから取得する（内部用）。
 * リレーが「届かない (throw)」「届いたが kind:3 が無い (null)」「届いて最新が取れた (event)」
 * の 3 パターンを区別したいため、エラーは throw のままにする。
 */
async function fetchLatestMyContactEvent(
  myPubkey: string,
  deps: FollowDeps | undefined,
): Promise<NostrEvent | null> {
  const queryRelays = resolveQuery(deps);
  const result = await queryRelays({
    relays: [...DEFAULT_RELAYS],
    filter: { kinds: [3], authors: [myPubkey], limit: 5 },
  });
  return pickLatest(result.events);
}

/**
 * 自分の最新 kind:3 contact list（pubkey 配列）を取得する。
 *
 * fallback ロジック:
 *   1. リレーが応答し、kind:3 event が取れた → それを採用してキャッシュ更新
 *   2. リレーが応答したが kind:3 event が無い → ローカルキャッシュがあればそれを返す（無ければ []）
 *   3. リレーが完全に応答しない（throw） → ローカルキャッシュがあればそれを返す（無ければ []）
 */
export async function getMyContacts(secretKey: Uint8Array, deps?: FollowDeps): Promise<string[]> {
  const myPubkey = bytesToHex(getPublicKey(secretKey));
  try {
    const latest = await fetchLatestMyContactEvent(myPubkey, deps);
    if (latest) {
      const contacts = extractContacts(latest);
      writeCache(contacts, latest.created_at);
      return contacts;
    }
    // リレーは応答したが kind:3 が無い場合もキャッシュを優先する
    // （他デバイスで作った contact list が D1 だけにあって今のリレーに来てない可能性がある）
    const cached = readCache();
    return cached?.pubkeys ?? [];
  } catch {
    // リレー throw 時もキャッシュにフォールバック
    const cached = readCache();
    return cached?.pubkeys ?? [];
  }
}

/**
 * kind:3 を「追加版 contact list」で再発行する。既に follow 中なら no-op。
 * 既存タグ（relay/petname 付き 4 要素）は保持したまま追加する。
 */
export async function followPubkey(
  secretKey: Uint8Array,
  pubkey: string,
  deps?: FollowDeps,
): Promise<void> {
  if (pubkey.length !== 64) {
    throw new Error("invalid pubkey: must be 64-char hex");
  }
  const myPubkey = bytesToHex(getPublicKey(secretKey));
  let baseTags: string[][];
  try {
    const latest = await fetchLatestMyContactEvent(myPubkey, deps);
    baseTags = extractContactTags(latest);
  } catch {
    // リレーが応答しない場合は空 tags を初期値にする（破壊リスクは無い）
    baseTags = [];
  }
  if (baseTags.some((t) => t[0] === "p" && t[1] === pubkey)) {
    return;
  }
  const nextTags = addContactTag(baseTags, pubkey);
  await publishContacts(secretKey, nextTags, deps);
}

/**
 * kind:3 を「除外版 contact list」で再発行する。元から follow していなければ no-op。
 * 対象 pubkey の行だけ除去し、他の relay/petname 付きタグは温存する。
 */
export async function unfollowPubkey(
  secretKey: Uint8Array,
  pubkey: string,
  deps?: FollowDeps,
): Promise<void> {
  if (pubkey.length !== 64) {
    throw new Error("invalid pubkey: must be 64-char hex");
  }
  const myPubkey = bytesToHex(getPublicKey(secretKey));
  let baseTags: string[][];
  try {
    const latest = await fetchLatestMyContactEvent(myPubkey, deps);
    baseTags = extractContactTags(latest);
  } catch {
    baseTags = [];
  }
  if (!baseTags.some((t) => t[0] === "p" && t[1] === pubkey)) {
    return;
  }
  const nextTags = removeContactTag(baseTags, pubkey);
  await publishContacts(secretKey, nextTags, deps);
}

async function publishContacts(
  secretKey: Uint8Array,
  tags: string[][],
  deps: FollowDeps | undefined,
): Promise<void> {
  const created_at = nowSec(deps);
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
  // キャッシュは pubkey 配列のみ持つので tags から抽出
  const pubkeys: string[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    if (t[0] === "p" && typeof t[1] === "string" && !seen.has(t[1])) {
      seen.add(t[1]);
      pubkeys.push(t[1]);
    }
  }
  writeCache(pubkeys, created_at);
}
