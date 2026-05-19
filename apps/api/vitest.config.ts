// Issue: kako-jun/farm-in-pocket#87
// apps/api の統合テスト用 vitest 設定。
//
// - environment: node（Hono の app.fetch を in-process で叩く）
// - include: src/**/*.test.ts のみ。.wrangler/ や dist/ は除外
// - test/d1-mock.ts が migrations を sort 順に読み込んで :memory: sqlite に流すため
//   各テストで `setupTestDb()` を呼ぶ運用。

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "dist", ".wrangler"],
    // 統合テストは sqlite を毎回 in-memory で初期化するため並列でも干渉しないが、
    // better-sqlite3 のロードや migration 適用にコストがあるので fork ベースで run。
    pool: "forks",
  },
});
