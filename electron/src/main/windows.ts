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
      width: 820,
      height: 620,
      minWidth: 680,
      minHeight: 520,
      resizable: true,
      title: "Echo",
      backgroundColor: "#0B1220",
      show: false,
      icon: assetPath("echo_windows_multi_size.ico"),
      // Hide the native title bar but keep Windows' native min/max/close
      // buttons via titleBarOverlay, themed to our dark background. Avoids
      // shipping a custom X button.
      titleBarStyle: "hidden",
      titleBarOverlay: {
        color: "#0B1220",
        symbolColor: "#E8EDF5",
        height: 36,
      },
      webPreferences: {
        preload: PRELOAD,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
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

    // Initial position — replaced per-show by positionOnActiveDisplay() so
    // the indicator follows the monitor the user is currently working on.
    const { x: dx, y: dy, width, height } = screen.getPrimaryDisplay().workArea;

    this.indicatorWindow = new BrowserWindow({
      width: 200,
      height: 52,
      x: dx + width - 220,
      y: dy + height - 72,
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
        if (this.indicatorWindow && !this.indicatorWindow.isVisible()) {
          this.positionOnActiveDisplay(this.indicatorWindow);
          this.indicatorWindow.show();
          this.reassertAlwaysOnTop(this.indicatorWindow);
        }
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

  notifyModelDownloaded(modelSize: string): void {
    this.settingsWindow?.webContents.send("settings:model-downloaded", modelSize);
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
    if (!win.isVisible()) {
      this.positionOnActiveDisplay(win);
      win.show();
      this.reassertAlwaysOnTop(win);
    }
  }

  // Place the indicator at the bottom-right of whichever monitor the user is
  // currently on (determined by cursor position). Without this the overlay
  // would always show on the primary display even when the user is typing on
  // another monitor.
  private positionOnActiveDisplay(win: BrowserWindow): void {
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const { x, y, width, height } = display.workArea;
    const [w, h] = win.getSize();
    win.setBounds({
      x: x + width - w - 20,
      y: y + height - h - 20,
      width: w,
      height: h,
    });
  }

  // On Windows, a BrowserWindow's screen-saver-level z-order can drift after
  // focus switches or hide/show cycles, which causes the indicator to fall
  // behind other app windows (it ends up "only visible on the desktop"). We
  // re-apply the level and force it to the top on every show() to pin it.
  private reassertAlwaysOnTop(win: BrowserWindow): void {
    try {
      win.setAlwaysOnTop(false);
      win.setAlwaysOnTop(true, "screen-saver");
      win.moveTop();
    } catch {
      // non-fatal — indicator will self-correct on next show
    }
  }
}
