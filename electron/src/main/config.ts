import Store from "electron-store";
import { Config, DEFAULT_CONFIG } from "../shared/types";

export class ConfigStore {
  private store: Store<Config>;

  constructor() {
    this.store = new Store<Config>({
      name: "config",
      defaults: DEFAULT_CONFIG,
    });
  }

  get(): Config {
    // Spread all keys explicitly so the return is always a plain object
    return {
      hotkey: this.store.get("hotkey"),
      exitKey: this.store.get("exitKey"),
      modelSize: this.store.get("modelSize"),
      language: this.store.get("language"),
      backend: this.store.get("backend"),
      autoPaste: this.store.get("autoPaste"),
      autostart: this.store.get("autostart"),
      voiceActivation: this.store.get("voiceActivation"),
      translateTo: this.store.get("translateTo"),
      deeplApiKey: this.store.get("deeplApiKey"),
      prompt: this.store.get("prompt"),
      replacements: this.store.get("replacements"),
      indicatorHideDelayMs: this.store.get("indicatorHideDelayMs"),
      audioInputDeviceId: this.store.get("audioInputDeviceId"),
    };
  }

  save(config: Config): void {
    this.store.set(config);
  }

  /** True if the user has never explicitly saved a config (all defaults). */
  isFirstRun(): boolean {
    return !this.store.has("backend");
  }
}
