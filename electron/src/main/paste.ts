import { clipboard } from "electron";
import { keyboard, Key } from "@nut-tree-fork/nut-js";
import { log } from "./logger";
import { focusHwnd, getForegroundHwnd, isHwndIconic, minimizeHwnd } from "./window-picker";

keyboard.config.autoDelayMs = 0;

const PASTE_SETTLE_MS = 40;
const FOCUS_SETTLE_MS = 150;
const SUBMIT_SETTLE_MS = 60;
const RESTORE_SETTLE_MS = 80;

interface PasteOpts {
  autoSubmit?: boolean;
  /** HWND to return focus to after paste. Callers pass this when they've
   *  already captured it (e.g. before a resolution step that might steal
   *  focus as a side effect). When omitted, we capture current foreground
   *  at paste time. */
  previouslyFocused?: bigint;
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

    // Snapshot state BEFORE stealing focus so we can put everything back.
    // Avoids disrupting the user's flow: if they were on Chrome, they stay
    // on Chrome; if the target was minimized, it gets re-minimized.
    const previouslyFocused = opts.previouslyFocused ?? getForegroundHwnd();
    const targetWasMinimized = isHwndIconic(hwnd);

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

      // Restore the target's original minimized state, then return focus to
      // whichever window the user was actually on. Skip the restore if the
      // user was already on the target (no disruption to undo).
      await new Promise<void>((r) => setTimeout(r, RESTORE_SETTLE_MS));
      if (targetWasMinimized) {
        minimizeHwnd(hwnd);
      }
      if (previouslyFocused && previouslyFocused !== hwnd) {
        focusHwnd(previouslyFocused);
      }
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
