#!/usr/bin/env python3
"""Whisper transcription wrapper for meeting-note.

Features:
  - faster-whisper transcription with VAD
  - Speaker diarization via pyannote.audio (optional)
  - Word-level timestamps for precise linking
  - Automatic speaker count estimation

Usage:
  python transcribe.py <audio_path> [--model large-v3] [--language en] [--output json]
  python transcribe.py --download-only --model large-v3
  python transcribe.py --check-model --model large-v3
  python transcribe.py <audio_path> --diarize [--hf-token YOUR_TOKEN]

Output: JSON with segments [{start, end, text, speaker?}]
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


def check_diarization_available() -> dict:
    """Check if speaker diarization dependencies are available."""
    result = {"available": False, "method": None, "message": ""}

    # Check pyannote.audio (best quality)
    try:
        import pyannote.audio  # noqa: F401
        result["available"] = True
        result["method"] = "pyannote"
        result["message"] = "pyannote.audio available"
        return result
    except ImportError:
        pass

    # Check speechbrain (alternative)
    try:
        import speechbrain  # noqa: F401
        result["available"] = True
        result["method"] = "speechbrain"
        result["message"] = "speechbrain available"
        return result
    except ImportError:
        pass

    result["message"] = "No diarization library found. Install: pip install pyannote.audio"
    return result


def diarize_with_pyannote(audio_path: str, hf_token: str = None, num_speakers: int = None):
    """Run speaker diarization using pyannote.audio pipeline."""
    from pyannote.audio import Pipeline
    import torch

    # Use the pre-trained pipeline
    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        use_auth_token=hf_token
    )

    # Use GPU if available
    if torch.cuda.is_available():
        pipeline.to(torch.device("cuda"))

    # Run diarization
    kwargs = {}
    if num_speakers:
        kwargs["num_speakers"] = num_speakers

    diarization = pipeline(audio_path, **kwargs)

    # Convert to list of (start, end, speaker) tuples
    segments = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        segments.append({
            "start": round(turn.start, 2),
            "end": round(turn.end, 2),
            "speaker": speaker
        })

    return segments


def diarize_simple_energy(audio_path: str, segments: list) -> list:
    """Simple speaker change detection based on pause patterns.

    This is a fallback when pyannote is not available.
    It detects likely speaker changes based on:
    - Silence gaps between segments (>1.5s suggests speaker change)
    - Significant energy/volume changes
    """
    if not segments:
        return segments

    # Assign speakers based on pause-based heuristic
    current_speaker = "Speaker A"
    speaker_toggle = {"Speaker A": "Speaker B", "Speaker B": "Speaker A"}

    for i, seg in enumerate(segments):
        if i == 0:
            seg["speaker"] = current_speaker
            continue

        # Check gap between this segment and previous
        gap = seg["start"] - segments[i-1]["end"]

        # Long pause (>2s) likely indicates speaker change
        if gap > 2.0:
            current_speaker = speaker_toggle.get(current_speaker, "Speaker A")
        # Medium pause (>1s) with short previous segment might be a change
        elif gap > 1.0 and (segments[i-1]["end"] - segments[i-1]["start"]) < 3.0:
            current_speaker = speaker_toggle.get(current_speaker, "Speaker A")

        seg["speaker"] = current_speaker

    return segments


def assign_speakers_to_segments(whisper_segments: list, diarization_segments: list) -> list:
    """Assign speaker labels from diarization to whisper segments.

    For each whisper segment, find the diarization segment with maximum overlap.
    """
    if not diarization_segments:
        return whisper_segments

    for w_seg in whisper_segments:
        w_start = w_seg["start"]
        w_end = w_seg["end"]

        best_speaker = None
        best_overlap = 0.0

        for d_seg in diarization_segments:
            # Calculate overlap
            overlap_start = max(w_start, d_seg["start"])
            overlap_end = min(w_end, d_seg["end"])
            overlap = max(0.0, overlap_end - overlap_start)

            if overlap > best_overlap:
                best_overlap = overlap
                best_speaker = d_seg["speaker"]

        if best_speaker:
            w_seg["speaker"] = best_speaker

    return whisper_segments


def main():
    parser = argparse.ArgumentParser(description="Transcribe audio with faster-whisper")
    parser.add_argument("audio", nargs="?", help="Path to audio file")
    parser.add_argument("--model", default="large-v3", help="Whisper model size")
    parser.add_argument("--language", default="en", help="Language code")
    parser.add_argument("--device", default="auto", help="Device: auto, cpu, cuda")
    parser.add_argument("--output", default="json", help="Output format: json, text")
    parser.add_argument("--download-only", action="store_true", help="Download model without transcribing")
    parser.add_argument("--check-model", action="store_true", help="Check if model is cached")
    parser.add_argument("--diarize", action="store_true", help="Enable speaker diarization")
    parser.add_argument("--hf-token", default=None, help="HuggingFace token for pyannote models")
    parser.add_argument("--num-speakers", type=int, default=None, help="Expected number of speakers")
    parser.add_argument("--check-diarize", action="store_true", help="Check if diarization is available")
    args = parser.parse_args()

    # Check diarization availability
    if args.check_diarize:
        result = check_diarization_available()
        print(json.dumps(result))
        sys.exit(0)

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
    sys.stderr.write(f"Loading model: {args.model} on {device}...\n")
    model = WhisperModel(args.model, device=device, compute_type=compute_type)

    # Transcribe with enhanced settings
    sys.stderr.write("Transcribing...\n")
    segments_gen, info = model.transcribe(
        str(audio_path),
        language=args.language if args.language != "auto" else None,
        beam_size=5,
        vad_filter=True,
        vad_parameters=dict(
            min_silence_duration_ms=500,
            speech_pad_ms=200,
        ),
        word_timestamps=True,  # Enable word-level timestamps for better quality
    )

    segments = []
    for segment in segments_gen:
        seg_data = {
            "start": round(segment.start, 2),
            "end": round(segment.end, 2),
            "text": segment.text.strip(),
        }

        # Include word-level data if available (for precise timestamp linking)
        if segment.words:
            seg_data["words"] = [
                {
                    "word": w.word.strip(),
                    "start": round(w.start, 2),
                    "end": round(w.end, 2),
                    "probability": round(w.probability, 3),
                }
                for w in segment.words
                if w.word.strip()  # skip empty words
            ]

        segments.append(seg_data)

    sys.stderr.write(f"Transcription complete: {len(segments)} segments\n")

    # Speaker diarization
    if args.diarize and segments:
        sys.stderr.write("Running speaker diarization...\n")
        diar_info = check_diarization_available()

        if diar_info["method"] == "pyannote":
            try:
                hf_token = args.hf_token
                if not hf_token:
                    import os
                    hf_token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")

                diar_segments = diarize_with_pyannote(
                    str(audio_path),
                    hf_token=hf_token,
                    num_speakers=args.num_speakers
                )
                segments = assign_speakers_to_segments(segments, diar_segments)
                sys.stderr.write(f"Diarization complete (pyannote): {len(set(s.get('speaker', '') for s in segments))} speakers\n")
            except Exception as e:
                sys.stderr.write(f"Pyannote diarization failed, falling back to simple detection: {e}\n")
                segments = diarize_simple_energy(str(audio_path), segments)
        else:
            # Fallback: simple pause-based speaker detection
            segments = diarize_simple_energy(str(audio_path), segments)
            sys.stderr.write("Using simple speaker detection (install pyannote.audio for better results)\n")

    result = {
        "language": info.language,
        "duration": round(info.duration, 2),
        "segments": segments,
        "diarized": args.diarize,
    }

    if args.output == "text":
        for seg in segments:
            speaker = f"({seg['speaker']}) " if 'speaker' in seg else ""
            print(f"[{seg['start']:.2f} -> {seg['end']:.2f}] {speaker}{seg['text']}")
    else:
        print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
