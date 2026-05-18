// NIP-98 HTTP Authorization。
//
// 仕様:
// - kind = 27235
// - tags: [["u", url], ["method", METHOD_UPPER]]
// - content = ""
// - created_at は現在 unix 秒
// - 署名済み event を JSON.stringify → UTF-8 → base64 にして
//   `Nostr <base64>` 形式の Authorization ヘッダ値にする。
//
// 用途: mypace API の認証付きエンドポイント呼び出し。
// MypaceSigner.buildNip98Header(method, url) の実体としてもこの関数を使う。

import "./_hashes";
import { base64 } from "@scure/base";
import type { MypaceSigner } from "../mypace/types";
import { signEvent } from "./sign";

export const NIP98_KIND = 27235;

export interface BuildNip98HeaderOptions {
  /** テスト時に時刻を固定するための injection ポイント。デフォルトは現在 unix 秒。 */
  now?: () => number;
}

/**
 * NIP-98 の Authorization ヘッダ値（`Nostr <base64>`）を構築する。
 */
export function buildNip98Header(
  method: string,
  url: string,
  secretKey: Uint8Array,
  options: BuildNip98HeaderOptions = {},
): string {
  if (typeof method !== "string" || method.length === 0) {
    throw new Error("invalid method");
  }
  if (typeof url !== "string" || url.length === 0) {
    throw new Error("invalid url");
  }

  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const createdAt = now();

  const event = signEvent(
    {
      created_at: createdAt,
      kind: NIP98_KIND,
      tags: [
        ["u", url],
        ["method", method.toUpperCase()],
      ],
      content: "",
    },
    secretKey,
  );

  const json = JSON.stringify(event);
  const encoded = base64.encode(new TextEncoder().encode(json));
  return `Nostr ${encoded}`;
}

/**
 * 指定された秘密鍵で署名する MypaceSigner を作る。
 * apps/web から渡す signer は基本これ。
 */
export function createNip98Signer(
  secretKey: Uint8Array,
  options: BuildNip98HeaderOptions = {},
): MypaceSigner {
  return {
    buildNip98Header: async (method: string, url: string): Promise<string> => {
      return buildNip98Header(method, url, secretKey, options);
    },
  };
}
