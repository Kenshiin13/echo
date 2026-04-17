import { BrowserWindow, screen, app } from "electron";
import path from "path";

function assetPath(name: string): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "assets", name)
    : path.join(app.getAppPath(), "../assets", name);
}
import { IndicatorState } from "../shared/types";

const PRELOAD = path.join(__dirname, "../preload/index.js");

function rendererPath(name: string): string {
  // Always load from built files — works in both dev and production
  return path.join(__dirname, "../../renderer", name);
}

export class WindowManager {
  private settingsWindow: BrowserWindow | null = null;
  private indicatorWindow: BrowserWindow | null = null;
  private indicatorReady = false;
  private pendingState: IndicatorState | null = null;

  openSettings(): void {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.focus();
      return;
    }
    this.settingsWindow = new BrowserWindow({
      width: 560,
      height: 720,
      minWidth: 480,
      minHeight: 600,
      resizable: true,
      title: "Echo",
      backgroundColor: "#0B1220",
      show: false,
      ...(process.platform === "win32"
        ? { icon: assetPath("echo_windows_multi_size.ico") }
        : process.platform === "darwin"
        ? {}
        : { icon: assetPath("echo_executable_256.png") }),
      webPreferences: {
        preload: PRELOAD,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
      ...(process.platform === "darwin"
        ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 16 } }
        : { frame: false }),
    });

    this.settingsWindow.loadFile(rendererPath("settings/index.html"));

    this.settingsWindow.once("ready-to-show", () => {
      this.settingsWindow?.show();
    });

    this.settingsWindow.on("closed", () => {
      this.settingsWindow = null;
    });
  }

  closeSettings(): void {
    this.settingsWindow?.close();
  }

  ensureIndicator(): BrowserWindow {
    if (this.indicatorWindow && !this.indicatorWindow.isDestroyed()) {
      return this.indicatorWindow;
    }

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    this.indicatorWindow = new BrowserWindow({
      width: 200,
      height: 52,
      x: width - 220,
      y: height - 72,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: false,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: PRELOAD,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    // Use "screen-saver" level so the overlay stays above app windows
    // (VS Code, browsers, fullscreen games). Plain alwaysOnTop:true uses
    // the "normal" level which loses to foreground apps on Windows.
    this.indicatorWindow.setAlwaysOnTop(true, "screen-saver");

    if (process.platform === "darwin") {
      this.indicatorWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }

    this.indicatorReady = false;
    this.indicatorWindow.loadFile(rendererPath("indicator/index.html"));

    this.indicatorWindow.webContents.once("did-finish-load", () => {
      this.indicatorReady = true;
      if (this.pendingState && this.pendingState !== "idle") {
        this.indicatorWindow?.webContents.send("indicator:state", this.pendingState);
        if (!this.indicatorWindow?.isVisible()) this.indicatorWindow?.show();
      }
      this.pendingState = null;
    });

    this.indicatorWindow.on("closed", () => {
      this.indicatorWindow = null;
      this.indicatorReady = false;
    });

    return this.indicatorWindow;
  }

  sendLevelToIndicator(rms: number): void {
    this.indicatorWindow?.webContents.send("indicator:level", rms);
  }

  sendDownloadProgress(percent: number): void {
    if (!this.indicatorReady) return;
    this.indicatorWindow?.webContents.send("indicator:download-progress", percent);
  }

  updateIndicator(state: IndicatorState): void {
    const win = this.ensureIndicator();

    if (state === "idle") {
      this.pendingState = null;
      win.hide();
      return;
    }

    if (!this.indicatorReady) {
      // Page still loading — queue the state; did-finish-load will flush it
      this.pendingState = state;
      return;
    }

    win.webContents.send("indicator:state", state);
    if (!win.isVisible()) win.show();
  }
}
