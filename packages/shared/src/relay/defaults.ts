// 既定で読みに行く Nostr リレー一覧。
//
// Issue: kako-jun/farm-in-pocket#18
// 認証 / 課金リレーは避け、誰でも anonymously に REQ できる主要パブリックリレーを並べる。
// 配列順は優先度ではない（クライアントは並列に問い合わせて結果を統合する）。

export const DEFAULT_RELAYS: readonly string[] = [
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://nos.lol",
  "wss://relay.snort.social",
];
