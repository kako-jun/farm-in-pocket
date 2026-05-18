// Cloudflare Workers の crypto.randomUUID() を薄くラップ。
// テスト・互換用に別ファイルに切り出している。
export function newId(): string {
  return crypto.randomUUID();
}
