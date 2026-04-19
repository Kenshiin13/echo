import { log } from "./logger";

export class HotkeyManager {
  private backend: WindowsHotkeyBackend | null = null;

  constructor(
    private hotkey: string,
    private onPress: () => void,
    private onRelease: () => void,
  ) {}

  start(): void {
    this.backend = new WindowsHotkeyBackend(this.hotkey, this.onPress, this.onRelease);
    this.backend.start();
    log.info(`Hotkey started: ${this.hotkey}`);
  }

  stop(): void {
    this.backend?.stop();
    this.backend = null;
  }

  update(hotkey: string): void {
    this.hotkey = hotkey;
    this.stop();
    this.start();
  }
}

// Pure GetAsyncKeyState polling, no global hooks.
// Works with all games and anti-cheat drivers regardless of window focus.

const WIN_VK: Record<string, number> = {
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`f${i + 1}`, 0x70 + i])),
  ctrl: 0x11, ctrl_l: 0xa2, ctrl_r: 0xa3,
  alt: 0x12, alt_l: 0xa4, alt_r: 0xa5,
  shift: 0x10, shift_l: 0xa0, shift_r: 0xa1,
  win: 0x5b, cmd: 0x5b,
  space: 0x20, caps_lock: 0x14,
  insert: 0x2d, delete: 0x2e,
  home: 0x24, end: 0x23, page_up: 0x21, page_down: 0x22,
  scroll_lock: 0x91, pause: 0x13, num_lock: 0x90,
};

function parseVkCombo(name: string): number[] {
  const vks: number[] = [];
  for (const part of name.toLowerCase().split("+").map((p) => p.trim())) {
    if (!part) continue;
    if (part in WIN_VK) {
      vks.push(WIN_VK[part]);
    } else if (part.length === 1) {
      vks.push(part.toUpperCase().charCodeAt(0));
    } else {
      throw new Error(`Unsupported key: ${part}`);
    }
  }
  if (!vks.length) throw new Error(`Empty hotkey: ${name}`);
  return vks;
}

class WindowsHotkeyBackend {
  private vks: number[];
  private timer: ReturnType<typeof setInterval> | null = null;
  private active = false;
  private user32: ReturnType<typeof loadUser32> | null = null;

  constructor(
    hotkey: string,
    private onPress: () => void,
    private onRelease: () => void,
  ) {
    this.vks = parseVkCombo(hotkey);
  }

  start(): void {
    this.user32 = loadUser32();
    let prev = false;
    this.timer = setInterval(() => {
      const now = this.allDown();
      if (now && !prev && !this.active) {
        this.active = true;
        try { this.onPress(); } catch (e) { log.error("hotkey press error:", e); }
      } else if (!now && prev && this.active) {
        this.active = false;
        try { this.onRelease(); } catch (e) { log.error("hotkey release error:", e); }
      }
      prev = now;
    }, 20);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.active = false;
  }

  private allDown(): boolean {
    if (!this.user32) return false;
    return this.vks.every((vk) => {
      const state = this.user32!.GetAsyncKeyState(vk) as number;
      return (state & 0x8000) !== 0;
    });
  }
}

function loadUser32() {
  try {
    const koffi = require("koffi") as typeof import("koffi");
    const lib = koffi.load("user32.dll");
    const GetAsyncKeyState = lib.func("short __stdcall GetAsyncKeyState(int vKey)");
    return { GetAsyncKeyState: (vk: number) => GetAsyncKeyState(vk) };
  } catch (err) {
    log.error("Failed to load user32.dll via koffi:", err);
    return null;
  }
}
