from __future__ import annotations

import unittest
import importlib.util
import sys
import json
import tempfile
from pathlib import Path

RUNTIME_PATH = Path(__file__).with_name("runtime_authority.py")
RUNTIME_SPEC = importlib.util.spec_from_file_location("runtime_authority", RUNTIME_PATH)
if RUNTIME_SPEC is None or RUNTIME_SPEC.loader is None:
    raise ImportError("runtime authority module is unavailable")
runtime = importlib.util.module_from_spec(RUNTIME_SPEC)
sys.modules[RUNTIME_SPEC.name] = runtime
RUNTIME_SPEC.loader.exec_module(runtime)
EvidenceResult = runtime.EvidenceResult
WorkspaceActionDispatcher = runtime.WorkspaceActionDispatcher
WorkspaceFact = runtime.WorkspaceFact
WorkspaceFactAuthority = runtime.WorkspaceFactAuthority
evaluate_multi_instance_convergence = runtime.evaluate_multi_instance_convergence
sign_workspace_fact = runtime.sign_workspace_fact
CloudflareEvidenceProvider = runtime.CloudflareEvidenceProvider
CanonicalBuildArtifactEvidenceProvider = runtime.CanonicalBuildArtifactEvidenceProvider
mark_evidence_freshness = runtime.mark_evidence_freshness


class MemoryStore:
    def __init__(self):
        self.values = {}

    def get(self, scope, key):
        return self.values.get((scope, key))

    def put(self, scope, key, request_hash, receipt):
        self.values[(scope, key)] = (request_hash, receipt)

    def reserve(self, scope, key, request_hash, receipt):
        previous = self.get(scope, key)
        if previous:
            return ("CONFLICT", None) if previous[0] != request_hash else ("REPLAY", previous[1])
        self.values[(scope, key)] = (request_hash, receipt)
        return "CREATED", None

    def complete(self, scope, key, request_hash, receipt):
        self.values[(scope, key)] = (request_hash, receipt)


