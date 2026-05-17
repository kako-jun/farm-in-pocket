import { MypaceClient, type MypaceSigner } from "@farm-in-pocket/shared";

// Vite/Astro の build 時に PUBLIC_MYPACE_API_URL が無ければ prod を既定値にする。
const baseUrl = import.meta.env.PUBLIC_MYPACE_API_URL ?? "https://mypace.llll-ll.com";

// signer は呼び出し側（ログイン後 nip-07 / nsec）から渡す。
// 未認証で読み取りのみ使うコンポーネントは signer 省略でよい。
export function createMypaceClient(signer?: MypaceSigner): MypaceClient {
  return new MypaceClient({ baseUrl, signer });
}
