import { autoUpdater, UpdateInfo, ProgressInfo } from "electron-updater";
import { app, Notification } from "electron";
import path from "path";
import { log } from "./logger";
import { WindowManager } from "./windows";
import { ConfigStore } from "./config";
import type { UpdateState } from "../shared/types";

const HOUR_MS = 60 * 60 * 1000;
const BOOT_DELAY_MS = 5_000;
const WATCHDOG_MS = 20_000;

function iconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "assets", "echo_windows_multi_size.ico")
    : path.join(app.getAppPath(), "..", "assets", "echo_windows_multi_size.ico");
}

export class UpdaterManager {
  private state: UpdateState = { phase: "idle" };
  private periodicTimer: NodeJS.Timeout | null = null;
  /** De-dupe notifications — one toast per new version per app session. */
  private notifiedVersion: string | null = null;

  constructor(private windows: WindowManager, private config: ConfigStore) {
    autoUpdater.logger = log as unknown as typeof autoUpdater.logger;
    // One-click update: detect → auto-download → show "Restart & install"
    // when ready. Install itself is driven manually so the user picks when
    // to restart.
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on("checking-for-update", () => {
      this.setState({ phase: "checking" });
    });
    autoUpdater.on("update-available", (info: UpdateInfo) => {
      log.info(`Update available: ${info.version}`);
      this.setState({ phase: "available", version: info.version });
      this.notifyAvailable(info.version);
    });
    autoUpdater.on("update-not-available", () => {
      log.info("No update available");
      this.setState({ phase: "not-available", checkedAt: Date.now() });
    });
    autoUpdater.on("error", (err) => {
      log.error("autoUpdater error:", err);
      this.setState({ phase: "error", message: err?.message ?? String(err) });
    });
    autoUpdater.on("download-progress", (progress: ProgressInfo) => {
      const version =
        this.state.phase === "available" || this.state.phase === "downloading"
          ? this.state.version
          : "";
      this.setState({
        phase: "downloading",
        percent: Math.round(progress.percent),
        version,
      });
    });
    autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
      log.info(`Update downloaded: ${info.version}`);
      this.setState({ phase: "downloaded", version: info.version });
    });
  }

  /**
   * Kick off auto-check behaviour: one delayed boot check + hourly polling.
   * Both gated on the user's `autoUpdate` preference. Dev builds skip
   * everything (electron-updater can't verify against a non-packaged exe).
   */
  scheduleBootCheck(): void {
    if (!app.isPackaged) return;
    if (!this.config.get().autoUpdate) return;
    setTimeout(() => {
      this.check().catch(() => {});
    }, BOOT_DELAY_MS);
    this.startPeriodic();
  }

  /**
   * Reconcile the hourly timer with the current `autoUpdate` setting.
   * Called by the IPC save handler when the user flips the toggle.
   */
  syncAutoCheck(): void {
    if (!app.isPackaged) return;
    if (this.config.get().autoUpdate) this.startPeriodic();
    else this.stopPeriodic();
  }

  async check(): Promise<void> {
    if (!app.isPackaged) {
      // Dev builds can't verify updates against themselves — reflect the
      // click in the UI as "up to date".
      this.setState({ phase: "not-available", checkedAt: Date.now() });
      return;
    }
    // Watchdog: if autoUpdater silently stalls (DNS, cert, feed 404), don't
    // let the UI sit on "Checking…" forever.
    const watchdog = setTimeout(() => {
      if (this.state.phase === "checking") {
        log.warn("Update check timed out after 20s");
        this.setState({ phase: "error", message: "Update check timed out." });
      }
    }, WATCHDOG_MS);
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      log.error("Update check failed:", err);
      this.setState({ phase: "error", message: String(err) });
    } finally {
      clearTimeout(watchdog);
    }
  }

  getState(): UpdateState {
    return this.state;
  }

  // isSilent: run installer silently; forceRunAfter: relaunch the app when done.
  quitAndInstall(): void {
    if (this.state.phase !== "downloaded") return;
    autoUpdater.quitAndInstall(true, true);
  }

  private startPeriodic(): void {
    if (this.periodicTimer) return;
    this.periodicTimer = setInterval(() => {
      if (!this.config.get().autoUpdate) {
        this.stopPeriodic();
        return;
      }
      this.check().catch(() => {});
    }, HOUR_MS);
  }

  private stopPeriodic(): void {
    if (!this.periodicTimer) return;
    clearInterval(this.periodicTimer);
    this.periodicTimer = null;
  }

  private notifyAvailable(version: string): void {
    if (this.notifiedVersion === version) return;
    this.notifiedVersion = version;
    try {
      const n = new Notification({
        title: "Echo update available",
        body: `Version ${version} is ready. Open Echo → About to install.`,
        icon: iconPath(),
      });
      // Clicking the toast opens Settings where the update UI lives.
      n.on("click", () => this.windows.openSettings());
      n.show();
    } catch (err) {
      log.warn(`updater: notification failed: ${err}`);
    }
  }

  private setState(state: UpdateState): void {
    this.state = state;
    this.windows.notifyUpdateState(state);
  }
}
