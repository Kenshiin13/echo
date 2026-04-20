import { desktopCapturer } from "electron";
import { getWindows } from "@nut-tree-fork/nut-js";
import koffi from "koffi";
import { log } from "./logger";
import type { SmartTarget } from "../shared/types";

const SW_MINIMIZE = 6;
const SW_RESTORE = 9;

/**
 * Window enumeration + focus resolution for Smart-transcription.
 *
 * Enumeration is delegated to Electron's desktopCapturer — it's the same
 * filter Chromium/Electron use for "Share this window" pickers, which matches
 * the OS Alt-Tab list on Windows. No koffi callbacks, no Raymond Chen walk,
 * no hand-curated class blacklist. The source id has the form
 * "window:<hwnd>:<index>" on Windows, so we can lift the HWND directly and
 * enrich with PID via a single GetWindowThreadProcessId call.
 *
 * Identity is the PID. Title is kept for display only and for matching
 * back to a nut-js Window we can .focus().
 */

export interface OpenWindow {
  pid: number;
  title: string;
}

// ── Minimal koffi bindings: PID lookup + focus dance. Deliberately no
// EnumWindows — every attempt to wire it in tripped the renderer. When we
// need to resolve a minimized target, nut-js handles that path instead.
let GetWindowThreadProcessId: ((hwnd: bigint, pidOut: Uint32Array) => number) | null = null;
let GetForegroundWindow: (() => bigint) | null = null;
let SetForegroundWindow: ((hwnd: bigint) => boolean) | null = null;
let BringWindowToTop: ((hwnd: bigint) => boolean) | null = null;
let ShowWindow: ((hwnd: bigint, cmd: number) => boolean) | null = null;
let IsIconic: ((hwnd: bigint) => boolean) | null = null;
let AttachThreadInput: ((tAttach: number, tAttachTo: number, fAttach: boolean) => boolean) | null = null;
let GetCurrentThreadId: (() => number) | null = null;
// Null classname + title pointer; returns first matching top-level HWND.
// Works for minimized windows too, which is the whole point.
let FindWindowW: ((cls: bigint, wnd: Buffer) => bigint) | null = null;
let koffiTried = false;

function ensureKoffi(): void {
  if (koffiTried) return;
  koffiTried = true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function bind<T>(lib: any, sig: string, label: string): T | null {
    try {
      return lib.func(sig) as T;
    } catch (err) {
      log.warn(`window-picker: bind ${label} failed: ${err}`);
      return null;
    }
  }

  try {
    const user32 = koffi.load("user32.dll");
    GetWindowThreadProcessId = bind(user32, "uint32_t __stdcall GetWindowThreadProcessId(uintptr_t hWnd, _Out_ uint32_t* lpdwProcessId)", "GetWindowThreadProcessId");
    GetForegroundWindow = bind(user32, "uintptr_t __stdcall GetForegroundWindow()", "GetForegroundWindow");
    SetForegroundWindow = bind(user32, "bool __stdcall SetForegroundWindow(uintptr_t hWnd)", "SetForegroundWindow");
    BringWindowToTop = bind(user32, "bool __stdcall BringWindowToTop(uintptr_t hWnd)", "BringWindowToTop");
    ShowWindow = bind(user32, "bool __stdcall ShowWindow(uintptr_t hWnd, int nCmdShow)", "ShowWindow");
    IsIconic = bind(user32, "bool __stdcall IsIconic(uintptr_t hWnd)", "IsIconic");
    AttachThreadInput = bind(user32, "bool __stdcall AttachThreadInput(uint32_t idAttach, uint32_t idAttachTo, bool fAttach)", "AttachThreadInput");
    FindWindowW = bind(user32, "uintptr_t __stdcall FindWindowW(uintptr_t lpClassName, void* lpWindowName)", "FindWindowW");
  } catch (err) {
    log.warn(`window-picker: user32 load failed: ${err}`);
  }

  try {
    const kernel32 = koffi.load("kernel32.dll");
    GetCurrentThreadId = bind(kernel32, "uint32_t __stdcall GetCurrentThreadId()", "GetCurrentThreadId");
  } catch (err) {
    log.warn(`window-picker: kernel32 load failed: ${err}`);
  }
}

