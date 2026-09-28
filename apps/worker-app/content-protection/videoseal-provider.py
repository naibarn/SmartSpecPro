#!/usr/bin/env python3
"""VideoSeal bridge for the Worker App content-protection command contract."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def ffbin(name: str) -> str:
    return os.environ.get(name, name.lower())


def load_provider(provider_id: str):
    if provider_id not in {"videoseal", "pixelseal"}:
        raise RuntimeError(f"unsupported provider: {provider_id}")
    try:
        import torch
        import videoseal
    except ImportError as error:
        raise RuntimeError(
            "VideoSeal runtime is not installed; see content-protection/README.md"
        ) from error
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model_root = os.environ.get("CONTENT_PROTECTION_MODEL_DIR", "").strip()
    previous_cwd = Path.cwd()
    if model_root:
        Path(model_root).mkdir(parents=True, exist_ok=True)
        os.chdir(model_root)
    try:
        model = videoseal.load(provider_id)
    finally:
        if model_root:
            os.chdir(previous_cwd)
    model.to(device)
    model.eval()
    return model, device, torch


def message_for_watermark(watermark_id: str, nbits: int, torch, device):
    material = hashlib.sha256(watermark_id.encode("utf-8")).digest()
    while len(material) * 8 < nbits:
        material += hashlib.sha256(material).digest()
    bits = []
    for byte in material:
        bits.extend(float((byte >> shift) & 1) for shift in range(7, -1, -1))
    return torch.tensor(bits[:nbits], dtype=torch.float32, device=device).unsqueeze(0)


def message_size(model) -> int:
    try:
        value = int(getattr(getattr(model, "msg_processor", None), "nbits", 256))
    except (TypeError, ValueError):
        value = 256
    if value <= 0 or value > 4096:
        raise RuntimeError("provider returned an invalid message size")
    return value


def embed(model, frames, message, is_video: bool):
    result = model.embed(frames, msgs=message, is_video=is_video)
    if isinstance(result, dict):
        result = result.get("imgs_w")
    if result is None:
        raise RuntimeError("provider returned no watermarked frames")
    return result.clamp(0.0, 1.0)


def prediction_scores(model, frames, is_video: bool):
    result = model.detect(frames, is_video=is_video)
    if isinstance(result, dict):
        result = result.get("preds")
    if result is None or result.ndim < 2:
        raise RuntimeError("provider returned invalid detection output")
    bits = result[:, 1:]
    reduce_dims = tuple(index for index in range(bits.ndim) if index != 1)
    return bits.mean(dim=reduce_dims)


def confidence(model, frames, message, is_video: bool) -> float:
    scores = prediction_scores(model, frames, is_video)
    expected = message[0].to(scores.device)
    if scores.shape[-1] != expected.shape[-1]:
        raise RuntimeError("provider message size mismatch")
    return float(((scores > 0).to(expected.dtype) == expected).float().mean().item())


def video_info(path: Path):
    result = subprocess.run(
        [ffbin("CONTENT_PROTECTION_FFPROBE"), "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", str(path)],
        check=True, capture_output=True, text=True,
    )
    stream = json.loads(result.stdout)["streams"][0]
    numerator, denominator = (int(value) for value in stream["r_frame_rate"].split("/", 1))
    return int(stream["width"]), int(stream["height"]), max(numerator / denominator, 1.0)


def stream_video(model, device, torch, source: Path, destination: Path, message):
    import numpy as np

    width, height, fps = video_info(source)
    frame_size = width * height * 3
    chunk_size = max(1, int(os.environ.get("CONTENT_PROTECTION_VIDEO_CHUNK", "16")))
    reader = subprocess.Popen(
        [ffbin("CONTENT_PROTECTION_FFMPEG"), "-hide_banner", "-loglevel", "error", "-i", str(source),
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    )
    writer = subprocess.Popen(
        [ffbin("CONTENT_PROTECTION_FFMPEG"), "-hide_banner", "-loglevel", "error", "-f", "rawvideo",
         "-pix_fmt", "rgb24", "-s", f"{width}x{height}", "-r", str(fps), "-i", "-", "-an",
         "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p",
         "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-y", str(destination)],
        stdin=subprocess.PIPE, stderr=subprocess.DEVNULL,
    )
    frame_count = 0
    try:
        assert reader.stdout is not None and writer.stdin is not None
        while True:
            raw_frames = []
            for _ in range(chunk_size):
                raw = reader.stdout.read(frame_size)
                if not raw:
                    break
                if len(raw) != frame_size:
                    raise RuntimeError("ffmpeg returned a truncated frame")
                raw_frames.append(raw)
            if not raw_frames:
                break
            frames = np.frombuffer(b"".join(raw_frames), dtype=np.uint8).copy()
            frames = frames.reshape(len(raw_frames), height, width, 3)
            tensor = torch.from_numpy(frames).permute(0, 3, 1, 2).float().div(255.0).to(device)
            with torch.no_grad():
                watermarked = embed(model, tensor, message, True)
            encoded = watermarked.cpu().mul(255.0).round().byte().permute(0, 2, 3, 1).numpy()
            writer.stdin.write(encoded.tobytes())
            frame_count += len(raw_frames)
    finally:
        if reader.stdout is not None:
            reader.stdout.close()
        if writer.stdin is not None:
            writer.stdin.close()
        reader.wait()
        writer.wait()
    if reader.returncode != 0 or writer.returncode != 0 or frame_count == 0:
        raise RuntimeError("VideoSeal failed to encode the video")
    return frame_count


def mux_audio(video_only: Path, source: Path, output: Path):
    command = [ffbin("CONTENT_PROTECTION_FFMPEG"), "-hide_banner", "-loglevel", "error", "-i", str(video_only),
               "-i", str(source), "-map", "0:v:0", "-map", "1:a?", "-c:v", "copy", "-c:a", "copy",
               "-shortest", "-y", str(output)]
    try:
        subprocess.run(command, check=True, capture_output=True)
    except subprocess.CalledProcessError:
        shutil.copyfile(video_only, output)


def detect_video(model, device, torch, source: Path, message):
    import numpy as np

    width, height, _ = video_info(source)
    frame_size = width * height * 3
    reader = subprocess.Popen(
        [ffbin("CONTENT_PROTECTION_FFMPEG"), "-hide_banner", "-loglevel", "error", "-i", str(source),
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    )
    scores = []
    try:
        assert reader.stdout is not None
        while True:
            raw = reader.stdout.read(frame_size)
            if not raw:
                break
            if len(raw) != frame_size:
                raise RuntimeError("ffmpeg returned a truncated verification frame")
            frames = np.frombuffer(raw, dtype=np.uint8).copy().reshape(1, height, width, 3)
            tensor = torch.from_numpy(frames).permute(0, 3, 1, 2).float().div(255.0).to(device)
            with torch.no_grad():
                scores.append(prediction_scores(model, tensor, True))
    finally:
        if reader.stdout is not None:
            reader.stdout.close()
        reader.wait()
    if reader.returncode != 0 or not scores:
        raise RuntimeError("VideoSeal failed to read the protected video")
    average = torch.stack(scores).mean(dim=0)
    expected = message[0].to(average.device)
    return float(((average > 0).to(expected.dtype) == expected).float().mean().item()), len(scores)


def image_operation(model, device, torch, source: Path, output: Path, message):
    from PIL import Image
    import torchvision.transforms.functional as functional

    image = Image.open(source).convert("RGB")
    tensor = functional.to_tensor(image).unsqueeze(0).to(device)
    with torch.no_grad():
        watermarked = embed(model, tensor, message, False)
        result = functional.to_pil_image(watermarked[0].cpu())
        result.save(output)
        score = confidence(model, watermarked, message, False)
        score = min(score, confidence(model, functional.to_tensor(result).unsqueeze(0).to(device), message, False))
    return score


def args():
    parser = argparse.ArgumentParser(description="Smart AI Hub VideoSeal provider")
    parser.add_argument("--health", action="store_true")
    parser.add_argument("--input", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--verify-json", type=Path)
    parser.add_argument("--modality", choices=["image", "video", "audio"])
    parser.add_argument("--provider", default="videoseal", choices=["videoseal", "pixelseal"])
    parser.add_argument("--provider-version", default="videoseal-1.0")
    parser.add_argument("--watermark-id")
    return parser.parse_args()


def main() -> int:
    options = args()
    if options.health:
        model, device, torch = load_provider(options.provider)
        print(json.dumps({
            "ready": True,
            "provider": options.provider,
            "providerVersion": options.provider_version,
            "device": str(device),
            "messageBits": message_size(model),
        }, separators=(",", ":")))
        return 0
    missing = [
        name for name, value in {
            "--input": options.input,
            "--output": options.output,
            "--verify-json": options.verify_json,
            "--modality": options.modality,
            "--watermark-id": options.watermark_id,
        }.items() if value is None
    ]
    if missing:
        raise RuntimeError(f"missing required provider arguments: {', '.join(missing)}")
    if options.modality == "audio":
        raise RuntimeError("VideoSeal is video/image-only; configure an AudioSeal command for audio")
    if not options.input.is_file():
        raise RuntimeError("content protection input does not exist")
    options.output.parent.mkdir(parents=True, exist_ok=True)
    options.verify_json.parent.mkdir(parents=True, exist_ok=True)
    model, device, torch = load_provider(options.provider)
    message = message_for_watermark(options.watermark_id, message_size(model), torch, device)
    with tempfile.TemporaryDirectory(prefix="smartspec-protection-") as temporary:
        video_only = Path(temporary) / "protected-video.mp4"
        if options.modality == "video":
            frame_count = stream_video(model, device, torch, options.input, video_only, message)
            mux_audio(video_only, options.input, options.output)
            score, verified_frames = detect_video(model, device, torch, options.output, message)
            frame_count = min(frame_count, verified_frames)
        else:
            score = image_operation(model, device, torch, options.input, options.output, message)
            frame_count = 1
    if score < 0.5 or not options.output.is_file() or options.output.stat().st_size == 0:
        raise RuntimeError("content protection self-verification failed")
    options.verify_json.write_text(json.dumps({
        "detected": True,
        "confidence": score,
        "evidence": {
            "provider": options.provider,
            "providerVersion": options.provider_version,
            "framesVerified": frame_count,
            "verification": "provider-redecode",
        },
    }, separators=(",", ":")), encoding="utf-8")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # provider boundary must return non-zero
        print(f"content protection provider failed: {error}", file=sys.stderr)
        raise SystemExit(1)
