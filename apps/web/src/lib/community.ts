// コミュニティ農家一覧の取得ロジック。
//
// Issue: kako-jun/farm-in-pocket#18
// 1. Nostr リレーから kind:1 / "#t":["farm-in-pocket"] な最新投稿を集める（自前 WebSocket クライアント）
// 2. event.pubkey をユニーク化し、各ユーザーの最新投稿 1 件を残す
// 3. mypace の bulk profile API でプロフィール（picture / banner / display_name 等）を取りに行く
// 4. UI に渡す `CommunityUser[]` を返す
//
// プロフィール取得失敗・リレーエラーは graceful に空 profile で続行する。

import {
  DEFAULT_RELAYS,
  type FarmMilestone,
  type NostrEvent,
  type NostrProfile,
  encodeNpub,
  hexToBytes,
  isFarmMilestone,
  queryRelays,
} from "@farm-in-pocket/shared";
import { createMypaceClient } from "./mypace";

export interface CommunityLatestEvent {
  id: string;
  content: string;
  /** event.tags から抽出した farm-action 値（未指定なら null）。 */
  action: string | null;
  /** event.tags から抽出した farm-crop 値（未指定なら null）。 */
  crop: string | null;
  /** event.tags から抽出した farm-milestone 値（未指定 or 不明値なら null）。 */
  milestone: FarmMilestone | null;
  /** unix seconds。 */
  created_at: number;
}

export interface CommunityUser {
  pubkey: string; // hex
  npub: string;
  profile: NostrProfile | null;
  latestEvent: CommunityLatestEvent;
}

export interface FetchCommunityResult {
  users: CommunityUser[];
  relayErrors: { relay: string; error: string }[];
}

function findTagValue(tags: string[][], name: string): string | null {
  for (const tag of tags) {
    if (tag[0] === name && typeof tag[1] === "string") {
      return tag[1];
    }
  }
  return null;
}

function toLatest(event: NostrEvent): CommunityLatestEvent {
  const milestoneRaw = findTagValue(event.tags, "farm-milestone");
  return {
    id: event.id,
    content: event.content,
    action: findTagValue(event.tags, "farm-action"),
    crop: findTagValue(event.tags, "farm-crop"),
    milestone: isFarmMilestone(milestoneRaw) ? milestoneRaw : null,
    created_at: event.created_at,
  };
}

function safeEncodeNpub(pubkeyHex: string): string {
  // hex が壊れていたら fallback として頭8字を返す。UI で見える程度の体裁。
  try {
    return encodeNpub(hexToBytes(pubkeyHex));
  } catch {
    return pubkeyHex.slice(0, 8);
  }
}

/**
 * Nostr リレー + mypace を組み合わせて、`#farm-in-pocket` を付けて投稿しているユーザー一覧を取得する。
 *
 * @param limit リレーに依頼する初期取得件数（既定 50）。最終的なユーザー数は dedup 後に減る。
 */
export async function fetchFarmInPocketUsers(limit = 50): Promise<FetchCommunityResult> {
  const queryResult = await queryRelays({
    relays: [...DEFAULT_RELAYS],
    filter: {
      kinds: [1],
      "#t": ["farm-in-pocket"],
      limit,
    },
  });

  // pubkey ごとに「最新 created_at」の event を 1 つだけ残す
  const latestByPubkey = new Map<string, NostrEvent>();
  for (const evt of queryResult.events) {
    const existing = latestByPubkey.get(evt.pubkey);
    if (!existing || existing.created_at < evt.created_at) {
      latestByPubkey.set(evt.pubkey, evt);
    }
  }

  const pubkeys = [...latestByPubkey.keys()];

  // mypace から profile bulk 取得。mypace 側ハードリミット 10 件のため chunk して順次叩く。
  // 失敗チャンクは空のままで続行する（profile=null フォールバック）。
  let profiles: Record<string, NostrProfile> = {};
  if (pubkeys.length > 0) {
    const client = createMypaceClient();
    const MYPACE_PROFILES_CHUNK = 10;
    for (let i = 0; i < pubkeys.length; i += MYPACE_PROFILES_CHUNK) {
      const chunk = pubkeys.slice(i, i + MYPACE_PROFILES_CHUNK);
      try {
        const got = await client.getProfiles(chunk);
        profiles = { ...profiles, ...got };
      } catch {
        // このチャンクは諦めて次へ
      }
    }
  }

  const users: CommunityUser[] = [];
  for (const [pubkey, evt] of latestByPubkey) {
    users.push({
      pubkey,
      npub: safeEncodeNpub(pubkey),
      profile: profiles[pubkey] ?? null,
      latestEvent: toLatest(evt),
    });
  }

  // created_at 降順（最新の活動が上）
  users.sort((a, b) => b.latestEvent.created_at - a.latestEvent.created_at);

  return { users, relayErrors: queryResult.errors };
}

// ---------- UI helper ----------

/** プロフィールから表示名を引く。display_name → name → npub 頭8字。 */
export function getDisplayName(user: CommunityUser): string {
  const dn = user.profile?.display_name;
  if (typeof dn === "string" && dn.trim().length > 0) return dn;
  const name = user.profile?.name;
  if (typeof name === "string" && name.trim().length > 0) return name;
  return user.npub.slice(0, 8);
}

export function getBannerUrl(user: CommunityUser): string | null {
  const banner = user.profile?.banner;
  return typeof banner === "string" && banner.length > 0 ? banner : null;
}

export function getPictureUrl(user: CommunityUser): string | null {
  const picture = user.profile?.picture;
  return typeof picture === "string" && picture.length > 0 ? picture : null;
}

/**
 * 相対時刻を日本語で返す。「たった今」「3分前」「3時間前」「3日前」、それ以上は YYYY-MM-DD。
 * @param now テスト用に現在時刻（unix seconds）を差し替えられる。
 */
export function relativeJa(unixSec: number, now: number = Math.floor(Date.now() / 1000)): string {
  const diff = now - unixSec;
  if (!Number.isFinite(diff)) return "";
  if (diff < 60) return "たった今";
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}日前`;
  const d = new Date(unixSec * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
