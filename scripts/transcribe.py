#!/usr/bin/env python3
"""Whisper transcription wrapper for meeting-note.

Usage:
  python transcribe.py <audio_path> [--model large-v3] [--language en] [--output json]
  python transcribe.py --download-only --model large-v3
  python transcribe.py --check-model --model large-v3

Output: JSON with segments [{start, end, text}]
"""

import argparse
import json
import sys
from pathlib import Path


MODEL_SIZES = {
    "base": "~150 MB",
    "small": "~500 MB",
    "medium": "~1.5 GB",
    "large-v3": "~3 GB",
}


def check_model_cached(model_name: str) -> bool:
    """Check if model is already downloaded."""
    try:
        from huggingface_hub import try_to_load_from_cache
        # faster-whisper models are stored as CTranslate2 format
        repo_id = f"Systran/faster-whisper-{model_name}"
        result = try_to_load_from_cache(repo_id, "model.bin")
        return result is not None
    except Exception:
        # Fallback: check common cache directories
        import os
        cache_dir = Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface"))
        # If cache dir has any folder matching the model name, assume cached
        if cache_dir.exists():
            for p in cache_dir.rglob(f"*faster-whisper-{model_name}*"):
                if p.is_dir():
                    return True
        return False


def download_model(model_name: str, device: str, compute_type: str) -> None:
    """Download model with progress output to stderr."""
    import os
    os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "0")

    print(json.dumps({"status": "downloading", "model": model_name, "size": MODEL_SIZES.get(model_name, "unknown")}), flush=True)

    try:
        from faster_whisper import WhisperModel
        WhisperModel(model_name, device=device, compute_type=compute_type)
        print(json.dumps({"status": "ready", "model": model_name}), flush=True)
    except Exception as e:
        print(json.dumps({"status": "error", "error": str(e)}), flush=True)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Transcribe audio with faster-whisper")
    parser.add_argument("audio", nargs="?", help="Path to audio file")
    parser.add_argument("--model", default="large-v3", help="Whisper model size")
    parser.add_argument("--language", default="en", help="Language code")
    parser.add_argument("--device", default="auto", help="Device: auto, cpu, cuda")
    parser.add_argument("--output", default="json", help="Output format: json, text")
    parser.add_argument("--download-only", action="store_true", help="Download model without transcribing")
    parser.add_argument("--check-model", action="store_true", help="Check if model is cached")
    args = parser.parse_args()

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

    # Check model mode
    if args.check_model:
        cached = check_model_cached(args.model)
        print(json.dumps({"cached": cached, "model": args.model, "size": MODEL_SIZES.get(args.model, "unknown")}))
        sys.exit(0)

    # Download-only mode
    if args.download_only:
        download_model(args.model, device, compute_type)
        sys.exit(0)

    # Normal transcription
    if not args.audio:
        print(json.dumps({"error": "No audio file provided"}))
        sys.exit(1)

    audio_path = Path(args.audio)
    if not audio_path.exists():
        print(json.dumps({"error": f"File not found: {args.audio}"}))
        sys.exit(1)

    # Load model (may download on first run)
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
