"""Test-only Codex SDK double for the authenticated Fast Lane process chain."""
from __future__ import annotations

import json
import os
import sys
import time
import types
import uuid
from pathlib import Path


state_dir = Path(os.environ["SPEC224_GOLDEN_STATE_DIR"])
state_dir.mkdir(parents=True, exist_ok=True)
real_time = time.time
clock_file = os.environ.get("SPEC224_GOLDEN_CLOCK_FILE")
if clock_file:
    def controlled_time():
        try:
            return float(Path(clock_file).read_text())
        except (OSError, ValueError):
            return real_time()
    time.time = controlled_time


def increment(name: str) -> int:
    path = state_dir / name
    try:
        count = int(path.read_text()) + 1
    except (OSError, ValueError):
        count = 1
    path.write_text(str(count))
    return count


class RateLimit(Exception):
    status_code = 429

    def __init__(self, seconds: int):
        self.response = types.SimpleNamespace(headers={"retry-after": str(seconds)})
        super().__init__("test Codex capacity reset")


class Result:
    def __init__(self, turn_id: str, text: str, model: str):
        self.id = turn_id
        self.status = "completed"
        self.items = []
        self.duration_ms = 1
        self.model = model
        self.usage = types.SimpleNamespace(model_dump=lambda **_kwargs: {
            "inputTokens": 19, "cachedInputTokens": 3, "outputTokens": 7, "totalTokens": 23,
        })
        self.final_response = text


def persisted_turn_path(thread_id: str) -> Path:
    return state_dir / f"thread-{thread_id}.json"


def read_persisted_turns(thread_id: str):
    try:
        return json.loads(persisted_turn_path(thread_id).read_text())
    except (OSError, json.JSONDecodeError):
        return []


class Turn:
    def __init__(self, model: str, thread_id: str, instruction: str):
        self.id = f"golden-turn-{uuid.uuid4()}"
        self.model = model
        self.thread_id = thread_id
        self.instruction = instruction
        self.text = self._response(instruction)
        self._persist()

    @staticmethod
    def _response(instruction: str) -> str:
        try:
            request = json.loads(instruction.split("Request JSON:\n", 1)[1])
            guidance = request.get("instructions", "")
        except (IndexError, json.JSONDecodeError):
            guidance = ""
        if "read-only planning phase" in guidance:
            final = {"task_instruction": "Verify the seeded behavior and run its focused test.", "acceptance": ["The focused test passes"]}
        elif "Independently inspect" in guidance:
            final = {"complete": True, "functionalReadyForUserTest": True, "findings": [], "evidence": ["focused test receipt"]}
        elif "Independently verify" in guidance:
            final = {"complete": True, "functionalReadyForUserTest": True, "findings": [], "evidence": ["review and focused test receipts"]}
        else:
            final = {"result": "Implementation phase completed within the authorized scope."}
        return json.dumps({"action": "final", "name": None, "arguments_json": "", "text": json.dumps(final)})

    def _persist(self):
        rows = read_persisted_turns(self.thread_id)
        usage = {"inputTokens": 19, "cachedInputTokens": 3, "outputTokens": 7, "totalTokens": 23}
        rows.append({"id": self.id, "status": "completed", "text": self.text, "usage": usage})
        persisted_turn_path(self.thread_id).write_text(json.dumps(rows))

    def run(self):
        return Result(self.id, self.text, self.model)


class Thread:
    def __init__(self, model: str):
        self.id = f"golden-thread-{uuid.uuid4()}"
        self.model = model

    def read(self, **_kwargs):
        turns = []
        for row in read_persisted_turns(self.id):
            item = types.SimpleNamespace(type="agentMessage", phase=types.SimpleNamespace(value="finalAnswer"), text=row["text"])
            turns.append(types.SimpleNamespace(id=row["id"], status=row["status"], items=[item], usage=types.SimpleNamespace(model_dump=lambda **_kwargs: row["usage"])))
        return types.SimpleNamespace(thread=types.SimpleNamespace(turns=turns))

    def turn(self, instruction, **kwargs):
        increment("turn-dispatch-count")
        return Turn(str(kwargs.get("model") or self.model), self.id, instruction)


class Codex:
    def __init__(self, *_args, **_kwargs):
        self.model = "gpt-6-luna"

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def models(self):
        row = types.SimpleNamespace(
            id=self.model, description="Luna", is_default=False,
            supported_reasoning_efforts=[types.SimpleNamespace(reasoning_effort="medium")],
        )
        return types.SimpleNamespace(data=[row])

    def thread_start(self, **_kwargs):
        if os.environ.get("SPEC224_GOLDEN_429_ONCE"):
            marker = state_dir / "provider-429-issued"
            if not marker.exists():
                marker.write_text(json.dumps({"atEpochSeconds": real_time()}))
                raise RateLimit(int(os.environ.get("SPEC224_GOLDEN_RETRY_AFTER_SECONDS", "259200")))
        return Thread(self.model)

    def thread_resume(self, thread_id, **_kwargs):
        thread = Thread(self.model)
        thread.id = str(thread_id)
        return thread


sys.modules["openai_codex"] = types.SimpleNamespace(
    Codex=Codex,
    CodexConfig=lambda **_kwargs: object(),
    ApprovalMode=types.SimpleNamespace(deny_all="deny_all"),
    Sandbox=types.SimpleNamespace(read_only="read_only"),
)
