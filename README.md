<p align="center">
  <img src="assets/echo_header_top_left_256x96.png" alt="Echo" height="96" />
</p>

<p align="center">
  <b>Local voice-to-text for Windows.</b><br/>
  Hold a hotkey or just start talking; the transcript gets pasted where your cursor is.
</p>

<p align="center">
  <a href="https://github.com/Kenshiin13/echo/releases"><img src="https://img.shields.io/github/v/release/Kenshiin13/echo?style=flat-square&color=3FA8E0" alt="Release"/></a>
  <img src="https://img.shields.io/badge/platform-Windows-1f2937?style=flat-square" alt="Platform"/>
  <img src="https://img.shields.io/badge/whisper.cpp-v1.8.4-A855F7?style=flat-square" alt="whisper.cpp"/>
</p>

---

<p align="center">
  <img src="assets/screenshot.png" alt="Echo settings window" width="560" />
</p>

## Features

- Push-to-talk hotkey (default `F9`) that works in any app
- Voice activation mode (Silero VAD) if you don't want to hold a key
- Pick a specific microphone, or let the OS default route
- Whisper runs locally via [whisper.cpp](https://github.com/ggml-org/whisper.cpp) — audio stays on your machine
- CUDA acceleration if you have an NVIDIA GPU, CPU fallback otherwise
- Five Whisper model sizes: `tiny`, `base`, `small`, `medium`, `large-v3-turbo`, plus a local Models library to delete/swap them
- Optional DeepL translation into a target language of your choice
- Find & replace rules + an initial prompt passed to Whisper, applied to every transcript
- **Hands-free paste** — pin a target window and Echo focuses it, pastes, and returns you to whatever you were on. Works even when the target is minimized
- **Auto-submit** — press Enter after paste, handy for Claude / ChatGPT / Discord
- Rolling transcription history with copy-to-clipboard
- Built-in auto-updater: new releases download in the background and install with one click
- Lives in the system tray; can start at login

## Install

Download the latest installer from the [Releases page](https://github.com/Kenshiin13/echo/releases/latest) and run it.

On first launch Echo downloads the selected Whisper model (`base` by default) and, if you have an NVIDIA GPU and pick the CUDA backend, the matching whisper.cpp binary. From v2.2.0 onward, Echo checks for its own updates on launch and installs them from a single **Restart & install** button in the About tab.

## Usage

**Push-to-talk (default):**

1. Hold `F9` (or whatever hotkey you set).
2. Speak.
3. Release. Transcript is pasted into the focused text field.

**Voice activation:**

In Settings → Hands-free, toggle **Voice activation** on. Echo then listens continuously and transcribes each utterance as you speak. The mic stays live; the hotkey is disabled while this is on.

**Hands-free paste into a specific window:**

In Settings → Hands-free, pick a **Target window**. Every transcript after that goes to that window — Echo focuses it, pastes, and returns focus to whatever you were actually on. Minimized targets are un-minimized for the paste then re-minimized afterward. The pin is keyed by process ID so title changes (Chrome tab switches, Notepad edits) don't break it, and is cleared only when the pinned process actually dies. The pin is intentionally volatile across app restarts — pick it again next session.

Enable **Auto-submit** alongside it to send Enter after the paste, so voice-driving a chat app is literally hands-free.

## Settings

Organised into six tabs in the Settings window (tray → Settings).

### General

| Setting | Default | Notes |
|---------|---------|-------|
| Push-to-talk hotkey | `F9` | Any key or modifier combo |
| Exit shortcut | `Ctrl+Alt+Q` | Global quit |
| Microphone | System default | Pick a specific input device; falls back to default if unplugged |
| Start at login | Off | |

### Model

| Setting | Default | Notes |
|---------|---------|-------|
| Whisper model size | `base` | `tiny` / `base` / `small` / `medium` / `large-v3-turbo` |
| Language | Auto-detect | Pin one for a small speedup and to enable the translate-skip optimisation |
| Compute backend | Auto | `CPU` or `CUDA`; auto-selected based on hardware |
| Downloaded models | — | List, delete, and re-download cached models |

### Post-processing

| Setting | Default | Notes |
|---------|---------|-------|
| Initial prompt | — | Biases Whisper's style (custom vocabulary, punctuation, tone) |
| Translate to | Off | Sends the transcript to DeepL for translation |
| DeepL API key | — | Only needed when a translation target is set. Free keys end in `:fx` |
| Find & Replace | — | Case-insensitive rules applied last; supports `\n` / `\t` |

### Hands-free

| Setting | Default | Notes |
|---------|---------|-------|
| Target window | None | Pin a specific window for all transcripts (by PID, volatile across restarts) |
| Voice activation | Off | Always-on mic; disables the push-to-talk hotkey |
| Auto-paste transcript | On | Off = copy to clipboard only |
| Auto-submit | Off | Press Enter after paste; requires auto-paste |

### History

Rolling last 50 transcripts, persisted to `%APPDATA%\Echo\history.json`. Copy each back to the clipboard, delete individually, or clear all. Toggle off to stop saving without wiping existing entries.

### About

Current version, platform and GPU badges, **Check for updates** button, and a "What's new" list of recent releases linking to the GitHub compare view for each version.

## Build from source

Requires Node.js 20+ on Windows.

```bash
git clone https://github.com/Kenshiin13/echo.git
cd echo/electron
npm install --legacy-peer-deps
npm run dev
```

Package an installer:

```bash
npm run dist:win
```

Pushing a `v*` tag runs the [release workflow](.github/workflows/release.yml) and publishes a GitHub Release with the built artifacts (installer, `latest.yml`, blockmap — electron-updater needs all three).

## Stack

- [Electron 33](https://www.electronjs.org/), [React 18](https://react.dev/), [Vite 6](https://vite.dev/), [Mantine](https://mantine.dev/)
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp) via [nodejs-whisper](https://github.com/ChetanXpro/nodejs-whisper) for transcription (model kept resident in a local `whisper-server` subprocess)
- [Silero VAD](https://github.com/snakers4/silero-vad) via [@ricky0123/vad-web](https://github.com/ricky0123/vad) for voice activation
- [DeepL API](https://www.deepl.com/pro-api) (optional) for translation
- [koffi](https://koffi.dev/) for `GetAsyncKeyState`-based hotkey polling and the `SetForegroundWindow` + `AttachThreadInput` focus dance that powers the Hands-free paste
- Electron's [`desktopCapturer`](https://www.electronjs.org/docs/latest/api/desktop-capturer) + [@nut-tree-fork/nut-js](https://github.com/nut-tree/nut.js) for window enumeration and keystroke simulation
- [electron-updater](https://www.electron.build/auto-update) for the built-in updater
- [electron-store](https://github.com/sindresorhus/electron-store) for settings, [electron-builder](https://www.electron.build/) for packaging

## License

MIT
