import { app, Notification } from "electron";
import { spawnSync } from "child_process";
import path from "path";
import { log } from "./logger";

const TASK_NAME = "EchoAutoStart";

function appIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "assets", "echo_windows_multi_size.ico")
    : path.join(app.getAppPath(), "..", "assets", "echo_windows_multi_size.ico");
}

function describeExecError(err: unknown): string {
  const e = err as { message?: string; stderr?: Buffer | string; stdout?: Buffer | string };
  const pipe = (v: Buffer | string | undefined) =>
    v ? (Buffer.isBuffer(v) ? v.toString("utf8") : v).trim() : "";
  const extras = [pipe(e.stderr), pipe(e.stdout)].filter(Boolean).join(" | ");
  return extras ? `${e.message ?? err} — ${extras}` : String(e.message ?? err);
}

/**
 * Auto-launch Echo at login via Windows Task Scheduler.
 *
 * We can't use the Run registry key (what `app.setLoginItemSettings` writes
 * to) because Echo's manifest requires admin elevation, and Windows silently
 * skips Run-key entries for elevated apps on logon. Task Scheduler, with
 * `/rl highest`, launches elevated tasks at logon without a UAC prompt.
 *
 * Registering the task itself needs admin — fine in production (elevated
 * manifest), fails in `npm run dev` where Electron isn't elevated; in that
 * case we surface a notification so the user knows why.
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
      const msg = describeExecError(err);
      log.error(`autostart: setEnabled(${enabled}) failed: ${msg}`);
      this.notifyFailure(enabled, msg);
    }
  }

  private createTask(): void {
    const exePath = process.execPath;
    const r = spawnSync(
      "schtasks.exe",
      [
        "/create",
        "/tn", TASK_NAME,
        "/tr", `"${exePath}"`,
        "/sc", "onlogon",
        "/rl", "highest",
        "/f",
      ],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, encoding: "utf8" },
    );
    if (r.status !== 0) {
      throw Object.assign(
        new Error(`schtasks /create exit=${r.status}`),
        { stderr: r.stderr, stdout: r.stdout },
      );
    }
    log.info(`autostart: created scheduled task "${TASK_NAME}" → ${exePath}`);
  }

  private deleteTask(): void {
    const r = spawnSync(
      "schtasks.exe",
      ["/delete", "/tn", TASK_NAME, "/f"],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, encoding: "utf8" },
    );
    if (r.status === 0) {
      log.info(`autostart: deleted scheduled task "${TASK_NAME}"`);
      return;
    }
    // schtasks returns non-zero when the task doesn't exist — swallow that.
    const err = (r.stderr || "").toLowerCase();
    if (err.includes("cannot find") || err.includes("does not exist") || err.includes("nicht gefunden")) {
      return;
    }
    throw Object.assign(
      new Error(`schtasks /delete exit=${r.status}`),
      { stderr: r.stderr, stdout: r.stdout },
    );
  }

  private notifyFailure(enabled: boolean, _detail: string): void {
    // schtasks refuses /rl highest tasks without elevation. That's the only
    // cause we've ever seen for this failing, so instead of brittle locale
    // pattern-matching on the error text, we tell the user the common cause
    // in plain language. The raw detail goes to main.log for debugging.
    const action = enabled ? "enable" : "disable";
    try {
      new Notification({
        title: `Couldn't ${action} auto-start`,
        body:
          "This action needs administrator privileges. " +
          "Right-click Echo and choose Run as administrator, then try again.",
        icon: appIconPath(),
      }).show();
    } catch (err) {
      log.warn(`autostart: could not show notification: ${err}`);
    }
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
      log.warn(`autostart: migration failed: ${describeExecError(err)}`);
    }
  }
}
