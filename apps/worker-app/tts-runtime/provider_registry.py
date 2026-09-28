"""Provider-neutral local TTS adapter registry for Feature 180.

Provider commands are operator-installed and selected only by a fixed
environment-variable allowlist. Job input cannot choose an executable or URL.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


PROVIDERS: dict[str, dict[str, Any]] = {
    "voxcpm2": {"model": "VoxCPM2", "command_env": "SMARTSPEC_TTS_VOXCPM2_COMMAND", "training_command_env": "SMARTSPEC_TTS_VOXCPM2_TRAIN_COMMAND", "modes": {"reference_clone", "transcript_clone", "trained_voice"}},
    "confucius4-tts": {"model": "Confucius4-TTS", "command_env": "SMARTSPEC_TTS_CONFUCIUS4_COMMAND", "training_command_env": "SMARTSPEC_TTS_CONFUCIUS4_TRAIN_COMMAND", "modes": {"reference_clone"}},
    "moss-tts": {"model": "MOSS-TTS", "command_env": "SMARTSPEC_TTS_MOSS_COMMAND", "training_command_env": "SMARTSPEC_TTS_MOSS_TRAIN_COMMAND", "modes": {"reference_clone"}},
}


def _fail(message: str) -> int:
    print(json.dumps({"status": "failed", "failureCode": "TTS_PROVIDER_UNAVAILABLE", "message": message}), file=sys.stderr)
    return 2


def run(request_path: Path, output_path: Path) -> int:
    try:
        request = json.loads(request_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return _fail(f"invalid provider request: {exc}")
    training = request.get("type") == "audio.voice_train"
    binding = request.get("voiceBinding") or {}
    recipe = request.get("recipe") or {}
    provider_id = str((recipe if training else binding).get("providerId") or "")
    model_id = str((recipe if training else binding).get("modelId") or "")
    mode = str(binding.get("mode") or "")
    manifest = PROVIDERS.get(provider_id)
    if not manifest or manifest["model"] != model_id:
        return _fail(f"unregistered local provider/model: {provider_id}/{model_id}")
    if not training and mode not in manifest["modes"]:
        return _fail(f"unsupported mode {mode} for {provider_id}")
    if not training and mode == "trained_voice":
        model_path = str(request.get("stagedTrainedModelPath") or "")
        model_snapshot = request.get("trainedVoiceModel") or {}
        if not model_path or not Path(model_path).is_file() or Path(model_path).stat().st_size <= 0:
            return _fail("promoted trained voice model artifact is not staged")
        if model_snapshot.get("status") != "promoted":
            return _fail("trained voice model is not promoted")
    command_env = manifest["training_command_env"] if training else manifest["command_env"]
    command = os.environ.get(command_env, "").strip()
    if not command:
        return _fail(f"{command_env} is not configured; no model execution was attempted")
    try:
        completed = subprocess.run(
            [command, str(output_path)],
            input=json.dumps(request, ensure_ascii=False).encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=max(1, int(request.get("executionPolicy", {}).get("maxRuntimeMs", 3_600_000) / 1000)),
        )
    except subprocess.TimeoutExpired:
        return _fail("provider command timed out")
    if completed.returncode != 0:
        return _fail(f"provider command failed with exit code {completed.returncode}")
    if not output_path.is_file() or output_path.stat().st_size <= 0:
        return _fail("provider command did not create a non-empty output artifact")
    print(json.dumps({"status": "completed", "providerId": provider_id, "modelId": model_id}))
    return 0


def main() -> int:
    if len(sys.argv) != 5 or sys.argv[1] != "--request" or sys.argv[3] != "--output":
        return _fail("usage: provider_registry.py --request REQUEST.json --output OUTPUT.wav")
    return run(Path(sys.argv[2]), Path(sys.argv[4]))


if __name__ == "__main__":
    raise SystemExit(main())
