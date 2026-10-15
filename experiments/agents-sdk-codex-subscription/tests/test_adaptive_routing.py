from __future__ import annotations

import tempfile
import uuid
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from adaptive_routing import (
    ASTRA_MODEL_ID,
    CatalogModel,
    LUNA_MODEL_ID,
    ModelProfile,
    RoutingConfigurationError,
    classify_failure,
    parse_catalog,
    route_model,
    select_profile,
    validate_run_model_transition,
)
from durable_store import DurableRunStore
from run_spec_workunit import is_capacity_error, luna_repair_failure_evidence, make_workunit_agent


def model(model_id: str, efforts: set[str] | None = None, default: bool = False) -> CatalogModel:
    return CatalogModel(model_id, model_id, frozenset(efforts or {"low", "medium", "high"}), default)


class CatalogTests(unittest.TestCase):
    def test_catalog_uses_runtime_ids_capabilities_and_default_flag(self):
        response = SimpleNamespace(data=[
            SimpleNamespace(id="runtime-a", description="A", is_default=True,
                            supported_reasoning_efforts=[SimpleNamespace(reasoning_effort="medium")]),
            SimpleNamespace(id="runtime-b", description="B", is_default=False,
                            supported_reasoning_efforts=[{"reasoning_effort": "high"}]),
            SimpleNamespace(id="runtime-a", description="duplicate", is_default=False,
                            supported_reasoning_efforts=[]),
        ])
        catalog = parse_catalog(response)
        self.assertEqual([item.model_id for item in catalog], ["runtime-a", "runtime-b"])
        self.assertEqual(catalog[0].efforts, frozenset({"medium"}))
        self.assertTrue(catalog[0].is_default)

    def test_empty_live_catalog_fails_closed(self):
        with self.assertRaises(RoutingConfigurationError):
            parse_catalog(SimpleNamespace(data=[]))


