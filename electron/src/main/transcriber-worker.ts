import { workerData, parentPort } from "worker_threads";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";

interface WorkerData {
  modelPath: string;
  language: string | null;
  backend: string;
  whisperCppDir: string;
}

const { language, whisperCppDir } = workerData as WorkerData;

// v1.8+ ships whisper-cli; cmake --install puts it in bin/; main is a deprecated shim
function resolveBinary(dir: string): string {
  const exe = process.platform === "win32" ? ".exe" : "";
  const candidates = [
    path.join(dir, `whisper-cli${exe}`),
    path.join(dir, "bin", `whisper-cli${exe}`),
    path.join(dir, `main${exe}`),
    path.join(dir, "bin", `main${exe}`),
  ];
  return candidates.find(p => fs.existsSync(p)) ?? candidates[0];
}

const BINARY = resolveBinary(whisperCppDir);

// Preferred model order when exact match is missing
const MODEL_PRIORITY = ["ggml-base.bin", "ggml-small.bin", "ggml-tiny.bin",
  "ggml-medium.bin", "ggml-large-v3-turbo.bin"];

function resolveModelFile(modelPath: string): string {
  const modelsDir = path.join(whisperCppDir, "models");
  const filename  = path.basename(modelPath); // e.g. "ggml-medium.bin"

  // Exact match first
  const exact = path.join(modelsDir, filename);
  if (fs.existsSync(exact)) return exact;

  // Fallback: use best available model
  for (const candidate of MODEL_PRIORITY) {
    const p = path.join(modelsDir, candidate);
    if (fs.existsSync(p)) return p;
  }

  // Last resort: any .bin file
  if (fs.existsSync(modelsDir)) {
    const any = fs.readdirSync(modelsDir).find(f => f.startsWith("ggml-") && f.endsWith(".bin"));
    if (any) return path.join(modelsDir, any);
  }

  throw new Error(
    `No Whisper model found in:\n  ${modelsDir}\n` +
    `Run: npm run setup:whisper`
  );
}

async function transcribe(wavPath: string): Promise<string> {
  if (!fs.existsSync(BINARY)) {
    throw new Error(
      `Whisper binary not found at:\n  ${BINARY}\n` +
      `Run: npm run setup:whisper`
    );
  }

  const modelFile = resolveModelFile((workerData as WorkerData).modelPath);
  if (!fs.existsSync(modelFile)) {
    throw new Error(
      `Model file not found at:\n  ${modelFile}\n` +
      `Run: npm run setup:whisper`
    );
  }

  return new Promise((resolve, reject) => {
    // -nt  = no timestamps in output
    // -otxt = write transcript to <wavPath without extension>.txt
    // -l   = language (auto = auto-detect)
    const args = [
      "-m", modelFile,
      "-f", wavPath,
      "-otxt",
      "-nt",
      "-l", language ?? "auto",
    ];

    execFile(BINARY, args, { timeout: 120_000 }, (err, _stdout, stderr) => {
      // With -otxt, the transcript goes to <wav_stem>.txt regardless of err
      const txtPath = wavPath + ".txt"; // whisper appends .txt to the full path
      const hasTxt  = fs.existsSync(txtPath);

      let text = "";
      if (hasTxt) {
        text = fs.readFileSync(txtPath, "utf8");
        try { fs.unlinkSync(txtPath); } catch {}
      }
      try { fs.unlinkSync(wavPath); } catch {}

      if (err && !hasTxt) {
        reject(new Error(`Whisper failed: ${err.message}\n${stderr}`));
        return;
      }

      resolve(text.trim());
    });
  });
}

parentPort?.on("message", async (msg: { wavPath: string }) => {
  try {
    const text = await transcribe(msg.wavPath);
    parentPort?.postMessage({ text });
  } catch (err) {
    parentPort?.postMessage({ error: String(err) });
  }
});
