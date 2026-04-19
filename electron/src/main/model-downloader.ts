// Model manager for the Transformers.js cache layout.
//
// Transformers.js stores downloaded models at:
//   <env.cacheDir>/models--<org>--<model>/snapshots/<sha>/...
// where env.cacheDir is set in transcriber.ts to
//   <userData>/whisper-models.
//
// We expose just enough to list + delete downloaded models for the Settings
// "Downloaded Models" card. Downloading is handled lazily by the pipeline
// itself on first use.
import fs from "fs";
import path from "path";
import { app } from "electron";
import type { ModelSize } from "../shared/types";
import { log } from "./logger";

// Keep these repo IDs in sync with modelIdFor() in transcriber.ts.
const MODEL_REPOS: Record<ModelSize, string> = {
  "tiny":           "Xenova/whisper-tiny",
  "base":           "Xenova/whisper-base",
  "small":          "Xenova/whisper-small",
  "medium":         "Xenova/whisper-medium",
  "large-v3-turbo": "onnx-community/whisper-large-v3-turbo",
};

function cacheDir(): string {
  return path.join(app.getPath("userData"), "whisper-models");
}

function repoDir(size: ModelSize): string {
  const repo = MODEL_REPOS[size];
  if (!repo) return "";
  return path.join(cacheDir(), `models--${repo.replace("/", "--")}`);
}

export function modelExists(size: ModelSize): boolean {
  const dir = repoDir(size);
  if (!dir || !fs.existsSync(dir)) return false;
  const snapshots = path.join(dir, "snapshots");
  if (!fs.existsSync(snapshots)) return false;
  return fs.readdirSync(snapshots).filter((n) => !n.startsWith(".")).length > 0;
}

export function listDownloadedModels(): string[] {
  return (Object.keys(MODEL_REPOS) as ModelSize[]).filter(modelExists);
}

export function deleteModel(size: string): void {
  const dir = repoDir(size as ModelSize);
  if (!dir) return;
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    log.info(`Deleted model cache: ${size} (${dir})`);
  }
}