class RoutingTests(unittest.TestCase):
    def setUp(self):
        self.catalog = [model("gpt-6.1-sol", default=True), model("catalog-peer"),
                        model(LUNA_MODEL_ID, {"low", "medium"})]

    def test_all_phases_pin_luna_medium_even_when_sdk_default_or_catalog_order_changes(self):
        for profile in ModelProfile:
            result = route_model(self.catalog, profile, config={})
            self.assertEqual(result["requestedModel"], LUNA_MODEL_ID)
            self.assertEqual(result["reasoningEffort"], "medium")
            self.assertEqual(result["modelPolicy"], "LUNA_ONLY")
        shuffled = list(reversed(self.catalog))
        self.assertEqual(route_model(shuffled, "REASONING", config={})["requestedModel"], LUNA_MODEL_ID)
        risky = select_profile("implementer", "migrate tenant authorization", [])[0]
        self.assertEqual(route_model(self.catalog, risky, config={})["requestedModel"], LUNA_MODEL_ID)

    def test_review_independence_does_not_require_a_different_model(self):
        result = route_model(self.catalog, "REVIEW", config={}, avoid_models={LUNA_MODEL_ID})
        self.assertEqual(result["requestedModel"], LUNA_MODEL_ID)
        self.assertEqual(result["reviewIndependence"], "INDEPENDENT_CONTEXT_SAME_MODEL_ALLOWED")

    def test_configured_model_and_effort_are_validated(self):
        self.assertEqual(route_model(self.catalog, "GENERAL", config={
            "SMARTSPEC_CODEX_MODEL_GENERAL": "invented-model",
            "SMARTSPEC_CODEX_EFFORT_GENERAL": "ultra",
        })["requestedModel"], LUNA_MODEL_ID)
        with self.assertRaises(RoutingConfigurationError):
            route_model(self.catalog, "GENERAL", config={"SMARTSPEC_CODEX_MODEL_POLICY": "AUTO"})

    def test_luna_unavailable_or_missing_medium_fails_closed_without_catalog_fallback(self):
        with self.assertRaises(RoutingConfigurationError):
            route_model([model("gpt-6.1-sol", default=True)], "GENERAL", config={
                "SMARTSPEC_CODEX_MODEL_FALLBACK": "gpt-6.1-sol",
            })
        with self.assertRaises(RoutingConfigurationError):
            route_model([model(LUNA_MODEL_ID, {"low"}), model("gpt-6.1-sol", default=True)], "GENERAL", config={})

    def test_repeated_code_failure_does_not_escalate_without_budget_authorization(self):
        failed = [{"category": "code_failure", "signature": "same"},
                  {"category": "code_failure", "signature": "same"}]
        profile = select_profile("implementer", "routine", [
            {"iteration": n, "testReceipt": {"exitCode": 1, "stdout": "AssertionError: expected 2 got 3"}}
            for n in (1, 2)
        ])[0]
        route = route_model(self.catalog, profile, config={"SMARTSPEC_CODEX_MODEL_POLICY": "CONTROLLED_ESCALATION"},
                            failure_evidence=failed)
        self.assertEqual(route["requestedModel"], LUNA_MODEL_ID)
        self.assertNotIn("escalationReceipt", route)

    def test_controlled_sol_escalation_requires_failure_luna_repair_budget_and_allowlist(self):
        auth = {"requestedModel": "gpt-6-sol", "modelAllowlist": ["gpt-6-sol"],
                "budgetAuthorizationId": "budget-42", "budgetAuthorized": True,
                "quotaAvailable": True, "quotaObservationId": "quota-42",
                "remainingBudgetTokens": 10000, "requestedBudgetTokens": 1000,
                "lunaRepairAttempted": True,
                "failureEvidence": [{"category": "code_failure", "iteration": 2}]}
        route = route_model(self.catalog + [model("gpt-6-sol", default=False)], "REASONING",
                            config={"SMARTSPEC_CODEX_MODEL_POLICY": "CONTROLLED_ESCALATION"},
                            escalation_authorization=auth)
        self.assertEqual(route["requestedModel"], "gpt-6-sol")
        self.assertEqual(route["escalationReceipt"]["budgetAuthorizationId"], "budget-42")
        for denied in ({**auth, "quotaAvailable": False}, {**auth, "lunaRepairAttempted": False},
                       {**auth, "remainingBudgetTokens": 1},
                       {**auth, "failureEvidence": [{"category": "network"}]}):
            blocked = route_model(self.catalog + [model("gpt-6-sol")], "REASONING",
                                  config={"SMARTSPEC_CODEX_MODEL_POLICY": "CONTROLLED_ESCALATION"},
                                  escalation_authorization=denied)
            self.assertEqual(blocked["requestedModel"], LUNA_MODEL_ID)

    def test_astra_needs_additional_explicit_opt_in(self):
        auth = {"requestedModel": ASTRA_MODEL_ID, "modelAllowlist": [ASTRA_MODEL_ID],
                "budgetAuthorizationId": "budget-43", "budgetAuthorized": True,
                "quotaAvailable": True, "quotaObservationId": "quota-43",
                "remainingBudgetTokens": 10000, "requestedBudgetTokens": 1000,
                "lunaRepairAttempted": True,
                "failureEvidence": [{"category": "code_failure"}]}
        catalog = self.catalog + [model(ASTRA_MODEL_ID)]
        config = {"SMARTSPEC_CODEX_MODEL_POLICY": "CONTROLLED_ESCALATION"}
        self.assertEqual(route_model(catalog, "REASONING", config=config, escalation_authorization=auth)["requestedModel"], LUNA_MODEL_ID)
        auth["astraOptIn"] = True
        self.assertEqual(route_model(catalog, "REASONING", config=config, escalation_authorization=auth)["requestedModel"], ASTRA_MODEL_ID)

    def test_run_model_binding_requires_authorized_escalation_or_verified_luna_recovery(self):
        luna = {"requestedModel": LUNA_MODEL_ID, "modelPolicy": "LUNA_ONLY"}
        sol = {"requestedModel": "gpt-6-sol", "modelPolicy": "CONTROLLED_ESCALATION",
               "escalationReceipt": {"budgetAuthorizationId": "budget-1"}}
        self.assertEqual(validate_run_model_transition(luna, sol), sol)
        with self.assertRaises(RoutingConfigurationError):
            validate_run_model_transition({"requestedModel": "gpt-6.1-sol"}, luna)
        with self.assertRaises(RoutingConfigurationError):
            validate_run_model_transition(sol, {"requestedModel": LUNA_MODEL_ID, "modelPolicy": "LUNA_ONLY"},
                                          verified_recovery=True)
        downshift = validate_run_model_transition(sol, {"requestedModel": LUNA_MODEL_ID,
                                                        "modelPolicy": "CONTROLLED_ESCALATION"},
                                                  verified_recovery=True)
        self.assertEqual(downshift["deescalationReceipt"]["fromModel"], "gpt-6-sol")
        self.assertNotIn("deescalationReceipt", validate_run_model_transition(luna, dict(luna)))

    def test_roles_high_risk_and_repeated_failures_choose_profiles(self):
        self.assertEqual(select_profile("independent_reviewer", "routine", [])[0], ModelProfile.REVIEW)
        self.assertEqual(select_profile("implementer", "migrate tenant authorization", [])[0], ModelProfile.REASONING)
        failed = [
            {"iteration": 1, "changedPaths": ["src/a.py"], "testReceipt": {"exitCode": 1, "stdout": "FAILED test_route AssertionError: expected deny", "stderr": "", "revision": "r1"}},
            {"iteration": 2, "changedPaths": ["src/a.py"], "testReceipt": {"exitCode": 1, "stdout": "FAILED test_route AssertionError: expected deny", "stderr": "", "revision": "r2"}},
        ]
        profile, reason, evidence = select_profile("implementer", "routine component change", failed)
        self.assertEqual(profile, ModelProfile.REASONING)
        self.assertIn("repeated twice", reason)
        self.assertEqual(len(evidence), 2)

    def test_environment_failures_do_not_trigger_reasoning_escalation(self):
        failure = [
            {"iteration": i, "testReceipt": {"exitCode": 1, "stdout": "ModuleNotFoundError: No module named x", "stderr": ""}}
            for i in (1, 2, 3)
        ]
        self.assertEqual(select_profile("implementer", "routine", failure)[0], ModelProfile.GENERAL)
        self.assertEqual(classify_failure("HTTP 429 quota exhausted", exit_code=1)[0], "capacity")
        self.assertEqual(classify_failure("permission denied", exit_code=1)[0], "permission")
        self.assertEqual(classify_failure("npm ERR! Missing script: test", exit_code=1)[0], "test_runner")
        self.assertEqual(classify_failure("CI job failed", exit_code=1)[0], "ci_failure")
        self.assertEqual(classify_failure("AssertionError: expected true", exit_code=1)[0], "code_failure")
        self.assertEqual(classify_failure("AssertionError: expected 403, got 200", exit_code=1)[0], "code_failure")
        self.assertEqual(classify_failure("FAILED test_authentication AssertionError: expected deny", exit_code=1)[0], "code_failure")
        self.assertEqual(classify_failure("AssertionError: expected OOM handler to reject", exit_code=1)[0], "code_failure")
        self.assertEqual(classify_failure("AssertionError: expected 4, got 3\nnpm ERR! Lifecycle script test failed", exit_code=1)[0], "code_failure")
        self.assertEqual(classify_failure("AssertionError: response mismatch\nExpected: permission denied\nReceived: ok", exit_code=1)[0], "code_failure")
        self.assertEqual(classify_failure("AssertionError: response mismatch\nExpected: OOM handler\nReceived: ok", exit_code=1)[0], "code_failure")
        self.assertEqual(classify_failure('AssertionError: mismatch\nExpected:\n  "message": "capacity exhausted"\n}\nReceived:\n  {}', exit_code=1)[0], "code_failure")
        self.assertEqual(classify_failure('AssertionError: mismatch\nExpected:\n  {\n    "message": "capacity exhausted"\n  }\nReceived:\n  {}', exit_code=1)[0], "code_failure")
        self.assertEqual(classify_failure('AssertionError: mismatch\nExpected:\n  {}\nReceived:\n  {}\nnpm ERR! Missing script: test', exit_code=1)[0], "test_runner")
        self.assertEqual(classify_failure("AssertionError: mismatch\nExpected:\n  ok\nReceived:\n  bad\nError: connect ECONNREFUSED localhost", exit_code=1)[0], "service_unavailable")
        self.assertEqual(classify_failure("AssertionError: expected 4, got 3\nError: failed to load config /tmp/vitest.config.ts", exit_code=1)[0], "test_runner")
        self.assertEqual(classify_failure("AssertionError: expected 4, got 3\nFAILED tests/test_quota.py::test_remaining", exit_code=1)[0], "code_failure")
        self.assertEqual(classify_failure("Error: connect ECONNREFUSED 127.0.0.1:5432", exit_code=1)[0], "service_unavailable")
        self.assertEqual(classify_failure("Error: connect ETIMEDOUT localhost", exit_code=1)[0], "service_unavailable")
        self.assertEqual(classify_failure("process killed", exit_code=137)[0], "resource_blocked")
        self.assertEqual(classify_failure("allocation failed", exit_code=-9, signal="SIGKILL")[0], "resource_blocked")
        self.assertEqual(classify_failure("allocation failed", exit_code=None, signal="SIGKILL")[0], "resource_blocked")
        self.assertFalse(is_capacity_error(RoutingConfigurationError("model quota-model unavailable after error 429")))
        self.assertTrue(is_capacity_error(RuntimeError("HTTP 429 rate limit")))
        self.assertTrue(is_capacity_error(RuntimeError("current quota has been exceeded")))
        self.assertTrue(is_capacity_error(RuntimeError("server overloaded; capacity exhausted")))
        self.assertFalse(is_capacity_error(RuntimeError("model quota-model does not exist (HTTP 404)")))
        self.assertFalse(is_capacity_error(RuntimeError("HTTP 404: model 'rate_limit' does not exist")))
        self.assertFalse(is_capacity_error(RuntimeError("HTTP error 404: model 'rate_limit' does not exist")))

    def test_successful_repair_deescalates_next_eligible_task(self):
        successful = [{"iteration": 3, "changedPaths": ["src/a.py"],
                       "testReceipt": {"exitCode": 0, "revision": "fixed"},
                       "review": {"complete": True}}]
        profile, reason, _ = select_profile("implementer", "routine", successful)
        self.assertEqual(profile, ModelProfile.GENERAL)
        self.assertEqual(reason, "ordinary implementation task")


