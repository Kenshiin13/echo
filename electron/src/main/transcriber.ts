import path from "path";
import { app } from "electron";
import { ConfigStore } from "./config";
import { SystemInfo, ModelSize } from "../shared/types";
import { log } from "./logger";
import { translateViaDeepL } from "./deepl";

// Transformers.js is ESM; load lazily via dynamic import from this CJS module.
type ASRPipeline = (audio: Float32Array, opts?: Record<string, unknown>) => Promise<{ text: string }>;

type DoneCallback = (text: string) => void;
type ProgressCallback = (percent: number) => void;

export class Transcriber {
  private asr: ASRPipeline | null = null;
  private asrLoadPromise: Promise<ASRPipeline> | null = null;
  private busy = false;
  private onProgress: ProgressCallback | null = null;

  constructor(
    private config: ConfigStore,
    private _sysInfo: SystemInfo,
    private onDone: DoneCallback,
  ) {}

  setProgressCallback(cb: ProgressCallback | null): void {
    this.onProgress = cb;
  }

  async ensureStarted(): Promise<void> {
    if (this.asr) return;
    if (!this.asrLoadPromise) this.asrLoadPromise = this.loadPipeline();
    this.asr = await this.asrLoadPromise;
  }

  private async loadPipeline(): Promise<ASRPipeline> {
    // @huggingface/transformers ships a CJS bundle at
    // dist/transformers.node.cjs which package.json's `exports.node.require`
    // points at, so a direct require() works from this CommonJS main bundle.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { pipeline, env } =
      require("@huggingface/transformers") as typeof import("@huggingface/transformers");

    // Keep model downloads inside the app's user-data dir so Settings' model
    // manager can list/delete them, and they survive uninstalls the same way
    // config does.
    env.cacheDir = path.join(app.getPath("userData"), "whisper-models");
    env.allowLocalModels = false;

    const modelId = modelIdFor(this.config.get().modelSize);
    log.info(`Loading ASR pipeline: ${modelId} (cache: ${env.cacheDir})`);

    const pipe = await pipeline("automatic-speech-recognition", modelId, {
      device: "cpu",
      dtype: "fp32",
      progress_callback: (e: unknown) => {
        // Transformers.js emits { status: 'progress', progress: 0..100, ... }
        // during model download. Forward to the indicator.
        const ev = e as { status?: string; progress?: number };
        if (ev.status === "progress" && typeof ev.progress === "number" && this.onProgress) {
          this.onProgress(Math.floor(ev.progress));
        }
      },
    });

    log.info("ASR pipeline ready");
    return pipe as unknown as ASRPipeline;
  }

  async transcribe(pcmBuffer: Buffer): Promise<void> {
    if (this.busy) throw new Error("Transcriber busy");
    if (!this.asr) await this.ensureStarted();

    this.busy = true;
    try {
      const samples = int16BufferToFloat32(pcmBuffer);
      const cfg = this.config.get();

      const opts: Record<string, unknown> = {
        chunk_length_s: 30,
        stride_length_s: 5,
      };
      if (cfg.language) opts.language = cfg.language;

      const result = await this.asr!(samples, opts);
      const text = (result?.text ?? "").trim();
      const final = await this.maybeTranslate(text, cfg.language);
      this.onDone(final);
    } finally {
      this.busy = false;
    }
  }

  private async maybeTranslate(text: string, sourceLang: string | null): Promise<string> {
    if (!text.trim()) return text;

    const cfg = this.config.get();
    const target = cfg.translateTo;
    if (!target) return text;
    if (!cfg.deeplApiKey.trim()) return text;

    // Transformers.js's ASR pipeline doesn't expose the detected source
    // language in its output, so if the user has pinned their language in
    // Settings and it matches the translation target we skip the DeepL call.
    // Otherwise we always call DeepL and let it auto-detect (it returns the
    // text unchanged when source == target, which is correct but costs some
    // free-tier characters).
    if (sourceLang && sourceLang.toLowerCase() === target.toLowerCase()) {
      log.info(`Translation skipped — source == target (${target})`);
      return text;
    }

    log.info(`Translating via DeepL: ${sourceLang ?? "auto"} → ${target}`);
    return translateViaDeepL(text, target, cfg.deeplApiKey);
  }

  async destroy(): Promise<void> {
    if (this.asr) {
      // Transformers.js pipelines implement Disposable; dispose frees model memory.
      const disposable = this.asr as unknown as { dispose?: () => Promise<void> };
      try { await disposable.dispose?.(); } catch { /* non-fatal */ }
    }
    this.asr = null;
    this.asrLoadPromise = null;
  }
}

function modelIdFor(size: ModelSize): string {
  // Xenova hosts ONNX conversions of the standard Whisper checkpoints.
  // Large-v3-turbo lives under onnx-community.
  switch (size) {
    case "tiny":           return "Xenova/whisper-tiny";
    case "base":           return "Xenova/whisper-base";
    case "small":          return "Xenova/whisper-small";
    case "medium":         return "Xenova/whisper-medium";
    case "large-v3-turbo": return "onnx-community/whisper-large-v3-turbo";
    default:               return "Xenova/whisper-base";
  }
}

function int16BufferToFloat32(pcm: Buffer): Float32Array {
  const int16 = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2);
  const f32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768;
  return f32;
}
