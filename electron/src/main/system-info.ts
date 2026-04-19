import { app } from "electron";
import { execSync } from "child_process";
import { pathToFileURL } from "url";
import path from "path";
import { Backend, SystemInfo } from "../shared/types";

function hasNvidiaGpu(): boolean {
  try {
    execSync("nvidia-smi", { timeout: 5000, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function recommendedBackend(nvidia: boolean): Backend {
  return nvidia ? "cuda" : "cpu";
}

export async function getSystemInfo(): Promise<SystemInfo> {
  const nvidia = hasNvidiaGpu();
  const assetsDir = app.isPackaged
    ? path.join(process.resourcesPath, "assets")
    : path.join(app.getAppPath(), "../assets");
  return {
    platform: process.platform as SystemInfo["platform"],
    hasNvidiaGpu: nvidia,
    isAppleSilicon: false,
    recommendedBackend: recommendedBackend(nvidia),
    appVersion: app.getVersion(),
    assetsUrl: pathToFileURL(assetsDir).href,
  };
}
