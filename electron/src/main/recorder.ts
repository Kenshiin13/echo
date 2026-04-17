import { BrowserWindow, ipcMain, app } from "electron";
import path from "path";
import { log } from "./logger";

type DoneCallback = (pcmBuffer: Buffer) => void;
type SkipCallback = () => void;
type StartCallback = () => void;

const PRELOAD = path.join(__dirname, "../preload/index.js");

let captureWindow: BrowserWindow | null = null;

function ensureCaptureWindow(): BrowserWindow {
  if (captureWindow && !captureWindow.isDestroyed()) return captureWindow;

  captureWindow = new BrowserWindow({
    show: false,
    width: 1,
    height: 1,
    skipTaskbar: true,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Forward renderer console messages into the main-process log so we can see
  // errors from the hidden capture window (VAD load failures, mic errors, etc.)
  captureWindow.webContents.on("console-message", (_e, level, message, line, source) => {
    const tag = "[capture]";
    const src = source ? ` (${path.basename(source)}:${line})` : "";
    if (level >= 2) log.error(`${tag} ${message}${src}`);
    else log.info(`${tag} ${message}${src}`);
  });

  captureWindow.loadFile(
    path.join(__dirname, "../../renderer/audio-capture/index.html"),
  );

  // In dev, pop devtools so the renderer stack traces are inspectable.
  if (!app.isPackaged) {
    captureWindow.webContents.once("did-finish-load", () => {
      captureWindow?.webContents.openDevTools({ mode: "detach" });
    });
  }

  captureWindow.on("closed", () => { captureWindow = null; });
  return captureWindow;
}

function sendWhenReady(win: BrowserWindow, channel: string): void {
  if (win.webContents.isLoading()) {
    win.webContents.once("did-finish-load", () => {
      win.webContents.send(channel);
    });
  } else {
    win.webContents.send(channel);
  }
}

export class RecordingSession {
  private recording = false;
  private pendingDone: DoneCallback | null = null;
  private ipcRegistered = false;
  private vadEnabled = false;

  constructor(
    private onDone: DoneCallback,
    private onSkipped: SkipCallback = () => {},
    private onVadSpeechStart: StartCallback = () => {},
  ) {
    this.registerIpc();
  }

  isRecording(): boolean {
    return this.recording;
  }

  // Push-to-talk: caller drives start/stop via the hotkey.
  start(): void {
    if (this.vadEnabled) return; // ignored in voice-activation mode
    if (this.recording) return;
    this.recording = true;
    const win = ensureCaptureWindow();
    sendWhenReady(win, "audio:start");
  }

  stop(): void {
    if (this.vadEnabled) return;
    if (!this.recording) return;
    this.recording = false;
    this.pendingDone = this.onDone;
    captureWindow?.webContents.send("audio:stop");
  }

  // Voice-activation: capture window stays alive, Silero VAD drives the flow.
  enableVoiceActivation(): void {
    if (this.vadEnabled) {
      log.info("[recorder] enableVoiceActivation: already enabled, ignoring");
      return;
    }
    this.vadEnabled = true;
    const win = ensureCaptureWindow();
    log.info(`[recorder] enableVoiceActivation: capture window ready=${!win.webContents.isLoading()}, sending audio:vad-enable`);
    sendWhenReady(win, "audio:vad-enable");
  }

  disableVoiceActivation(): void {
    if (!this.vadEnabled) return;
    this.vadEnabled = false;
    log.info("[recorder] disableVoiceActivation: sending audio:vad-disable");
    captureWindow?.webContents.send("audio:vad-disable");
  }

  private registerIpc(): void {
    if (this.ipcRegistered) return;
    this.ipcRegistered = true;

    ipcMain.on("audio:data", (_e, pcmBytes: Uint8Array) => {
      const pcm = Buffer.from(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength);

      // VAD mode: every speech-end delivers its own buffer straight to onDone.
      if (this.vadEnabled) {
        if (pcm.length < 3200) {
          log.info("VAD utterance too short, ignoring");
          this.onSkipped();
          return;
        }
        this.onDone(pcm);
        return;
      }

      // Push-to-talk mode: dispatch to the pending stop() caller.
      if (!this.pendingDone) return;
      const cb = this.pendingDone;
      this.pendingDone = null;

      if (pcm.length < 3200) {
        log.info("Recording too short, ignoring");
        this.onSkipped();
        return;
      }
      cb(pcm);
    });

    ipcMain.on("audio:vad-speech-start", () => {
      if (this.vadEnabled) this.onVadSpeechStart();
    });

    ipcMain.on("audio:vad-misfire", () => {
      if (this.vadEnabled) this.onSkipped();
    });
  }
}
