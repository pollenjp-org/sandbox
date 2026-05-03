import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages 用にサブパスを設定。
// 公開先 URL: https://pollenjp-org.github.io/sandbox/book-mindmap-explorer-2026-05-03/
// ローカル開発時は VITE_BASE 未指定で "/" になる。
const base = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});
