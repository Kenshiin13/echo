import path from "path";
import fs from "fs";
import os from "os";
import { app } from "electron";
import { Worker } from "worker_threads";
import { ConfigStore } from "./config";
import { SystemInfo } from "../shared/types";
import { log } from "./logger";
import { getModelPath, getWhisperCppDir } from "./model-downloader";

type DoneCallback = (text: string) => void;

export class Transcriber {
  private worker: Worker | null = null;
  private pendingDone: DoneCallback | null = null;
  private pendingReject: ((e: Error) => void) | null = null;

  constructor(
    private config: ConfigStore,
    private sysInfo: SystemInfo,
    private onDone: DoneCallback,
  ) {
    this.spawnWorker();
  }

  private modelPath(): string {
    return getModelPath(this.config.get().modelSize);
  }

  private whisperCppDir(): string {
    return getWhisperCppDir();
  }

  private spawnWorker(): void {
    const workerPath = path.join(__dirname, "transcriber-worker.js");
    if (!fs.existsSync(workerPath)) {
      log.error("Transcriber worker not found:", workerPath);
      return;
    }
    this.worker = new Worker(workerPath, {
      workerData: {
        modelPath:     this.modelPath(),
        language:      this.config.get().language,
        backend:       this.config.get().backend,
        whisperCppDir: this.whisperCppDir(),
      },
    });

    this.worker.on("message", (msg: { text?: string; error?: string }) => {
      const done = this.pendingDone;
      const rej  = this.pendingReject;
      this.pendingDone   = null;
      this.pendingReject = null;

      if (msg.error) {
        log.error("Transcriber worker error:", msg.error);
        rej?.(new Error(msg.error));
      } else {
        done?.(msg.text ?? "");
      }
    });

    this.worker.on("error", (err) => {
      log.error("Transcriber worker crashed:", err);
      const rej = this.pendingReject;
      this.pendingDone   = null;
      this.pendingReject = null;
      rej?.(err);
      this.worker = null;
      setTimeout(() => this.spawnWorker(), 2000);
    });
  }

  async transcribe(pcmBuffer: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error("Transcriber worker not available"));
        return;
      }
      if (this.pendingDone) {
        reject(new Error("Transcriber busy"));
        return;
      }

      this.pendingDone = (text) => {
        this.onDone(text);
        resolve();
      };
      this.pendingReject = reject;

      const wavPath = path.join(os.tmpdir(), `echo-audio-${Date.now()}.wav`);
      writePcmAsWav(pcmBuffer, wavPath);

      this.worker.postMessage({ wavPath });
    });
  }

  destroy(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}

function writePcmAsWav(pcm: Buffer, outPath: string): void {
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
  buf.writeUInt32LE(16, 16);      // PCM chunk size
  buf.writeUInt16LE(1, 20);       // PCM format
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  pcm.copy(buf, headerSize);

  fs.writeFileSync(outPath, buf);
}
