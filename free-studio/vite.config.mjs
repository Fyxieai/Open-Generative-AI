import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  // This theme uses system fonts; discard its unused inherited font loader.
  resolve: {
    alias: {
      "@astryxdesign/theme-gothic/fonts.css": fileURLToPath(
        new URL("./public/system-fonts.css", import.meta.url),
      ),
    },
  },
  css: { postcss: { plugins: [] } },
  server: { proxy: { "/api": "http://127.0.0.1:3210" } },
  build: { sourcemap: false },
});
