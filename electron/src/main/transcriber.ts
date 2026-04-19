import path from "path";
import fs from "fs";
import { ConfigStore } from "./config";
import { SystemInfo } from "../shared/types";
import { log } from "./logger";
import { getModelPath, getWhisperCppDir } from "./model-downloader";
import { WhisperServer } from "./whisper-server";
import { translateViaDeepL } from "./deepl";

type DoneCallback = (text: string) => void;

export class Transcriber {
  private server: WhisperServer | null = null;
  private busy = false;
  private startError: Error | null = null;

  constructor(
    private config: ConfigStore,
    private _sysInfo: SystemInfo,
    private onDone: DoneCallback,
  ) {}

  // Called by the app after the model/binary are known to be present.
  async ensureStarted(): Promise<void> {
    if (this.server) return;

    const binary = resolveBinary(getWhisperCppDir());
    const modelPath = this.resolveModelFile();

    this.server = new WhisperServer({
      binary,
      modelPath,
      language: this.config.get().language,
    });

    try {
      await this.server.start();
    } catch (err) {
      this.startError = err as Error;
      log.error("whisper-server failed to start:", err);
      throw err;
    }
  }

  async transcribe(pcmBuffer: Buffer): Promise<void> {
    if (this.busy) throw new Error("Transcriber busy");
    if (!this.server) {
      await this.ensureStarted();
    }
    if (this.startError) throw this.startError;

    this.busy = true;
    try {
      const wav = wrapPcmAsWav(pcmBuffer);
      const cfg = this.config.get();
      // Flag if whisper-server is running a different model than config asks
      // for (e.g. if the last reload() failed). whisper-server.ts logs the
      // actual model + prompt + language at the send site, so we only need
      // to surface the mismatch here.
      const activeModel = path.basename(this.server!.modelPath);
      const configuredModel = `ggml-${cfg.modelSize}.bin`;
      if (activeModel !== configuredModel) {
        log.warn(`[transcribe] active model (${activeModel}) does not match config (${configuredModel}) — last reload likely failed`);
      }
      const { text, language } = await this.server!.transcribe(wav, cfg.language, cfg.prompt);

      const final = await this.maybeTranslate(text, language);
      this.onDone(final);
    } finally {
      this.busy = false;
    }
  }

  /**
   * Stop the current whisper-server and start a fresh one with the latest
   * config (model path + default language). Called when the user changes the
   * model size in Settings — no app restart needed.
   */
  async reload(): Promise<void> {
    // If we're mid-transcription, wait for it to finish so we don't yank the
    // server out from under an in-flight HTTP request.
    while (this.busy) await new Promise((r) => setTimeout(r, 50));
    log.info("Reloading whisper-server with updated config");
    this.server?.stop();
    this.server = null;
    this.startError = null;
    await this.ensureStarted();
  }

  private async maybeTranslate(text: string, detectedLang: string | null): Promise<string> {
    if (!text.trim()) return text;

    const cfg = this.config.get();
    const target = cfg.translateTo;
    if (!target) return text;                         // translation disabled
    if (!cfg.deeplApiKey.trim()) return text;         // no key configured — skip silently
    if (detectedLang && detectedLang.toLowerCase() === target.toLowerCase()) {
      log.info(`Translation skipped — already in target (${target})`);
      return text;
    }

    log.info(`Translating via DeepL: ${detectedLang ?? "?"} → ${target}`);
    return translateViaDeepL(text, target, cfg.deeplApiKey);
  }

  destroy(): void {
    this.server?.stop();
    this.server = null;
  }

  private resolveModelFile(): string {
    const wanted = getModelPath(this.config.get().modelSize);
    if (fs.existsSync(wanted)) return wanted;

    const modelsDir = path.join(getWhisperCppDir(), "models");
    const priority = ["ggml-base.bin", "ggml-small.bin", "ggml-tiny.bin",
      "ggml-medium.bin", "ggml-large-v3-turbo.bin"];
    for (const candidate of priority) {
      const p = path.join(modelsDir, candidate);
      if (fs.existsSync(p)) return p;
    }
    if (fs.existsSync(modelsDir)) {
      const any = fs.readdirSync(modelsDir).find(f => f.startsWith("ggml-") && f.endsWith(".bin"));
      if (any) return path.join(modelsDir, any);
    }
    throw new Error(`No Whisper model found in:\n  ${modelsDir}\nRun: npm run setup:whisper`);
  }
}

function resolveBinary(dir: string): string {
  const exe = process.platform === "win32" ? ".exe" : "";
  const candidates = [
    path.join(dir, `whisper-server${exe}`),
    path.join(dir, "bin", `whisper-server${exe}`),
  ];
  const found = candidates.find(p => fs.existsSync(p));
  if (!found) {
    throw new Error(`whisper-server binary not found in ${dir}. Run: npm run setup:whisper`);
  }
  return found;
}

function wrapPcmAsWav(pcm: Buffer): Buffer {
  const sampleRate = 16000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcm.length;
  const headerSize = 44;

  const buf = Buffer.alloc(headerSize + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  pcm.copy(buf, headerSize);
  return buf;
}
