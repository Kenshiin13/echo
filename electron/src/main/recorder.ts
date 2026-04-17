import { BrowserWindow, ipcMain, app } from "electron";
import path from "path";
import { log } from "./logger";

type DoneCallback = (pcmBuffer: Buffer) => void;
type SkipCallback = () => void;

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

  captureWindow.loadFile(
    path.join(__dirname, "../../renderer/audio-capture/index.html"),
  );

  captureWindow.on("closed", () => { captureWindow = null; });
  return captureWindow;
}

export class RecordingSession {
  private recording = false;
  private pendingDone: DoneCallback | null = null;
  private ipcRegistered = false;

  constructor(
    private onDone: DoneCallback,
    private onSkipped: SkipCallback = () => {},
  ) {
    this.registerIpc();
  }

  isRecording(): boolean {
    return this.recording;
  }

  start(): void {
    if (this.recording) return;
    this.recording = true;
    const win = ensureCaptureWindow();
    if (win.webContents.isLoading()) {
      win.webContents.once("did-finish-load", () => {
        win.webContents.send("audio:start");
      });
    } else {
      win.webContents.send("audio:start");
    }
  }

  stop(): void {
    if (!this.recording) return;
    this.recording = false;
    this.pendingDone = this.onDone;
    captureWindow?.webContents.send("audio:stop");
  }

  private registerIpc(): void {
    if (this.ipcRegistered) return;
    this.ipcRegistered = true;

    ipcMain.on("audio:data", (_e, pcmBytes: Uint8Array) => {
      if (!this.pendingDone) return;
      const cb = this.pendingDone;
      this.pendingDone = null;

      const pcm = Buffer.from(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength);
      if (pcm.length < 3200) {
        log.info("Recording too short, ignoring");
        this.onSkipped(); // let the caller hide the indicator
        return;
      }
      cb(pcm);
    });
  }
}
