import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import AstroPWA from "@vite-pwa/astro";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
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
