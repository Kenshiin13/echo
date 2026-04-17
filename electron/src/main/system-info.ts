import { app } from "electron";
import { execSync } from "child_process";
import { pathToFileURL } from "url";
import path from "path";
import os from "os";
import { Backend, SystemInfo } from "../shared/types";

function hasNvidiaGpu(): boolean {
  if (process.platform === "darwin") return false;
  try {
    execSync("nvidia-smi", { timeout: 5000, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function isAppleSilicon(): boolean {
  return process.platform === "darwin" && os.cpus()[0]?.model?.includes("Apple") === true;
}

function recommendedBackend(nvidia: boolean, apple: boolean): Backend {
  if (apple) return "mlx";
  if (nvidia) return "cuda";
  return "cpu";
}

export async function getSystemInfo(): Promise<SystemInfo> {
  const nvidia = hasNvidiaGpu();
  const apple = isAppleSilicon();
  const assetsDir = app.isPackaged
    ? path.join(process.resourcesPath, "assets")
    : path.join(app.getAppPath(), "../assets");
  return {
    platform: process.platform as SystemInfo["platform"],
    hasNvidiaGpu: nvidia,
    isAppleSilicon: apple,
    recommendedBackend: recommendedBackend(nvidia, apple),
    appVersion: app.getVersion(),
    assetsUrl: pathToFileURL(assetsDir).href,
  };
}
