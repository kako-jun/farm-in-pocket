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
//
// PR #89 retro B5 で `vitest/config` 経由の `UserConfig` 型に置き換える試みを行ったが、
// astro が依存する vite 6 と、ワークスペース hoist で解決される vite 7 で UserConfig 型が
// 別物になり、`getViteConfig` の引数として渡すと型不一致になる（PluginOption の Plugin<any>
// の `hotUpdate` シグネチャ違い）。vitest 4 系で vite 7 統一が進めば自然に解消する見込み
// なので、それまでは any キャストを維持する。
// biome-ignore lint/suspicious/noExplicitAny: vitest フィールドを astro UserConfig に注入するためのキャスト（vitest 4 系で掃除予定）
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
