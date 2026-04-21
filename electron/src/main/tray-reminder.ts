import { Notification, app } from "electron";
import path from "path";
import { log } from "./logger";

function iconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "assets", "echo_windows_multi_size.ico")
    : path.join(app.getAppPath(), "..", "assets", "echo_windows_multi_size.ico");
}

/**
 * "Echo is still active" reminder shown when the Settings window closes.
 * Fires once per app session — users learn after the first close that
 * Echo lives in the tray, so further toasts each time they close Settings
 * would be noise. Counter resets on app restart.
 */
export class TrayReminder {
  private shown = false;

  show(): void {
    if (this.shown) return;
    this.shown = true;
    try {
      new Notification({
        title: "Echo",
        body: "Still active in the system tray.",
        icon: iconPath(),
      }).show();
    } catch (err) {
      log.warn(`tray-reminder: could not show notification: ${err}`);
    }
  }
}
