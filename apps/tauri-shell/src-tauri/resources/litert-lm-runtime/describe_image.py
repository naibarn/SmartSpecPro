#!/usr/bin/env python3

import argparse
import json
from pathlib import Path

import litert_lm


def _extract_text(payload) -> str:
    if isinstance(payload, str):
        return payload.strip()
    if not isinstance(payload, dict):
        return str(payload).strip()

    parts: list[str] = []
    for item in payload.get("content", []) or []:
        if isinstance(item, dict) and item.get("type") == "text":
            text = str(item.get("text") or "").strip()
            if text:
                parts.append(text)
    if parts:
        return "\n".join(parts).strip()

    channels = payload.get("channels", {}) or {}
    if isinstance(channels, dict):
        for channel_content in channels.values():
            text = str(channel_content or "").strip()
            if text:
                parts.append(text)
    return "\n".join(parts).strip()


def _candidate_messages(prompt: str, image_path: str):
    return [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image", "path": image_path},
            ],
        },
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image", "image_path": image_path},
            ],
        },
        {
            "role": "user",
            "content": [
                prompt,
                {"imageSource": image_path},
            ],
        },
    ]


def run(model_path: str, image_path: str, backend: str, prompt: str) -> str:
    backend_enum = litert_lm.Backend.GPU if backend.lower() == "gpu" else litert_lm.Backend.CPU
    last_error: Exception | None = None

    with litert_lm.Engine(
        model_path,
        backend=backend_enum,
        vision_backend=backend_enum,
    ) as engine:
        with engine.create_conversation() as conversation:
            for message in _candidate_messages(prompt, image_path):
                try:
                    response = conversation.send_message(message)
                    text = _extract_text(response)
                    if text:
                        return text
                except Exception as exc:  # pragma: no cover - fallback probing
                    last_error = exc

    if last_error is not None:
        raise last_error
    return ""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--image-path", required=True)
    parser.add_argument("--backend", default="cpu")
    parser.add_argument("--prompt", required=True)
    args = parser.parse_args()

    try:
        image_path = str(Path(args.image_path).expanduser().resolve())
        text = run(
            model_path=args.model_path,
            image_path=image_path,
            backend=args.backend,
            prompt=args.prompt.strip(),
        )
        print(json.dumps({"text": text}))
        return 0
    except Exception as exc:
        print(json.dumps({"text": "", "error": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
