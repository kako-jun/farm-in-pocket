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

export default getViteConfig(
  {
    test: {
      environment: "happy-dom",
      globals: true,
      include: ["src/**/*.test.{ts,tsx}"],
      setupFiles: ["./src/test-setup.ts"],
    },
  },
  {
    // astro inline config: 本番 astro.config.mjs を全部引き込むと Cloudflare adapter まで
    // 走ってテストが重くなるので、ここでは最小構成の integrations のみ渡す。
    integrations: [react()],
  },
);
