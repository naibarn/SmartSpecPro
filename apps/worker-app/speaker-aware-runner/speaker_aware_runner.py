#!/usr/bin/env python3
"""Smart AI Hub Feature 179 speaker-aware analysis runner.

The Worker invokes this process as a local, operator-controlled executable.
This module intentionally has no network client and never fabricates speaker
evidence. Optional ML adapters are loaded only when the request selects them
and their runtime/model is installed on the Worker host.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import wave
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

CONTRACT_VERSION = "feature-179-v1"
RUNNER_VERSION = "0.1.0"
ADAPTER_IDS = (
    "SileroOnnx",
    "FireRedOnnx",
    "TenVad",
    "WebRtcVad",
    "PyannoteDiarization",
    "MediaPipeFace",
    "PersonBody",
    "ActiveSpeakerFusion",
)
STATUS_READY = "ready"
STATUS_MISSING_MODEL = "missing_model"
STATUS_MISSING_RUNTIME = "missing_runtime"
STATUS_GPU_UNAVAILABLE = "gpu_unavailable"
STATUS_INCOMPATIBLE = "incompatible"


class RunnerError(RuntimeError):
    """A truthful, user-actionable runner failure."""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def safe_id(value: Any, fallback: str) -> str:
    raw = str(value or fallback).strip()
    result = "".join(char if (char.isalnum() or char in "._:-") else "-" for char in raw)
    result = result.strip("-")
    return result[:160] or fallback


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def find_command(name: str, env_name: str) -> str | None:
    configured = os.environ.get(env_name, "").strip()
    if configured:
        return configured
    return shutil.which(name)


def module_available(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ModuleNotFoundError, ValueError):
        return False


def model_checksum(path: Path | None) -> str | None:
    return sha256_file(path) if path and path.is_file() else None


def device_for_onnx() -> str:
    try:
        import onnxruntime as ort  # type: ignore

        return "cuda" if "CUDAExecutionProvider" in ort.get_available_providers() else "cpu"
    except Exception:
        return "cpu"


def adapter_model_path(adapter_id: str) -> Path | None:
    env_names = {
        "SileroOnnx": "SMARTAIHUB_SILERO_MODEL",
        "FireRedOnnx": "SMARTAIHUB_FIRERED_MODEL",
        "TenVad": "SMARTAIHUB_TENVAD_MODEL",
        "PyannoteDiarization": "SMARTAIHUB_PYANNOTE_MODEL",
        "MediaPipeFace": "SMARTAIHUB_MEDIAPIPE_FACE_MODEL",
        "PersonBody": "SMARTAIHUB_MEDIAPIPE_PERSON_MODEL",
    }
    value = os.environ.get(env_names.get(adapter_id, ""), "").strip()
    return Path(value) if value else None


def adapter_capability(adapter_id: str) -> dict[str, Any]:
    checked_at = now_iso()
    model = adapter_model_path(adapter_id)
    runtime: str | None = None
    status = STATUS_MISSING_RUNTIME
    device = "unknown"
    remediation: str | None = None
    supported_rates: list[int] = []
    supported_inputs: list[str] = ["video", "audio"]

    if adapter_id == "SileroOnnx":
        runtime = "onnxruntime"
        device = device_for_onnx()
        supported_rates = [8000, 16000]
        if not module_available("onnxruntime"):
            remediation = "install_onnxruntime"
        elif not model or not model.is_file():
            status = STATUS_MISSING_MODEL
            remediation = "install_silero_model"
        else:
            status = STATUS_READY
    elif adapter_id == "WebRtcVad":
        runtime = "webrtcvad"
        device = "cpu"
        supported_rates = [8000, 16000, 32000, 48000]
        supported_inputs = ["audio", "video"]
        if module_available("webrtcvad"):
            status = STATUS_READY
        else:
            remediation = "install_webrtcvad"
    elif adapter_id in {"FireRedOnnx", "TenVad"}:
        runtime = "onnxruntime"
        device = device_for_onnx()
        supported_rates = [16000]
        remediation = "install_adapter_runtime"
    elif adapter_id == "PyannoteDiarization":
        runtime = "pyannote.audio"
        device = "cuda" if os.environ.get("SMARTAIHUB_PYANNOTE_DEVICE", "cuda") == "cuda" else "cpu"
        supported_rates = [16000]
        supported_inputs = ["audio", "video"]
        if not module_available("pyannote.audio"):
            remediation = "install_pyannote"
        elif not model or not model.exists():
            status = STATUS_MISSING_MODEL
            remediation = "install_pyannote_model"
        else:
            status = STATUS_READY
    elif adapter_id in {"MediaPipeFace", "PersonBody"}:
        runtime = "mediapipe"
        device = "cpu"
        supported_rates = []
        supported_inputs = ["video", "image"]
        if not module_available("mediapipe") or not module_available("cv2"):
            remediation = "install_mediapipe_opencv"
        elif not model or not model.is_file():
            status = STATUS_MISSING_MODEL
            remediation = "install_mediapipe_model"
        else:
            status = STATUS_READY
    elif adapter_id == "ActiveSpeakerFusion":
        runtime = "smartaihub-fusion"
        device = "cpu"
        supported_rates = [8000, 16000]
        status = STATUS_READY
    else:
        status = STATUS_INCOMPATIBLE
        remediation = "unsupported_adapter"

    return {
        "adapterId": adapter_id,
        "version": RUNNER_VERSION,
        "status": status,
        "runtime": runtime,
        "device": device,
        "modelChecksum": model_checksum(model),
        "supportedSampleRates": supported_rates,
        "supportedInputKinds": supported_inputs,
        "remediationKey": remediation,
        "checkedAt": checked_at,
    }


def adapter_capabilities() -> dict[str, dict[str, Any]]:
    return {adapter_id: adapter_capability(adapter_id) for adapter_id in ADAPTER_IDS}


def resolve_stage(stage: dict[str, Any], capabilities: dict[str, dict[str, Any]], name: str) -> str | None:
    primary = str(stage.get("primary", ""))
    if capabilities.get(primary, {}).get("status") == STATUS_READY:
        return primary
    if stage.get("fallbackPolicy") == "allow_listed":
        for fallback in stage.get("fallbackAllowList", []):
            if capabilities.get(fallback, {}).get("status") == STATUS_READY:
                return str(fallback)
    if stage.get("required"):
        status = capabilities.get(primary, {}).get("status", STATUS_INCOMPATIBLE)
        raise RunnerError(
            f"workflow_capability_blocked: {name} primary adapter {primary} is {status}; "
            "install its runtime/model or select an explicit ready allow-listed fallback"
        )
    return None


def stage_policy(request: dict[str, Any], key: str) -> dict[str, Any]:
    policy = request.get("adapterPolicy")
    if not isinstance(policy, dict):
        raise RunnerError("invalid_contract: adapterPolicy must be an object")
    if policy.get("contractVersion") != CONTRACT_VERSION:
        raise RunnerError("invalid_contract: adapterPolicy contractVersion mismatch")
    stage = policy.get(key)
    if not isinstance(stage, dict):
        raise RunnerError(f"invalid_contract: adapterPolicy.{key} is missing")
    return stage


def probe_duration_ms(input_path: Path) -> int:
    ffprobe = find_command("ffprobe", "SMARTAIHUB_FFPROBE")
    if not ffprobe:
        raise RunnerError("workflow_capability_blocked: ffprobe is required by speaker-aware runner")
    try:
        completed = subprocess.run(
            [ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(input_path)],
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        duration = float(completed.stdout.strip())
    except (OSError, subprocess.SubprocessError, ValueError) as error:
        raise RunnerError(f"speaker_aware_input_probe_failed: {error}") from error
    if not math.isfinite(duration) or duration <= 0:
        raise RunnerError("speaker_aware_input_probe_failed: input duration is unavailable")
    return max(1, round(duration * 1000))


def extract_wav(input_path: Path, directory: Path) -> Path:
    ffmpeg = find_command("ffmpeg", "SMARTAIHUB_FFMPEG")
    if not ffmpeg:
        raise RunnerError("workflow_capability_blocked: ffmpeg is required by speaker-aware audio adapters")
    output = directory / "analysis-audio.wav"
    try:
        subprocess.run(
            [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(input_path), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(output)],
            check=True,
            capture_output=True,
            timeout=max(120, int(probe_duration_ms(input_path) / 1000) * 4),
        )
    except (OSError, subprocess.SubprocessError) as error:
        raise RunnerError(f"speaker_aware_audio_extract_failed: {error}") from error
    if not output.is_file() or output.stat().st_size < 44:
        raise RunnerError("speaker_aware_audio_extract_failed: ffmpeg produced no audio")
    return output


def read_pcm16(wav_path: Path) -> tuple[list[float], int]:
    with wave.open(str(wav_path), "rb") as handle:
        if handle.getnchannels() != 1 or handle.getsampwidth() != 2:
            raise RunnerError("invalid_contract: analysis audio must be mono 16-bit PCM")
        sample_rate = handle.getframerate()
        raw = handle.readframes(handle.getnframes())
    samples = [value / 32768.0 for value in memoryview(raw).cast("h")]
    return samples, sample_rate


def merge_flags(flags: Iterable[tuple[int, int, float, bool]], sample_rate: int, adapter_id: str, threshold: float, model: Path | None) -> list[dict[str, Any]]:
    items = list(flags)
    if not items:
        return []
    result: list[dict[str, Any]] = []
    start_frame, end_frame, confidence, is_speech = items[0]
    for frame_start, frame_end, frame_confidence, frame_speech in items[1:]:
        if frame_speech == is_speech and frame_start <= end_frame + 1:
            end_frame = frame_end
            confidence = max(confidence, frame_confidence)
            continue
        result.append(vad_segment(start_frame, end_frame, confidence, is_speech, sample_rate, adapter_id, threshold, model))
        start_frame, end_frame, confidence, is_speech = frame_start, frame_end, frame_confidence, frame_speech
    result.append(vad_segment(start_frame, end_frame, confidence, is_speech, sample_rate, adapter_id, threshold, model))
    return result


def vad_segment(start_frame: int, end_frame: int, confidence: float, is_speech: bool, sample_rate: int, adapter_id: str, threshold: float, model: Path | None) -> dict[str, Any]:
    return {
        "startMs": round(start_frame / sample_rate * 1000),
        "endMs": max(round(end_frame / sample_rate * 1000), round((start_frame + 1) / sample_rate * 1000)),
        "speechConfidence": max(0.0, min(1.0, confidence)),
        "isSpeech": is_speech,
        "threshold": threshold,
        "sampleRate": sample_rate,
        "evidence": {"adapterId": adapter_id, "adapterVersion": RUNNER_VERSION, "modelChecksum": model_checksum(model)},
    }


def run_webrtc_vad(wav_path: Path, adapter_id: str, model: Path | None) -> list[dict[str, Any]]:
    try:
        import webrtcvad  # type: ignore
    except ImportError as error:
        raise RunnerError("workflow_capability_blocked: WebRTC VAD runtime is not installed") from error
    with wave.open(str(wav_path), "rb") as handle:
        sample_rate = handle.getframerate()
        raw = handle.readframes(handle.getnframes())
    frame_bytes = int(sample_rate * 30 / 1000) * 2
    detector = webrtcvad.Vad(int(os.environ.get("SMARTAIHUB_WEBRTC_AGGRESSIVENESS", "2")))
    flags: list[tuple[int, int, float, bool]] = []
    for offset in range(0, len(raw) - frame_bytes + 1, frame_bytes):
        speech = bool(detector.is_speech(raw[offset : offset + frame_bytes], sample_rate))
        frame_start = offset // 2
        frame_end = frame_start + frame_bytes // 2
        flags.append((frame_start, frame_end, 0.75 if speech else 0.05, speech))
    return merge_flags(flags, sample_rate, adapter_id, 0.5, model)


def run_silero_vad(wav_path: Path, adapter_id: str, model: Path) -> list[dict[str, Any]]:
    try:
        import numpy as np  # type: ignore
        import onnxruntime as ort  # type: ignore
    except ImportError as error:
        raise RunnerError("workflow_capability_blocked: Silero requires numpy and onnxruntime") from error
    providers = ["CUDAExecutionProvider", "CPUExecutionProvider"] if device_for_onnx() == "cuda" else ["CPUExecutionProvider"]
    session = ort.InferenceSession(str(model), providers=providers)
    inputs = session.get_inputs()
    samples, sample_rate = read_pcm16(wav_path)
    if sample_rate not in {8000, 16000}:
        raise RunnerError(f"invalid_contract: Silero sample rate {sample_rate} is unsupported")
    threshold = float(os.environ.get("SMARTAIHUB_SILERO_THRESHOLD", "0.5"))
    state = np.zeros((2, 1, 128), dtype=np.float32)
    flags: list[tuple[int, int, float, bool]] = []
    window = 512 if sample_rate == 16000 else 256
    for offset in range(0, len(samples), window):
        chunk = np.asarray(samples[offset : offset + window], dtype=np.float32)
        if chunk.size < window:
            chunk = np.pad(chunk, (0, window - chunk.size))
        feed: dict[str, Any] = {}
        for input_meta in inputs:
            name = input_meta.name.lower()
            if "state" in name or "h" == name:
                feed[input_meta.name] = state
            elif name in {"sr", "sample_rate", "sampling_rate"}:
                feed[input_meta.name] = np.asarray(sample_rate, dtype=np.int64)
            else:
                feed[input_meta.name] = chunk.reshape(1, -1)
        outputs = session.run(None, feed)
        probability = float(np.asarray(outputs[0]).reshape(-1)[0])
        for output in outputs[1:]:
            array = np.asarray(output)
            if array.shape == state.shape:
                state = array.astype(np.float32)
                break
        frame_start = offset
        frame_end = min(offset + window, len(samples))
        flags.append((frame_start, frame_end, probability, probability >= threshold))
    return merge_flags(flags, sample_rate, adapter_id, threshold, model)


def run_vad(wav_path: Path, adapter_id: str, model: Path | None) -> list[dict[str, Any]]:
    if adapter_id == "SileroOnnx":
        if not model or not model.is_file():
            raise RunnerError("workflow_capability_blocked: Silero ONNX model is not configured")
        return run_silero_vad(wav_path, adapter_id, model)
    if adapter_id == "WebRtcVad":
        return run_webrtc_vad(wav_path, adapter_id, model)
    raise RunnerError(f"workflow_capability_blocked: {adapter_id} adapter has no installed runner implementation")


def normalize_box(x: float, y: float, width: float, height: float, frame_width: int, frame_height: int) -> dict[str, float]:
    return {
        "x": max(0.0, min(1.0, x / max(1, frame_width))),
        "y": max(0.0, min(1.0, y / max(1, frame_height))),
        "width": max(0.0, min(1.0, width / max(1, frame_width))),
        "height": max(0.0, min(1.0, height / max(1, frame_height))),
    }


def iou(left: dict[str, float], right: dict[str, float]) -> float:
    ax1, ay1 = left["x"], left["y"]
    ax2, ay2 = ax1 + left["width"], ay1 + left["height"]
    bx1, by1 = right["x"], right["y"]
    bx2, by2 = bx1 + right["width"], by1 + right["height"]
    ix1, iy1, ix2, iy2 = max(ax1, bx1), max(ay1, by1), min(ax2, bx2), min(ay2, by2)
    intersection = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    union = left["width"] * left["height"] + right["width"] * right["height"] - intersection
    return intersection / union if union > 0 else 0.0


@dataclass
class Track:
    track_id: str
    kind: str
    start_ms: int
    end_ms: int
    posture: str = "unknown"
    boxes: list[dict[str, Any]] = field(default_factory=list)


def run_visual_scan(input_path: Path, selected: list[str], duration_ms: int, max_scan_window_ms: int) -> list[dict[str, Any]]:
    if not selected:
        return []
    try:
        import cv2  # type: ignore
        import mediapipe as mp  # type: ignore
        from mediapipe.tasks import python as mp_python  # type: ignore
        from mediapipe.tasks.python import vision  # type: ignore
    except ImportError as error:
        raise RunnerError("workflow_capability_blocked: MediaPipe Face/Person requires mediapipe and opencv") from error

    face_model = adapter_model_path("MediaPipeFace")
    person_model = adapter_model_path("PersonBody")
    capture = cv2.VideoCapture(str(input_path))
    if not capture.isOpened():
        raise RunnerError("speaker_aware_visual_scan_failed: video cannot be opened")
    fps = float(capture.get(cv2.CAP_PROP_FPS) or 25.0)
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    frame_width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 1)
    frame_height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 1)
    sample_period_ms = max(250, min(2000, int(max_scan_window_ms or 1000)))
    sample_every = max(1, round(fps * sample_period_ms / 1000))
    face_detector = None
    pose_detector = None
    try:
        if "MediaPipeFace" in selected:
            if not face_model or not face_model.is_file():
                raise RunnerError("workflow_capability_blocked: MediaPipe Face model is not configured")
            base = mp_python.BaseOptions(model_asset_path=str(face_model))
            options = vision.FaceDetectorOptions(base_options=base, running_mode=vision.RunningMode.IMAGE, min_detection_confidence=0.35)
            face_detector = vision.FaceDetector.create_from_options(options)
        if "PersonBody" in selected:
            if not person_model or not person_model.is_file():
                raise RunnerError("workflow_capability_blocked: Person/Body model is not configured")
            base = mp_python.BaseOptions(model_asset_path=str(person_model))
            options = vision.PoseLandmarkerOptions(base_options=base, running_mode=vision.RunningMode.IMAGE, num_poses=8, min_pose_detection_confidence=0.3, min_pose_presence_confidence=0.3)
            pose_detector = vision.PoseLandmarker.create_from_options(options)
        tracks: dict[str, list[Track]] = {"face": [], "person": []}
        frame_index = 0
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            if frame_index % sample_every:
                frame_index += 1
                continue
            timestamp_ms = min(duration_ms, round(frame_index / max(fps, 1.0) * 1000))
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            detections: list[tuple[str, dict[str, float], float, str]] = []
            if face_detector:
                for detection in face_detector.detect(image).detections:
                    box = detection.bounding_box
                    confidence = float(detection.categories[0].score if detection.categories else 0.0)
                    detections.append(("face", normalize_box(box.origin_x, box.origin_y, box.width, box.height, frame_width, frame_height), confidence, "unknown"))
            if pose_detector:
                for landmarks in pose_detector.detect(image).pose_landmarks:
                    xs = [float(point.x) for point in landmarks if math.isfinite(float(point.x))]
                    ys = [float(point.y) for point in landmarks if math.isfinite(float(point.y))]
                    if not xs or not ys:
                        continue
                    x, y = max(0.0, min(xs)), max(0.0, min(ys))
                    width, height = min(1.0, max(xs) - x), min(1.0, max(ys) - y)
                    posture = "standing" if height > 0.55 else "seated" if height < 0.45 else "unknown"
                    detections.append(("person", {"x": x, "y": y, "width": width, "height": height}, 0.6, posture))
            for kind, box, confidence, posture in detections:
                candidates = tracks[kind]
                target = max(candidates, key=lambda item: iou(item.boxes[-1]["box"], box), default=None)
                if target is None or iou(target.boxes[-1]["box"], box) < 0.15:
                    target = Track(track_id=f"{kind}-{len(candidates) + 1}", kind=kind, start_ms=timestamp_ms, end_ms=timestamp_ms + max(1, sample_period_ms), posture=posture)
                    candidates.append(target)
                target.end_ms = max(target.end_ms, timestamp_ms + max(1, sample_period_ms))
                if posture != "unknown":
                    target.posture = posture
                target.boxes.append({"timeMs": timestamp_ms, **box, "confidence": max(0.0, min(1.0, confidence))})
            frame_index += 1
            if frame_count and frame_index >= frame_count:
                break
        return [
            {"trackId": track.track_id, "kind": track.kind, "startMs": track.start_ms, "endMs": min(duration_ms, track.end_ms), "boxes": track.boxes, "posture": track.posture, "detector": {"adapterId": "MediaPipeFace" if track.kind == "face" else "PersonBody", "adapterVersion": RUNNER_VERSION, "modelChecksum": model_checksum(face_model if track.kind == "face" else person_model)}}
            for kind in ("face", "person")
            for track in tracks[kind]
            if track.boxes and track.end_ms > track.start_ms
        ]
    finally:
        if face_detector:
            face_detector.close()
        if pose_detector:
            pose_detector.close()
        capture.release()


def subtitle_evidence(analysis_paths: list[Path]) -> dict[str, Any] | None:
    for path in analysis_paths:
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        candidate = document.get("subtitleEvidence") if isinstance(document, dict) else None
        if not isinstance(candidate, dict):
            candidate = document if isinstance(document, dict) and isinstance(document.get("cues"), list) else None
        if not candidate:
            continue
        cues: list[dict[str, Any]] = []
        for index, cue in enumerate(candidate.get("cues", [])):
            if not isinstance(cue, dict):
                continue
            start = int(cue.get("startMs", cue.get("start_ms", 0)))
            end = int(cue.get("endMs", cue.get("end_ms", 0)))
            text = str(cue.get("text", "")).strip()
            if end <= start or not text:
                continue
            cues.append({"cueId": safe_id(cue.get("cueId", cue.get("id")), f"cue-{index + 1}"), "startMs": start, "endMs": end, "text": text[:4000], "speakerId": cue.get("speakerId"), "confidence": cue.get("confidence")})
        if not cues:
            continue
        evidence = {"evidenceId": safe_id(candidate.get("evidenceId"), f"subtitle-{sha256_file(path)[:12]}"), "sourceKind": candidate.get("sourceKind", "observed_asr"), "format": candidate.get("format", "json"), "language": str(candidate.get("language", "und"))[:16], "cues": cues, "confidence": candidate.get("confidence"), "checksum": candidate.get("checksum", sha256_file(path)), "revision": safe_id(candidate.get("revision"), "imported")}
        return evidence
    return None


def diarize(wav_path: Path, adapter_id: str, model: Path) -> list[dict[str, Any]]:
    try:
        from pyannote.audio import Pipeline  # type: ignore
    except ImportError as error:
        raise RunnerError("workflow_capability_blocked: pyannote.audio is not installed") from error
    token = os.environ.get("SMARTAIHUB_PYANNOTE_TOKEN", "").strip() or None
    try:
        pipeline = Pipeline.from_pretrained(str(model), use_auth_token=token)
        if os.environ.get("SMARTAIHUB_PYANNOTE_DEVICE", "cuda") == "cuda":
            import torch  # type: ignore
            if not torch.cuda.is_available():
                raise RunnerError("workflow_capability_blocked: pyannote CUDA device is unavailable")
            pipeline.to(torch.device("cuda"))
        annotation = pipeline(str(wav_path))
    except RunnerError:
        raise
    except Exception as error:
        raise RunnerError(f"speaker_aware_diarization_failed: {error}") from error
    result: list[dict[str, Any]] = []
    for turn, _, speaker in annotation.itertracks(yield_label=True):
        result.append({"speakerId": safe_id(speaker, "speaker-unknown"), "startMs": round(turn.start * 1000), "endMs": max(round(turn.end * 1000), round(turn.start * 1000) + 1), "confidence": 0.8, "evidence": {"adapterId": adapter_id, "adapterVersion": RUNNER_VERSION, "modelChecksum": model_checksum(model)}})
    return result


def overlap_ms(left_start: int, left_end: int, right_start: int, right_end: int) -> int:
    return max(0, min(left_end, right_end) - max(left_start, right_start))


def fuse_active_speakers(vad_segments: list[dict[str, Any]], diarization: list[dict[str, Any]], tracks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for segment in vad_segments:
        if not segment.get("isSpeech"):
            continue
        start, end = int(segment["startMs"]), int(segment["endMs"])
        diarized = max(diarization, key=lambda item: overlap_ms(start, end, item["startMs"], item["endMs"]), default=None)
        candidates = [track for track in tracks if overlap_ms(start, end, track["startMs"], track["endMs"]) > 0]
        face = next((track for track in candidates if track["kind"] == "face"), None)
        person = next((track for track in candidates if track["kind"] == "person"), None)
        visual = face or person
        basis = ["vad"]
        if diarized:
            basis.append("diarization")
        if face:
            basis.append("face")
        elif person:
            basis.append("person")
        conflict = "none" if visual else "missing_visual"
        visual_confidence = max((box.get("confidence", 0.0) for box in (visual or {}).get("boxes", [])), default=0.0)
        result.append({"startMs": start, "endMs": end, "speakerId": diarized.get("speakerId") if diarized else None, "activeFaceTrackId": face.get("trackId") if face else None, "activePersonTrackId": person.get("trackId") if person else None, "speechConfidence": segment["speechConfidence"], "visualConfidence": visual_confidence, "fusedConfidence": min(float(segment["speechConfidence"]), float(visual_confidence)) if visual else 0.0, "basis": basis, "conflict": conflict})
    return result


def source_artifact(request: dict[str, Any], source_checksum: str) -> dict[str, str]:
    value = request.get("sourceArtifact")
    if isinstance(value, dict):
        return {"artifactId": safe_id(value.get("artifactId"), f"source-{source_checksum[:12]}"), "revision": safe_id(value.get("revision"), "local"), "checksum": source_checksum, "kind": safe_id(value.get("kind"), "video")}
    return {"artifactId": f"source-{source_checksum[:12]}", "revision": "local", "checksum": source_checksum, "kind": "video"}


def build_ranges(duration_ms: int, vad_segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    removals = sorted((int(item["startMs"]), int(item["endMs"])) for item in vad_segments if not item.get("isSpeech") and int(item["endMs"]) - int(item["startMs"]) >= 250)
    ranges: list[dict[str, Any]] = []
    cursor = 0
    output_cursor = 0
    range_index = 1
    for remove_start, remove_end in removals:
        remove_start, remove_end = max(cursor, remove_start), min(duration_ms, remove_end)
        if remove_start > cursor:
            ranges.append({"rangeId": f"range-{range_index}", "sourceStartMs": cursor, "sourceEndMs": remove_start, "outputStartMs": output_cursor, "outputEndMs": output_cursor + remove_start - cursor, "decision": "keep", "reasons": ["source"]})
            output_cursor += remove_start - cursor
            range_index += 1
        if remove_end > remove_start:
            ranges.append({"rangeId": f"range-{range_index}", "sourceStartMs": remove_start, "sourceEndMs": remove_end, "outputStartMs": output_cursor, "outputEndMs": output_cursor, "decision": "remove", "reasons": ["dead_air"]})
            range_index += 1
        cursor = max(cursor, remove_end)
    if cursor < duration_ms:
        ranges.append({"rangeId": f"range-{range_index}", "sourceStartMs": cursor, "sourceEndMs": duration_ms, "outputStartMs": output_cursor, "outputEndMs": output_cursor + duration_ms - cursor, "decision": "keep", "reasons": ["source"]})
    return ranges or [{"rangeId": "range-1", "sourceStartMs": 0, "sourceEndMs": max(1, duration_ms), "outputStartMs": 0, "outputEndMs": max(1, duration_ms), "decision": "keep", "reasons": ["source"]}]


def camera_actions(duration_ms: int, active: list[dict[str, Any]]) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    for evidence in active:
        target = evidence.get("activeFaceTrackId") or evidence.get("activePersonTrackId")
        action = "slow_move" if target else "hold"
        reason = "stable_target" if target else "no_evidence"
        actions.append({"startMs": evidence["startMs"], "endMs": evidence["endMs"], "action": action, "targetTrackId": target, "fromX": 0.5, "fromY": 0.5, "toX": 0.5, "toY": 0.5, "reason": reason})
    if not actions:
        actions.append({"startMs": 0, "endMs": max(1, duration_ms), "action": "hold", "targetTrackId": None, "fromX": 0.5, "fromY": 0.5, "toX": 0.5, "toY": 0.5, "reason": "no_evidence"})
    return actions


def run_analysis(request: dict[str, Any], input_path: Path) -> dict[str, Any]:
    if request.get("contractVersion") != CONTRACT_VERSION:
        raise RunnerError("invalid_contract: request contractVersion mismatch")
    expected_checksum = str(request.get("sourceChecksum", "")).lower()
    if len(expected_checksum) != 64:
        raise RunnerError("invalid_contract: request sourceChecksum is required")
    actual_checksum = sha256_file(input_path)
    if actual_checksum != expected_checksum:
        raise RunnerError("invalid_contract: input sourceChecksum does not match request")
    duration_ms = probe_duration_ms(input_path)
    requested = {str(stage) for stage in request.get("requestedStages", [])}
    capabilities = adapter_capabilities()
    warnings: list[str] = []
    selected_vad = None
    vad_segments: list[dict[str, Any]] = []
    diarization_segments: list[dict[str, Any]] = []
    visual_tracks: list[dict[str, Any]] = []
    active_speakers: list[dict[str, Any]] = []
    analysis_paths = [Path(value) for value in request.get("analysisPaths", []) if isinstance(value, str)]
    subtitle = subtitle_evidence(analysis_paths)

    with tempfile.TemporaryDirectory(prefix="smartaihub-speaker-aware-") as temp_dir:
        temp_path = Path(temp_dir)
        needs_audio = bool(requested & {"vad_scan", "diarization_scan", "active_speaker_fusion"})
        wav_path = extract_wav(input_path, temp_path) if needs_audio else None
        if "vad_scan" in requested or "diarization_scan" in requested or "active_speaker_fusion" in requested:
            selected_vad = resolve_stage(stage_policy(request, "vad"), capabilities, "vad")
            if selected_vad and wav_path:
                vad_segments = run_vad(wav_path, selected_vad, adapter_model_path(selected_vad))
        if "diarization_scan" in requested:
            selected_diarization = resolve_stage(stage_policy(request, "diarization"), capabilities, "diarization")
            if selected_diarization and wav_path:
                model = adapter_model_path(selected_diarization)
                if not model:
                    raise RunnerError("workflow_capability_blocked: pyannote model is not configured")
                diarization_segments = diarize(wav_path, selected_diarization, model)
        if "visual_track_scan" in requested or "active_speaker_fusion" in requested or "speaker_reframe" in requested:
            visual_adapters: list[str] = []
            if "MediaPipeFace" in stage_policy(request, "face").get("enabledAdapters", []):
                selected_face = resolve_stage(stage_policy(request, "face"), capabilities, "face")
                if selected_face:
                    visual_adapters.append(selected_face)
            if "PersonBody" in stage_policy(request, "person").get("enabledAdapters", []):
                selected_person = resolve_stage(stage_policy(request, "person"), capabilities, "person")
                if selected_person:
                    visual_adapters.append(selected_person)
            if visual_adapters:
                visual_tracks = run_visual_scan(input_path, visual_adapters, duration_ms, int(request.get("adapterPolicy", {}).get("maxScanWindowMs", 1000)))
        if "active_speaker_fusion" in requested or "speaker_reframe" in requested:
            resolve_stage(stage_policy(request, "activeSpeaker"), capabilities, "activeSpeaker")
            active_speakers = fuse_active_speakers(vad_segments, diarization_segments, visual_tracks)

    if selected_vad is None and requested & {"vad_scan", "diarization_scan", "active_speaker_fusion"}:
        warnings.append("VAD stage was requested but no ready adapter was selected")
    return {
        "contractVersion": CONTRACT_VERSION,
        "sourceArtifact": source_artifact(request, actual_checksum),
        "sourceChecksum": actual_checksum,
        "durationMs": duration_ms,
        "adapterCapabilities": list(capabilities.values()),
        "subtitleEvidence": subtitle,
        "vadSegments": vad_segments,
        "diarizationSegments": diarization_segments,
        "visualTracks": visual_tracks,
        "activeSpeakers": active_speakers,
        "warnings": warnings,
        "scanRevision": f"scan-{safe_id(request.get('jobId'), actual_checksum[:12])}",
        "createdAt": now_iso(),
    }


def build_edit_plan(request: dict[str, Any], scan: dict[str, Any]) -> dict[str, Any]:
    source = scan["sourceArtifact"]
    duration_ms = int(scan["durationMs"])
    active = scan.get("activeSpeakers", [])
    composed = {
        "contractVersion": CONTRACT_VERSION,
        "mapId": f"map-{safe_id(request.get('jobId'), scan['sourceChecksum'][:12])}",
        "mapRevision": "runner-1",
        "sourceArtifact": source,
        "parentArtifactHashes": [scan["sourceChecksum"]],
        "ranges": build_ranges(duration_ms, scan.get("vadSegments", [])),
        "cameraActions": camera_actions(duration_ms, active),
        "activeSpeakers": active,
        "manualRevision": "none",
        "workflowRevision": safe_id(request.get("workflowMode"), "custom"),
        "approvalState": "review_required",
        "createdAt": now_iso(),
    }
    scan_digest = sha256_bytes(json.dumps(scan, sort_keys=True, separators=(",", ":")).encode("utf-8"))
    return {
        "contractVersion": CONTRACT_VERSION,
        "sourceArtifact": source,
        "scanArtifact": {"artifactId": f"runner-scan-{scan['sourceChecksum'][:12]}", "revision": scan["scanRevision"], "checksum": scan_digest, "kind": "speaker_aware_scan"},
        "sourceChecksum": scan["sourceChecksum"],
        "composedEditMap": composed,
        "condensationProposals": [],
        "approvalRequired": True,
        "createdAt": now_iso(),
    }


def load_request(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RunnerError(f"invalid_contract: request JSON is unreadable: {error}") from error
    if not isinstance(value, dict):
        raise RunnerError("invalid_contract: request JSON must be an object")
    return value


def write_output(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Smart AI Hub Feature 179 speaker-aware runner")
    parser.add_argument("--version", action="store_true")
    parser.add_argument("--request")
    parser.add_argument("--input")
    parser.add_argument("--output")
    args = parser.parse_args(argv)
    if args.version:
        print(f"smartaihub-speaker-aware-runner {RUNNER_VERSION} contract={CONTRACT_VERSION}")
        return 0
    if not args.request or not args.input or not args.output:
        parser.error("--request, --input and --output are required unless --version is used")
    try:
        request = load_request(Path(args.request))
        input_path = Path(args.input)
        if not input_path.is_file():
            raise RunnerError("source_reference_expired: input video is missing")
        scan = run_analysis(request, input_path)
        output = build_edit_plan(request, scan) if request.get("kind") == "speaker_aware_edit_plan" else scan
        write_output(Path(args.output), output)
        return 0
    except RunnerError as error:
        print(str(error), file=sys.stderr)
        return 2
    except Exception as error:  # keep the Worker failure truthful and diagnosable
        print(f"speaker_aware_runner_failed: {error}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
