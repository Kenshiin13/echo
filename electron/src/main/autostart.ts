import { app } from "electron";

export class AutostartManager {
  isEnabled(): boolean {
    return app.getLoginItemSettings().openAtLogin;
  }

  setEnabled(enabled: boolean): void {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true,
    });
  }
}
