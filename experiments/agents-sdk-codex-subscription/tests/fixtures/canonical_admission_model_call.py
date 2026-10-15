from __future__ import annotations

import asyncio
import json
import os
import sys
import time
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from codex_model import CodexSubscriptionModel
from durable_store import DurableRunStore
from model_admission import FdCanonicalModelAdmissionTransport

run_id = sys.argv[1]
evidence_root = Path(sys.argv[2])
row = types.SimpleNamespace(id="gpt-6-luna", description="Luna", is_default=False,
                            supported_reasoning_efforts=[types.SimpleNamespace(reasoning_effort="medium")])

class Codex:
    def __init__(self, *_args, **_kwargs): pass
    def __enter__(self): return self
    def __exit__(self, *_args): pass
    def models(self): return types.SimpleNamespace(data=[row])
    def thread_start(self, **_kwargs):
        attempt_path = store_dir / "mock-thread-start-attempt-count"
        attempts = int(attempt_path.read_text() if attempt_path.exists() else "0") + 1
        attempt_path.write_text(str(attempts))
        retry_after = os.environ.get("SPEC224_MOCK_PROVIDER_RETRY_AFTER_SECONDS")
        rejected_path = store_dir / "mock-provider-rejection-recorded"
        if retry_after and not rejected_path.exists():
            rejected_path.touch()
            raise MockCodexRateLimit(float(retry_after))
        if os.environ.get("SPEC224_MOCK_ACCEPTED_THREAD_RESPONSE_LOST"):
            (store_dir / "mock-provider-accepted-thread-with-lost-identity").touch()
            raise RuntimeError("mock provider accepted thread but response identity was lost")
        count_path = store_dir / "mock-thread-start-count"
        count = int(count_path.read_text() if count_path.exists() else "0") + 1
        count_path.write_text(str(count))
        return FakeThread()

class MockCodexRateLimit(Exception):
    status_code = 429
    def __init__(self, retry_after):
        self.response = types.SimpleNamespace(headers={"retry-after": str(retry_after)})
        super().__init__("mock Codex capacity reset")

class FakeThread:
    id = "mock-thread-e2e"
    def turn(self, *_args, **_kwargs): return FakeTurnHandle()

class FakeTurnHandle:
    id = "mock-turn-e2e"
    def run(self):
        return types.SimpleNamespace(status="completed", usage=types.SimpleNamespace(model_dump=lambda **_kw: {
            "inputTokens": 31, "cachedInputTokens": 4, "outputTokens": 9, "totalTokens": 40,
        }), final_response='{"action":"final","name":null,"arguments_json":"","text":"done"}',
            id=self.id, duration_ms=12, items=[], model="gpt-6-luna")

sys.modules["openai_codex"] = types.SimpleNamespace(Codex=Codex,
    CodexConfig=lambda **_kw: object(), ApprovalMode=types.SimpleNamespace(deny_all="deny_all"),
    Sandbox=types.SimpleNamespace(read_only="read_only"))
store_dir = evidence_root / run_id
store = DurableRunStore(store_dir, run_id=run_id,
    initial_state=None if (store_dir / "runtime.sqlite3").exists() else {"runId": run_id, "iterations": [], "status": "active"},
    resume=(store_dir / "runtime.sqlite3").exists())
receipts = []
admission = FdCanonicalModelAdmissionTransport(3)
pause_dir = os.environ.get("SPEC224_E2E_PAUSE_AFTER_RESERVE")
if pause_dir:
    original_reserve = admission.reserve
    def reserve_then_pause(request):
        result = original_reserve(request)
        pause = Path(pause_dir)
        pause.mkdir(parents=True, exist_ok=True)
        (pause / "reserved").touch()
        deadline = time.monotonic() + 15
        while not (pause / "continue").exists() and time.monotonic() < deadline:
            time.sleep(0.01)
        if not (pause / "continue").exists():
            raise RuntimeError("test dispatch barrier timed out")
        return result
    admission.reserve = reserve_then_pause
model = CodexSubscriptionModel(codex_cwd=ROOT, role="implementer", on_receipt=receipts.append,
    store=store, phase_id="implement:1", routing={"profile": "GENERAL"},
    admission=admission, admission_required=True)
try:
    asyncio.run(model.get_response(None, "authenticated fast lane acceptance", None, [], None, [], None,
        previous_response_id=None, conversation_id=None, prompt=None))
except BaseException:
    call = store.connection.execute("SELECT call_id FROM model_calls ORDER BY rowid DESC LIMIT 1").fetchone()
    if call:
        (store_dir / "mock-model-call-id").write_text(call["call_id"])
        ids_path = store_dir / "mock-model-call-ids.json"
        ids = json.loads(ids_path.read_text()) if ids_path.exists() else []
        if call["call_id"] not in ids:
            ids.append(call["call_id"])
        ids_path.write_text(json.dumps(ids))
    store.close()
    raise
call = store.connection.execute("SELECT call_id FROM model_calls ORDER BY rowid DESC LIMIT 1").fetchone()
if call:
    (store_dir / "mock-model-call-id").write_text(call["call_id"])
    ids_path = store_dir / "mock-model-call-ids.json"
    ids = json.loads(ids_path.read_text()) if ids_path.exists() else []
    if call["call_id"] not in ids:
        ids.append(call["call_id"])
    ids_path.write_text(json.dumps(ids))
store.state["status"] = "completed"
store.export()
store.close()
print(json.dumps({"runId": run_id, "result": "done"}))
