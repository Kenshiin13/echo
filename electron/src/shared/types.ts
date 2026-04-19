export type Backend = "cuda" | "mlx" | "cpu";
export type ModelSize = "tiny" | "base" | "small" | "medium" | "large-v3-turbo";
export type IndicatorState = "idle" | "recording" | "transcribing" | "done" | "error" | "downloading";

export interface Config {
  hotkey: string;
  exitKey: string;
  /** null when the user has deleted all models — transcription is disabled until
   *  they pick and download one. */
  modelSize: ModelSize | null;
  language: string | null;
  backend: Backend;
  autoPaste: boolean;
  autostart: boolean;
  voiceActivation: boolean;
  /** ISO language code to auto-translate the transcript into, via DeepL. null = disabled. */
  translateTo: string | null;
  /** DeepL API key. Keys ending in ":fx" use the free endpoint; others use pro. */
  deeplApiKey: string;
  /** Optional initial prompt passed to Whisper as context before each
   *  transcription. Biases spelling, style, punctuation, custom vocabulary. */
  prompt: string;
  /** User-editable find/replace rules applied to every transcript after
   *  Whisper + optional DeepL translation, before paste. Case-insensitive,
   *  applied in order. Use `\n` in the replacement for a newline. */
  replacements: Replacement[];
  indicatorHideDelayMs: number;
}

export interface Replacement {
  from: string;
  to: string;
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
  translateTo: null,
  deeplApiKey: "",
  prompt: "",
  replacements: [],
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
