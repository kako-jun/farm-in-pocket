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
  integrations: [
    react(),
    AstroPWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Farm in Pocket (ポケ農)",
        short_name: "ポケ農",
        description: "ポケットの中の農業。牧場物語のリアル MMO な家庭菜園 SNS。",
        theme_color: "#4ade80",
        background_color: "#ffffff",
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
