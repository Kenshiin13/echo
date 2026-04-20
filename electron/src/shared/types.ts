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
  /** MediaDeviceInfo.deviceId of the preferred microphone. null = OS default. */
  audioInputDeviceId: string | null;
  /** Keep a rolling log of transcripts for re-copy. Disable to stop saving. */
  historyEnabled: boolean;
  /** Press Enter after pasting — useful for chat inputs (Claude, ChatGPT). */
  smartAutoSubmit: boolean;
}

/** Volatile identity for the Smart-transcription target window.
 *  Identified by PID so title changes (Chrome tab switch, Notepad edit) don't
 *  invalidate the pin. Never persisted to disk — reset to null on every
 *  app boot. */
export interface SmartTarget {
  pid: number;
  /** Title captured when the user picked it — display + fallback matching. */
  title: string;
}

export interface HistoryEntry {
  id: string;
  text: string;
  timestamp: number;
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
  audioInputDeviceId: null,
  historyEnabled: true,
  smartAutoSubmit: false,
};

export interface SystemInfo {
  platform: "win32" | "darwin" | "linux";
  hasNvidiaGpu: boolean;
  isAppleSilicon: boolean;
  recommendedBackend: Backend;
  appVersion: string;
  assetsUrl: string; // file:// URL for the assets directory
}

export type UpdateState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "not-available"; checkedAt: number }
  | { phase: "available"; version: string }
  | { phase: "downloading"; percent: number; version: string }
  | { phase: "downloaded"; version: string }
  | { phase: "error"; message: string };

export interface GitHubRelease {
  tagName: string;
  name: string;
  publishedAt: string;
  body: string;
  htmlUrl: string;
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
