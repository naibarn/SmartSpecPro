from __future__ import annotations

import asyncio
import json
import os
import sys
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
    def thread_start(self, **_kwargs): return FakeThread()

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
store = DurableRunStore(store_dir, run_id=run_id, initial_state={"runId": run_id, "iterations": [], "status": "completed"})
receipts = []
model = CodexSubscriptionModel(codex_cwd=ROOT, role="implementer", on_receipt=receipts.append,
    store=store, phase_id="implement:1", routing={"profile": "GENERAL"},
    admission=FdCanonicalModelAdmissionTransport(3), admission_required=True)
asyncio.run(model.get_response(None, "authenticated fast lane acceptance", None, [], None, [], None,
    previous_response_id=None, conversation_id=None, prompt=None))
store.state["status"] = "completed"
store.export()
store.close()
print(json.dumps({"runId": run_id, "result": "done"}))
