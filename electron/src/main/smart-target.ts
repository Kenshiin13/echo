import type { SmartTarget } from "../shared/types";

/**
 * Volatile pin for the Smart-transcription target window. Never persisted —
 * cleared on every app boot. Identity is carried as PID + exe path so title
 * changes (Chrome tab switch, Notepad edit) don't invalidate the pin.
 */
export class SmartTargetStore {
  private current: SmartTarget | null = null;

  get(): SmartTarget | null {
    return this.current;
  }

  set(target: SmartTarget | null): void {
    this.current = target;
  }
}
