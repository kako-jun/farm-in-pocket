// mypace API クライアントのファクトリ。
//
// Issue #16 で signer を NIP-98 で配線できる構造にしたが、現状の publishEvent
// （POST /api/publish）は署名済み event を body に積むだけで NIP-98 認証は不要。
// signer が必要になるのは Issue #17 で実装する uploads (POST /api/uploads) や
// その他の認証付き endpoint で、署名鍵を渡すべきタイミングはそのときに改めて検討する。
//
// したがって投稿用途で本ファクトリを呼ぶときは secretKey を渡さなくてよい（渡しても
// 害は無いが、不要な signer 生成を避ける意味で省略するのが自然）。
// 読み取りのみのコンポーネントも当然 secretKey 無しで生成する（profile 取得など）。

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
 * @param secretKey 32 byte の Nostr 秘密鍵。
 *   - 未指定: publish など NIP-98 不要な endpoint だけ叩ける（現状の作業記録投稿はこちら）。
 *   - 指定あり: NIP-98 認証付きで uploads など認証必須 endpoint（#17 で実装）も叩ける。
 */
export function createMypaceClient(secretKey?: Uint8Array): TMypaceClient {
  const signer = secretKey ? createNip98Signer(secretKey) : undefined;
  return new MypaceClient({ baseUrl, signer });
}
