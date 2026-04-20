import { contextBridge, ipcRenderer } from "electron";
import type { Config, SystemInfo, IndicatorState, UpdateState, HistoryEntry, SmartTarget } from "../shared/types";

export type SmartWindow = {
  pid: number;
  title: string;
};

const api = {
  // Settings window
  getConfig: (): Promise<Config> =>
    ipcRenderer.invoke("settings:get-config"),

  getSystemInfo: (): Promise<SystemInfo> =>
    ipcRenderer.invoke("settings:get-system-info"),

  saveConfig: (config: Config): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("settings:save", config),

  restart: (): void => ipcRenderer.send("app:restart"),
  closeSettings: (): void => ipcRenderer.send("settings:close"),

  // Indicator overlay
  onIndicatorState: (cb: (state: IndicatorState) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, state: IndicatorState) => cb(state);
    ipcRenderer.on("indicator:state", handler);
    return () => ipcRenderer.removeListener("indicator:state", handler);
  },

  // Audio capture window
  onAudioStart: (cb: (deviceId: string | null) => void): void => {
    ipcRenderer.on("audio:start", (_e, deviceId: string | null) => cb(deviceId));
  },

  onAudioStop: (cb: () => void): void => {
    ipcRenderer.on("audio:stop", () => cb());
  },

  sendAudioData: (pcm: Uint8Array): void => {
    ipcRenderer.send("audio:data", pcm);
  },

  sendAudioLevel: (rms: number): void => {
    ipcRenderer.send("audio:level", rms);
  },

  // Voice-activation (Silero VAD) in the capture window
  onVadEnable: (cb: (deviceId: string | null) => void): void => {
    ipcRenderer.on("audio:vad-enable", (_e, deviceId: string | null) => cb(deviceId));
  },

  onVadDisable: (cb: () => void): void => {
    ipcRenderer.on("audio:vad-disable", () => cb());
  },

  sendVadSpeechStart: (): void => {
    ipcRenderer.send("audio:vad-speech-start");
  },

  sendVadMisfire: (): void => {
    ipcRenderer.send("audio:vad-misfire");
  },

  onAudioLevel: (cb: (rms: number) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, rms: number) => cb(rms);
    ipcRenderer.on("indicator:level", handler);
    return () => ipcRenderer.removeListener("indicator:level", handler);
  },

  onDownloadProgress: (cb: (percent: number) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, pct: number) => cb(pct);
    ipcRenderer.on("indicator:download-progress", handler);
    return () => ipcRenderer.removeListener("indicator:download-progress", handler);
  },

  // Model management
  listModels: (): Promise<string[]> => ipcRenderer.invoke("model:list"),
  deleteModel: (modelSize: string): Promise<void> => ipcRenderer.invoke("model:delete", modelSize),

  onModelDownloaded: (cb: (modelSize: string) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, size: string) => cb(size);
    ipcRenderer.on("settings:model-downloaded", handler);
    return () => ipcRenderer.removeListener("settings:model-downloaded", handler);
  },

  // Auto-updater
  getUpdateState: (): Promise<UpdateState> => ipcRenderer.invoke("updates:get-state"),
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke("updates:check"),
  installUpdate: (): Promise<void> => ipcRenderer.invoke("updates:install"),
  onUpdateState: (cb: (state: UpdateState) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, state: UpdateState) => cb(state);
    ipcRenderer.on("updates:state", handler);
    return () => ipcRenderer.removeListener("updates:state", handler);
  },

  // Transcription history
  listHistory: (): Promise<HistoryEntry[]> => ipcRenderer.invoke("history:list"),
  deleteHistoryEntry: (id: string): Promise<void> => ipcRenderer.invoke("history:delete", id),
  clearHistory: (): Promise<void> => ipcRenderer.invoke("history:clear"),
  onHistoryUpdated: (cb: () => void): (() => void) => {
    const handler = () => cb();
    ipcRenderer.on("history:updated", handler);
    return () => ipcRenderer.removeListener("history:updated", handler);
  },

  // Smart-transcription: list Alt-Tab-visible windows and read/write the
  // volatile target (PID + exe path; never persisted across restarts).
  listSmartWindows: (): Promise<SmartWindow[]> => ipcRenderer.invoke("smart:list-windows"),
  getSmartTarget: (): Promise<SmartTarget | null> => ipcRenderer.invoke("smart:get-target"),
  setSmartTarget: (target: SmartTarget | null): Promise<void> =>
    ipcRenderer.invoke("smart:set-target", target),
  onSmartTargetChanged: (cb: (target: SmartTarget | null) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, target: SmartTarget | null) => cb(target);
    ipcRenderer.on("smart:target-changed", handler);
    return () => ipcRenderer.removeListener("smart:target-changed", handler);
  },
};

contextBridge.exposeInMainWorld("echo", api);

declare global {
  interface Window {
    echo: typeof api;
  }
}
