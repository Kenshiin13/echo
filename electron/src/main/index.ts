import { app, dialog, Notification, protocol } from "electron";
import { pathToFileURL, fileURLToPath } from "url";
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

  // Inject COOP/COEP on every file:// response so the renderer is treated as
  // crossOriginIsolated. That's what makes SharedArrayBuffer available, which
  // the threaded WASM in onnxruntime-web 1.24 (bundled by @ricky0123/vad-web)
  // requires. Using protocol.handle + bypassCustomProtocolHandlers avoids
  // touching file-loading anywhere else in the app.
  protocol.handle("file", async (request) => {
    const filePath = fileURLToPath(request.url);
    try {
      const data = await fs.promises.readFile(filePath);
      const headers = new Headers();
      headers.set("Content-Type", mimeFor(filePath));
      headers.set("Cross-Origin-Opener-Policy", "same-origin");
      headers.set("Cross-Origin-Embedder-Policy", "require-corp");
      headers.set("Cross-Origin-Resource-Policy", "cross-origin");
      // Log VAD-related asset fetches for diagnostics
      if (/ort-wasm|silero|vad\.worklet/.test(filePath)) {
        log.info(`[protocol file] served ${path.basename(filePath)} (${data.length} B)`);
      }
      return new Response(new Uint8Array(data), { status: 200, headers });
    } catch (err) {
      log.error(`[protocol file] ${filePath} — ${err}`);
      return new Response(null, { status: 404 });
    }
  });
  // silence unused-import complaints — pathToFileURL is kept for future use
  void pathToFileURL;

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
    () => windows.updateIndicator("recording"), // VAD detected speech start
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
  setupIpc(config, sysInfo, windows, tray, hotkey, autostart, session, transcriber);

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
  if (selectedModel && !modelExists(selectedModel)) {
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

  // Preload the Whisper model into the persistent server subprocess so the
  // first transcription doesn't pay a cold model-load cost. Skipped if the
  // user has no model selected — they'll pick one from Settings.
  if (selectedModel) {
    transcriber.ensureStarted().catch((err) => {
      log.error("Initial whisper-server start failed:", err);
    });
  }

  const boot = config.get();
  log.info(`Boot config: voiceActivation=${boot.voiceActivation}, hotkey=${boot.hotkey}, model=${boot.modelSize}`);

  if (boot.voiceActivation) {
    log.info("Voice activation ON at boot — enabling Silero VAD");
    session.enableVoiceActivation();
  } else {
    log.info("Voice activation OFF at boot — starting push-to-talk hotkey");
    hotkey.start();
  }

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
    session.disableVoiceActivation();
    transcriber.destroy();
    lock.release();
  });

  log.info(`Echo started (v${app.getVersion()}, ${sysInfo.platform}, backend=${config.get().backend})`);
}

function mimeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html": return "text/html; charset=utf-8";
    case ".js":   return "text/javascript; charset=utf-8";
    case ".mjs":  return "text/javascript; charset=utf-8";
    case ".css":  return "text/css; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".wasm": return "application/wasm";
    case ".svg":  return "image/svg+xml";
    case ".png":  return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".gif":  return "image/gif";
    case ".ico":  return "image/x-icon";
    case ".woff": return "font/woff";
    case ".woff2":return "font/woff2";
    case ".ttf":  return "font/ttf";
    case ".onnx": return "application/octet-stream";
    default:      return "application/octet-stream";
  }
}

main().catch((err) => {
  process.stderr.write(`[Echo fatal] ${err}\n${err?.stack ?? ""}\n`);
  try {
    dialog.showErrorBox("Echo — Fatal Error", String(err));
  } catch {}
  app.quit();
});
