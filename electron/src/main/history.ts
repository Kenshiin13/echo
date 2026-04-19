import fs from "fs";
import path from "path";
import { app } from "electron";
import { log } from "./logger";
import type { HistoryEntry } from "../shared/types";

const MAX_ENTRIES = 50;

export class HistoryStore {
  private entries: HistoryEntry[] = [];
  private file: string;

  constructor() {
    this.file = path.join(app.getPath("userData"), "history.json");
    this.load();
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.file)) return;
      const raw = fs.readFileSync(this.file, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) this.entries = parsed;
    } catch (err) {
      log.error("Failed to load transcription history:", err);
      this.entries = [];
    }
  }

  private persist(): void {
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.entries));
    } catch (err) {
      log.error("Failed to save transcription history:", err);
    }
  }

  add(text: string): HistoryEntry | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: trimmed,
      timestamp: Date.now(),
    };
    this.entries.unshift(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(0, MAX_ENTRIES);
    }
    this.persist();
    return entry;
  }

  list(): HistoryEntry[] {
    return this.entries;
  }

  remove(id: string): void {
    this.entries = this.entries.filter((e) => e.id !== id);
    this.persist();
  }

  clear(): void {
    this.entries = [];
    this.persist();
  }
}
