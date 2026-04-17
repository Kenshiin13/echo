import { ipcMain, app } from "electron";
import { ConfigStore } from "./config";
import { WindowManager } from "./windows";
import { TrayManager } from "./tray";
import { HotkeyManager } from "./hotkey";
import { AutostartManager } from "./autostart";
import { RecordingSession } from "./recorder";
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
  session: RecordingSession,
): void {
  ipcMain.handle("settings:get-config", () => config.get());
  ipcMain.handle("settings:get-system-info", () => sysInfo);

  ipcMain.handle("settings:save", (_e, newConfig) => {
    try {
      const prev = config.get();
      config.save(newConfig);
      tray.buildMenu();

      // Hotkey changed — restart the listener (only relevant when push-to-talk is active)
      if (prev.hotkey !== newConfig.hotkey && !newConfig.voiceActivation) {
        hotkey.update(newConfig.hotkey);
      }

      // Autostart changed
      if (prev.autostart !== newConfig.autostart) {
        autostart.setEnabled(newConfig.autostart);
      }

      // Voice activation toggled — swap between hotkey and Silero VAD live
      if (prev.voiceActivation !== newConfig.voiceActivation) {
        if (newConfig.voiceActivation) {
          hotkey.stop();
          session.enableVoiceActivation();
          log.info("Voice activation enabled (live swap)");
        } else {
          session.disableVoiceActivation();
          hotkey.start();
          log.info("Voice activation disabled (live swap)");
        }
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
