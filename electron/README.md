# Echo — Electron

Push-to-talk voice-to-text built on Electron + React + TypeScript.

## Dev Setup

```bash
cd electron
npm install
npm run build
npm run dev
```

## Stack

- **Electron 33** — shell
- **React 18 + Vite** — renderer (two entries: settings window + indicator overlay)
- **Mantine v7 + Tailwind** — UI
- **nodejs-whisper** — whisper.cpp bindings (runs in a worker thread)
- **naudiodon** — PortAudio Node.js bindings for mic capture
- **koffi** — FFI for `GetAsyncKeyState` on Windows
- **uiohook-napi** — global hotkey hook on macOS/Linux
- **@nut-tree-fork/nut-js** — keyboard simulation for auto-paste
- **electron-store** — JSON config in `userData`
- **electron-builder** — packaging for Windows (NSIS) + macOS (DMG)

## Build

```bash
npm run dist:win   # Windows NSIS installer
npm run dist:mac   # macOS DMG
```
