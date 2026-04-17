export type Backend = "cuda" | "mlx" | "cpu";
export type ModelSize = "tiny" | "base" | "small" | "medium" | "large-v3-turbo";
export type IndicatorState = "idle" | "recording" | "transcribing" | "done" | "error" | "downloading";

export interface Config {
  hotkey: string;
  exitKey: string;
  modelSize: ModelSize;
  language: string | null;
  backend: Backend;
  autoPaste: boolean;
  autostart: boolean;
  voiceActivation: boolean;
  indicatorHideDelayMs: number;
}

export const DEFAULT_CONFIG: Config = {
  hotkey: "f9",
  exitKey: "ctrl+alt+q",
  modelSize: "base",
  language: null,
  backend: "cpu",
  autoPaste: true,
  autostart: false,
  voiceActivation: false,
  indicatorHideDelayMs: 1200,
};

export interface SystemInfo {
  platform: "win32" | "darwin" | "linux";
  hasNvidiaGpu: boolean;
  isAppleSilicon: boolean;
  recommendedBackend: Backend;
  appVersion: string;
  assetsUrl: string; // file:// URL for the assets directory
}

export type IpcChannels = {
  // main → renderer
  "indicator:state": IndicatorState;
  "settings:config": Config;
  "settings:system-info": SystemInfo;
  "settings:save-result": { ok: boolean; error?: string };
  // renderer → main
  "settings:get-config": void;
  "settings:get-system-info": void;
  "settings:save": Config;
  "settings:open-installer": void;
  "app:restart": void;
};