function threadIdFor(hwnd: bigint): number {
  if (!GetWindowThreadProcessId) return 0;
  const pidOut = new Uint32Array(1);
  return GetWindowThreadProcessId(hwnd, pidOut);
}

/** Current foreground HWND (0n if none / call failed). */
export function getForegroundHwnd(): bigint {
  ensureKoffi();
  return GetForegroundWindow ? GetForegroundWindow() : 0n;
}

/** True if the window is minimized. Safe when koffi isn't loaded. */
export function isHwndIconic(hwnd: bigint): boolean {
  ensureKoffi();
  return IsIconic ? IsIconic(hwnd) : false;
}

/** Minimize a window. No-op if koffi didn't load. */
export function minimizeHwnd(hwnd: bigint): void {
  ensureKoffi();
  if (ShowWindow) ShowWindow(hwnd, SW_MINIMIZE);
}

/**
 * Bring a window to the foreground, bypassing Windows' focus-stealing
 * protection via the AttachThreadInput trick. Returns true if the focus
 * sequence completed; the actual foreground swap is best-effort.
 */
export function focusHwnd(hwnd: bigint): boolean {
  ensureKoffi();
  if (!SetForegroundWindow || !GetForegroundWindow || !AttachThreadInput || !GetCurrentThreadId) {
    return false;
  }

  // Un-minimize if needed so focus actually lands on a visible window.
  if (IsIconic && IsIconic(hwnd) && ShowWindow) {
    ShowWindow(hwnd, SW_RESTORE);
  }

  const currentThread = GetCurrentThreadId();
  const foregroundHwnd = GetForegroundWindow();
  const foregroundThread = foregroundHwnd ? threadIdFor(foregroundHwnd) : 0;
  const targetThread = threadIdFor(hwnd);

  // Attach our input queue to the thread owning the current foreground window
  // AND the thread owning the target. While attached, SetForegroundWindow
  // inherits the foreground thread's permission to change focus.
  const attachedForeground =
    foregroundThread && foregroundThread !== currentThread
      ? AttachThreadInput(currentThread, foregroundThread, true)
      : false;
  const attachedTarget =
    targetThread && targetThread !== currentThread
      ? AttachThreadInput(currentThread, targetThread, true)
      : false;

  try {
    SetForegroundWindow(hwnd);
    if (BringWindowToTop) BringWindowToTop(hwnd);
    SetForegroundWindow(hwnd); // second call sticks more reliably after BWTT
  } finally {
    if (attachedForeground) AttachThreadInput(currentThread, foregroundThread, false);
    if (attachedTarget) AttachThreadInput(currentThread, targetThread, false);
  }

  return true;
}

function parseHwndFromSourceId(id: string): bigint | null {
  // Electron's Windows id format: "window:<HWND>:<index>"
  const m = /^window:(\d+):/.exec(id);
  if (!m) return null;
  try {
    return BigInt(m[1]);
  } catch {
    return null;
  }
}

function pidFor(hwnd: bigint): number {
  ensureKoffi();
  if (!GetWindowThreadProcessId) return 0;
  const out = new Uint32Array(1);
  GetWindowThreadProcessId(hwnd, out);
  return out[0];
}

/** Look up the current HWND for a pinned PID via desktopCapturer (non-minimized
 *  windows only). Callers fall back to nut-js for the minimized path. */
async function hwndForPidVisible(pid: number): Promise<bigint | null> {
  if (!pid) return null;
  ensureKoffi();
  try {
    const sources = await desktopCapturer.getSources({
      types: ["window"],
      fetchWindowIcons: false,
      thumbnailSize: { width: 0, height: 0 },
    });
    for (const s of sources) {
      const hwnd = parseHwndFromSourceId(s.id);
      if (!hwnd) continue;
      if (pidFor(hwnd) === pid) return hwnd;
    }
  } catch (err) {
    log.warn("hwndForPidVisible lookup failed:", err);
  }
  return null;
}

/** True if the process with the given PID is still running. Used to decide
 *  whether to auto-clear a pinned target — independent of whether the
 *  window is currently focusable (minimized, on another virtual desktop, …). */
