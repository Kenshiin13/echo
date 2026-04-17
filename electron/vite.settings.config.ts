import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: "src/renderer/settings",
  base: "./",
  build: {
    outDir: "../../../dist/renderer/settings",
    emptyOutDir: false,
    rollupOptions: {
      input: path.resolve(__dirname, "src/renderer/settings/index.html"),
    },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "src/shared"),
    },
  },
});
