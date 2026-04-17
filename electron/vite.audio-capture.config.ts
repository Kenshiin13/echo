import { defineConfig, Plugin } from "vite";
import path from "path";
import fs from "fs";

// Copies @ricky0123/vad-web + onnxruntime-web runtime assets next to the
// built audio-capture bundle so MicVAD can load them via relative file://
// paths (no CDN, no HTTP server).
function copyVadAssets(outDir: string): Plugin {
  // VAD + ORT runtime assets. Two locations are needed because the lookup paths
  // differ:
  //   • Silero VAD uses baseAssetPath: "./" → resolved relative to index.html,
  //     so the .onnx model + worklet must sit at the page root.
  //   • ORT's emscripten .mjs loader is loaded via a dynamic import from the
  //     bundled JS at assets/index-*.js, so the .mjs must sit in assets/.
  //   • ORT's .wasm is looked up via locateFile(onnxWASMBasePath) which is
  //     "./" relative to index.html → page root.
  // Simplest robust layout: copy the VAD files to root, and the ORT files to
  // both locations so either lookup path finds them.
  const rootFiles = [
    "node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js",
    "node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx",
    "node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx",
  ];
  const ortFiles = [
    "node_modules/@ricky0123/vad-web/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs",
    "node_modules/@ricky0123/vad-web/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
    "node_modules/@ricky0123/vad-web/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs",
    "node_modules/@ricky0123/vad-web/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm",
  ];

  return {
    name: "copy-vad-assets",
    closeBundle() {
      const destRoot = path.resolve(__dirname, outDir);
      const destAssets = path.join(destRoot, "assets");
      if (!fs.existsSync(destRoot)) fs.mkdirSync(destRoot, { recursive: true });
      if (!fs.existsSync(destAssets)) fs.mkdirSync(destAssets, { recursive: true });

      for (const rel of rootFiles) {
        const src = path.resolve(__dirname, rel);
        if (!fs.existsSync(src)) throw new Error(`VAD asset missing: ${rel} — run npm install`);
        fs.copyFileSync(src, path.join(destRoot, path.basename(src)));
      }
      for (const rel of ortFiles) {
        const src = path.resolve(__dirname, rel);
        if (!fs.existsSync(src)) throw new Error(`ORT asset missing: ${rel} — run npm install`);
        const name = path.basename(src);
        fs.copyFileSync(src, path.join(destRoot, name));
        fs.copyFileSync(src, path.join(destAssets, name));
      }
    },
  };
}

export default defineConfig({
  root: "src/renderer/audio-capture",
  base: "./",
  build: {
    outDir: "../../../dist/renderer/audio-capture",
    emptyOutDir: false,
    rollupOptions: {
      input: path.resolve(__dirname, "src/renderer/audio-capture/index.html"),
    },
  },
  plugins: [
    copyVadAssets("dist/renderer/audio-capture"),
  ],
});