export function isPidAlive(pid: number): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH = process doesn't exist → dead.
    // EPERM = process exists but we can't signal it → alive.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

export async function listOpenWindows(): Promise<OpenWindow[]> {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["window"],
      fetchWindowIcons: false,
      // Skip thumbnails — we don't render them, and they're the slow part.
      thumbnailSize: { width: 0, height: 0 },
    });
    const seen = new Set<string>();
    const out: OpenWindow[] = [];
    for (const s of sources) {
      const title = s.name.trim();
      if (!title || seen.has(title)) continue;
      seen.add(title);
      const hwnd = parseHwndFromSourceId(s.id);
      const pid = hwnd ? pidFor(hwnd) : 0;
      out.push({ pid, title });
    }
    out.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    log.info(`window-picker: listed ${out.length} windows from desktopCapturer`);
    return out;
  } catch (err) {
    log.error("desktopCapturer.getSources failed:", err);
    return [];
  }
}

/**
 * Resolve a pinned SmartTarget to a live HWND.
 *
 * Tries two passes:
 *  1. desktopCapturer — covers non-minimized windows with exact PID match,
 *     title fallback. Side-effect free.
 *  2. nut-js — covers minimized windows (and any other case desktopCapturer
 *     skips). This one has a side effect: it brings the window to the
 *     foreground in order to recover an HWND, since nut-js doesn't expose
 *     the raw handle. Callers must capture their previouslyFocused *before*
 *     calling this.
 */
export async function findHwndForTarget(target: SmartTarget): Promise<bigint | null> {
  ensureKoffi();

  // Pass 1: desktopCapturer by PID — fast, covers the common case (non-min).
  if (target.pid) {
    const byPid = await hwndForPidVisible(target.pid);
    if (byPid) {
      log.info(`findHwndForTarget: resolved via desktopCapturer/PID → hwnd=${byPid}`);
      return byPid;
    }
  }

  // Pass 2: desktopCapturer by title — handles "PID changed" edge cases.
  try {
    const sources = await desktopCapturer.getSources({
      types: ["window"],
      fetchWindowIcons: false,
      thumbnailSize: { width: 0, height: 0 },
    });
    for (const s of sources) {
      if (s.name.trim() === target.title) {
        const h = parseHwndFromSourceId(s.id);
        if (h) {
          log.info(`findHwndForTarget: resolved via desktopCapturer/title → hwnd=${h}`);
          return h;
        }
      }
    }
  } catch (err) {
    log.warn("findHwndForTarget desktopCapturer pass failed:", err);
  }

  // Pass 3: Win32 FindWindowW by exact title. Single syscall, no callbacks,
  // and — crucially — includes minimized windows.
  if (FindWindowW && target.title) {
    try {
      const buf = Buffer.from(target.title + "\0", "utf16le");
      const h = FindWindowW(0n, buf);
      if (h) {
        const p = pidFor(h);
        log.info(`findHwndForTarget: FindWindowW hit → hwnd=${h}, pid=${p}, want=${target.pid}`);
        if (!target.pid || p === target.pid) return h;
      } else {
        log.info(`findHwndForTarget: FindWindowW no match for title "${target.title}"`);
      }
    } catch (err) {
      log.warn("findHwndForTarget FindWindowW failed:", err);
    }
  }

  // Pass 4: nut-js. Reads HWND directly off the Window instance. Last resort
  // because nut-js's enumeration filter can vary.
  try {
    const wins = await getWindows();
    log.info(`findHwndForTarget: nut-js returned ${wins.length} windows`);
    for (const w of wins) {
      const t = (await w.title.catch(() => "")).trim();
      if (t !== target.title) continue;
      const raw = (w as unknown as { windowHandle?: number | bigint }).windowHandle;
      if (raw == null) continue;
      const hwnd = typeof raw === "bigint" ? raw : BigInt(raw);
      if (!hwnd) continue;
      if (target.pid && pidFor(hwnd) !== target.pid) continue;
      log.info(`findHwndForTarget: resolved via nut-js → hwnd=${hwnd}`);
      return hwnd;
    }
  } catch (err) {
    log.warn("findHwndForTarget nut-js fallback failed:", err);
  }
  return null;
}
