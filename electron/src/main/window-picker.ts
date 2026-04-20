import { desktopCapturer } from "electron";
import koffi from "koffi";
import { log } from "./logger";
import type { SmartTarget } from "../shared/types";

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

// ── Minimal koffi bindings: PID lookup + the focus dance. No EnumWindows,
// no callbacks, no Raymond-Chen walk.
let GetWindowThreadProcessId: ((hwnd: bigint, pidOut: Uint32Array) => number) | null = null;
let GetForegroundWindow: (() => bigint) | null = null;
let SetForegroundWindow: ((hwnd: bigint) => boolean) | null = null;
let BringWindowToTop: ((hwnd: bigint) => boolean) | null = null;
let ShowWindow: ((hwnd: bigint, cmd: number) => boolean) | null = null;
let IsIconic: ((hwnd: bigint) => boolean) | null = null;
let AttachThreadInput: ((tAttach: number, tAttachTo: number, fAttach: boolean) => boolean) | null = null;
let GetCurrentThreadId: (() => number) | null = null;
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

/** Look up the current HWND for a pinned PID via desktopCapturer. Returns
 *  null if the process has no visible window. */
async function hwndForPid(pid: number): Promise<bigint | null> {
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
    log.warn("hwndForPid lookup failed:", err);
  }
  return null;
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
 * Resolve a pinned SmartTarget to a live HWND. Primary match is PID — survives
 * title changes. Fallback is title match from the desktopCapturer list.
 */
export async function findHwndForTarget(target: SmartTarget): Promise<bigint | null> {
  if (target.pid) {
    const byPid = await hwndForPid(target.pid);
    if (byPid) return byPid;
  }
  try {
    const sources = await desktopCapturer.getSources({
      types: ["window"],
      fetchWindowIcons: false,
      thumbnailSize: { width: 0, height: 0 },
    });
    for (const s of sources) {
      if (s.name.trim() === target.title) {
        return parseHwndFromSourceId(s.id);
      }
    }
  } catch (err) {
    log.warn("findHwndForTarget title fallback failed:", err);
  }
  return null;
}
