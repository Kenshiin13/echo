import { ipcMain, app } from "electron";
import { ConfigStore } from "./config";
import { WindowManager } from "./windows";
import { TrayManager } from "./tray";
import { HotkeyManager } from "./hotkey";
import { AutostartManager } from "./autostart";
import { SystemInfo } from "../shared/types";
import { log } from "./logger";
import { listDownloadedModels, deleteModel } from "./model-downloader";

export function setupIpc(
  config: ConfigStore,
  sysInfo: SystemInfo,
  windows: WindowManager,
  tray: TrayManager,
  hotkey: HotkeyManager,
  autostart: AutostartManager,
): void {
  ipcMain.handle("settings:get-config", () => config.get());
  ipcMain.handle("settings:get-system-info", () => sysInfo);

  ipcMain.handle("settings:save", (_e, newConfig) => {
    try {
      const prev = config.get();
      config.save(newConfig);
      tray.buildMenu();

      // Hotkey changed — restart the listener
      if (prev.hotkey !== newConfig.hotkey) {
        hotkey.update(newConfig.hotkey);
      }

      // Autostart changed
      if (prev.autostart !== newConfig.autostart) {
        autostart.setEnabled(newConfig.autostart);
      }

      log.info("Config saved:", JSON.stringify(newConfig));
      return { ok: true };
    } catch (err) {
      log.error("Config save failed:", err);
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.on("settings:close", () => windows.closeSettings());
  ipcMain.on("audio:level", (_e, rms: number) => windows.sendLevelToIndicator(rms));

  ipcMain.handle("model:list", () => listDownloadedModels());
  ipcMain.handle("model:delete", (_e, modelSize: string) => { deleteModel(modelSize); });

  ipcMain.on("app:restart", () => {
    app.relaunch();
    app.quit();
  });
}
