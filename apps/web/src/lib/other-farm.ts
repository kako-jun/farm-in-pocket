// 他人の畑ページ用のデータ取得ロジック。
//
// Issue: kako-jun/farm-in-pocket#19
// 1. npub をデコードして hex pubkey に変換（不正なら null を返して 404 扱い）
// 2. Nostr リレーからそのユーザーの kind:1 / "#t":["farm-in-pocket"] な投稿を直近 limit 件まで読む
// 3. mypace から profile（display_name / banner / picture / about）を bulk 取得（失敗時は null フォールバック）
// 4. created_at 降順で events を整列して返す
//
// プライバシー方針: マイ畑のグリッド間取り（D1 の cells / plantings）はここでは絶対に取得しない。
// 公開チャネル（Nostr）に流れている情報だけを集約する。

import {
  DEFAULT_RELAYS,
  type NostrEvent,
  type NostrProfile,
  bytesToHex,
  decodeNpub,
  queryRelays,
} from "@farm-in-pocket/shared";
import { createMypaceClient } from "./mypace";

export interface OtherFarmData {
  /** hex 64 文字。 */
  pubkey: string;
  /** 受け取った npub をそのまま戻す（UI のキャッシュ・リンク生成用）。 */
  npub: string;
  profile: NostrProfile | null;
  /** kind:1 / "#t":["farm-in-pocket"] の event 配列。created_at 降順。 */
  events: NostrEvent[];
  /** 一部リレーがダウンしていた場合のエラー集約。空配列なら全リレー成功。 */
  relayErrors: { relay: string; error: string }[];
}

/**
 * npub に紐付くプロフィール + farm-in-pocket 投稿を取得する。
 *
 * @param npub `npub1...` 形式の bech32 公開鍵
 * @param limit リレー側に依頼する最大 event 件数（既定 50）
 * @returns 不正 npub なら null、それ以外は OtherFarmData
 */
export async function fetchOtherFarm(npub: string, limit = 50): Promise<OtherFarmData | null> {
  // npub → hex pubkey。decodeNpub は不正なら throw するので、ここで 404 相当に変換する。
  let pubkeyBytes: Uint8Array;
  try {
    pubkeyBytes = decodeNpub(npub);
  } catch {
    return null;
  }
  // shared/nostr/bech32 の decodeNpub は Uint8Array (32 byte) を返す。
  // pubkey hex は x-only 32 byte → 64 文字 hex。
  const pubkey = bytesToHex(pubkeyBytes);
  if (pubkey.length !== 64) {
    return null;
  }

  const queryResult = await queryRelays({
    relays: [...DEFAULT_RELAYS],
    filter: {
      kinds: [1],
      authors: [pubkey],
      "#t": ["farm-in-pocket"],
      limit,
    },
  });

  // profile は失敗してもページ表示は続行させる（タイムラインが見えれば最低限の用途を満たす）。
  let profile: NostrProfile | null = null;
  try {
    const client = createMypaceClient();
    const profiles = await client.getProfiles([pubkey]);
    profile = profiles[pubkey] ?? null;
  } catch {
    profile = null;
  }

  // queryRelays は dedup 済みで created_at 降順だが、安全側で再 sort する（テスト容易性のため）。
  const events = [...queryResult.events].sort((a, b) => b.created_at - a.created_at);

  return {
    pubkey,
    npub,
    profile,
    events,
    relayErrors: queryResult.errors,
  };
}

// ---------- UI helper ----------

/**
 * event.tags から特定 name のタグの value（tag[1]）を抽出する。
 * 同名複数なら最初のものを返す。
 */
export function findTagValue(tags: string[][], name: string): string | null {
  for (const tag of tags) {
    if (tag[0] === name && typeof tag[1] === "string") {
      return tag[1];
    }
  }
  return null;
}

/**
 * event.tags から image URL を全て抽出する。
 */
export function findImageUrls(tags: string[][]): string[] {
  const urls: string[] = [];
  for (const tag of tags) {
    if (tag[0] === "image" && typeof tag[1] === "string" && tag[1].length > 0) {
      urls.push(tag[1]);
    }
  }
  return urls;
}
