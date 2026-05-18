// nostr モジュール公開エントリ。
// 副作用 import (_hashes) は各モジュールから入っているのでここでは明示再 import 不要だが、
// 念のため一度走らせて未使用ツリーシェイクを防ぐ。
import "./_hashes";

export { bytesToHex, decodeNpub, decodeNsec, encodeNpub, encodeNsec, hexToBytes } from "./bech32";
export {
  generateSecretKey,
  getPublicKey,
  isValidPubkeyHex,
  isValidSecretKey,
  normalizePubkey,
} from "./keys";
export { signEvent, verifyEvent, type SignEventDraft } from "./sign";
export {
  NIP98_KIND,
  buildNip98Header,
  createNip98Signer,
  type BuildNip98HeaderOptions,
} from "./nip98";
