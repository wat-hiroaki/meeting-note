# meeting-note

AI-powered meeting note taker for Windows.

System audio capture → Whisper transcription → Claude summary → MD/Notion/Slack distribution.

Glassmorphism floating bar UI, always-on-top.

## Prerequisites

- **Node.js** 20+
- **FFmpeg** — `winget install Gyan.FFmpeg`
- **Python 3.10+** with faster-whisper — `pip install faster-whisper`
- **Claude CLI** (for summary via subscription) or Anthropic API key

## Setup

```bash
npm install
npm run dev
```

## Configuration

Copy `meeting-note.config.yml` to `%APPDATA%/meeting-note/config.yml` and edit.

## Hotkeys

| Shortcut | Action |
|---|---|
| Ctrl+Shift+M | Toggle window |
| Ctrl+Shift+R | Start recording |
| Ctrl+Shift+P | Pause/Resume |
| Ctrl+Shift+S | Stop + process |

## Build

```bash
npm run build
npm run package
```
