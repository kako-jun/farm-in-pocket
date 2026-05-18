import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// `@vitejs/plugin-react` の Plugin 型は @vite-pwa/astro 経由で hoist された vite 7 の
// 型に解決されるが、vitest 3.2 はまだ vite 6 の型を expose している。実行時の Plugin
// インターフェースは互換なので、unknown 経由のキャストで型差分を吸収する。
// biome-ignore lint/suspicious/noExplicitAny: vite 6/7 Plugin 型の差分吸収（runtime 互換）
const reactPlugins = react() as unknown as any[];

export default defineConfig({
  plugins: reactPlugins,
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test-setup.ts"],
  },
});
