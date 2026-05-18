// mypace API クライアントのファクトリ。
//
// Issue #16 で signer を NIP-98 で配線。secretKey を渡すと NIP-98 署名付きのリクエストができる。
// 読み取りのみのコンポーネントは secretKey 無しで生成する（profile 取得など）。

import {
  MypaceClient,
  type MypaceClient as TMypaceClient,
  createNip98Signer,
} from "@farm-in-pocket/shared";

// Vite/Astro の build 時に PUBLIC_MYPACE_API_URL が無ければ prod を既定値にする。
const baseUrl: string =
  (import.meta.env.PUBLIC_MYPACE_API_URL as string | undefined) ?? "https://mypace.llll-ll.com";

/**
 * MypaceClient を作る。
 *
 * @param secretKey 32 byte の Nostr 秘密鍵。指定すると NIP-98 認証付きで投稿系 API が叩ける。
 */
export function createMypaceClient(secretKey?: Uint8Array): TMypaceClient {
  const signer = secretKey ? createNip98Signer(secretKey) : undefined;
  return new MypaceClient({ baseUrl, signer });
}
