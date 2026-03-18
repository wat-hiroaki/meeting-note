# meeting-note

AI-powered meeting note taker for Windows & macOS.

System audio capture → Whisper transcription → Claude summary → MD/Notion/Slack distribution.

Glassmorphism floating bar UI, always-on-top.

## Features

- **One-click recording** — Capture system audio via FFmpeg
- **AI transcription** — Local (faster-whisper), OpenAI Whisper API, or remote SSH
- **AI summary** — Claude CLI (free with subscription) or Anthropic API
- **Multi-output** — Save as Markdown, push to Notion, Slack, or remote SCP
- **Cross-platform** — Windows (dshow) and macOS (avfoundation) support
- **Guided onboarding** — Step-by-step setup wizard with FFmpeg detection
- **Error handling** — Actionable error messages with recovery guidance
- **Global hotkeys** — Record, pause, stop from anywhere

## Prerequisites

- **Node.js** 20+
- **FFmpeg**
  - Windows: `winget install Gyan.FFmpeg`
  - macOS: `brew install ffmpeg`
- **Python 3.10+** with faster-whisper (for local transcription): `pip install faster-whisper`
- **Claude CLI** (for summary via subscription) or Anthropic API key

## Setup

```bash
npm install
npm run dev
```

The onboarding wizard will guide you through transcription and summary configuration on first launch.

## Configuration

Settings are accessible via the gear icon in the floating bar. You can configure:

- **Transcription** — Mode (local/API/remote), language, model
- **Summary** — Mode (Claude CLI/Anthropic API)
- **Output** — Directory for saved meeting notes
- **Integrations** — Notion (API key + DB ID), Slack (token + channel), Remote SCP

Config file: `%APPDATA%/meeting-note/config.yml` (Windows) or `~/Library/Application Support/meeting-note/config.yml` (macOS)

## Hotkeys

| Shortcut (Win) | Shortcut (Mac) | Action |
|---|---|---|
| Ctrl+Shift+M | Cmd+Shift+M | Toggle window |
| Ctrl+Shift+R | Cmd+Shift+R | Start recording |
| Ctrl+Shift+P | Cmd+Shift+P | Pause / Resume |
| Ctrl+Shift+S | Cmd+Shift+S | Stop & process |

## Architecture

```
src/
├── main/           # Electron main process
│   ├── index.ts    # Window creation, tray, hotkeys
│   ├── recorder.ts # FFmpeg audio capture (Win/Mac)
│   ├── transcriber.ts # Whisper (local/API/SSH)
│   ├── summarizer.ts  # Claude (CLI/API)
│   ├── pipeline.ts    # Orchestration with progress
│   └── publishers/    # MD, Notion, Slack, SCP
├── preload/        # Context bridge (IPC API)
├── renderer/       # React UI
│   ├── components/ # FloatingBar, Onboarding, Settings, etc.
│   └── hooks/      # useRecording, useConfig
└── shared/         # Zod schemas, types
```

## Build

```bash
npm run build
npm run package
```
