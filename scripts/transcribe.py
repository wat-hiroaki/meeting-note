#!/usr/bin/env python3
"""Whisper transcription wrapper for meeting-note.

Usage:
  python transcribe.py <audio_path> [--model large-v3] [--language ja] [--output json]

Output: JSON with segments [{start, end, text}]
"""

import argparse
import json
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Transcribe audio with faster-whisper")
    parser.add_argument("audio", help="Path to audio file")
    parser.add_argument("--model", default="large-v3", help="Whisper model size")
    parser.add_argument("--language", default="ja", help="Language code")
    parser.add_argument("--device", default="auto", help="Device: auto, cpu, cuda")
    parser.add_argument("--output", default="json", help="Output format: json, text")
    args = parser.parse_args()

    audio_path = Path(args.audio)
    if not audio_path.exists():
        print(json.dumps({"error": f"File not found: {args.audio}"}))
        sys.exit(1)

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(json.dumps({"error": "faster-whisper not installed. Run: pip install faster-whisper"}))
        sys.exit(1)

    # Determine compute type
    device = args.device
    compute_type = "int8"
    if device == "auto":
        try:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
            if device == "cuda":
                compute_type = "float16"
        except ImportError:
            device = "cpu"

    # Load model
    model = WhisperModel(args.model, device=device, compute_type=compute_type)

    # Transcribe
    segments_gen, info = model.transcribe(
        str(audio_path),
        language=args.language if args.language != "auto" else None,
        beam_size=5,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
    )

    segments = []
    for segment in segments_gen:
        segments.append({
            "start": round(segment.start, 2),
            "end": round(segment.end, 2),
            "text": segment.text.strip(),
        })

    result = {
        "language": info.language,
        "duration": round(info.duration, 2),
        "segments": segments,
    }

    if args.output == "text":
        for seg in segments:
            print(f"[{seg['start']:.2f} -> {seg['end']:.2f}] {seg['text']}")
    else:
        print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
