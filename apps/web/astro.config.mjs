import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import AstroPWA from "@vite-pwa/astro";
import { defineConfig } from "astro/config";

// https://astro.build/config
//
// Issue: kako-jun/farm-in-pocket#19
// 動的ルート `/community/[npub]` を実装するため SSR モード（output: "server"）に切り替え、
// 既存の静的ページ（`/`, `/grid`, `/record`, `/settings`, `/community`）は各ページで
// `export const prerender = true;` を付けて SSG のまま出力する。
// Cloudflare Pages の adapter は静的アセットを _astro と public に、動的ハンドラを
// Pages Functions として出力する（image service は passthrough で Workers Image をスキップ）。
export default defineConfig({
  output: "server",
  adapter: cloudflare({
    imageService: "passthrough",
  }),
  // Issue #19: session API (Astro.session) は使っていない。
  // 既定の @astrojs/cloudflare は SESSION KV binding を要求する driver を強制注入してくるが、
  // 明示的に memory driver を指定しておけば KV binding 要求は出なくなる
  // （session?.driver が設定済みなら adapter 側の "Enabling sessions with Cloudflare KV..."
  // ロジックがスキップされる）。
  // 参考: https://docs.astro.build/en/guides/sessions/
  session: {
    driver: "memory",
  },
  integrations: [
    react(),
    AstroPWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Farm in Pocket (ポケ農)",
        short_name: "ポケ農",
        description: "ポケットの中の農業。牧場物語のリアル MMO な家庭菜園 SNS。",
        // Issue #20: スキュモーフィズム基本UIの基準色に合わせる。
        // theme_color は emerald 系の落ち着いた緑（アクティブタブのライン色寄り）、
        // background_color は global.css の body グラデの起点（オフホワイト soil）。
        theme_color: "#5d8a3a",
        background_color: "#fefcf7",
        display: "standalone",
        lang: "ja",
        icons: [
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
