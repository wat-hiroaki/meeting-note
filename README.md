# meeting-note

AI-powered meeting note taker for Windows & macOS.

Record system audio + microphone → Whisper transcription → AI summary → Markdown / Notion / Slack.

Zero-config system audio capture via WASAPI loopback — no Stereo Mix or virtual cables needed.

## Features

- **Zero-config audio capture** — System audio (WASAPI loopback) + microphone via Web Audio API. No Stereo Mix or VB-Cable required.
- **AI transcription** — Local (faster-whisper), OpenAI Whisper API, or Remote SSH
- **Multi-LLM summary** — Claude Code CLI (free with subscription), Anthropic API, OpenAI GPT (Beta), Google Gemini (Beta)
- **Multi-output** — Save as Markdown, push to Notion, Slack, or Remote SCP
- **Glassmorphism UI** — Always-on-top floating bar with dark theme
- **5-step onboarding** — Guided setup with dependency detection and model download
- **Global hotkeys** — Record, pause, stop from anywhere
- **Cross-platform** — Windows 10+ and macOS 12.3+

## Download

Download the latest release from [GitHub Releases](https://github.com/wat-hiroaki/meeting-note/releases).

## Prerequisites

- **FFmpeg** — Required for audio format conversion
  - Windows: `winget install Gyan.FFmpeg`
  - macOS: `brew install ffmpeg`
- **For local transcription:**
  - Python 3.10+: `pip install faster-whisper`
- **For summary (choose one):**
  - Claude Code CLI (free with subscription): `npm install -g @anthropic-ai/claude-code`
  - Or any API key: Anthropic / OpenAI / Google Gemini

## Quick Start

```bash
# Development
npm install
npm run dev

# Build & Package
npm run build
npm run package
```

The onboarding wizard guides you through all configuration on first launch.

## How It Works

1. **Record** — Click the red button or press `Ctrl+Shift+R`. System audio and microphone are captured simultaneously via Web Audio API (WASAPI loopback on Windows).
2. **Transcribe** — Audio is converted to WAV and processed by Whisper (locally or via API).
3. **Summarize** — Transcript is sent to your chosen LLM for structured meeting notes.
4. **Share** — Notes are saved as Markdown and optionally pushed to Notion, Slack, or remote server.

## Summary Providers

| Provider | Cost | Setup |
|----------|------|-------|
| **Claude Code CLI** | Free (with $20/mo+ subscription) | Install CLI, sign in |
| Anthropic API | Pay-per-use | API key |
| OpenAI API (Beta) | Pay-per-use | API key |
| Google Gemini (Beta) | Pay-per-use | API key |

## Configuration

Settings are accessible via the gear icon (⚙) in the floating bar:

- **Recording** — Microphone selection (system audio is automatic)
- **Transcription** — Mode, language, model size
- **Summary** — LLM provider and API keys
- **Output** — Save directory
- **Integrations** — Notion, Slack, Remote SCP

Config file: `%APPDATA%/meeting-note/config.yml` (Windows) / `~/Library/Application Support/meeting-note/config.yml` (macOS)

## Hotkeys

| Windows | macOS | Action |
|---------|-------|--------|
| `Ctrl+Shift+R` | `Cmd+Shift+R` | Start recording |
| `Ctrl+Shift+P` | `Cmd+Shift+P` | Pause / Resume |
| `Ctrl+Shift+S` | `Cmd+Shift+S` | Stop & process |
| `Ctrl+Shift+M` | `Cmd+Shift+M` | Show / Hide |

## Architecture

```
src/
├── main/              # Electron main process
│   ├── index.ts       # Window, tray, hotkeys, WASAPI loopback setup
│   ├── recorder.ts    # Audio buffer save + WebM→WAV conversion
│   ├── transcriber.ts # Whisper (local/API/SSH)
│   ├── summarizer.ts  # Multi-LLM (Claude CLI/Anthropic/OpenAI/Gemini)
│   ├── pipeline.ts    # Orchestration with progress tracking
│   └── publishers/    # Markdown, Notion, Slack, SCP
├── preload/           # Context bridge (IPC API)
├── renderer/          # React + Tailwind UI
│   ├── components/    # FloatingBar, Onboarding, Settings, etc.
│   └── hooks/         # useRecording, useAudioRecorder, useConfig
└── shared/            # Zod config schema
```

## Contributing

Pull requests welcome. The project uses GitHub Actions CI for build, lint, and type checking on every PR.

```bash
npm run build    # Build all targets
npm run lint     # ESLint
npm run package  # Create installer
```

## License

MIT
