import { clipboard } from "electron";
import { keyboard, Key } from "@nut-tree-fork/nut-js";
import { log } from "./logger";
import { focusHwnd } from "./window-picker";

keyboard.config.autoDelayMs = 0;

const PASTE_SETTLE_MS = 40;
const FOCUS_SETTLE_MS = 150;
const SUBMIT_SETTLE_MS = 60;

interface PasteOpts {
  autoSubmit?: boolean;
}

export class PasteManager {
  async pasteText(text: string, opts: PasteOpts = {}): Promise<void> {
    if (!text.trim()) return;

    const prev = clipboard.readText();
    clipboard.writeText(text);

    try {
      await this.sendPasteKeys();
      await new Promise<void>((r) => setTimeout(r, PASTE_SETTLE_MS));
      if (opts.autoSubmit) await this.sendEnter();
    } catch (err) {
      log.error("nut-js paste failed:", err);
    } finally {
      clipboard.writeText(prev);
    }
  }

  async pasteToHwnd(hwnd: bigint, text: string, opts: PasteOpts = {}): Promise<void> {
    if (!text.trim()) return;

    const prev = clipboard.readText();
    clipboard.writeText(text);

    try {
      const focused = focusHwnd(hwnd);
      if (!focused) {
        log.warn("pasteToHwnd: focusHwnd returned false — paste may miss target");
      }
      // Focus-steal protection + compositor lag mean keystrokes sent
      // immediately after SetForegroundWindow can miss. Give Windows a beat.
      await new Promise<void>((r) => setTimeout(r, FOCUS_SETTLE_MS));
      await this.sendPasteKeys();
      await new Promise<void>((r) => setTimeout(r, PASTE_SETTLE_MS));
      if (opts.autoSubmit) await this.sendEnter();
    } catch (err) {
      log.error("pasteToHwnd failed:", err);
    } finally {
      clipboard.writeText(prev);
    }
  }

  private async sendPasteKeys(): Promise<void> {
    await keyboard.pressKey(Key.LeftControl, Key.V);
    await keyboard.releaseKey(Key.LeftControl, Key.V);
  }

  private async sendEnter(): Promise<void> {
    await new Promise<void>((r) => setTimeout(r, SUBMIT_SETTLE_MS));
    await keyboard.pressKey(Key.Enter);
    await keyboard.releaseKey(Key.Enter);
  }
}
