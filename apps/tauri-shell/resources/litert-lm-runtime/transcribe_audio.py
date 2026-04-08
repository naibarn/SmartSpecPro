#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("GLOG_minloglevel", "3")

import litert_lm


DEFAULT_PROMPT = (
    "Transcribe the spoken audio faithfully. Return only the spoken words in the "
    "same language. Do not add commentary, labels, or explanations. If there is "
    "no intelligible speech, return an empty string."
)


def extract_text(value: object) -> str:
    if isinstance(value, str):
        return value.strip()

    if isinstance(value, dict):
        content = value.get("content")
        if isinstance(content, list):
            text_parts: list[str] = []
            for item in content:
                if (
                    isinstance(item, dict)
                    and item.get("type") == "text"
                    and isinstance(item.get("text"), str)
                ):
                    text_parts.append(item["text"].strip())
            if text_parts:
                return "".join(text_parts).strip()

        channels = value.get("channels")
        if isinstance(channels, dict):
            channel_text = [
                part.strip()
                for part in channels.values()
                if isinstance(part, str) and part.strip()
            ]
            if channel_text:
                return "\n".join(channel_text).strip()

        direct_text = value.get("text")
        if isinstance(direct_text, str):
            return direct_text.strip()

    return str(value).strip()


def transcribe_and_exit(model_path: Path, audio_path: Path, backend: str, prompt: str) -> "NoReturn":
    backend_enum = litert_lm.Backend.GPU if backend == "gpu" else litert_lm.Backend.CPU
    try:
        litert_lm.set_min_log_severity(litert_lm.LogSeverity.WARNING)
    except Exception:
        pass

    message = {
        "role": "user",
        "content": [
            {"type": "audio", "path": str(audio_path)},
            {"type": "text", "text": prompt},
        ],
    }

    with litert_lm.Engine(
        model_path=str(model_path),
        backend=backend_enum,
        audio_backend=backend_enum,
        input_prompt_as_hint=prompt,
    ) as engine:
        conversation = engine.create_conversation()
        response = conversation.send_message(message)
        emit_payload_and_exit({"text": extract_text(response)}, 0)


def emit_payload_and_exit(payload: dict[str, object], code: int) -> "NoReturn":
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.write("\n")
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(code)


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcribe audio with Gemma 4 LiteRT-LM.")
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--audio-path", required=True)
    parser.add_argument("--backend", choices=("cpu", "gpu"), default="cpu")
    parser.add_argument("--prompt", default=DEFAULT_PROMPT)
    args = parser.parse_args()

    model_path = Path(args.model_path).expanduser().resolve()
    audio_path = Path(args.audio_path).expanduser().resolve()

    if not model_path.is_file():
        emit_payload_and_exit({"text": "", "error": "model_path_missing"}, 2)
    if not audio_path.is_file():
        emit_payload_and_exit({"text": "", "error": "audio_path_missing"}, 2)

    try:
        transcribe_and_exit(
            model_path=model_path,
            audio_path=audio_path,
            backend=args.backend,
            prompt=args.prompt,
        )
    except Exception as exc:  # pragma: no cover - runtime-dependent
        emit_payload_and_exit({"text": "", "error": str(exc)}, 1)

    emit_payload_and_exit({"text": "", "error": "transcription_unexpected_fallthrough"}, 1)


if __name__ == "__main__":
    raise SystemExit(main())
