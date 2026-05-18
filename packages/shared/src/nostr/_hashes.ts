// @noble/secp256k1 v3 系では sync API（schnorr.sign / sign 等）の利用前に
// hashes.sha256 / hashes.hmacSha256 を呼び出し側が注入する必要がある。
// ここで一度だけ注入し、全ての nostr/* モジュールから副作用 import される。

import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hashes } from "@noble/secp256k1";

if (hashes.sha256 === undefined) {
  hashes.sha256 = (msg) => sha256(msg);
}
if (hashes.hmacSha256 === undefined) {
  hashes.hmacSha256 = (key, msg) => hmac(sha256, key, msg);
}