class DurableSelectionTests(unittest.TestCase):
    def test_selection_is_durable_idempotent_and_rejects_rebinding(self):
        run_id = str(uuid.uuid4())
        selection = {"profile": "GENERAL", "requestedModel": LUNA_MODEL_ID, "reasoningEffort": "medium",
                     "modelPolicy": "LUNA_ONLY", "policyVersion": "model-policy.v2"}
        with tempfile.TemporaryDirectory() as temp:
            store = DurableRunStore(Path(temp), run_id=run_id, initial_state={"runId": run_id, "status": "running"})
            phase = store.start_phase("implementation", 1, {"input": "x"}, 3)
            call_id = str(uuid.uuid4())
            request = {"instruction": "x", "schema": {}, "selection": selection}
            first = store.reserve_model_call(call_id, phase["phase_id"], "implementer", request, selection=selection)
            second = store.get_model_call(call_id)
            self.assertEqual(first["selection_json"], second["selection_json"])
            persisted = __import__("json").loads(second["selection_json"])
            self.assertEqual(persisted["requestedModel"], LUNA_MODEL_ID)
            self.assertEqual(persisted["reasoningEffort"], "medium")
            self.assertEqual(persisted["modelPolicy"], "LUNA_ONLY")
            self.assertEqual(store.connection.execute("SELECT COUNT(*) FROM model_calls").fetchone()[0], 1)
            self.assertEqual(store.connection.execute("SELECT COUNT(*) FROM events WHERE kind='model.call.planned'").fetchone()[0], 1)
            self.assertEqual(store.connection.execute("SELECT COUNT(*) FROM events WHERE kind='model.selection.persisted'").fetchone()[0], 1)
            second_selection = {**selection, "profile": "REASONING", "requestedModel": "catalog-peer", "reasoningEffort": "high"}
            second_id = str(uuid.uuid4())
            store.reserve_model_call(second_id, phase["phase_id"], "implementer", {
                "instruction": "y", "schema": {}, "selection": second_selection
            }, selection=second_selection)
            transition = store.connection.execute("SELECT payload_json FROM events WHERE kind='model.selection.transitioned'").fetchone()
            self.assertIsNotNone(transition)
            self.assertEqual(__import__("json").loads(transition["payload_json"])["toProfile"], "REASONING")
            with self.assertRaises(RuntimeError):
                store.reserve_model_call(call_id, phase["phase_id"], "implementer", {
                    "instruction": "x", "schema": {}, "selection": {**selection, "requestedModel": "changed"}
                }, selection={**selection, "requestedModel": "changed"})
            store.close()

    def test_restart_after_selection_persistence_reuses_original_decision(self):
        run_id = str(uuid.uuid4())
        selection = {"profile": "REASONING", "requestedModel": "catalog-peer", "reasoningEffort": "high", "policyVersion": "adaptive-routing.v1"}
        with tempfile.TemporaryDirectory() as temp:
            evidence = Path(temp)
            store = DurableRunStore(evidence, run_id=run_id, initial_state={"runId": run_id, "status": "running"})
            phase = store.start_phase("implementation", 2, {"input": "repair"}, 3)
            call_id = str(uuid.uuid4())
            request = {"instruction": "repair", "schema": {}, "selection": selection}
            store.reserve_model_call(call_id, phase["phase_id"], "implementer", request, selection=selection)
            with patch.dict("os.environ", {"AUTONOMY_CRASH_AT": "model.after_selection_persisted"}), \
                 patch("codex_model.os.kill", side_effect=RuntimeError("injected crash")):
                from codex_model import _maybe_crash
                with self.assertRaisesRegex(RuntimeError, "injected crash"):
                    _maybe_crash(store, "model.after_selection_persisted", {"callId": call_id})
            store.close()
            resumed = DurableRunStore(evidence, run_id=run_id, resume=True, count_restart=False)
            restored = resumed.get_model_call(call_id)
            self.assertEqual(restored["status"], "planned")
            self.assertEqual(restored["selection_json"], __import__("json").dumps(selection, sort_keys=True, separators=(",", ":")))
            self.assertEqual(resumed.connection.execute("SELECT COUNT(*) FROM model_calls").fetchone()[0], 1)
            self.assertEqual(resumed.connection.execute("SELECT COUNT(*) FROM events WHERE kind='fault.injected'").fetchone()[0], 1)
            resumed.close()


    def test_profile_qualified_crash_only_fires_for_matching_real_transition(self):
        run_id = str(uuid.uuid4())
        with tempfile.TemporaryDirectory() as temp:
            evidence = Path(temp)
            store = DurableRunStore(evidence, run_id=run_id, initial_state={"runId": run_id, "status": "running"})
            with patch.dict("os.environ", {"AUTONOMY_CRASH_AT": "model.after_selection_persisted@profile=REASONING"}), \
                 patch("codex_model.os.kill", side_effect=RuntimeError("injected crash")) as kill:
                from codex_model import _maybe_crash
                _maybe_crash(store, "model.after_selection_persisted", {"profile": "GENERAL", "requestedModel": "general-model"})
                kill.assert_not_called()
                with self.assertRaisesRegex(RuntimeError, "injected crash"):
                    _maybe_crash(store, "model.after_selection_persisted", {"profile": "REASONING", "requestedModel": "reasoning-model"})
            store.close()


