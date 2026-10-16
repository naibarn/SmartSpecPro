from __future__ import annotations

import asyncio
import json
import os
import signal
import subprocess
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import run_spec_workunit
from durable_store import DurableRunStore
from agents.exceptions import MaxTurnsExceeded


class FakeSession:
    def __init__(self, *_args, **_kwargs):
        pass

    def close(self):
        pass


class FakeState:
    def to_json(self):
        return {"run_id": "fake", "turns": []}


class PhaseProgressTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.evidence = Path(self.temp.name) / "evidence"
        self.run_id = str(uuid.uuid4())
        with DurableRunStore(self.evidence, run_id=self.run_id, initial_state={
            "runId": self.run_id, "status": "running", "iterations": [],
        }):
            pass

    def tearDown(self):
        self.temp.cleanup()

    def test_usage_summary_matches_full_turn_settlement_and_preserves_unknown(self):
        receipt = {"threadId": "thread", "turnId": "turn", "usageObservedAt": "2026-10-16T00:00:00Z",
            "usage": {"last": {"inputTokens": 18510, "cachedInputTokens": 18176, "outputTokens": 59},
                      "total": {"inputTokens": 36933, "cachedInputTokens": 18176, "outputTokens": 122},
                      "turnBaseline": {"kind": "fresh_thread", "totals": {"inputTokens": 0, "cachedInputTokens": 0, "outputTokens": 0}}}}
        summary = run_spec_workunit.subscription_usage_summary([receipt])
        self.assertEqual(summary["totalTokens"], 37055)
        self.assertEqual(summary["cachedInputTokens"], 18176)
        unknown = run_spec_workunit.subscription_usage_summary([receipt, {"usage": None}])
        self.assertIsNone(unknown["totalTokens"])
        self.assertEqual(unknown["observedKnownTotalTokens"], 37055)
        self.assertEqual(unknown["unknownUsageReceipts"], 1)

    def test_many_identical_stream_events_do_not_grow_checkpoint_history(self):
        store = DurableRunStore(self.evidence, run_id=self.run_id, resume=True, count_restart=False)

        class Stream:
            final_output = "done"
            last_response_id = "response-1"
            def to_state(self):
                return FakeState()
            async def stream_events(self):
                for _ in range(500):
                    await asyncio.sleep(0)
                    yield object()

        with patch.object(run_spec_workunit, "SQLiteSession", FakeSession), \
             patch.object(run_spec_workunit.Runner, "run_streamed", return_value=Stream()):
            result = run_spec_workunit.run_phase(store, "planning", 0, object(), "plan", 8)
        self.assertEqual(result.final_output, "done")
        phase = store.get_phase(store.phase_id("planning", 0))
        self.assertEqual(phase["checkpoint_revision"], 1)
        self.assertEqual(store.connection.execute(
            "SELECT COUNT(*) FROM events WHERE kind='agents.run_state.checkpointed'"
        ).fetchone()[0], 1)
        store.close()

    def test_model_activity_without_functional_progress_diagnoses_without_extending(self):
        store = DurableRunStore(self.evidence, run_id=self.run_id, resume=True, count_restart=False)
        calls = 0

        class Stream:
            def to_state(self):
                return FakeState()
            async def stream_events(self):
                nonlocal calls
                calls += 1
                if calls == 1:
                    phase_id = store.phase_id("planning", 0)
                    store.reserve_model_call("first-turn", phase_id, "planner", {"input": "first"})
                    store.update_model_call("first-turn", event="model.call.completed", stable_suffix="completed",
                                            status="completed", thread_id="thread", turn_id="turn-1")
                raise MaxTurnsExceeded("test boundary")
                yield  # pragma: no cover - make this an async generator

        with patch.object(run_spec_workunit, "SQLiteSession", FakeSession), \
             patch.object(run_spec_workunit.Runner, "run_streamed", side_effect=lambda *_a, **_kw: Stream()), \
             patch.object(run_spec_workunit.RunState, "from_json", new=AsyncMock(return_value="resumed")):
            with self.assertRaisesRegex(run_spec_workunit.NoProgressPhaseError, "Model responses alone"):
                run_spec_workunit.run_phase(store, "planning", 0, object(), "plan", 1)
        self.assertEqual(calls, 1)
        phase = store.get_phase(store.phase_id("planning", 0))
        self.assertEqual(phase["status"], "needs_replan")
        self.assertEqual(phase["no_progress_segments"], 1)
        self.assertEqual(store.connection.execute(
            "SELECT COUNT(*) FROM events WHERE kind='phase.turn_limit_continued'"
        ).fetchone()[0], 0)
        self.assertEqual(store.connection.execute(
            "SELECT COUNT(*) FROM events WHERE kind='phase.no_progress_diagnosed'"
        ).fetchone()[0], 1)
        store.close()

    def test_max_turns_can_continue_after_a_tool_receipt_makes_functional_progress(self):
        store = DurableRunStore(self.evidence, run_id=self.run_id, resume=True, count_restart=False)
        phase_id = store.phase_id("planning", 0)
        calls = 0

        class InterruptedStream:
            def to_state(self):
                return FakeState()
            async def stream_events(self):
                nonlocal calls
                calls += 1
                store.begin_tool("planning-tool", phase_id, "write_file", {"path": "plan.md"})
                store.complete_tool("planning-tool", {"written": True}, effect_hash="plan-revised")
                raise MaxTurnsExceeded("functional progress happened")
                yield  # pragma: no cover - make this an async generator

        class CompletedStream:
            final_output = "done"
            last_response_id = "response-2"
            def to_state(self):
                return FakeState()
            async def stream_events(self):
                nonlocal calls
                calls += 1
                yield object()

        with patch.object(run_spec_workunit, "SQLiteSession", FakeSession), \
             patch.object(run_spec_workunit.Runner, "run_streamed", side_effect=[InterruptedStream(), CompletedStream()]), \
             patch.object(run_spec_workunit.RunState, "from_json", new=AsyncMock(return_value="resumed")):
            result = run_spec_workunit.run_phase(store, "planning", 0, object(), "plan", 1)
        self.assertEqual(result.final_output, "done")
        self.assertEqual(calls, 2)
        self.assertEqual(store.connection.execute(
            "SELECT COUNT(*) FROM events WHERE kind='phase.turn_limit_continued'"
        ).fetchone()[0], 1)
        store.close()

    def test_long_running_stream_is_not_stalled_by_elapsed_time(self):
        store = DurableRunStore(self.evidence, run_id=self.run_id, resume=True, count_restart=False)

        class Stream:
            final_output = "completed after wait"
            last_response_id = "response-long"
            def to_state(self):
                return FakeState()
            async def stream_events(self):
                await asyncio.sleep(0.02)
                yield object()

        with patch.object(run_spec_workunit, "SQLiteSession", FakeSession), \
             patch.object(run_spec_workunit.Runner, "run_streamed", return_value=Stream()):
            result = run_spec_workunit.run_phase(store, "planning", 0, object(), "plan", 1)
        self.assertEqual(result.final_output, "completed after wait")
        self.assertEqual(store.get_phase(store.phase_id("planning", 0))["status"], "completed")
        store.close()


