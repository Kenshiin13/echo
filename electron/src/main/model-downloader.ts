import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { app } from "electron";
import { log } from "./logger";

const execFileAsync = promisify(execFile);

const HF_BASE = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";
const RELEASE  = "v1.8.4";
const GH_BASE  = `https://github.com/ggml-org/whisper.cpp/releases/download/${RELEASE}`;

const BINARY_URLS: Record<"cpu" | "cuda", string> = {
  cpu:  `${GH_BASE}/whisper-bin-x64.zip`,
  cuda: `${GH_BASE}/whisper-cublas-12.4.0-bin-x64.zip`,
};

export function getWhisperCppDir(): string {
  // Live in <userData>/whisper-cpp so both the binary zip and the downloaded
  // .bin models survive npm install (dev) and app upgrades (prod).
  return path.join(app.getPath("userData"), "whisper-cpp");
}

export function getModelsDir(): string {
  return path.join(getWhisperCppDir(), "models");
}

export function getModelPath(modelSize: string): string {
  return path.join(getModelsDir(), `ggml-${modelSize}.bin`);
}

export function modelExists(modelSize: string): boolean {
  return fs.existsSync(getModelPath(modelSize));
}

export function listDownloadedModels(): string[] {
  const dir = getModelsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.startsWith("ggml-") && f.endsWith(".bin"))
    .map(f => f.replace(/^ggml-/, "").replace(/\.bin$/, ""));
}

export function deleteModel(modelSize: string): void {
  const p = getModelPath(modelSize);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    log.info(`Deleted model: ggml-${modelSize}.bin`);
  }
}

// Legacy migration: v1.x's NSIS uninstaller (with "keep models" chosen)
// stashed .bin files in userData/models-preserved/ so they'd survive a
// reinstall of the install-dir-based layout. v2.0.1+ stores models in
// userData/whisper-cpp/models/ directly, so we just move any legacy
// preserved models into the new location on first launch and forget.
export function restorePreservedModels(): void {
  const src = path.join(app.getPath("userData"), "models-preserved");
  if (!fs.existsSync(src)) return;

  const dst = getModelsDir();
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });

  let restored = 0;
  for (const f of fs.readdirSync(src)) {
    if (!f.startsWith("ggml-") || !f.endsWith(".bin")) continue;
    const srcPath = path.join(src, f);
    const dstPath = path.join(dst, f);
    if (fs.existsSync(dstPath)) { fs.unlinkSync(srcPath); continue; } // already bundled/installed
    try {
      fs.renameSync(srcPath, dstPath);
      restored++;
    } catch (e) {
      // rename fails across volumes; fall back to copy+unlink
      fs.copyFileSync(srcPath, dstPath);
      fs.unlinkSync(srcPath);
      restored++;
    }
  }

  try { fs.rmdirSync(src); } catch {}
  if (restored > 0) log.info(`Restored ${restored} preserved model(s) from previous install`);
}

// ── binary variant tracking ───────────────────────────────────────────────────

function binaryVariantFile(): string {
  return path.join(getWhisperCppDir(), ".binary-type");
}

export function getInstalledBinaryVariant(): "cpu" | "cuda" {
  try {
    const v = fs.readFileSync(binaryVariantFile(), "utf8").trim();
    return v === "cuda" ? "cuda" : "cpu";
  } catch {
    return "cpu";
  }
}

function binaryExists(): boolean {
  const dir = getWhisperCppDir();
  const exe = process.platform === "win32" ? ".exe" : "";
  return fs.existsSync(path.join(dir, `whisper-cli${exe}`))
      || fs.existsSync(path.join(dir, "bin", `whisper-cli${exe}`))
      || fs.existsSync(path.join(dir, `main${exe}`))
      || fs.existsSync(path.join(dir, "bin", `main${exe}`));
}

export function binaryMatchesBackend(backend: string): boolean {
  if (!binaryExists()) return false;
  if (backend === "cuda") return getInstalledBinaryVariant() === "cuda";
  return true; // cpu / mlx use the same binary
}

// ── shared download helper ────────────────────────────────────────────────────

function fetchFile(
  url: string,
  dest: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tmp = dest + ".download";

    function request(u: string): void {
      const mod = u.startsWith("https") ? https : http;
      mod.get(u, { headers: { "User-Agent": "echo/1.0" } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return request(res.headers.location);
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} from ${u}`));
          return;
        }

        const total  = parseInt(res.headers["content-length"] ?? "0", 10);
        let received = 0;
        const file   = fs.createWriteStream(tmp);

        res.on("data", (chunk: Buffer) => {
          file.write(chunk);
          received += chunk.length;
          if (total > 0) onProgress(Math.round(received / total * 100));
        });
        res.on("end", () => file.end());

        file.on("finish", () => {
          try { fs.renameSync(tmp, dest); } catch (e) {
            try { fs.unlinkSync(tmp); } catch {}
            reject(e); return;
          }
          resolve();
        });

        function cleanup(err: Error) {
          file.destroy();
          try { fs.unlinkSync(tmp); } catch {}
          reject(err);
        }
        res.on("error", cleanup);
        file.on("error", cleanup);
      }).on("error", reject);
    }

    request(url);
  });
}

// ── model download ────────────────────────────────────────────────────────────

export function downloadModel(
  modelSize: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  const dest = getModelPath(modelSize);
  const dir  = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  return fetchFile(`${HF_BASE}/ggml-${modelSize}.bin`, dest, onProgress)
    .then(() => log.info(`Downloaded model: ggml-${modelSize}.bin`));
}

// ── binary download (Windows only) ───────────────────────────────────────────

async function extractZipWindows(zipPath: string, destDir: string): Promise<void> {
  const tmpDir = zipPath + "_extracted";
  const ps1    = zipPath + ".ps1";
  const esc    = (p: string) => p.replace(/\\/g, "\\\\");

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
    await execFileAsync("powershell", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1,
    ]);
  } finally {
    try { fs.unlinkSync(ps1); } catch {}
  }
}

export async function downloadBinary(
  variant: "cpu" | "cuda",
  onProgress: (percent: number) => void,
): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("In-app binary download is only supported on Windows");
  }

  const dir = getWhisperCppDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const zipPath = path.join(dir, "_whisper-bin.zip");
  log.info(`Downloading whisper.cpp ${variant} binary (${RELEASE})…`);

  await fetchFile(BINARY_URLS[variant], zipPath, onProgress);

  log.info("Extracting binary…");
  await extractZipWindows(zipPath, dir);
  try { fs.unlinkSync(zipPath); } catch {}

  fs.writeFileSync(binaryVariantFile(), variant);
  log.info(`Binary ready (${variant})`);
}