class RuntimeAuthorityTests(unittest.TestCase):
    def setUp(self):
        self.now = 1_800_000_000.0
        self.key = b"fixture-runner-key"

    def fact(self, *, host="runner-a", sha="a" * 40, trust="MANAGED_RUNNER", observed=None, expires=None):
        fact = WorkspaceFact("authority", "tenant", "project", "repo", host, "workspace",
            sha, "main", "owner-1", "session-1", False, "SYNCED", "runner_snapshot",
            self.now if observed is None else observed, self.now + 90 if expires is None else expires,
            trust, local_path=None)
        return WorkspaceFact(**{**fact.__dict__, "signature": sign_workspace_fact(fact, self.key)})

    def authority(self, keys=None):
        return WorkspaceFactAuthority({"runner-a": self.key, "runner-b": self.key} if keys is None else keys, now=lambda: self.now)

    def dispatcher(self, *, allowed=True, owner=True, execute=None):
        audits = []
        calls = []
        dispatch = WorkspaceActionDispatcher(
            store=MemoryStore(), resolve_project=lambda **_: {"id": "project"},
            resolve_workspace=lambda **_: {"id": "workspace", "owner": "actor"},
            authorize=lambda **_: allowed, recheck_owner=lambda **_: owner,
            execute=lambda **args: calls.append(args) or (execute if execute is not None else {"ok": True}),
            audit=lambda **entry: audits.append(entry), now=lambda: self.now,
        )
        return dispatch, audits, calls

    def test_trusted_cross_host_fact_is_accepted(self):
        self.assertEqual("ACCEPTED", self.authority().ingest(self.fact())["status"])

    def test_unsigned_fact_is_rejected(self):
        fact = self.fact()
        fact = WorkspaceFact(**{**fact.__dict__, "signature": ""})
        self.assertEqual("REJECTED", self.authority().ingest(fact)["status"])

    def test_unknown_host_key_is_rejected(self):
        self.assertEqual("REJECTED", self.authority({}).ingest(self.fact())["status"])

    def test_expired_fact_is_stale(self):
        self.assertEqual("STALE", self.authority().ingest(self.fact(expires=self.now))["status"])

    def test_future_fact_is_stale(self):
        self.assertEqual("STALE", self.authority().ingest(self.fact(observed=self.now + 60))["status"])

    def test_lower_authority_cannot_replace_managed_fact(self):
        auth = self.authority()
        auth.ingest(self.fact())
        self.assertEqual("LOWER_AUTHORITY_IGNORED", auth.ingest(self.fact(trust="USER_REPORTED", sha="b" * 40))["status"])

    def test_same_authority_sha_conflict_is_explicit(self):
        auth = self.authority()
        auth.ingest(self.fact())
        self.assertEqual("CONFLICT", auth.ingest(self.fact(sha="b" * 40))["status"])

    def test_newer_equal_authority_fact_updates_same_sha(self):
        auth = self.authority()
        auth.ingest(self.fact())
        newer = self.fact()
        newer = WorkspaceFact(**{**newer.__dict__, "observed_at": self.now + 1, "expires_at": self.now + 100, "signature": ""})
        newer = WorkspaceFact(**{**newer.__dict__, "signature": sign_workspace_fact(newer, self.key)})
        self.assertEqual("ACCEPTED", auth.ingest(newer)["status"])

    def test_project_snapshot_detects_same_workspace_multi_host_conflict(self):
        auth = self.authority()
        auth.ingest(self.fact())
        second = self.fact(host="runner-b", sha="b" * 40)
        auth.ingest(second)
        self.assertEqual("CONFLICT", auth.snapshot(tenant_id="tenant", project_id="project")["workspaces"][0]["state"])

    def test_same_host_conflict_remains_visible_in_project_snapshot(self):
        auth = self.authority()
        auth.ingest(self.fact())
        auth.ingest(self.fact(sha="b" * 40))
        self.assertEqual("CONFLICT", auth.snapshot(tenant_id="tenant", project_id="project")["workspaces"][0]["state"])

    def test_fact_identity_includes_host_not_local_path(self):
        auth = self.authority()
        auth.ingest(self.fact())
        auth.ingest(self.fact(host="runner-b"))
        self.assertEqual(2, len(auth.snapshot(tenant_id="tenant", project_id="project")["workspaces"][0]["hosts"]))

    def test_missing_actor_authentication_denied(self):
        dispatcher, _, _ = self.dispatcher()
        with self.assertRaisesRegex(PermissionError, "ACTOR_AUTHENTICATION_REQUIRED"):
            dispatcher.dispatch(actor_id="", tenant_id="tenant", project_id="project", action="INSPECT_LOCAL_CHANGES", workspace_id="workspace", idempotency_key="key", payload={})

    def test_invalid_action_denied(self):
        dispatcher, _, _ = self.dispatcher()
        with self.assertRaisesRegex(ValueError, "ACTION_REQUEST_INVALID"):
            dispatcher.dispatch(actor_id="actor", tenant_id="tenant", project_id="project", action="DROP_ALL", workspace_id=None, idempotency_key="key", payload={})

    def test_permission_denial_is_audited(self):
        dispatcher, audits, _ = self.dispatcher(allowed=False)
        with self.assertRaisesRegex(PermissionError, "ACTION_PERMISSION_DENIED"):
            dispatcher.dispatch(actor_id="actor", tenant_id="tenant", project_id="project", action="RETIRE_SAFE_WORKTREE", workspace_id="workspace", idempotency_key="key", payload={})
        self.assertTrue(audits[0]["denied"])

    def test_owner_is_rechecked_before_execution(self):
        dispatcher, _, calls = self.dispatcher(owner=False)
        with self.assertRaisesRegex(PermissionError, "WORKSPACE_OWNER_RECHECK_FAILED"):
            dispatcher.dispatch(actor_id="actor", tenant_id="tenant", project_id="project", action="SYNC_WORKSPACE_SAFELY", workspace_id="workspace", idempotency_key="key", payload={})
        self.assertEqual([], calls)

    def test_action_receipt_and_audit_are_emitted(self):
        dispatcher, audits, calls = self.dispatcher()
        receipt = dispatcher.dispatch(actor_id="actor", tenant_id="tenant", project_id="project", action="VERIFY_PROJECT_CONVERGENCE", workspace_id=None, idempotency_key="key", payload={})
        self.assertEqual("COMPLETED", receipt["status"])
        self.assertEqual(1, len(calls))
        self.assertEqual(receipt["receipt_id"], audits[-1]["receipt_id"])

    def test_exact_action_replay_returns_replay_safe_status_without_reexecution(self):
        dispatcher, _, calls = self.dispatcher()
        args = dict(actor_id="actor", tenant_id="tenant", project_id="project", action="VERIFY_PROJECT_CONVERGENCE", workspace_id=None, idempotency_key="key", payload={})
        first = dispatcher.dispatch(**args)
        second = dispatcher.dispatch(**args)
        self.assertEqual("COMPLETED", first["status"])
        self.assertEqual({"status": "REPLAY_SAFE", "receipt": first}, second)
        self.assertEqual(1, len(calls))

    def test_conflicting_action_replay_is_rejected(self):
        dispatcher, _, _ = self.dispatcher()
        base = dict(actor_id="actor", tenant_id="tenant", project_id="project", action="VERIFY_PROJECT_CONVERGENCE", workspace_id=None, idempotency_key="key", payload={})
        dispatcher.dispatch(**base)
        with self.assertRaisesRegex(ValueError, "IDEMPOTENCY_CONFLICT"):
            dispatcher.dispatch(**{**base, "action": "INSPECT_LOCAL_CHANGES"})

    def test_idempotency_uses_normalized_key_and_canonical_json_payload(self):
        dispatcher, _, calls = self.dispatcher()
        first = dispatcher.dispatch(actor_id="actor", tenant_id="tenant", project_id="project", action="VERIFY_PROJECT_CONVERGENCE", workspace_id=None, idempotency_key=" key ", payload={"a": 1, "b": 2})
        replay = dispatcher.dispatch(actor_id="actor", tenant_id="tenant", project_id="project", action="VERIFY_PROJECT_CONVERGENCE", workspace_id=None, idempotency_key="key", payload={"b": 2, "a": 1})
        self.assertEqual({"status": "REPLAY_SAFE", "receipt": first}, replay)
        self.assertEqual(1, len(calls))

    def test_idempotency_rejects_non_json_numeric_values(self):
        dispatcher, _, calls = self.dispatcher()
        with self.assertRaisesRegex(ValueError, "ACTION_REQUEST_INVALID"):
            dispatcher.dispatch(actor_id="actor", tenant_id="tenant", project_id="project", action="VERIFY_PROJECT_CONVERGENCE", workspace_id=None, idempotency_key="key", payload={"value": float("nan")})
        self.assertEqual([], calls)

    def test_evidence_result_accepts_all_declared_provider_statuses(self):
        statuses = ["OBSERVED", "UNAVAILABLE", "NOT_CONFIGURED", "PERMISSION_DENIED", "STALE", "ERROR"]
        self.assertEqual(statuses, [EvidenceResult(s, "fixture").status for s in statuses])

    def test_evidence_result_rejects_non_contract_status(self):
        with self.assertRaisesRegex(ValueError, "EVIDENCE_STATUS_INVALID"):
            EvidenceResult("HEALTHY", "fixture")

    def test_source_artifact_mismatch_has_precedence(self):
        result = evaluate_multi_instance_convergence({"source_sha": "a", "artifact_digest": "d", "artifact_source_sha": "b", "migration_failed": True})
        self.assertEqual("SOURCE_ARTIFACT_MISMATCH", result["status"])

    def test_rollback_in_progress_precedes_migration_pending(self):
        e = {"source_sha": "a", "artifact_digest": "d", "artifact_source_sha": "a", "release_kind": "ROLLBACK", "rollback_in_progress": True, "migration_pending": True}
        self.assertEqual("ROLLBACK_IN_PROGRESS", evaluate_multi_instance_convergence(e)["status"])

    def test_migration_failed_precedes_pending(self):
        e = {"source_sha": "a", "artifact_digest": "d", "artifact_source_sha": "a", "migration_failed": True, "migration_pending": True}
        self.assertEqual("MIGRATION_FAILED", evaluate_multi_instance_convergence(e)["status"])

    def test_migration_pending_is_reported(self):
        e = {"source_sha": "a", "artifact_digest": "d", "artifact_source_sha": "a", "migration_pending": True}
        self.assertEqual("MIGRATION_PENDING", evaluate_multi_instance_convergence(e)["status"])

    def test_stale_instance_is_reported(self):
        e = {"source_sha": "a", "artifact_digest": "d", "artifact_source_sha": "a", "instances": [{"observed_at": 10}]}
        self.assertEqual("STALE_INSTANCE", evaluate_multi_instance_convergence(e, now=500)["status"])

    def test_artifact_runtime_mismatch_is_reported(self):
        e = {"source_sha": "a", "artifact_digest": "d", "artifact_source_sha": "a", "instances": [{"observed_at": 500, "artifact_digest": "other"}]}
        self.assertEqual("ARTIFACT_RUNTIME_MISMATCH", evaluate_multi_instance_convergence(e, now=500)["status"])

    def test_multiple_runtime_revisions_are_mixed(self):
        base = {"source_sha": "a", "artifact_digest": "d", "artifact_source_sha": "a", "expected_revision": "r2"}
        base["instances"] = [{"observed_at": 500, "artifact_digest": "d", "revision": "r1", "health": "HEALTHY"}, {"observed_at": 500, "artifact_digest": "d", "revision": "r2", "health": "HEALTHY"}]
        self.assertEqual("MIXED_REVISION", evaluate_multi_instance_convergence(base, now=500)["status"])

    def test_single_stale_revision_is_partial_rollout(self):
        e = {"source_sha": "a", "artifact_digest": "d", "artifact_source_sha": "a", "expected_revision": "r2", "instances": [{"observed_at": 500, "artifact_digest": "d", "revision": "r1", "health": "HEALTHY"}]}
        self.assertEqual("PARTIAL_ROLLOUT", evaluate_multi_instance_convergence(e, now=500)["status"])

    def test_degraded_health_blocks_convergence(self):
        e = {"source_sha": "a", "artifact_digest": "d", "artifact_source_sha": "a", "expected_revision": "r1", "instances": [{"observed_at": 500, "artifact_digest": "d", "revision": "r1", "health": "DEGRADED"}]}
        self.assertEqual("HEALTH_DEGRADED", evaluate_multi_instance_convergence(e, now=500)["status"])

    def test_missing_instance_evidence_is_unknown(self):
        e = {"source_sha": "a", "artifact_digest": "d", "artifact_source_sha": "a"}
        self.assertEqual("UNKNOWN_EVIDENCE", evaluate_multi_instance_convergence(e)["status"])

    def test_fully_converged_release_requires_fresh_matching_healthy_instances(self):
        e = {"source_sha": "a", "artifact_digest": "d", "artifact_source_sha": "a", "expected_revision": "r1", "instances": [{"observed_at": 500, "artifact_digest": "d", "revision": "r1", "health": "HEALTHY"}]}
        self.assertEqual("FULLY_CONVERGED", evaluate_multi_instance_convergence(e, now=500)["status"])

    def test_canonical_build_artifact_provider_reads_source_bound_receipt(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / ".development-build-results" / "repo-key"
            root.mkdir(parents=True)
            (root / "run-1.json").write_text(json.dumps({"status": "BUILD_PASSED", "source_revision": "abc", "completed_at": self.now, "build_target": "web", "artifact": {"artifact_digest": "sha256:" + "a" * 64, "artifact_file_count": 3}}), encoding="utf-8")
            result = CanonicalBuildArtifactEvidenceProvider(root.parent, now=lambda: self.now).observe("abc")
        self.assertEqual("OBSERVED", result.status)
        self.assertEqual("abc", result.data["source_sha"])
        self.assertEqual(3, result.data["artifact_file_count"])

    def test_canonical_build_artifact_provider_marks_stale_receipt(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / ".development-build-results" / "repo-key"
            root.mkdir(parents=True)
            (root / "run.json").write_text(json.dumps({"status": "BUILD_PASSED", "source_revision": "abc", "completed_at": self.now - 500, "artifact": {"artifact_digest": "sha256:" + "a" * 64}}), encoding="utf-8")
            result = CanonicalBuildArtifactEvidenceProvider(root.parent, now=lambda: self.now, max_age_seconds=10).observe("abc")
        self.assertEqual("STALE", result.status)

    def test_cloudflare_missing_credentials_return_not_configured(self):
        provider = CloudflareEvidenceProvider(lambda _: {"status": "NOT_CONFIGURED"}, request=lambda *_: self.fail("request must not run"), now=lambda: self.now)
        self.assertEqual("NOT_CONFIGURED", provider.observe_worker_deployments("worker").status)

    def test_cloudflare_401_and_403_map_to_permission_denied(self):
        for status in (401, 403):
            provider = CloudflareEvidenceProvider(lambda _: {"status": "OBSERVED", "account_id": "acct", "token": "secret"}, request=lambda *_args, status=status: (status, {}), now=lambda: self.now)
            self.assertEqual("PERMISSION_DENIED", provider.observe_worker_deployments("worker").status)

    def test_cloudflare_worker_deployment_normalizes_revision_and_traffic(self):
        calls = []
        def request(url, token):
            calls.append((url, token))
            return 200, {"success": True, "result": {"deployments": [{"id": "deploy-1", "created_on": "2027-01-15T00:00:00Z", "versions": [{"version_id": "version-1", "percentage": 100}]}]}}
        provider = CloudflareEvidenceProvider(lambda _: {"status": "OBSERVED", "account_id": "acct", "token": "secret"}, request=request, now=lambda: 1_800_000_000, max_age_seconds=60_000)
        result = provider.observe_worker_deployments("smart-worker")
        self.assertEqual("OBSERVED", result.status)
        self.assertEqual("deploy-1", result.data["observed_revision"])
        self.assertEqual("version-1", result.data["version_id"])
        self.assertIn("/workers/scripts/smart-worker/deployments", calls[0][0])
        self.assertEqual("secret", calls[0][1])

    def test_cloudflare_container_adapter_exposes_only_observed_fields(self):
        responses = [
            (200, {"success": True, "result": {"id": "app-1", "account_id": "acct", "version": 4, "active_rollout_id": "rollout-2", "updated_at": "2027-01-15T00:00:00Z", "configuration": {"image": "registry/image:tag"}, "health": {"summary": "healthy"}}}),
            (200, {"success": True, "result": [{"id": "instance-1", "image": "registry/image:tag", "status": {"state": "running", "updated_at": "2027-01-15T00:00:00Z"}}]}),
        ]
        provider = CloudflareEvidenceProvider(lambda _: {"status": "OBSERVED", "account_id": "acct", "token": "secret"}, request=lambda *_: responses.pop(0), now=lambda: 1_800_000_000, max_age_seconds=60_000)
        result = provider.observe_container_application("app-1")
        self.assertEqual("OBSERVED", result.status)
        self.assertEqual("rollout-2", result.data["deployment_id"])
        self.assertIsNone(result.data["intended_digest"])
        self.assertEqual("running", result.data["instances"][0]["state"])

    def test_cloudflare_old_observation_is_stale(self):
        provider = CloudflareEvidenceProvider(lambda _: {"status": "OBSERVED", "account_id": "acct", "token": "secret"}, request=lambda *_: (200, {"success": True, "result": {"deployments": [{"id": "d", "created_on": "2020-01-01T00:00:00Z"}]}}), now=lambda: self.now)
        result = provider.observe_worker_deployments("worker")
        self.assertEqual("OBSERVED", result.status)
        self.assertEqual("2020-01-01T00:00:00Z", result.data["deployment_created_at"])

    def test_cached_provider_observation_expires_by_collection_timestamp(self):
        result = EvidenceResult("OBSERVED", "cloudflare-workers", "2020-01-01T00:00:00Z", {"deployment_id": "d"})
        self.assertEqual("STALE", mark_evidence_freshness(result, now=self.now, max_age_seconds=60).status)

if __name__ == "__main__":
    unittest.main()
