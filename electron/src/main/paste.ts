import { clipboard } from "electron";
import { log } from "./logger";

export class PasteManager {
  async pasteText(text: string): Promise<void> {
    if (!text.trim()) return;

    const prev = clipboard.readText();
    clipboard.writeText(text);

    try {
      await this.sendPasteKeys();
      // Brief settle so the target app processes the paste before we restore
      await new Promise<void>((r) => setTimeout(r, 150));
    } catch (err) {
      log.error("nut-js paste failed:", err);
      // Clipboard already has the text — user can paste manually with Ctrl+V
    } finally {
      clipboard.writeText(prev);
    }
  }

  private async sendPasteKeys(): Promise<void> {
    const { keyboard, Key } = require("@nut-tree-fork/nut-js") as typeof import("@nut-tree-fork/nut-js");
    keyboard.config.autoDelayMs = 0;

    if (process.platform === "darwin") {
      await keyboard.pressKey(Key.LeftSuper, Key.V);
      await keyboard.releaseKey(Key.LeftSuper, Key.V);
    } else {
      await keyboard.pressKey(Key.LeftControl, Key.V);
      await keyboard.releaseKey(Key.LeftControl, Key.V);
    }
  }
}