class WorkUnitReviewRoutingTests(unittest.TestCase):
    def test_escalation_evidence_requires_completed_luna_repair_and_following_code_failure(self):
        run_id = str(uuid.uuid4())
        with tempfile.TemporaryDirectory() as temp:
            store = DurableRunStore(Path(temp), run_id=run_id, initial_state={"runId": run_id, "status": "running"})
            first = store.start_phase("implementation", 1, {"input": "first"}, 3)
            repair = store.start_phase("implementation", 2, {"input": "repair"}, 3)
            iterations = [
                {"iteration": 1, "testReceipt": {"exitCode": 1, "stdout": "AssertionError: expected deny"}},
                {"iteration": 2, "testReceipt": {"exitCode": 1, "stdout": "AssertionError: expected deny"}},
            ]
            self.assertEqual(luna_repair_failure_evidence(store, iterations), [])
            call_id = str(uuid.uuid4())
            store.reserve_model_call(call_id, repair["phase_id"], "implementer", {"instruction": "repair"},
                                     selection={"profile": "GENERAL", "requestedModel": LUNA_MODEL_ID})
            store.update_model_call(call_id, event="model.call.completed", stable_suffix="completed", status="completed")
            evidence = luna_repair_failure_evidence(store, iterations)
            self.assertEqual(len(evidence), 1)
            self.assertEqual(evidence[0]["requestedModel"], LUNA_MODEL_ID)
            self.assertTrue(evidence[0]["repairAttempted"])
            environment_failure = [iterations[0], {"iteration": 2, "testReceipt": {
                "exitCode": 1, "stderr": "Connection timed out", "stdout": ""}}]
            self.assertEqual(luna_repair_failure_evidence(store, environment_failure), [])
            store.close()

    def test_review_keeps_independent_agent_context_without_model_avoidance(self):
        run_id = str(uuid.uuid4())
        with tempfile.TemporaryDirectory() as temp:
            store = DurableRunStore(Path(temp), run_id=run_id, initial_state={"runId": run_id, "status": "running"})
            implementation = store.start_phase("implementation", 1, {"input": "work"}, 3)
            reviewer = store.start_phase("review", 1, {"input": "review"}, 3)
            store.reserve_model_call(str(uuid.uuid4()), implementation["phase_id"], "implementer", {"instruction": "implement"},
                                     selection={"profile": "GENERAL", "requestedModel": LUNA_MODEL_ID})
            with patch("run_spec_workunit.select_profile", return_value=(ModelProfile.REVIEW, "independent", [])), \
                 patch("run_spec_workunit.make_agent") as make_agent:
                make_workunit_agent("independent_reviewer_1", "review", None, [], lambda _item: None,
                                    store, reviewer["phase_id"], "low-risk task")
            self.assertNotIn("avoidModels", make_agent.call_args.kwargs["routing"])
            self.assertEqual(make_agent.call_args.kwargs["routing"]["profile"], "REVIEW")
            store.close()


if __name__ == "__main__":
    unittest.main()
