import { app, dialog, Notification } from "electron";
import fs from "fs";
import path from "path";
import { ConfigStore } from "./config";
import { WindowManager } from "./windows";
import { TrayManager } from "./tray";
import { HotkeyManager } from "./hotkey";
import { RecordingSession } from "./recorder";
import { Transcriber } from "./transcriber";
import { PasteManager } from "./paste";
import { AutostartManager } from "./autostart";
import { SingleInstance } from "./single-instance";
import { setupIpc } from "./ipc";
import { getSystemInfo } from "./system-info";
import { log } from "./logger";
import { modelExists, downloadModel, binaryMatchesBackend, downloadBinary, restorePreservedModels } from "./model-downloader";

async function main() {
  await app.whenReady();

  const lock = new SingleInstance();
  if (!lock.acquire()) {
    dialog.showMessageBoxSync({
      type: "info",
      title: "Echo",
      message: "Echo is already running.",
      detail: "Find the microphone icon in your system tray.",
      buttons: ["OK"],
    });
    app.quit();
    return;
  }

  const config = new ConfigStore();
  const sysInfo = await getSystemInfo();

  // On first run, default the backend to whatever the hardware recommends
  if (config.isFirstRun() && sysInfo.recommendedBackend !== "cpu") {
    config.save({ ...config.get(), backend: sysInfo.recommendedBackend });
  }
  const windows = new WindowManager();
  const paste = new PasteManager();
  const autostart = new AutostartManager();

  const transcriber = new Transcriber(config, sysInfo, (text) => {
    log.info(`Transcribed: "${text.slice(0, 80)}${text.length > 80 ? "…" : ""}" (${text.length} chars)`);

    if (!text.trim()) {
      // Whisper returned nothing (silence) — go back to idle quietly
      windows.updateIndicator("idle");
      return;
    }

    windows.updateIndicator("done");

    if (config.get().autoPaste) {
      paste.pasteText(text).catch((err) => log.error("pasteText failed:", err));
    } else {
      const { clipboard } = require("electron");
      clipboard.writeText(text);
    }

    setTimeout(() => windows.updateIndicator("idle"), config.get().indicatorHideDelayMs);
  });

  const session = new RecordingSession(
    (pcmData) => {
      windows.updateIndicator("transcribing");
      transcriber.transcribe(pcmData).catch((err) => {
        log.error("Transcription failed:", err);
        windows.updateIndicator("error");
        setTimeout(() => windows.updateIndicator("idle"), 2000);
      });
    },
    () => windows.updateIndicator("idle"), // too-short recording → hide indicator
  );

  const hotkey = new HotkeyManager(
    config.get().hotkey,
    () => {
      if (session.isRecording()) return;
      windows.updateIndicator("recording");
      session.start();
    },
    () => {
      if (!session.isRecording()) return;
      session.stop();
    },
  );

  const tray = new TrayManager(config, windows);
  setupIpc(config, sysInfo, windows, tray, hotkey, autostart);

  tray.create();

  // Restore any models the user preserved on a previous uninstall
  restorePreservedModels();

  // Download correct binary variant if backend changed (e.g. CPU → CUDA)
  const backend = config.get().backend;
  if (process.platform === "win32" && !binaryMatchesBackend(backend)) {
    const variant = backend === "cuda" ? "cuda" : "cpu";
    log.info(`Binary variant mismatch — downloading ${variant} binary…`);
    windows.updateIndicator("downloading");
    try {
      await downloadBinary(variant, (pct) => windows.sendDownloadProgress(pct));
    } catch (err) {
      log.error("Binary download failed:", err);
      windows.updateIndicator("error");
      await new Promise((r) => setTimeout(r, 3000));
    }
    windows.updateIndicator("idle");
  }

  // Download selected model if missing before enabling the hotkey
  const selectedModel = config.get().modelSize;
  if (!modelExists(selectedModel)) {
    log.info(`Model ggml-${selectedModel}.bin not found — downloading…`);
    windows.updateIndicator("downloading");
    try {
      await downloadModel(selectedModel, (pct) => windows.sendDownloadProgress(pct));
      log.info(`Model ggml-${selectedModel}.bin ready`);
    } catch (err) {
      log.error("Model download failed:", err);
      windows.updateIndicator("error");
      await new Promise((r) => setTimeout(r, 3000));
    }
    windows.updateIndicator("idle");
  }

  hotkey.start();

  // Show a one-time "moved to tray" notification on first ever launch
  const flagPath = path.join(app.getPath("userData"), ".launched");
  if (!fs.existsSync(flagPath)) {
    fs.writeFileSync(flagPath, "1");
    if (Notification.isSupported()) {
      setTimeout(() => {
        new Notification({
          title: "Echo is running",
          body: "Echo has been moved to the system tray. Right-click the tray icon to open settings or quit.",
        }).show();
      }, 1200);
    }
  }

  // In dev, open settings immediately so there's something visible
  if (!app.isPackaged) {
    windows.openSettings();
  }

  app.on("window-all-closed", () => { /* keep alive — tray app */ });
  app.on("before-quit", () => {
    hotkey.stop();
    lock.release();
  });

  log.info(`Echo started (v${app.getVersion()}, ${sysInfo.platform}, backend=${config.get().backend})`);
}

main().catch((err) => {
  process.stderr.write(`[Echo fatal] ${err}\n${err?.stack ?? ""}\n`);
  try {
    dialog.showErrorBox("Echo — Fatal Error", String(err));
  } catch {}
  app.quit();
});
