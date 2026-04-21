import { app } from "electron";
import { execFileSync, spawnSync } from "child_process";
import { log } from "./logger";

const TASK_NAME = "EchoAutoStart";

/**
 * Auto-launch Echo at login via Windows Task Scheduler.
 *
 * We can't use the Run registry key (what `app.setLoginItemSettings` writes
 * to) because Echo's manifest requires admin elevation, and Windows silently
 * skips Run-key entries for elevated apps on logon. Task Scheduler, with
 * `/rl highest`, happily launches elevated tasks at logon without a UAC
 * prompt because the task itself is registered as trusted.
 *
 * Creating the task also needs admin — which we have, since Echo is running
 * elevated when this runs.
 */
export class AutostartManager {
  constructor() {
    this.migrateFromRunKey();
  }

  isEnabled(): boolean {
    const r = spawnSync("schtasks.exe", ["/query", "/tn", TASK_NAME], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    return r.status === 0;
  }

  setEnabled(enabled: boolean): void {
    try {
      if (enabled) this.createTask();
      else this.deleteTask();
    } catch (err) {
      log.error(`autostart: setEnabled(${enabled}) failed:`, err);
    }
  }

  private createTask(): void {
    const exePath = process.execPath;
    // `/rl highest` = run elevated (matches the installed exe's manifest).
    // `/sc onlogon` = trigger on any user logon. `/f` = overwrite.
    execFileSync(
      "schtasks.exe",
      [
        "/create",
        "/tn", TASK_NAME,
        "/tr", `"${exePath}"`,
        "/sc", "onlogon",
        "/rl", "highest",
        "/f",
      ],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
    log.info(`autostart: created scheduled task "${TASK_NAME}" → ${exePath}`);
  }

  private deleteTask(): void {
    const r = spawnSync(
      "schtasks.exe",
      ["/delete", "/tn", TASK_NAME, "/f"],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
    if (r.status === 0) {
      log.info(`autostart: deleted scheduled task "${TASK_NAME}"`);
    }
    // Non-zero = task didn't exist. Fine.
  }

  /**
   * One-time migration: earlier Echo versions wrote to HKCU\...\Run, which
   * Windows silently ignores for admin-manifested apps. If the legacy entry
   * is still there, clear it and re-create autostart as a scheduled task.
   */
  private migrateFromRunKey(): void {
    try {
      const legacy = app.getLoginItemSettings();
      if (!legacy.openAtLogin) return;
      log.info("autostart: migrating legacy Run-key autostart to Task Scheduler");
      app.setLoginItemSettings({ openAtLogin: false });
      if (!this.isEnabled()) this.createTask();
    } catch (err) {
      log.warn("autostart: migration failed:", err);
    }
  }
}
