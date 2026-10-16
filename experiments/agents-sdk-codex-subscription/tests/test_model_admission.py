from __future__ import annotations

import asyncio
import json
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
                                  "usage": {"total": {"inputTokens": 31, "cachedInputTokens": 4, "outputTokens": 9, "totalTokens": 40}}}
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

    def model(self, admission, receipts=None):
        return CodexSubscriptionModel(
            codex_cwd=Path(self.temp.name), role="implementer", on_receipt=(receipts.append if receipts is not None else lambda _r: None),
            store=self.store, phase_id="phase-1", routing={"profile": "GENERAL"}, admission=admission,
        )

    @staticmethod
    def respond(model, text="hello"):
        return asyncio.run(model.get_response(None, text, None, [], None, [], None,
                                             previous_response_id=None, conversation_id=None, prompt=None))

    def turn_sdk(self, totals):
        """Run the real adapter dispatch/recovery path; only provider responses are mocked."""
        sdk = self.fake_sdk()
        turns, dispatches = [], []
        store = self.store
        class Thread:
            id = "thread-1"
            def read(self, **_kwargs):
                return types.SimpleNamespace(thread=types.SimpleNamespace(turns=turns))
            def turn(self, *_args, **_kwargs):
                row = store.connection.execute("SELECT * FROM model_calls ORDER BY rowid DESC LIMIT 1").fetchone()
                # Baseline must already be durable before provider acceptance.
                baseline = json.loads(row["usage_json"])["turnBaseline"]
                dispatches.append({"callId": row["call_id"], "baseline": baseline})
                turn_id = f"turn-{len(dispatches)}"
                usage = totals[len(dispatches) - 1]
                result = types.SimpleNamespace(id=turn_id, status="completed", items=[], duration_ms=1,
                                              final_response=json_final(), usage=types.SimpleNamespace(model_dump=lambda **_k: dict(usage)))
                turns.append(types.SimpleNamespace(id=turn_id, status="completed", usage=result.usage, items=[
                    types.SimpleNamespace(type="agentMessage", phase="finalAnswer", text=json_final())]))
                return types.SimpleNamespace(id=turn_id, run=lambda: result)
        thread = Thread()
        sdk.Codex.thread_start = lambda *_a, **_k: thread
        sdk.Codex.thread_resume = lambda *_a, **_k: thread
        sdk.CodexConfig = lambda **_k: object()
        sdk.ApprovalMode = types.SimpleNamespace(deny_all="deny_all")
        sdk.Sandbox = types.SimpleNamespace(read_only="read_only")
        return sdk, dispatches

    @staticmethod
    def full_usage():
        return {"last": {"inputTokens": 18510, "cachedInputTokens": 18176, "outputTokens": 59, "totalTokens": 18569},
                "total": {"inputTokens": 36933, "cachedInputTokens": 18176, "outputTokens": 122, "totalTokens": 37055}}

    def test_full_provider_turn_settles_37055_not_last_internal_response_18569(self):
        admission, receipts = FakeAdmission(), []
        sdk, dispatches = self.turn_sdk([self.full_usage()])
        with patch.dict(sys.modules, {"openai_codex": sdk}):
            result = self.respond(self.model(admission, receipts))
        settled = admission.events[-1][2]
        self.assertEqual((settled["inputTokens"], settled["cachedInputTokens"], settled["outputTokens"]), (36933, 18176, 122))
        self.assertEqual(result.usage.total_tokens, 37055)
        self.assertEqual(result.usage.input_tokens_details.cached_tokens, 18176)
        self.assertEqual(result.usage.input_tokens + result.usage.output_tokens, 37055)
        self.assertEqual((settled["threadId"], settled["turnId"]), ("thread-1", "turn-1"))
        self.assertEqual(dispatches[0]["baseline"]["kind"], "fresh_thread")
        self.assertEqual(receipts[0]["usage"]["last"]["totalTokens"], 18569)
        row = self.store.connection.execute("SELECT * FROM model_calls").fetchone()
        self.assertEqual(json.loads(row["usage_json"])["total"]["totalTokens"], 37055)

    def test_reused_thread_settles_only_new_turn_delta_and_replay_is_stable(self):
        usage2 = {"last": {"inputTokens": 90, "cachedInputTokens": 20, "outputTokens": 5},
                  "total": {"inputTokens": 37133, "cachedInputTokens": 18276, "outputTokens": 142, "totalTokens": 37275}}
        admission = FakeAdmission()
        sdk, dispatches = self.turn_sdk([self.full_usage(), usage2])
        model = self.model(admission)
        with patch.dict(sys.modules, {"openai_codex": sdk}):
            self.respond(model)
            result = self.respond(model, "next")
            receipt_before = self.store.connection.execute("SELECT receipt_json FROM model_calls ORDER BY rowid DESC LIMIT 1").fetchone()[0]
            settled_before = admission.events[-1][2]
            self.respond(model, "next")
        self.assertEqual(result.usage.total_tokens, 220)
        self.assertEqual((settled_before["inputTokens"], settled_before["cachedInputTokens"], settled_before["outputTokens"]), (200, 100, 20))
        self.assertEqual(dispatches[1]["baseline"]["priorTurnId"], "turn-1")
        self.assertEqual(len(dispatches), 2)
        self.assertEqual(admission.events[-1][2], settled_before)
        self.assertEqual(self.store.connection.execute("SELECT receipt_json FROM model_calls ORDER BY rowid DESC LIMIT 1").fetchone()[0], receipt_before)

    def test_missing_preceding_cumulative_baseline_is_unknown_not_last_usage(self):
        admission = FakeAdmission()
        sdk, dispatches = self.turn_sdk([self.full_usage(), self.full_usage()])
        with patch.dict(sys.modules, {"openai_codex": sdk}):
            model = self.model(admission)
            self.respond(model)
            # Legacy preceding receipts can lack totals. Do not invent a zero baseline.
            row = self.store.connection.execute("SELECT call_id FROM model_calls").fetchone()
            self.store.update_model_call(row[0], event="test.legacy_usage", stable_suffix="legacy", usage_json=json.dumps({"last": self.full_usage()["last"]}))
            self.respond(model, "next")
        self.assertIsNone(admission.events[-1][2])
        self.assertIsNone(dispatches[1]["baseline"])
        receipt = json.loads(self.store.connection.execute("SELECT receipt_json FROM model_calls ORDER BY rowid DESC LIMIT 1").fetchone()[0])
        self.assertEqual(receipt["usageState"], "unknown")

    def test_crash_after_receipt_before_settlement_reuses_persisted_usage_and_identity(self):
        admission = FakeAdmission()
        sdk, dispatches = self.turn_sdk([self.full_usage()])
        def crash(_store, boundary, _payload):
            if boundary == "model.after_receipt_persisted_before_settlement":
                raise RuntimeError("injected process interruption")
        with patch.dict(sys.modules, {"openai_codex": sdk}):
            with patch("codex_model._maybe_crash", side_effect=crash):
                with self.assertRaisesRegex(RuntimeError, "interruption"):
                    self.respond(self.model(admission))
            row_before = dict(self.store.connection.execute("SELECT * FROM model_calls").fetchone())
            admission.decision = {"kind": "reconcile_required", "operationKey": "op-1", "threadId": "thread-1", "turnId": "turn-1"}
            result = self.respond(self.model(admission))
        self.assertEqual(len(dispatches), 1)
        self.assertEqual(result.usage.total_tokens, 37055)
        self.assertEqual(admission.events[-1][2]["turnId"], row_before["turn_id"])
        self.assertTrue(admission.events[-1][3])
        self.assertEqual(dict(self.store.connection.execute("SELECT * FROM model_calls").fetchone()), row_before)

    def test_invalid_or_ambiguous_totals_remain_unknown(self):
        baseline = {"kind": "preceding_turn", "threadId": "thread-1", "priorTurnId": "turn-1",
                    "totals": {"inputTokens": 100, "cachedInputTokens": 40, "outputTokens": 10}}
        receipt = {"threadId": "thread-1", "turnId": "turn-2", "usageObservedAt": "2026-10-16T02:00:00Z",
                   "usage": {"turnBaseline": baseline, "total": {"inputTokens": 120, "cachedInputTokens": 50, "outputTokens": 15}}}
        self.assertEqual(CodexSubscriptionModel._usage_receipt(receipt)["inputTokens"], 20)
        for invalid in ({"inputTokens": 99, "cachedInputTokens": 50, "outputTokens": 15},
                        {"inputTokens": 120, "cachedInputTokens": 70, "outputTokens": 15},
                        {"inputTokens": 120.5, "cachedInputTokens": 50, "outputTokens": 15},
                        {"inputTokens": 120, "cachedInputTokens": 50, "outputTokens": 15, "totalTokens": 999}):
            with self.subTest(invalid=invalid):
                receipt["usage"]["total"] = invalid
                self.assertIsNone(CodexSubscriptionModel._usage_receipt(receipt))
        receipt["usage"] = {"last": self.full_usage()["last"]}
        self.assertIsNone(CodexSubscriptionModel._usage_receipt(receipt))

    def test_settlement_conflict_fails_closed_without_rewriting_receipt(self):
        admission = FakeAdmission()
        sdk, dispatches = self.turn_sdk([self.full_usage()])
        with patch.dict(sys.modules, {"openai_codex": sdk}):
            self.respond(self.model(admission))
            before = dict(self.store.connection.execute("SELECT * FROM model_calls").fetchone())
            admission.settle = lambda *_a, **_k: {"kind": "denied", "reason": "receipt_conflict"}
            with self.assertRaisesRegex(ModelAdmissionDenied, "accounting reconciliation required"):
                self.respond(self.model(admission))
        self.assertEqual(len(dispatches), 1)
        self.assertEqual(dict(self.store.connection.execute("SELECT * FROM model_calls").fetchone()), before)

    def test_provider_per_turn_breakdown_is_distinct_from_thread_cumulative_usage(self):
        receipt = {"threadId": "thread-1", "turnId": "turn-1", "usageObservedAt": "2026-10-16T02:00:00Z",
                   "usage": {"inputTokens": 31, "cachedInputTokens": 4, "outputTokens": 9, "totalTokens": 40}}
        self.assertEqual(CodexSubscriptionModel._usage_receipt(receipt)["inputTokens"], 31)
        # Cached input is already included: never subtract it to match an inconsistent total.
        receipt["usage"]["totalTokens"] = 36
        self.assertIsNone(CodexSubscriptionModel._usage_receipt(receipt))
        receipt["usage"] = {"last": {"inputTokens": 31, "cachedInputTokens": 4, "outputTokens": 9, "totalTokens": 40}}
        self.assertIsNone(CodexSubscriptionModel._usage_receipt(receipt))

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
