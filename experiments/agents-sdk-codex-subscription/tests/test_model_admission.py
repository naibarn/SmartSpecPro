from __future__ import annotations

import asyncio
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from codex_model import CodexSubscriptionModel
from durable_store import DurableRunStore
from model_admission import ModelAdmissionDenied, ModelAdmissionWait


class FakeAdmission:
    def __init__(self, decision=None):
        self.events = []
        self.decision = decision or {"kind": "reserved", "operationKey": "op-1"}

    def reserve(self, request):
        self.events.append(("reserve", request))
        return self.decision

    def dispatching(self, operation_key):
        self.events.append(("dispatch", operation_key))
        return {"kind": "marked"}

    def thread_created(self, operation_key, thread_id):
        self.events.append(("thread", operation_key, thread_id))
        return {"kind": "recorded"}

    def turn_started(self, operation_key, thread_id, turn_id):
        self.events.append(("turn", operation_key, thread_id, turn_id))
        return {"kind": "recorded"}

    def settle(self, operation_key, usage, *, reconcile=False):
        self.events.append(("settle", operation_key, usage, reconcile))
        return {"kind": "settled" if usage else "unknown"}

    def wait(self, operation_key, reason, next_eligible_at):
        self.events.append(("wait", operation_key, reason, next_eligible_at))


class ModelAdmissionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.run_id = "9e03f6bf-f60f-4f11-a4d5-a3d70f2cc402"
        self.store = DurableRunStore(Path(self.temp.name), run_id=self.run_id, initial_state={"runId": self.run_id, "iterations": []})
        self.addCleanup(self.store.close)
        self.addCleanup(self.temp.cleanup)

    @staticmethod
    def fake_sdk():
        row = types.SimpleNamespace(id="gpt-6-luna", description="Luna", is_default=False,
                                    supported_reasoning_efforts=[types.SimpleNamespace(reasoning_effort="medium")])
        class Codex:
            def __init__(self, *_args, **_kwargs): pass
            def __enter__(self): return self
            def __exit__(self, *_args): pass
            def models(self): return types.SimpleNamespace(data=[row])
        return types.SimpleNamespace(Codex=Codex)

    def test_model_caller_reserves_before_dispatch_and_settles_receipt(self):
        admission = FakeAdmission()
        model = CodexSubscriptionModel(codex_cwd=Path("/tmp"), role="implementer", on_receipt=lambda _r: None,
                                       store=self.store, phase_id="phase-1", routing={"profile": "GENERAL"}, admission=admission)
        def run_turn(*args, **kwargs):
            admission.events.append(("sdk_turn",))
            return json_final(), {"threadId": "thread-1", "turnId": "turn-1", "effectiveModel": "gpt-6-luna",
                                  "usage": {"last": {"inputTokens": 31, "cachedInputTokens": 4, "outputTokens": 9, "totalTokens": 40}}}
        model._run_codex_turn = run_turn
        with patch.dict(sys.modules, {"openai_codex": self.fake_sdk()}):
            asyncio.run(model.get_response(None, "hello", None, [], None, [], None,
                                           previous_response_id=None, conversation_id=None, prompt=None))
        names = [event[0] for event in admission.events]
        self.assertLess(names.index("reserve"), names.index("dispatch"))
        self.assertLess(names.index("dispatch"), names.index("sdk_turn"))
        self.assertLess(names.index("sdk_turn"), names.index("settle"))
        request = admission.events[0][1]
        self.assertEqual((request["requestedModel"], request["reasoningEffort"]), ("gpt-6-luna", "medium"))
        self.assertEqual(admission.events[-1][2]["cachedInputTokens"], 4)

    def test_budget_wait_is_durable_and_prevents_model_dispatch(self):
        decision = {"kind": "waiting_budget", "operationKey": "op-wait", "nextEligibleAt": "2026-10-15T13:00:00Z"}
        admission = FakeAdmission(decision)
        model = CodexSubscriptionModel(codex_cwd=Path("/tmp"), role="implementer", on_receipt=lambda _r: None,
                                       store=self.store, phase_id="phase-1", routing={"profile": "GENERAL"}, admission=admission)
        model._run_codex_turn = lambda *_a, **_k: self.fail("Codex must not dispatch while budget is full")
        with patch.dict(sys.modules, {"openai_codex": self.fake_sdk()}):
            with self.assertRaises(ModelAdmissionWait):
                asyncio.run(model.get_response(None, "hello", None, [], None, [], None,
                                               previous_response_id=None, conversation_id=None, prompt=None))
        self.assertEqual([event[0] for event in admission.events], ["reserve", "wait"])

    def test_developer_workunit_fails_closed_without_canonical_transport(self):
        model = CodexSubscriptionModel(codex_cwd=Path("/tmp"), role="implementer", on_receipt=lambda _r: None,
                                       store=self.store, phase_id="phase-1", admission_required=True)
        with self.assertRaisesRegex(ModelAdmissionDenied, "transport is unavailable"):
            asyncio.run(model.get_response(None, "hello", None, [], None, [], None,
                                           previous_response_id=None, conversation_id=None, prompt=None))


def json_final():
    return '{"action":"final","name":null,"arguments_json":"","text":"done"}'


if __name__ == "__main__":
    unittest.main()
