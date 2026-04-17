import path from "path";
import fs from "fs";
import { ConfigStore } from "./config";
import { SystemInfo } from "../shared/types";
import { log } from "./logger";
import { getModelPath, getWhisperCppDir } from "./model-downloader";
import { WhisperServer } from "./whisper-server";

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
      const text = await this.server!.transcribe(wav, this.config.get().language);
      this.onDone(text);
    } finally {
      this.busy = false;
    }
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
