from __future__ import annotations

import tempfile
import uuid
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from adaptive_routing import (
    CatalogModel,
    ModelProfile,
    RoutingConfigurationError,
    classify_failure,
    parse_catalog,
    route_model,
    select_profile,
)
from durable_store import DurableRunStore
from run_spec_workunit import is_capacity_error


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
        self.catalog = [model("account-default", default=True), model("catalog-peer"),
                        model("low-capability", {"low", "medium"})]

    def test_profiles_map_dynamically_and_request_supported_effort(self):
        general = route_model(self.catalog, ModelProfile.GENERAL, config={})
        reasoning = route_model(self.catalog, ModelProfile.REASONING, config={})
        review = route_model(self.catalog, ModelProfile.REVIEW, config={})
        self.assertEqual(general["requestedModel"], "account-default")
        self.assertEqual(general["reasoningEffort"], "medium")
        self.assertEqual(reasoning["requestedModel"], "catalog-peer")
        self.assertEqual(reasoning["reasoningEffort"], "high")
        self.assertEqual(review["requestedModel"], "catalog-peer")
        self.assertIn("providerAuthRoute", review)
        independent_review = route_model(self.catalog, "REVIEW", config={}, avoid_models={"account-default", "catalog-peer"})
        self.assertEqual(independent_review["requestedModel"], "low-capability")
        self.assertEqual(independent_review["reviewIndependence"], "DISTINCT_MODEL")
        constrained_review = route_model(self.catalog[:1], "REVIEW", config={}, avoid_models={"account-default"})
        self.assertEqual(constrained_review["reviewIndependence"], "SINGLE_MODEL_AVAILABLE")

    def test_configured_model_and_effort_are_validated(self):
        with self.assertRaises(RoutingConfigurationError):
            route_model(self.catalog, "GENERAL", config={"SMARTSPEC_CODEX_MODEL_GENERAL": "invented-model"})
        with self.assertRaises(RoutingConfigurationError):
            route_model(self.catalog, "GENERAL", config={"SMARTSPEC_CODEX_EFFORT_GENERAL": "ultra"})

    def test_only_explicit_catalog_fallback_is_used(self):
        route = route_model(self.catalog, "GENERAL", config={
            "SMARTSPEC_CODEX_MODEL_GENERAL": "unavailable",
            "SMARTSPEC_CODEX_MODEL_FALLBACK": "catalog-peer",
        })
        self.assertEqual(route["requestedModel"], "catalog-peer")
        self.assertTrue(route["fallbackUsed"])
        self.assertIn("fallback", route["selectionReason"])

    def test_unsupported_effort_uses_only_explicit_compatible_fallback(self):
        route = route_model(self.catalog, "GENERAL", config={
            "SMARTSPEC_CODEX_MODEL_GENERAL": "low-capability",
            "SMARTSPEC_CODEX_EFFORT_GENERAL": "high",
            "SMARTSPEC_CODEX_MODEL_FALLBACK": "catalog-peer",
        })
        self.assertEqual(route["requestedModel"], "catalog-peer")
        self.assertTrue(route["fallbackUsed"])
        with self.assertRaises(RoutingConfigurationError):
            route_model([model("primary", {"low", "medium"}), model("fallback", {"low", "medium"})], "GENERAL", config={
                "SMARTSPEC_CODEX_MODEL_GENERAL": "primary",
                "SMARTSPEC_CODEX_EFFORT_GENERAL": "high",
                "SMARTSPEC_CODEX_MODEL_FALLBACK": "fallback",
            })

    def test_review_prefers_a_model_different_from_the_prior_phase(self):
        two_model_catalog = [model("general" , default=True), model("reasoning")]
        result = route_model(two_model_catalog, "REVIEW", config={
            "SMARTSPEC_CODEX_MODEL_GENERAL": "general",
            "SMARTSPEC_CODEX_MODEL_REASONING": "reasoning",
        }, avoid_models={"reasoning"})
        self.assertEqual(result["requestedModel"], "general")
        self.assertEqual(result["reviewIndependence"], "DISTINCT_MODEL")
        with self.assertRaises(RoutingConfigurationError):
            route_model(two_model_catalog, "REVIEW", config={
                "SMARTSPEC_CODEX_MODEL_GENERAL": "general",
                "SMARTSPEC_CODEX_MODEL_REVIEW": "reasoning",
            }, avoid_models={"reasoning"})
        configured_fallback = route_model(two_model_catalog, "REVIEW", config={
            "SMARTSPEC_CODEX_MODEL_GENERAL": "general",
            "SMARTSPEC_CODEX_MODEL_REVIEW": "reasoning",
            "SMARTSPEC_CODEX_MODEL_FALLBACK": "general",
        }, avoid_models={"reasoning"})
        self.assertEqual(configured_fallback["requestedModel"], "general")
        self.assertTrue(configured_fallback["fallbackUsed"])
        with self.assertRaises(RoutingConfigurationError):
            route_model(two_model_catalog, "REVIEW", config={
                "SMARTSPEC_CODEX_MODEL_GENERAL": "general",
                "SMARTSPEC_CODEX_MODEL_REVIEW": "missing-review",
                "SMARTSPEC_CODEX_MODEL_FALLBACK": "reasoning",
            }, avoid_models={"reasoning"})

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
        selection = {"profile": "GENERAL", "requestedModel": "account-default", "reasoningEffort": "medium", "policyVersion": "adaptive-routing.v1"}
        with tempfile.TemporaryDirectory() as temp:
            store = DurableRunStore(Path(temp), run_id=run_id, initial_state={"runId": run_id, "status": "running"})
            phase = store.start_phase("implementation", 1, {"input": "x"}, 3)
            call_id = str(uuid.uuid4())
            request = {"instruction": "x", "schema": {}, "selection": selection}
            first = store.reserve_model_call(call_id, phase["phase_id"], "implementer", request, selection=selection)
            second = store.get_model_call(call_id)
            self.assertEqual(first["selection_json"], second["selection_json"])
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


if __name__ == "__main__":
    unittest.main()