class InjectedProcessCrash(BaseException):
    pass


class BoundedPhaseTests(unittest.TestCase):
    tearDown = PhaseProgressTests.tearDown
    def open_bounded(self, plan=2, implementation=4, review=2, attempts=2, digest="scope-original"):
        store = DurableRunStore(self.evidence, run_id=self.run_id, resume=True, count_restart=False)
        store.validated_workunit_contract = SimpleNamespace(
            raw={"schema": "agents-sdk-developer-workunit-contract.v1", "budget": {"maxAttempts": attempts}},
            plan_max_turns=plan, implementation_max_turns=implementation, review_max_turns=review, digest=digest,
        )
        return store

    def invoke(self, store, phase, attempt=0, *, turns=1, exceed=False, crash=None, progress=False):
        """SDK-boundary fixture: a persisted model receipt is replayed, never redispatched."""
        phase_id = store.phase_id(phase, attempt)
        test = self

        async def restore(_agent, state):
            return state

        def runner(_agent, content, **options):
            cursor = content.get("current_turn", 0) if isinstance(content, dict) else 0
            class Stream:
                current_turn = cursor
                final_output = "done"
                last_response_id = "response-bounded"
                def to_state(self):
                    return SimpleNamespace(to_json=lambda: {"current_turn": self.current_turn, "max_turns": options["max_turns"]})
                async def stream_events(self):
                    for _ in range(turns):
                        self.current_turn += 1
                        if self.current_turn > options["max_turns"]:
                            raise MaxTurnsExceeded("SDK rejected next undispatched turn")
                        await options["hooks"].on_llm_start(None, None, None, [])
                        call_id = f"{phase_id}:model:{self.current_turn}"
                        prior = store.connection.execute("SELECT status FROM model_calls WHERE call_id=?", (call_id,)).fetchone()
                        if prior is None:
                            test.dispatches.append(call_id)
                            store.reserve_model_call(call_id, phase_id, "bounded-test", {"sdkTurn": self.current_turn})
                            store.update_model_call(call_id, event="model.call.completed", stable_suffix="completed", status="completed",
                                                    thread_id=f"thread:{phase_id}", turn_id=f"turn:{self.current_turn}")
                        if progress:
                            operation = f"tool:{call_id}"
                            store.begin_tool(operation, phase_id, "write_file", {"path": "source.py"})
                            store.complete_tool(operation, {"written": True}, effect_hash="source-preserved")
                        if crash == "kill_before_checkpoint":
                            os.kill(os.getpid(), signal.SIGKILL)
                        if crash == "before_checkpoint":
                            raise InjectedProcessCrash()
                        yield object()
                        if crash == "after_checkpoint":
                            raise InjectedProcessCrash()
                    if exceed:
                        self.current_turn += 1
                        raise MaxTurnsExceeded("SDK boundary with no next model dispatch")
            return Stream()

        with patch.object(run_spec_workunit, "SQLiteSession", FakeSession), \
             patch.object(run_spec_workunit.Runner, "run_streamed", side_effect=runner) as dispatch, \
             patch.object(run_spec_workunit.RunState, "from_json", new=restore):
            result = run_spec_workunit.run_phase(store, phase, attempt, object(), "unchanged prompt", 999)
        return result, dispatch

    def setUp(self):
        PhaseProgressTests.setUp(self)
        self.dispatches = []

    def test_exact_boundary_with_tool_progress_parks_without_expansion(self):
        with self.open_bounded(plan=2) as store:
            with self.assertRaises(SystemExit) as stopped:
                self.invoke(store, "planning", turns=2, exceed=True, progress=True)
            self.assertEqual(stopped.exception.code, 75)
            self.assertEqual(len(self.dispatches), 2)
            self.assertEqual(store.state["status"], "WAITING_AUTHORIZATION")
            phase = store.get_phase(store.phase_id("planning"))
            self.assertEqual(json.loads(phase["checkpoint_json"]), {"current_turn": 3, "max_turns": 2})
            self.assertEqual(store.connection.execute("SELECT COUNT(*) FROM tool_receipts WHERE status='completed'").fetchone()[0], 2)
            self.assertEqual(store.connection.execute("SELECT COUNT(*) FROM events WHERE kind='phase.turn_limit_continued'").fetchone()[0], 0)

    def test_crash_before_checkpoint_reconciles_same_completed_turn_at_exact_cap(self):
        with self.open_bounded(plan=1) as store:
            with self.assertRaises(InjectedProcessCrash):
                self.invoke(store, "planning", crash="before_checkpoint", progress=True)
        with self.open_bounded(plan=1) as store:
            result, _ = self.invoke(store, "planning", progress=True)
            self.assertEqual(result.final_output, "done")
            self.assertEqual(len(self.dispatches), 1)
            self.assertEqual(run_spec_workunit.bounded_fast_lane_turns(store).counts()[store.phase_id("planning")], 1)
            self.assertEqual(store.connection.execute("SELECT COUNT(*) FROM tool_receipts").fetchone()[0], 1)

    def test_real_sigkill_retains_allowance_model_identity_and_tool_receipt(self):
        script = """
from pathlib import Path
from test_phase_progress import BoundedPhaseTests
import sys
fixture = BoundedPhaseTests()
fixture.evidence, fixture.run_id, fixture.dispatches = Path(sys.argv[1]), sys.argv[2], []
with fixture.open_bounded(plan=1) as store:
    fixture.invoke(store, "planning", crash="kill_before_checkpoint", progress=True)
"""
        environment = dict(os.environ, PYTHONPATH=os.pathsep.join([str(Path(__file__).parent), str(Path(__file__).parents[1])]))
        killed = subprocess.run([sys.executable, "-c", script, str(self.evidence), self.run_id], env=environment,
                                capture_output=True, text=True, timeout=20)
        self.assertEqual(killed.returncode, -signal.SIGKILL, killed.stderr)
        with self.open_bounded(plan=1) as store:
            call = store.connection.execute("SELECT call_id,thread_id,turn_id FROM model_calls").fetchone()
            self.assertIsNotNone(call)
            result, _ = self.invoke(store, "planning", progress=True)
            self.assertEqual(result.final_output, "done")
            self.assertEqual(self.dispatches, [])
            self.assertEqual(tuple(store.connection.execute("SELECT call_id,thread_id,turn_id FROM model_calls").fetchone()), tuple(call))
            self.assertEqual(store.connection.execute("SELECT COUNT(*) FROM tool_receipts").fetchone()[0], 1)
            self.assertEqual(run_spec_workunit.bounded_fast_lane_turns(store).counts()[store.phase_id("planning")], 1)

    def test_crash_after_checkpoint_keeps_consumption_and_resumes_remaining_turn(self):
        with self.open_bounded(plan=2) as store:
            with self.assertRaises(InjectedProcessCrash):
                self.invoke(store, "planning", crash="after_checkpoint")
        with self.open_bounded(plan=2) as store:
            result, _ = self.invoke(store, "planning")
            self.assertEqual(result.final_output, "done")
            self.assertEqual(len(self.dispatches), 2)
            result, dispatch = self.invoke(store, "planning")
            dispatch.assert_not_called()
            self.assertEqual(len(self.dispatches), 2)

    def test_restart_fencing_and_scope_renewal_do_not_reset_aggregate_allowance(self):
        with self.open_bounded(plan=1) as store:
            self.invoke(store, "planning")
        with self.open_bounded(plan=1, digest="renewed-expiry-new-fencing") as store:
            store.state["canonicalJobBinding"] = {"attemptId": "new-attempt", "fencingVersion": 2}
            with self.assertRaises(SystemExit):
                self.invoke(store, "planning-1")
            self.assertEqual(len(self.dispatches), 1)
            self.assertEqual(store.state["status"], "WAITING_AUTHORIZATION")

    def test_planning_replanning_and_fresh_planning_names_share_the_approved_limit(self):
        with self.open_bounded(plan=2) as store:
            self.invoke(store, "planning")
            self.invoke(store, "replanning", 2)
            with self.assertRaises(SystemExit):
                self.invoke(store, "planning-1")
            self.assertEqual(len(self.dispatches), 2)

    def test_review_and_independent_verification_share_aggregate_allowance(self):
        with self.open_bounded(review=2) as store:
            self.invoke(store, "review", 1)
            self.invoke(store, "verification", 1)
            with self.assertRaises(SystemExit):
                self.invoke(store, "review", 2)
            self.assertEqual(len(self.dispatches), 2)

    def test_repair_attempts_share_implementation_allowance(self):
        with self.open_bounded(implementation=2) as store:
            self.invoke(store, "implementation", 1)
            self.invoke(store, "implementation", 2)
            with self.assertRaises(SystemExit):
                self.invoke(store, "implementation", 3)
            self.assertEqual(len(self.dispatches), 2)

    def test_attempt_authorization_is_distinct_from_turn_token_and_canonical_retry_budgets(self):
        with self.open_bounded(implementation=4, attempts=1) as store:
            self.invoke(store, "implementation", 1)
            with self.assertRaises(SystemExit):
                self.invoke(store, "implementation", 2)
            self.assertEqual(len(self.dispatches), 1)

    def test_validated_additional_allowance_resumes_checkpoint_without_replaying_completed_turns(self):
        with self.open_bounded(plan=2) as store:
            with self.assertRaises(SystemExit):
                self.invoke(store, "planning", turns=2, exceed=True)
            original = store.get_phase(store.phase_id("planning"))["checkpoint_json"]
        with self.open_bounded(plan=3, digest="new-explicit-scoped-budget") as store:
            result, _ = self.invoke(store, "planning")
            self.assertEqual(result.final_output, "done")
            self.assertEqual(len(self.dispatches), 3)
            self.assertEqual(json.loads(original), {"current_turn": 3, "max_turns": 2})
            self.assertEqual(store.connection.execute("SELECT COUNT(*) FROM model_calls").fetchone()[0], 3)

    def test_supervisor_returns_bounded_authorization_wait_without_local_retry(self):
        import supervise_run
        workspace = self.evidence.parent / "workspace"
        workspace.mkdir()
        contract = self.evidence.parent / "contract.json"
        contract.write_text("{}")
        with DurableRunStore(self.evidence, run_id=self.run_id, resume=True, count_restart=False) as store:
            store.state.update(status="running")
            store.commit_state()
        def stopped(command, **_kwargs):
            with DurableRunStore(self.evidence, run_id=self.run_id, resume=True, count_restart=False) as store:
                store.state.update(status="WAITING_AUTHORIZATION", boundedTurnBudgetExhausted={"phase": "verification"})
                store.commit_state()
            return subprocess.CompletedProcess(command, 75, "", "")
        with patch.object(supervise_run.subprocess, "run", side_effect=stopped) as execute, \
             patch.object(supervise_run.time, "sleep") as sleep:
            code = supervise_run.main(["--workspace", str(workspace), "--spec-contract", str(contract),
                                       "--evidence-dir", str(self.evidence), "--run-id", self.run_id])
        self.assertEqual(code, 75)
        self.assertEqual(execute.call_count, 1)
        sleep.assert_not_called()
        recovery = json.loads((self.evidence / "recovery-receipt.json").read_text())
        self.assertEqual(recovery["supervisorResult"], "DEFERRED_BOUNDED_AUTHORIZATION")
        self.assertEqual(recovery["continuationProcessCount"], 0)

    def test_real_agents_sdk_enforces_boundary_and_resumes_with_new_validated_allowance(self):
        from agents import Agent, function_tool, set_tracing_disabled
        from codex_model import CodexSubscriptionModel
        set_tracing_disabled(True)
        provider_calls = []
        effects = []
        catalog = SimpleNamespace(data=[SimpleNamespace(id="gpt-6-luna", description="Luna", is_default=True,
            supported_reasoning_efforts=[SimpleNamespace(reasoning_effort="medium")])])
        class MockCodex:
            def __enter__(self): return self
            def __exit__(self, *_args): pass
            def models(self): return catalog

        def build_agent(store):
            @function_tool
            def progress() -> str:
                """Record the test's one permitted tool effect."""
                if not effects:
                    effects.append("one-effect")
                return "recorded"
            model = CodexSubscriptionModel(codex_cwd=self.evidence, role="planner", on_receipt=lambda _r: None,
                store=store, phase_id=store.phase_id("planning"), routing={"profile": "GENERAL"})
            def respond(*_args, **_kwargs):
                provider_calls.append(len(provider_calls) + 1)
                action = {"action": "call_tool", "name": "progress", "arguments_json": "{}", "text": None} if len(provider_calls) == 1 else {"action": "final", "name": None, "arguments_json": "", "text": "done"}
                return json.dumps(action), {"threadId": "sdk-mock-thread", "turnId": f"sdk-mock-turn-{len(provider_calls)}",
                    "usage": {"inputTokens": 3, "cachedInputTokens": 1, "outputTokens": 1, "totalTokens": 4}}
            model._run_codex_turn = respond
            return Agent(name="Bounded SDK test", instructions="Use the permitted tool then finish.", model=model, tools=[progress])

        with patch.dict(sys.modules, {"openai_codex": SimpleNamespace(Codex=MockCodex)}):
            with self.open_bounded(plan=1) as store:
                with self.assertRaises(SystemExit) as stopped:
                    run_spec_workunit.run_phase(store, "planning", 0, build_agent(store), "plan", 1)
                self.assertEqual(stopped.exception.code, 75)
                self.assertEqual(provider_calls, [1])
                self.assertEqual(effects, ["one-effect"])
                checkpoint = json.loads(store.get_phase(store.phase_id("planning"))["checkpoint_json"])
                self.assertEqual((checkpoint["current_turn"], checkpoint["max_turns"]), (2, 1))
            with self.open_bounded(plan=2, digest="validated-additional-sdk-turn") as store:
                result = run_spec_workunit.run_phase(store, "planning", 0, build_agent(store), "ignored on resume", 2)
                self.assertEqual(result.final_output, "done")
                self.assertEqual(provider_calls, [1, 2])
                self.assertEqual(effects, ["one-effect"])
                self.assertEqual(store.connection.execute("SELECT COUNT(*) FROM model_calls").fetchone()[0], 2)

    def test_scoped_server_budget_continuation_preserves_consumption_and_original_budget(self):
        from datetime import datetime, timezone
        with self.open_bounded(plan=1) as store:
            self.invoke(store, "planning")
        with self.open_bounded(plan=1) as store:
            raw = store.validated_workunit_contract.raw
            raw.update(canonicalJobBinding={"jobId": "job", "runId": self.run_id, "tenantId": "tenant", "actorId": 1},
                       workspaceId="workspace", sourceRevision="a" * 40, originalAuthorizationReceiptSha256="receipt",
                       scopeExpiresAt=run_spec_workunit.time.time() + 300)
            authorization = {**raw["canonicalJobBinding"], "workspaceId": "workspace", "sourceRevision": "a" * 40,
                "originalAuthorizationReceiptSha256": "receipt", "authorizationReference": "owner-grant",
                "expiresAt": datetime.fromtimestamp(raw["scopeExpiresAt"] + 1, timezone.utc).isoformat(),
                "budget": {"planMaxTurns": 2, "implementationMaxTurns": 4, "reviewMaxTurns": 2, "maxAttempts": 2}}
            raw["continuationBudgetAuthorization"] = authorization
            store.validated_workunit_contract.digest = "new-server-issued-turn-grant"
            limits = run_spec_workunit.bounded_fast_lane_turns(store)
            self.assertEqual(limits.allowance("planning", 0), (2, 1, 1))
            self.assertEqual(raw["budget"], {"maxAttempts": 2})
            for changed in ({**authorization, "jobId": "other-job"}, {**authorization, "expiresAt": "2000-01-01T00:00:00Z"}):
                raw["continuationBudgetAuthorization"] = changed
                with self.assertRaises(run_spec_workunit.BoundedTurnBudgetExceeded):
                    run_spec_workunit.bounded_fast_lane_turns(store)

    def test_real_sdk_capacity_wait_before_first_response_preserves_first_credit(self):
        from agents import Agent, set_tracing_disabled
        from codex_model import CodexSubscriptionModel
        from test_model_admission import FakeAdmission, ModelAdmissionTests
        set_tracing_disabled(True)
        admission = FakeAdmission({"kind": "waiting_capacity", "operationKey": "first", "nextEligibleAt": "2030-01-01T00:00:00Z"})
        dispatches = []
        def agent(store):
            model = CodexSubscriptionModel(codex_cwd=self.evidence, role="planner", on_receipt=lambda _r: None,
                store=store, phase_id=store.phase_id("planning"), routing={"profile": "GENERAL"}, admission=admission)
            def respond(*_args, **_kwargs):
                dispatches.append("turn-1")
                return json.dumps({"action": "final", "name": None, "arguments_json": "", "text": "done"}), {
                    "threadId": "thread", "turnId": "turn-1", "usage": {"total": {"inputTokens": 3, "cachedInputTokens": 0, "outputTokens": 1}}}
            model._run_codex_turn = respond
            return Agent(name="First pending SDK", instructions="Finish.", model=model)
        with patch.dict(sys.modules, {"openai_codex": ModelAdmissionTests.fake_sdk()}):
            store = self.open_bounded(plan=1)
            with self.assertRaises(SystemExit):
                run_spec_workunit.run_phase(store, "planning", 0, agent(store), "plan", 1)
            self.assertEqual(dispatches, [])
            admission.decision = {"kind": "reserved", "operationKey": "first"}
            with self.open_bounded(plan=1) as store:
                result = run_spec_workunit.run_phase(store, "planning", 0, agent(store), "ignored", 1)
                self.assertEqual(result.final_output, "done")
                self.assertEqual(dispatches, ["turn-1"])
                self.assertEqual(run_spec_workunit.bounded_fast_lane_turns(store).counts()[store.phase_id("planning")], 1)

    def test_real_sdk_budget_wait_resumes_pending_turn_at_exact_cap_with_same_identity(self):
        from agents import Agent, function_tool, set_tracing_disabled
        from codex_model import CodexSubscriptionModel
        from test_model_admission import FakeAdmission, ModelAdmissionTests
        set_tracing_disabled(True)
        effects, dispatches, reserved = [], [], []
        class Admission(FakeAdmission):
            def reserve(self, request):
                reserved.append(request["modelCallId"])
                if len(reserved) == 2:
                    return {"kind": "waiting_budget", "operationKey": "pending", "nextEligibleAt": "2030-01-01T00:00:00Z"}
                return super().reserve(request)
        admission = Admission()
        def build_agent(store):
            @function_tool
            def progress() -> str:
                """Record the permitted effect."""
                effects.append("one")
                return "done"
            model = CodexSubscriptionModel(codex_cwd=self.evidence, role="planner", on_receipt=lambda _r: None,
                store=store, phase_id=store.phase_id("planning"), routing={"profile": "GENERAL"}, admission=admission)
            def respond(_instruction, _schema, call_id, *_args, **_kwargs):
                dispatches.append(call_id)
                action = {"action": "call_tool", "name": "progress", "arguments_json": "{}", "text": None} if len(dispatches) == 1 else {"action": "final", "name": None, "arguments_json": "", "text": "done"}
                return json.dumps(action), {"threadId": "thread", "turnId": f"turn-{len(dispatches)}",
                    "usage": {"total": {"inputTokens": 3 * len(dispatches), "cachedInputTokens": 0, "outputTokens": len(dispatches)}}}
            model._run_codex_turn = respond
            return Agent(name="Pending SDK test", instructions="Use the tool then finish.", model=model, tools=[progress])
        with patch.dict(sys.modules, {"openai_codex": ModelAdmissionTests.fake_sdk()}):
            store = self.open_bounded(plan=2)
            with self.assertRaises(SystemExit) as stopped:
                run_spec_workunit.run_phase(store, "planning", 0, build_agent(store), "plan", 2)
            self.assertEqual(stopped.exception.code, 75)
            self.assertEqual(effects, ["one"])
            with self.open_bounded(plan=2) as store:
                result = run_spec_workunit.run_phase(store, "planning", 0, build_agent(store), "ignored", 2)
                self.assertEqual(result.final_output, "done")
                self.assertEqual(effects, ["one"])
                self.assertEqual(len(dispatches), 2)
                self.assertEqual(reserved[1], reserved[2])
                self.assertEqual(run_spec_workunit.bounded_fast_lane_turns(store).counts()[store.phase_id("planning")], 2)
                self.assertEqual(store.connection.execute("SELECT COUNT(*) FROM model_calls").fetchone()[0], 2)

    def test_unknown_legacy_sdk_consumption_never_becomes_free_allowance(self):
        with self.open_bounded() as store:
            phase = store.start_phase("planning", 0, {"input": "old prompt", "maxTurns": 2}, 2)
            store.reserve_model_call("legacy-unknown-call", phase["phase_id"], "planner", {"input": "unknown"})
            with self.assertRaises(SystemExit):
                self.invoke(store, "planning")
            self.assertEqual(self.dispatches, [])
            self.assertIn("reconciliation", store.state["boundedTurnBudgetExhausted"]["detail"])

    def test_invalid_legacy_cursor_is_not_zeroed(self):
        with self.open_bounded() as store:
            phase = store.start_phase("planning", 0, {"input": "old prompt", "maxTurns": 2}, 2)
            store.save_checkpoint(phase["phase_id"], {"current_turn": "invalid", "max_turns": 2})
            with self.assertRaises(SystemExit):
                self.invoke(store, "planning")
            self.assertEqual(self.dispatches, [])

    def test_unbounded_legacy_checkpoint_marker_does_not_override_current_authorization(self):
        with self.open_bounded(plan=2) as store:
            with self.assertRaises(InjectedProcessCrash):
                self.invoke(store, "planning", crash="after_checkpoint")
            phase_id = store.phase_id("planning")
            store.save_checkpoint(phase_id, {"current_turn": 1, "max_turns": None})
        with self.open_bounded(plan=2) as store:
            result, _ = self.invoke(store, "planning")
            self.assertEqual(result.final_output, "done")
            self.assertEqual(len(self.dispatches), 2)

    def test_unknown_phase_cannot_evade_bounded_group_accounting(self):
        with self.open_bounded() as store:
            with self.assertRaises(SystemExit):
                self.invoke(store, "renamed-unbudgeted-planner")
            self.assertEqual(self.dispatches, [])

    def test_bounded_no_progress_boundary_is_durable_and_does_not_replan_forever(self):
        with self.open_bounded(plan=1) as store:
            with self.assertRaises(SystemExit):
                self.invoke(store, "planning", exceed=True)
            self.assertEqual(store.get_phase(store.phase_id("planning"))["no_progress_segments"], 1)
        with self.open_bounded(plan=1) as store:
            with self.assertRaises(SystemExit):
                self.invoke(store, "planning-1")
            self.assertEqual(len(self.dispatches), 1)


if __name__ == "__main__":
    unittest.main()
