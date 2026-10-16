import sys
import os
import subprocess
import types
import unittest
import uuid
from unittest.mock import patch

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))
from codex_model import CodexSubscriptionModel, _select_turn_after_baseline, compact_reused_thread_instruction


class CodexTurnRecoveryTests(unittest.TestCase):
    @staticmethod
    def instruction(input_items, tools=None):
        import json
        return (
            "adapter preamble\nRequest JSON:\n"
            + json.dumps({"instructions": "system", "input": input_items,
                          "tools": tools if tools is not None else [{"name": "tool", "description": "x" * 1000}],
                          "final_output_schema": None}, separators=(",", ":"))
        )

    def test_reordered_resume_recovers_original_bound_call_and_immutable_request(self):
        import json
        import tempfile
        from pathlib import Path
        from durable_store import DurableRunStore
        from codex_model import _model_call_for_instruction
        with tempfile.TemporaryDirectory() as temp, DurableRunStore(Path(temp), run_id=str(uuid.uuid4()), initial_state={"runId": str(uuid.uuid4())}) as store:
            original = self.instruction([{"role": "user", "content": "goal"}])
            prefix, body = original.split("Request JSON:\n", 1)
            restored = prefix + "Request JSON:\n" + json.dumps(json.loads(body), sort_keys=True)
            store.reserve_model_call("original", "phase", "planner", {"instruction": original})
            store.update_model_call("original", event="test.bound", stable_suffix="bound", status="thread_reused", thread_id="thread", prior_turn_id="prior-turn")
            store.reserve_model_call("old-reordered-duplicate", "phase", "planner", {"instruction": restored})
            identity, prior, _ = _model_call_for_instruction(store, "phase", "planner", restored, "replacement")
            self.assertEqual(identity, "original")
            self.assertEqual(json.loads(prior["request_json"])["instruction"], original)
            changed = self.instruction([{"role": "user", "content": "changed goal"}])
            self.assertEqual(_model_call_for_instruction(store, "phase", "planner", changed, "new-operation"), ("new-operation", None, None))
            self.assertEqual(store.connection.execute("SELECT COUNT(*) FROM model_calls").fetchone()[0], 2)
            store.update_model_call("old-reordered-duplicate", event="test.ambiguous", stable_suffix="bound", status="thread_started", thread_id="other-thread")
            from model_admission import ModelAdmissionDenied
            with self.assertRaisesRegex(ModelAdmissionDenied, "multiple provider-bound identities"):
                _model_call_for_instruction(store, "phase", "planner", restored, "replacement")

    def test_reused_thread_sends_only_new_input_when_persisted_history_is_an_exact_prefix(self):
        previous = [{"role": "user", "content": "goal"}, {"type": "function_call", "call_id": "1"}]
        current = previous + [{"type": "function_call_output", "call_id": "1", "output": "done"}]
        full, metrics = compact_reused_thread_instruction(self.instruction(current), self.instruction(previous))
        import json
        sent = json.loads(full.split("Request JSON:\n", 1)[1])
        self.assertEqual(sent["input"], current[-1:])
        self.assertTrue(metrics["applied"])
        self.assertGreater(metrics["originalInstructionBytes"], metrics["dispatchedInstructionBytes"])
        self.assertEqual(metrics["omittedInputItems"], 2)

    def test_reused_thread_keeps_full_history_when_prefix_or_tool_contract_changes(self):
        previous = [{"role": "user", "content": "goal"}, {"type": "function_call", "call_id": "1"}]
        changed = [{"role": "user", "content": "rewritten goal"}]
        full, mismatch = compact_reused_thread_instruction(self.instruction(changed), self.instruction(previous))
        self.assertEqual(full, self.instruction(changed))
        self.assertEqual(mismatch["reason"], "input_history_not_an_exact_prefix")
        current = previous + [{"type": "function_call_output", "call_id": "1", "output": "done"}]
        full, mismatch = compact_reused_thread_instruction(
            self.instruction(current, tools=[{"name": "changed"}]), self.instruction(previous),
        )
        self.assertEqual(full, self.instruction(current, tools=[{"name": "changed"}]))
        self.assertEqual(mismatch["reason"], "tools_changed")

    def test_mocked_codex_dispatch_records_and_uses_compacted_thread_input(self):
        import json
        from pathlib import Path

        previous_items = [{"role": "user", "content": "goal"}, {"type": "function_call", "call_id": "1"}]
        current_items = previous_items + [{"type": "function_call_output", "call_id": "1", "output": "tool completed"}]
        previous_instruction = self.instruction(previous_items)
        current_instruction = self.instruction(current_items)
        previous_call = {"instruction": previous_instruction}

        class Result:
            id = "turn-2"
            status = "completed"
            items = []
            duration_ms = 12
            usage = types.SimpleNamespace(model_dump=lambda **_kwargs: {"last": {"inputTokens": 10, "outputTokens": 2, "totalTokens": 12}})
            final_response = "done"

        class Thread:
            id = "thread"
            def __init__(self): self.sent = None
            def read(self, **_kwargs):
                baseline = types.SimpleNamespace(id="turn-1", status="completed", items=[])
                return types.SimpleNamespace(thread=types.SimpleNamespace(turns=[baseline]))
            def turn(self, instruction, **_kwargs):
                self.sent = instruction
                return types.SimpleNamespace(id="turn-2", run=lambda: Result())

        thread = Thread()
        class Codex:
            def __init__(self, *_args, **_kwargs): pass
            def __enter__(self): return self
            def __exit__(self, *_args): pass
            def thread_resume(self, *_args, **_kwargs): return thread

        class Store:
            connection = types.SimpleNamespace(execute=lambda *_args: types.SimpleNamespace(
                fetchone=lambda: {"request_json": json.dumps({"instruction": previous_call["instruction"]})}
            ))
            def __init__(self): self.updates = []
            def update_model_call(self, *_args, **kwargs): self.updates.append(kwargs)

        fake_sdk = types.SimpleNamespace(
            ApprovalMode=types.SimpleNamespace(deny_all="deny_all"),
            Codex=Codex, CodexConfig=lambda **_kwargs: object(),
            Sandbox=types.SimpleNamespace(read_only="read_only"),
        )
        store = Store()
        model = CodexSubscriptionModel.__new__(CodexSubscriptionModel)
        model.codex_cwd = Path("/tmp")
        model.store = store
        model.phase_id = "phase"
        model.role = "implementer"
        with patch.dict(sys.modules, {"openai_codex": fake_sdk}):
            _text, receipt = model._run_codex_turn(
                current_instruction, {}, "call-2",
                {"call_id": "call-2", "thread_id": "thread", "prior_turn_id": "turn-1",
                 "turn_id": None, "status": "thread_reused", "turn_attempt": 0},
            )
        sent = json.loads(thread.sent.split("Request JSON:\n", 1)[1])
        self.assertEqual(sent["input"], current_items[-1:])
        self.assertTrue(receipt["promptMetrics"]["applied"])

    def test_reused_thread_recovery_selects_only_turns_after_the_persisted_baseline(self):
        baseline = types.SimpleNamespace(id="turn-1")
        appended = types.SimpleNamespace(id="turn-2")
        self.assertIsNone(_select_turn_after_baseline([baseline], "turn-1"))
        self.assertIs(_select_turn_after_baseline([baseline, appended], "turn-1"), appended)
        with self.assertRaisesRegex(RuntimeError, "reuse boundary is missing"):
            _select_turn_after_baseline([baseline], "missing-turn")
        with self.assertRaisesRegex(RuntimeError, "multiple turns"):
            _select_turn_after_baseline([baseline, appended, types.SimpleNamespace(id="turn-3")], "turn-1")

    def test_reused_thread_crash_recovery_does_not_return_the_previous_turn(self):
        class FakeThread:
            id = "thread-1"

            def __init__(self):
                self.read_count = 0
                self.turn_calls = 0
                self.baseline = types.SimpleNamespace(
                    id="turn-1", status="completed", items=[types.SimpleNamespace(
                        type="agentMessage", phase=types.SimpleNamespace(value="finalAnswer"), text="old answer",
                    )],
                )
                self.current = types.SimpleNamespace(
                    id="turn-2", status="inProgress", items=[types.SimpleNamespace(
                        type="agentMessage", phase=types.SimpleNamespace(value="finalAnswer"), text="new answer",
                    )],
                )

            def read(self, include_turns=True):
                self.read_count += 1
                if self.read_count > 1:
                    self.current.status = "completed"
                return types.SimpleNamespace(thread=types.SimpleNamespace(turns=[self.baseline, self.current]))

            def turn(self, *_args, **_kwargs):
                self.turn_calls += 1
                raise AssertionError("recovery must not create a duplicate Codex turn")

        thread = FakeThread()

        class FakeCodex:
            def __init__(self, _config):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return None

            def thread_resume(self, *_args, **_kwargs):
                return thread

            def thread_start(self, *_args, **_kwargs):
                raise AssertionError("reused thread recovery must not start a new thread")

        fake_sdk = types.SimpleNamespace(
            ApprovalMode=types.SimpleNamespace(deny_all="deny_all"),
            Codex=FakeCodex,
            CodexConfig=lambda **_kwargs: object(),
            Sandbox=types.SimpleNamespace(read_only="read_only"),
        )

        class Store:
            run_id = "12345678-1234-5678-1234-567812345678"
            state = {}

            def __init__(self):
                self.updates = []

            def update_model_call(self, *args, **kwargs):
                self.updates.append((args, kwargs))

        store = Store()
        model = CodexSubscriptionModel.__new__(CodexSubscriptionModel)
        model.codex_cwd = __import__("pathlib").Path("/tmp")
        model.store = store
        with patch.dict(sys.modules, {"openai_codex": fake_sdk}), patch("time.sleep", return_value=None):
            text, receipt = model._run_codex_turn(
                "instruction", {}, "call-2",
                {"thread_id": thread.id, "prior_turn_id": "turn-1", "turn_id": None,
                 "status": "thread_reused", "turn_attempt": 0},
            )

        self.assertEqual(text, "new answer")
        self.assertEqual(receipt["turnId"], "turn-2")
        self.assertEqual(receipt["status"], "completed_reconciled")
        self.assertEqual(thread.turn_calls, 0)
        self.assertEqual(store.updates[0][1]["turn_id"], "turn-2")

    def test_unbound_active_turn_is_bound_polled_and_reused_without_starting_a_duplicate(self):
        class FakeThread:
            id = "thread-1"

            def __init__(self):
                self.read_count = 0
                self.turn_calls = 0

            def read(self, include_turns=True):
                self.read_count += 1
                status = "inProgress" if self.read_count == 1 else "completed"
                item = types.SimpleNamespace(
                    type="agentMessage", phase=types.SimpleNamespace(value="finalAnswer"), text='{"action":"final","text":"resumed"}'
                )
                turn = types.SimpleNamespace(id="turn-created-before-crash", status=status, items=[item])
                return types.SimpleNamespace(thread=types.SimpleNamespace(turns=[turn]))

            def turn(self, *_args, **_kwargs):
                self.turn_calls += 1
                raise AssertionError("recovery must not create a duplicate Codex turn")

        thread = FakeThread()

        class FakeCodex:
            def __init__(self, _config):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return None

            def thread_resume(self, *_args, **_kwargs):
                return thread

        fake_sdk = types.SimpleNamespace(
            ApprovalMode=types.SimpleNamespace(deny_all="deny_all"),
            Codex=FakeCodex,
            CodexConfig=lambda **_kwargs: object(),
            Sandbox=types.SimpleNamespace(read_only="read_only"),
        )

        class Store:
            def __init__(self):
                self.updates = []

            def update_model_call(self, *args, **kwargs):
                self.updates.append((args, kwargs))

        store = Store()
        model = CodexSubscriptionModel.__new__(CodexSubscriptionModel)
        model.codex_cwd = __import__("pathlib").Path("/tmp")
        model.store = store
        with patch.dict(sys.modules, {"openai_codex": fake_sdk}), patch("time.sleep", return_value=None):
            text, receipt = model._run_codex_turn(
                "instruction", {}, "call-1",
                {"thread_id": thread.id, "turn_id": None, "status": "thread_started", "turn_attempt": 0},
            )

        self.assertEqual(text, '{"action":"final","text":"resumed"}')
        self.assertEqual(receipt["turnId"], "turn-created-before-crash")
        self.assertEqual(receipt["status"], "completed_reconciled")
        self.assertEqual(thread.turn_calls, 0)
        self.assertEqual(len(store.updates), 1)
        self.assertEqual(store.updates[0][1]["turn_id"], "turn-created-before-crash")

    def test_real_process_kill_after_model_receipt_persistence_keeps_receipt_for_reconciliation(self):
        import json
        import tempfile
        from pathlib import Path
        from durable_store import DurableRunStore

        run_id = str(uuid.uuid4())
        call_id = str(uuid.uuid4())
        with tempfile.TemporaryDirectory() as temp:
            evidence = Path(temp)
            with DurableRunStore(evidence, run_id=run_id, initial_state={"runId": run_id, "status": "running"}) as store:
                phase = store.start_phase("implementation", 1, {"input": "mock"}, 1)
                store.reserve_model_call(call_id, phase["phase_id"], "implementer", {"instruction": "mock"})
                store.update_model_call(
                    call_id, event="model.call.completed", stable_suffix="completed", status="completed",
                    response_text='{"type":"message","text":"done"}',
                    receipt_json=json.dumps({"threadId": "thread-known", "turnId": "turn-known", "usage": {"inputTokens": 5, "outputTokens": 2}}),
                )
            script = (
                "import sys; from pathlib import Path; from durable_store import DurableRunStore; "
                "from codex_model import _maybe_crash; "
                "store=DurableRunStore(Path(sys.argv[1]), run_id=sys.argv[2], resume=True, count_restart=False); "
                "_maybe_crash(store, 'model.after_receipt_persisted_before_settlement', {'callId': sys.argv[3]})"
            )
            env = {**os.environ, "AUTONOMY_CRASH_AT": "model.after_receipt_persisted_before_settlement",
                   "PYTHONPATH": str(Path(__file__).resolve().parents[1])}
            killed = subprocess.run([sys.executable, "-c", script, str(evidence), run_id, call_id], env=env,
                                    capture_output=True, check=False)
            self.assertEqual(killed.returncode, -9, killed.stderr.decode("utf-8", errors="replace"))
            with DurableRunStore(evidence, run_id=run_id, resume=True, count_restart=False) as recovered:
                call = recovered.get_model_call(call_id)
                self.assertEqual(call["status"], "completed")
                self.assertIn("thread-known", call["receipt_json"])
                self.assertIn("turn-known", call["receipt_json"])
                events = [row[0] for row in recovered.connection.execute(
                    "SELECT kind FROM events WHERE kind='fault.injected'"
                ).fetchall()]
                self.assertEqual(events, ["fault.injected"])


if __name__ == "__main__":
    unittest.main()
