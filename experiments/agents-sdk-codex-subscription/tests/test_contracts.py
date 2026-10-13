import sys
import tempfile
import unittest
from pathlib import Path

from agents import function_tool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from codex_model import CodexSubscriptionModel, DISPATCH_SCHEMA, _select_thread_turn
from durable_store import DurableRunStore, canonical_json
from run_experiment import (
    attempt_is_terminal,
    ensure_inside,
    find_incomplete_attempt,
    has_verified_success,
    reconcile_completed_verifications,
)


class WorkspacePathTests(unittest.TestCase):
    def test_accepts_relative_workspace_file(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.assertEqual(ensure_inside(root, "src/app.mjs"), root / "src/app.mjs")

    def test_rejects_parent_absolute_and_git_paths(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for path in ("../escape", "/tmp/escape", ".git/config", "evidence/run-state.json"):
                with self.subTest(path=path), self.assertRaises((ValueError, PermissionError)):
                    ensure_inside(root, path)

    def test_rejects_symlink_escape(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "workspace"
            root.mkdir()
            outside = Path(temp) / "outside"
            outside.mkdir()
            (root / "out").symlink_to(outside, target_is_directory=True)
            with self.assertRaises(ValueError):
                ensure_inside(root, "out/secret.txt")


class ModelDispatchTests(unittest.TestCase):
    def test_turn_reconciliation_preserves_existing_binding_and_recovers_only_latest_unbound_turn(self):
        from types import SimpleNamespace

        first = SimpleNamespace(id="turn-1")
        latest = SimpleNamespace(id="turn-2")
        turns = [first, latest]
        self.assertIs(_select_thread_turn(turns, "turn-1"), first)
        self.assertIsNone(_select_thread_turn(turns, "missing"))
        self.assertIsNone(_select_thread_turn(turns, None))
        self.assertIs(_select_thread_turn(turns, None, recover_latest=True), latest)

    def test_dispatch_schema_uses_codex_supported_strict_json_shape(self):
        self.assertIn("properties", DISPATCH_SCHEMA)
        self.assertEqual(DISPATCH_SCHEMA["properties"]["arguments_json"]["type"], "string")
        self.assertFalse(DISPATCH_SCHEMA["additionalProperties"])

    def test_dispatch_creates_an_agents_sdk_function_call(self):
        def add(a: int, b: int) -> int:
            """Add two integers."""
            return a + b

        tool = function_tool(add)
        item = CodexSubscriptionModel._parse_dispatch(
            '{"action":"call_tool","name":"add","arguments_json":"{\\"a\\":17,\\"b\\":25}","text":null}',
            [tool],
            [],
            identity="stable-call-1",
        )
        self.assertEqual(item.type, "function_call")
        self.assertEqual(item.name, "add")
        self.assertEqual(item.arguments, '{"a": 17, "b": 25}')
        self.assertTrue(item.call_id)
        duplicate = CodexSubscriptionModel._parse_dispatch(
            '{"action":"call_tool","name":"add","arguments_json":"{\\"a\\":17,\\"b\\":25}","text":null}',
            [tool], [], identity="stable-call-1",
        )
        self.assertEqual(item.call_id, duplicate.call_id)
        self.assertEqual(item.id, duplicate.id)

    def test_dispatch_rejects_unregistered_tools(self):
        with self.assertRaisesRegex(ValueError, "unregistered"):
            CodexSubscriptionModel._parse_dispatch(
                '{"action":"call_tool","name":"delete_everything","arguments_json":"{}","text":null}',
                [],
                [],
            )

    def test_dispatch_recovers_bare_quotes_in_write_file_source_only(self):
        raw = r'{"relative_path":"index.html","content":"<style>body{font-family:system-ui,"Segoe UI",sans-serif}</style>\n<script>const digits=/\d+/</script>"}'
        recovered = CodexSubscriptionModel._recover_write_file_arguments("write_file", raw)
        self.assertEqual(recovered["relative_path"], "index.html")
        self.assertIn('"Segoe UI"', recovered["content"])
        self.assertIn(r"/\d+/", recovered["content"])
        with self.assertRaisesRegex(ValueError, "not valid JSON"):
            CodexSubscriptionModel._recover_write_file_arguments("run_browser_uat", '{"x":"bare " quote"}')


class RecoveryProjectionTests(unittest.TestCase):
    def test_accepted_review_without_verification_is_resumed(self):
        attempt = {"attempt": 2, "status": "implemented", "review": {"complete": True, "findings": []}}
        self.assertFalse(attempt_is_terminal(attempt))
        self.assertFalse(has_verified_success({"attempts": [attempt]}))

    def test_completed_verification_restores_success_without_new_attempt(self):
        attempt = {
            "attempt": 2, "status": "implemented",
            "review": {"complete": True, "findings": []},
            "verification": {"complete": True, "findings": [], "evidence": ["verified"]},
        }
        state = {"attempts": [attempt]}
        self.assertTrue(attempt_is_terminal(attempt))
        self.assertTrue(has_verified_success(state))

    def test_successful_review_attempt_is_reused_until_verifier_settles(self):
        attempt = {"attempt": 1, "status": "implemented", "review": {"complete": True, "findings": []}}
        self.assertIs(find_incomplete_attempt([attempt], 1), attempt)
        attempt["verification"] = {"complete": True, "findings": []}
        self.assertIsNone(find_incomplete_attempt([attempt], 1))

    def test_completed_verification_phase_is_reconciled_without_new_attempt(self):
        run_id = "12345678-1234-5678-1234-567812345678"
        goal = "Verify this app"
        acceptance = ["works"]
        attempt = {
            "attempt": 1,
            "status": "implemented",
            "sourceSnapshot": {"app.mjs": "source"},
            "postImplementChecks": {"exitCode": 0, "sourceSha256": "source-hash"},
            "postImplementBrowserUat": {"result": "PASS", "sourceSha256": "source-hash"},
            "review": {"complete": True, "findings": [], "evidence": ["receipts match"]},
        }
        state = {"runId": run_id, "status": "recovering", "attempts": [attempt]}
        payload = {
            "goal": goal,
            "acceptance": acceptance,
            "source_snapshot": attempt["sourceSnapshot"],
            "test_receipt": attempt["postImplementChecks"],
            "browser_receipt": attempt["postImplementBrowserUat"],
            "independent_review": attempt["review"],
        }
        with tempfile.TemporaryDirectory() as temp:
            store = DurableRunStore(Path(temp) / "evidence", run_id=run_id, initial_state=state)
            phase = store.start_phase(
                "verification", 1,
                {"input": canonical_json(payload), "maxTurns": 3}, 3,
            )
            store.complete_phase(phase["phase_id"], {
                "finalOutput": canonical_json({"complete": True, "findings": [], "evidence": ["verified"]}),
            })
            self.assertEqual(reconcile_completed_verifications(state, goal, acceptance, store), 1)
            self.assertTrue(has_verified_success(state))
            self.assertEqual(attempt["verification"]["evidence"], ["verified"])
            self.assertEqual(store.state["status"], "recovering")
            store.close()

    def test_completed_verification_is_not_reconciled_against_changed_evidence(self):
        run_id = "12345678-1234-5678-1234-567812345678"
        goal = "Verify this app"
        acceptance = ["works"]
        attempt = {
            "attempt": 1,
            "status": "implemented",
            "sourceSnapshot": {"app.mjs": "changed"},
            "postImplementChecks": {"exitCode": 0},
            "postImplementBrowserUat": {"result": "PASS"},
            "review": {"complete": True, "findings": []},
        }
        stored_payload = {
            "goal": goal,
            "acceptance": acceptance,
            "source_snapshot": {"app.mjs": "old"},
            "test_receipt": attempt["postImplementChecks"],
            "browser_receipt": attempt["postImplementBrowserUat"],
            "independent_review": attempt["review"],
        }
        state = {"runId": run_id, "status": "recovering", "attempts": [attempt]}
        with tempfile.TemporaryDirectory() as temp:
            store = DurableRunStore(Path(temp) / "evidence", run_id=run_id, initial_state=state)
            phase = store.start_phase(
                "verification", 1,
                {"input": canonical_json(stored_payload), "maxTurns": 3}, 3,
            )
            store.complete_phase(phase["phase_id"], {
                "finalOutput": canonical_json({"complete": True, "findings": [], "evidence": []}),
            })
            self.assertEqual(reconcile_completed_verifications(state, goal, acceptance, store), 0)
            self.assertNotIn("verification", attempt)
            store.close()


class BrowserHarnessContractTests(unittest.TestCase):
    def test_browser_assertions_target_accessible_result_contract(self):
        source = (Path(__file__).resolve().parents[1] / "harness" / "browser_uat.cjs").read_text()
        self.assertIn('#results li', source)
        self.assertIn('[id*="share"] li', source)
        self.assertIn('shareTextToCents', source)
        self.assertIn("fill('0.001')", source)
        self.assertIn('invalid_subcent_amount', source)
        self.assertIn('[role="alert"]:visible', source)
        self.assertNotIn("#results li strong", source)
        self.assertNotIn("#message", source)


if __name__ == "__main__":
    unittest.main()
