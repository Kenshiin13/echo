import { clipboard } from "electron";
import { keyboard, Key } from "@nut-tree-fork/nut-js";
import { log } from "./logger";

keyboard.config.autoDelayMs = 0;

const PASTE_SETTLE_MS = 40;

export class PasteManager {
  async pasteText(text: string): Promise<void> {
    if (!text.trim()) return;

    const prev = clipboard.readText();
    clipboard.writeText(text);

    try {
      await this.sendPasteKeys();
      // Brief settle so the target app processes the paste before we restore
      await new Promise<void>((r) => setTimeout(r, PASTE_SETTLE_MS));
    } catch (err) {
      log.error("nut-js paste failed:", err);
      // Clipboard already has the text — user can paste manually with Ctrl+V
    } finally {
      clipboard.writeText(prev);
    }
  }

  private async sendPasteKeys(): Promise<void> {
    if (process.platform === "darwin") {
      await keyboard.pressKey(Key.LeftSuper, Key.V);
      await keyboard.releaseKey(Key.LeftSuper, Key.V);
    } else {
      await keyboard.pressKey(Key.LeftControl, Key.V);
      await keyboard.releaseKey(Key.LeftControl, Key.V);
    }
  }
}
