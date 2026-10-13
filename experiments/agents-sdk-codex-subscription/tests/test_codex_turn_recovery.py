import sys
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))
from codex_model import CodexSubscriptionModel


class CodexTurnRecoveryTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
