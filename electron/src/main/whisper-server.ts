import { spawn, ChildProcess } from "child_process";
import net from "net";
import path from "path";
import { log } from "./logger";

export interface WhisperServerOptions {
  binary: string;
  modelPath: string;
  language: string | null;
}

export interface TranscribeResult {
  text: string;
  /** Detected source language as an ISO 639-1 code ("en", "de", …), or null. */
  language: string | null;
}

export class WhisperServer {
  private proc: ChildProcess | null = null;
  private port = 0;
  private readyPromise: Promise<void> | null = null;

  constructor(private opts: WhisperServerOptions) {}

  start(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = this.doStart();
    return this.readyPromise;
  }

  private async doStart(): Promise<void> {
    this.port = await findFreePort();

    const args = [
      "-m", this.opts.modelPath,
      "-l", this.opts.language ?? "auto",
      "--host", "127.0.0.1",
      "--port", String(this.port),
      "-nt",
    ];

    const cwd = path.dirname(this.opts.binary);
    log.info(`Starting whisper-server on port ${this.port} (model: ${path.basename(this.opts.modelPath)})`);
    this.proc = spawn(this.opts.binary, args, { cwd, windowsHide: true });

    const tag = "[whisper-server]";
    this.proc.stdout?.on("data", (buf: Buffer) => {
      const s = buf.toString().trim();
      if (s) log.info(`${tag} ${s}`);
    });
    this.proc.stderr?.on("data", (buf: Buffer) => {
      const s = buf.toString().trim();
      if (s) log.info(`${tag} ${s}`);
    });
    this.proc.on("exit", (code) => {
      log.info(`${tag} exited code=${code}`);
      this.proc = null;
      this.readyPromise = null;
    });

    await this.waitUntilReady();
  }

  private async waitUntilReady(timeoutMs = 60_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!this.proc) throw new Error("whisper-server exited before becoming ready");
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/`, { method: "GET" });
        if (res.status < 500) return;
      } catch {
        // not up yet
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("whisper-server failed to become ready within 60s");
  }

  async transcribe(
    wavBuffer: Buffer,
    language: string | null,
    prompt: string = "",
  ): Promise<TranscribeResult> {
    if (!this.proc) throw new Error("whisper-server not running");

    const form = new FormData();
    const ab = wavBuffer.buffer.slice(wavBuffer.byteOffset, wavBuffer.byteOffset + wavBuffer.byteLength) as ArrayBuffer;
    form.append("file", new Blob([ab], { type: "audio/wav" }), "audio.wav");
    // verbose_json gives us the detected language alongside the text so we can
    // decide whether a DeepL translation is needed.
    form.append("response_format", "verbose_json");
    form.append("temperature", "0.0");
    if (language) form.append("language", language);
    if (prompt.trim()) form.append("prompt", prompt.trim());

    const res = await fetch(`http://127.0.0.1:${this.port}/inference`, {
      method: "POST",
      body: form as unknown as BodyInit,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`whisper-server HTTP ${res.status}: ${body}`);
    }

    const json = (await res.json()) as { text?: string; language?: string };
    return {
      text: (json.text ?? "").trim(),
      language: json.language ?? null,
    };
  }

  stop(): void {
    if (!this.proc) return;
    try { this.proc.kill(); } catch {}
    this.proc = null;
    this.readyPromise = null;
  }
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const p = addr.port;
        srv.close(() => resolve(p));
      } else {
        srv.close(() => reject(new Error("No free port")));
      }
    });
  });
}
