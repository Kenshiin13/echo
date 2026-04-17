import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  root: "src/renderer/audio-capture",
  base: "./",
  build: {
    outDir: "../../../dist/renderer/audio-capture",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "src/renderer/audio-capture/index.html"),
    },
  },
});
