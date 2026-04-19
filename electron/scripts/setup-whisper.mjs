#!/usr/bin/env node
/**
 * Downloads a pre-built whisper.cpp binary + ggml-base model.
 * Run once after npm install:  npm run setup:whisper
 */

import https from "https";
import fs, { createWriteStream } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WHISPER_CPP_DIR = path.join(
  __dirname, "..", "node_modules", "nodejs-whisper", "cpp", "whisper.cpp"
);
const MODELS_DIR  = path.join(WHISPER_CPP_DIR, "models");
// v1.8+ uses whisper-cli; cmake --install puts it in bin/; fall back to main for older releases
const BINARY_PATH = (() => {
  const exe = process.platform === "win32" ? ".exe" : "";
  const candidates = [
    path.join(WHISPER_CPP_DIR, `whisper-cli${exe}`),
    path.join(WHISPER_CPP_DIR, "bin", `whisper-cli${exe}`),
    path.join(WHISPER_CPP_DIR, `main${exe}`),
    path.join(WHISPER_CPP_DIR, "bin", `main${exe}`),
  ];
  return candidates.find(p => fs.existsSync(p)) ?? candidates[0];
})();

const MODEL_NAME = "base"; // tiny=75MB  base=142MB  small=488MB  medium=1.5GB
const MODEL_FILE = `ggml-${MODEL_NAME}.bin`;
const MODEL_PATH = path.join(MODELS_DIR, MODEL_FILE);
const MODEL_URL  = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_FILE}`;

const RELEASE          = "v1.8.4";
const WIN_CPU_ZIP_URL  = `https://github.com/ggml-org/whisper.cpp/releases/download/${RELEASE}/whisper-bin-x64.zip`;
const WIN_CUDA_ZIP_URL = `https://github.com/ggml-org/whisper.cpp/releases/download/${RELEASE}/whisper-cublas-12.4.0-bin-x64.zip`;

async function hasNvidiaGpu() {
  if (process.platform !== "win32") return false;
  try {
    const { stdout } = await execAsync("wmic path win32_VideoController get Name", { timeout: 5000 });
    return stdout.toLowerCase().includes("nvidia");
  } catch {
    return false;
  }
}

// ── download with redirect following ─────────────────────────────────────────
function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    let received = 0, total = 0, lastPct = -1;

    function request(u) {
      https.get(u, { headers: { "User-Agent": "echo-setup/1.0" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return request(res.headers.location);
        }
        if (res.statusCode !== 200) {
          file.destroy();
          reject(new Error(`HTTP ${res.statusCode} for ${u}`));
          return;
        }
        total = parseInt(res.headers["content-length"] || "0", 10);
        res.on("data", (chunk) => {
          file.write(chunk);
          received += chunk.length;
          if (total) {
            const pct = Math.floor(received / total * 100);
            if (pct !== lastPct && pct % 5 === 0) {
              process.stdout.write(
                `\r  ${pct}%  (${(received/1024/1024).toFixed(1)} / ${(total/1024/1024).toFixed(1)} MB)   `
              );
              lastPct = pct;
            }
          }
        });
        res.on("end", () => file.end());
        file.on("finish", () => { process.stdout.write("\n"); resolve(); });
        res.on("error", (e) => { try { fs.unlinkSync(dest); } catch {} reject(e); });
      }).on("error", (e) => { try { fs.unlinkSync(dest); } catch {} reject(e); });
    }
    request(url);
  });
}

// ── extract zip on Windows — writes temp .ps1 to avoid inline quoting issues ─
async function extractZipWindows(zipPath, destDir) {
  const ps1  = path.join(WHISPER_CPP_DIR, "_extract.ps1");
  const tmpDir = path.join(WHISPER_CPP_DIR, "_extracted");
  const esc = (p) => p.replace(/\\/g, "\\\\");

  fs.writeFileSync(ps1, [
    `$tmp  = "${esc(tmpDir)}"`,
    `$dest = "${esc(destDir)}"`,
    `$zip  = "${esc(zipPath)}"`,
    `Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force`,
    `$items = Get-ChildItem -Path $tmp`,
    `if ($items.Count -eq 1 -and $items[0].PSIsContainer) { $src = $items[0].FullName } else { $src = $tmp }`,
    `Copy-Item -Path "$src\\*" -Destination $dest -Recurse -Force`,
    `Remove-Item -Path $tmp -Recurse -Force`,
  ].join("\n"));

  try {
    await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}"`);
  } finally {
    try { fs.unlinkSync(ps1); } catch {}
  }
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\nEcho · Whisper setup\n");
  if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });

  // ── Binary ──────────────────────────────────────────────────────────────────
  if (fs.existsSync(BINARY_PATH)) {
    console.log("✓  Binary already present, skipping.");
  } else if (process.platform === "win32") {
    const nvidia = await hasNvidiaGpu();
    const variant = nvidia ? "cuda" : "cpu";
    const WIN_ZIP_URL = nvidia ? WIN_CUDA_ZIP_URL : WIN_CPU_ZIP_URL;
    const zipPath = path.join(WHISPER_CPP_DIR, "_whisper-bin.zip");
    console.log(`Detected: ${nvidia ? "NVIDIA GPU — downloading CUDA binary" : "no NVIDIA GPU — downloading CPU binary"}`);
    console.log(`Downloading whisper.cpp ${RELEASE} (${variant}) …`);
    await download(WIN_ZIP_URL, zipPath);
    console.log("Extracting all files …");
    await extractZipWindows(zipPath, WHISPER_CPP_DIR);
    try { fs.unlinkSync(zipPath); } catch {}
    // Write variant marker so in-app logic knows what's installed
    fs.writeFileSync(path.join(WHISPER_CPP_DIR, ".binary-type"), variant);
    if (!fs.existsSync(BINARY_PATH)) {
      throw new Error(
        "whisper-cli.exe not found after extraction.\n" +
        "Download manually from:\n" + WIN_ZIP_URL
      );
    }
    console.log(`✓  Binary ready (${variant}).`);
  } else {
    console.log("Compiling whisper.cpp from source (CMake) …");
    // v1.8+ uses CMake. Install into whisper.cpp dir so bin/, lib/ sit together
    // and @executable_path/../lib rpath in the binary resolves correctly.
    await execAsync("cmake -B build -DCMAKE_BUILD_TYPE=Release", { cwd: WHISPER_CPP_DIR });
    await execAsync("cmake --build build --config Release -j", { cwd: WHISPER_CPP_DIR });
    await execAsync("cmake --install build --prefix .", { cwd: WHISPER_CPP_DIR });
    console.log("✓  Binary built.");
  }

  // ── Model ───────────────────────────────────────────────────────────────────
  if (fs.existsSync(MODEL_PATH)) {
    console.log(`✓  Model ${MODEL_FILE} already present, skipping.`);
  } else {
    console.log(`\nDownloading ${MODEL_FILE} (~142 MB) …`);
    await download(MODEL_URL, MODEL_PATH);
    if (!fs.existsSync(MODEL_PATH)) throw new Error(`${MODEL_FILE} download did not complete.`);
    console.log(`✓  Model ready.`);
  }

  console.log(`\n✓  Setup complete!  Model: ${MODEL_NAME}`);
  console.log(`   To use a different model, edit MODEL_NAME in scripts/setup-whisper.mjs\n`);
}

main().catch((err) => {
  console.error("\n✗  Setup failed:", err.message);
  process.exit(1);
});
