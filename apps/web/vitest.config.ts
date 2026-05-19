// Issue: kako-jun/farm-in-pocket#20
// BottomNav.astro を Astro Container API でテストするため、astro 側の Vite 設定
// (`getViteConfig`) をベースにする。これで `.astro` import が解決される。
// React コンポーネント側のテストは @astrojs/react integration 経由で同じ Vite 上に
// 乗るため、従来の React Testing Library のフロー（happy-dom）は維持される。
//
// (旧構成は `@vitejs/plugin-react` プラグインのみだったが、`.astro` ファイルが
//  SFC として解決されず ESM import で失敗するため切り替えた。)

import react from "@astrojs/react";
import { getViteConfig } from "astro/config";

// Issue #87 メモ: apps/api に @types/better-sqlite3 を入れた副作用で vite 7 へ chain が
// 切り替わり、`getViteConfig` の第一引数の UserConfig 型に `test` が含まれないと
// TS が怒るようになった。vitest 側のフィールドは実行時には素通しされるため、第一引数を
// any 経由で渡してフィールド名のチェックを緩める。
// biome-ignore lint/suspicious/noExplicitAny: vitest フィールドを astro UserConfig に注入するためのキャスト
const viteTestConfig: any = {
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test-setup.ts"],
  },
};

export default getViteConfig(viteTestConfig, {
  // astro inline config: 本番 astro.config.mjs を全部引き込むと Cloudflare adapter まで
  // 走ってテストが重くなるので、ここでは最小構成の integrations のみ渡す。
  integrations: [react()],
});
