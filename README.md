<p align="center">
  <img src="assets/echo_header_top_left_256x96.png" alt="Echo" height="96" />
</p>

<p align="center">
  <b>Local voice-to-text, anywhere on your desktop.</b><br/>
  Push-to-talk with a hotkey — or flip on voice activation and just start talking. Your words get pasted into whatever window you're in.
</p>

<p align="center">
  <a href="https://github.com/Kenshiin13/echo/releases"><img src="https://img.shields.io/github/v/release/Kenshiin13/echo?style=flat-square&color=3FA8E0" alt="Release"/></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-1f2937?style=flat-square" alt="Platform"/>
  <img src="https://img.shields.io/badge/whisper.cpp-v1.8.4-A855F7?style=flat-square" alt="whisper.cpp"/>
</p>

---

<p align="center">
  <img src="assets/screenshot.png" alt="Echo settings window" width="560" />
</p>

## Features

- **Global push-to-talk** — press a hotkey anywhere (default `F9`), speak, release. Transcript is pasted at your cursor.
- **Voice activation (optional)** — hands-free mode powered by [Silero VAD](https://github.com/snakers4/silero-vad). Flip it on in Settings and Echo auto-transcribes each utterance as you speak. Ignores non-speech noise.
- **Fully local transcription** — all audio and transcription stays on-device via [whisper.cpp](https://github.com/ggml-org/whisper.cpp). Your voice never leaves your machine.
- **Automatic translation (optional)** — point Echo at a target language and it will translate each transcript via [DeepL](https://www.deepl.com/) before pasting. Skipped automatically when you're already speaking the target language. Audio still stays local; only the transcript text is sent.
- **Low-latency transcription** — Whisper runs as a persistent `whisper-server` process with the model kept resident in memory, so every utterance skips cold-load overhead.
- **GPU acceleration** — CUDA on Windows (NVIDIA), Metal on Apple Silicon, CPU fallback everywhere.
- **Five model sizes** — from 75 MB (`tiny`) to 1.6 GB (`large-v3-turbo`). Pick the accuracy/speed tradeoff you want.
- **14 languages + auto-detect** — English, German, French, Spanish, Italian, Portuguese, Dutch, Russian, Chinese, Japanese, Korean, Arabic…
- **Live audio indicator** — a small overlay shows a waveform while you speak, progress while a model downloads, and a check when paste completes.
- **Model manager** — download, switch, and delete models from the settings window. New models download with a progress bar on first use.
- **Auto-paste or clipboard-only** — toggle whether Echo pastes directly or just copies to clipboard.
- **Runs in the tray** — closes to tray, launches at login (optional), no dock clutter.

## Install

Download the latest installer from the [Releases page](https://github.com/Kenshiin13/echo/releases/latest):

| Platform | File |
|----------|------|
| Windows 10/11 (x64) | `Echo-Setup-X.Y.Z.exe` |
| macOS (Apple Silicon) | `Echo-X.Y.Z-arm64.dmg` |

> **macOS note:** the build is unsigned (no paid Apple Developer ID). After dragging **Echo** to Applications, right-click the app → **Open** on first launch to bypass Gatekeeper.
>
> If macOS still refuses with *"Echo is damaged and can't be opened"*, it's the quarantine flag from the download. Clear it with:
>
> ```bash
> xattr -cr /Applications/Echo.app && open /Applications/Echo.app
> ```

On first launch, Echo will auto-download the selected whisper model (`base` by default, ~142 MB) with a progress indicator. If you have an NVIDIA GPU and select the **CUDA** backend, it will also download the CUDA-enabled binary.

## Usage

**Push-to-talk (default):**

1. Press and hold **F9** (or your custom hotkey).
2. Speak.
3. Release — your transcript gets pasted into whatever text field has focus.

**Voice activation:**

1. Open Settings → toggle **Voice activation** on → **Save changes**.
2. Just speak. Echo detects the start and end of each utterance and pastes it automatically. The hotkey is disabled while voice activation is on; the mic stays live the whole time.

The tray icon gives you quick access to settings, the model picker, and quit.

## Configuration

Open settings from the tray icon. Everything is persisted to `electron-store` in your user data directory.

| Setting | Default | Notes |
|---------|---------|-------|
| Push-to-talk hotkey | `F9` | Any key or modifier combo |
| Exit shortcut | `Ctrl+Alt+Q` | Global quit |
| Model size | `base` | `tiny` / `base` / `small` / `medium` / `large-v3-turbo` |
| Language | Auto-detect | Pick one for better accuracy if auto-detect mis-fires |
| Compute backend | Auto | `CPU` / `CUDA` / `MLX` — auto-selected based on hardware |
| Auto-paste | On | Off = copy to clipboard only |
| Voice activation | Off | Always-listening mode using Silero VAD (disables the hotkey) |
| Translate transcription to | Off | Target language for automatic DeepL translation; skipped when you already speak it |
| DeepL API key | — | Required only when a translation target is set. Free keys end in `:fx` and include 500k chars/month |
| Start at login | Off | |

## Build from source

Requires Node.js 20+.

```bash
git clone https://github.com/Kenshiin13/echo.git
cd echo/electron
npm install --legacy-peer-deps
npm run setup:whisper   # downloads whisper.cpp binary + base model
npm run dev             # dev mode with hot reload
```

Package an installer:

```bash
npm run dist:win   # Windows NSIS installer  → dist/electron-release/
npm run dist:mac   # macOS DMG               → dist/electron-release/
```

Releases are automated — pushing a `v*` tag (e.g. `v1.2.0`) triggers the [release workflow](.github/workflows/release.yml) which builds Windows + macOS artifacts and attaches them to a GitHub Release.

## Stack

- **[Electron 33](https://www.electronjs.org/)** — shell
- **[React 18](https://react.dev/) + [Vite 6](https://vite.dev/)** — renderer (three entries: settings, indicator overlay, audio capture)
- **[Mantine v7](https://mantine.dev/) + [Tailwind](https://tailwindcss.com/)** — UI
- **[whisper.cpp](https://github.com/ggml-org/whisper.cpp)** — transcription engine, run as a long-lived `whisper-server` subprocess with the model kept resident in RAM
- **[Silero VAD](https://github.com/snakers4/silero-vad)** via [@ricky0123/vad-web](https://github.com/ricky0123/vad) — neural voice activity detection for the voice-activation mode
- **[DeepL API](https://www.deepl.com/pro-api)** — optional cloud translation layer between Whisper and paste
- **[koffi](https://koffi.dev/)** — FFI for global key polling on Windows
- **[@nut-tree-fork/nut-js](https://github.com/nut-tree/nut.js)** — keyboard simulation for auto-paste
- **[electron-store](https://github.com/sindresorhus/electron-store)** — config persistence
- **[electron-builder](https://www.electron.build/)** — NSIS (Windows) + DMG (macOS) packaging

## License

MIT
