import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: "src/renderer/indicator",
  base: "./",
  build: {
    outDir: "../../../dist/renderer/indicator",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "src/renderer/indicator/index.html"),
    },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "src/shared"),
    },
  },
});
