import { ipcMain, app } from "electron";
import { ConfigStore } from "./config";
import { WindowManager } from "./windows";
import { TrayManager } from "./tray";
import { HotkeyManager } from "./hotkey";
import { AutostartManager } from "./autostart";
import { RecordingSession } from "./recorder";
import { Transcriber } from "./transcriber";
import { SystemInfo } from "../shared/types";
import { log } from "./logger";
import { listDownloadedModels, deleteModel, modelExists, downloadModel } from "./model-downloader";
import { UpdaterManager } from "./updater";
import { HistoryStore } from "./history";
import { listOpenWindows } from "./window-picker";
import { SmartTargetStore } from "./smart-target";
import type { SmartTarget } from "../shared/types";

export function setupIpc(
  config: ConfigStore,
  sysInfo: SystemInfo,
  windows: WindowManager,
  tray: TrayManager,
  hotkey: HotkeyManager,
  autostart: AutostartManager,
  session: RecordingSession,
  transcriber: Transcriber,
  updater: UpdaterManager,
  history: HistoryStore,
  smartTarget: SmartTargetStore,
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

      // Auto-update-check toggled — start/stop the hourly poll.
      if (prev.autoUpdate !== newConfig.autoUpdate) {
        updater.syncAutoCheck();
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

      // Mic changed — if VAD is running, restart it so getUserMedia picks up
      // the new device. Push-to-talk reads the device fresh on each key-down
      // so it needs no action.
      if (prev.audioInputDeviceId !== newConfig.audioInputDeviceId && newConfig.voiceActivation) {
        log.info(`Mic changed while VAD running — restarting capture (${newConfig.audioInputDeviceId ?? "default"})`);
        session.disableVoiceActivation();
        session.enableVoiceActivation();
      }

      // Model size changed — download it if missing, then respawn
      // whisper-server. No full-app restart needed. Language and prompt
      // are per-request params and pick up on the next transcription.
      if (prev.modelSize !== newConfig.modelSize) {
        const size = newConfig.modelSize;
        // null = user deleted all models. Tear the server down; next non-null
        // switch (or app restart) will spin it back up with a downloaded model.
        if (!size) {
          transcriber.destroy();
          log.info("Model cleared — whisper-server stopped");
        } else (async () => {
          if (!modelExists(size)) {
            log.info(`Model ${size} not cached — downloading…`);
            windows.updateIndicator("downloading");
            try {
              await downloadModel(size, (pct) => windows.sendDownloadProgress(pct));
              log.info(`Model ${size} ready`);
              windows.notifyModelDownloaded(size);
            } catch (err) {
              log.error(`Model ${size} download failed:`, err);
              windows.updateIndicator("error");
              setTimeout(() => windows.updateIndicator("idle"), 3000);
              return;
            }
          }
          try {
            await transcriber.reload();
            windows.updateIndicator("idle");
          } catch (err) {
            log.error("Failed to reload whisper-server after model change:", err);
          }
        })();
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
  ipcMain.handle("model:delete", async (_e, modelSize: string) => {
    // Whisper-server holds the loaded .bin file in memory (and open on Windows).
    // If we're deleting the currently-active model, tear the subprocess down
    // first — otherwise transcription keeps working from the in-memory copy
    // and the file delete can fail on Windows.
    if (config.get().modelSize === modelSize) {
      transcriber.destroy();
    }
    deleteModel(modelSize);
  });

  ipcMain.on("app:restart", () => {
    app.relaunch();
    app.quit();
  });

  ipcMain.handle("updates:get-state", () => updater.getState());
  ipcMain.handle("updates:check", () => updater.check());
  ipcMain.handle("updates:install", () => updater.quitAndInstall());

  ipcMain.handle("history:list", () => history.list());
  ipcMain.handle("history:delete", (_e, id: string) => history.remove(id));
  ipcMain.handle("history:clear", () => history.clear());

  ipcMain.handle("smart:list-windows", () => listOpenWindows());
  ipcMain.handle("smart:get-target", () => smartTarget.get());
  ipcMain.handle("smart:set-target", (_e, target: SmartTarget | null) => {
    smartTarget.set(target);
  });
}
