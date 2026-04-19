import { autoUpdater, UpdateInfo, ProgressInfo } from "electron-updater";
import { app } from "electron";
import { log } from "./logger";
import { WindowManager } from "./windows";
import type { UpdateState } from "../shared/types";

export class UpdaterManager {
  private state: UpdateState = { phase: "idle" };

  constructor(private windows: WindowManager) {
    autoUpdater.logger = log as unknown as typeof autoUpdater.logger;
    // User asked for one-click update: detect → auto-download → show
    // "Restart & install" when ready. We still drive install manually so the
    // restart happens only when the user clicks the button.
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on("checking-for-update", () => {
      this.setState({ phase: "checking" });
    });
    autoUpdater.on("update-available", (info: UpdateInfo) => {
      log.info(`Update available: ${info.version}`);
      this.setState({ phase: "available", version: info.version });
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

  // electron-updater can't verify updates against a dev build (app version is
  // derived from package.json but the running exe isn't signed/squashed like
  // a real release), so we skip the check outside packaged builds.
  scheduleBootCheck(): void {
    if (!app.isPackaged) return;
    setTimeout(() => {
      this.check().catch(() => {});
    }, 5000);
  }

  async check(): Promise<void> {
    if (!app.isPackaged) return;
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      log.error("Update check failed:", err);
      this.setState({ phase: "error", message: String(err) });
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

  private setState(state: UpdateState): void {
    this.state = state;
    this.windows.notifyUpdateState(state);
  }
}
