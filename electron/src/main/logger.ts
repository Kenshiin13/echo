import { app } from "electron";
import fs from "fs";
import path from "path";

let stream: fs.WriteStream | null = null;

function getStream(): fs.WriteStream {
  if (!stream) {
    const logPath = path.join(app.getPath("userData"), "echo.log");
    stream = fs.createWriteStream(logPath, { flags: "a", encoding: "utf8" });
  }
  return stream;
}

function write(level: string, ...args: unknown[]) {
  const line = `[${new Date().toISOString()}] [${level}] ${args.join(" ")}\n`;
  try { getStream().write(line); } catch {}
  // Print everything to the terminal in dev, errors only in packaged builds
  if (level === "ERROR") process.stderr.write(line);
  else if (!app.isPackaged) process.stdout.write(line);
}

export const log = {
  info: (...args: unknown[]) => write("INFO", ...args),
  warn: (...args: unknown[]) => write("WARN", ...args),
  error: (...args: unknown[]) => write("ERROR", ...args),
};
