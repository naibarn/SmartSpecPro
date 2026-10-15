from __future__ import annotations

import os
import hashlib
import json
import sys
import tempfile
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import developer_workunit
from spec_workunit_contract import ContractError


class DeveloperWorkUnitProvisioningTests(unittest.TestCase):
    def test_contract_binds_identity_source_paths_tools_and_expiry(self) -> None:
        task_id = "12345678-90ab-cdef-1234-567890abcdef"
        scope_expiry = time.time() + 600
        request = {
            "task": "Build a small accessible calculator and verify its local behavior.",
            "allowedFiles": ["demo/index.html", "demo/app.js", "demo/test_app.py"],
            "writableFiles": ["demo/index.html", "demo/app.js", "demo/test_app.py"],
            "tests": {"runner": "pytest", "cwd": ".", "paths": ["demo/test_app.py"], "databaseMode": "none"},
            "browserUat": {"status": "configured", "projectPath": "demo"},
            "acceptanceCriteria": ["The app works in Chromium."],
        }
        identity = {"login": "developer", "permission": "write", "repository": "team/project", "host": "github.com"}
        registered = {
            "base_sha": "a" * 40, "workspace_id": "workspace:test",
            "owner_fencing_version": 3, "owner_lease_expires_at": scope_expiry,
        }
        with patch.dict(os.environ, {"CODEX_SESSION_ID": "session-test"}):
            contract = developer_workunit._request_contract(
                request, identity=identity, workspace=Path("/tmp/owned"), registered=registered,
                task_id=task_id, scope_expires_at=scope_expiry,
            )
        self.assertEqual(contract["ownerSessionId"], "session-test")
        self.assertEqual(contract["ownerFencingVersion"], 3)
        self.assertEqual(contract["sourceRevision"], "a" * 40)
        self.assertIn("run_browser_uat", contract["allowedTools"])
        self.assertFalse(contract["authority"]["productionAccess"])
        self.assertFalse(contract["authority"]["sharedDatabaseWrite"])
        self.assertEqual(contract["authorizationDigest"], contract["sourceSpecDigest"])
        self.assertEqual(contract["budget"], {
            "maxAttempts": 3, "implementationMaxTurns": 12, "planMaxTurns": 4, "reviewMaxTurns": 4,
        })
        auth = {
            "developer": identity, "taskId": task_id, "sourceSha": registered["base_sha"],
            "task": request["task"], "acceptanceCriteria": request["acceptanceCriteria"],
            "workspaceId": registered["workspace_id"], "allowedFiles": request["allowedFiles"],
            "writableFiles": request["writableFiles"], "patchableFiles": [],
            "allowedTools": contract["allowedTools"], "tests": request["tests"],
            "browserUat": request["browserUat"], "budget": contract["budget"], "expiresAt": scope_expiry,
            "productionAccess": False, "sharedDatabaseWrite": False, "runnerDispatch": False,
        }
        expected = hashlib.sha256(json.dumps(auth, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        self.assertEqual(contract["authorizationDigest"], expected)

    def test_resume_keeps_original_scope_receipt_and_accepts_only_server_bounded_continuation(self) -> None:
        task_id = "12345678-90ab-cdef-1234-567890abcdef"
        request = {
            "developerLogin": "developer", "sourceRevision": "a" * 40,
            "task": "Resume the same bounded WorkUnit", "allowedFiles": ["src/main.py"],
            "writableFiles": ["src/main.py"], "tests": {"runner": "pytest", "cwd": ".", "paths": ["src/main.py"]},
            "acceptanceCriteria": ["The same run resumes"],
            "budget": {"maxAttempts": 2, "implementationMaxTurns": 2, "planMaxTurns": 1, "reviewMaxTurns": 1},
            "scopeTtlSeconds": 3600,
        }
        binding = {"jobId": "job-1", "runId": task_id, "tenantId": "tenant-1", "actorId": 42,
                   "attemptId": "attempt-2", "fencingVersion": 7}
        identity = {"login": "developer", "permission": "write", "repository": "team/project", "host": "github.com"}
        original_expiry = time.time() - 86_400
        registered = {"base_sha": request["sourceRevision"], "workspace_id": "workspace:test",
                      "owner_fencing_version": 1, "owner_lease_expires_at": original_expiry}
        with tempfile.TemporaryDirectory() as raw_dir, patch.dict(os.environ, {"CODEX_SESSION_ID": "session-test"}):
            root = Path(raw_dir)
            workspace = root / "workspace"
            workspace.mkdir()
            contract = developer_workunit._request_contract(
                request, identity=identity, workspace=workspace, registered=registered,
                task_id=task_id, scope_expires_at=original_expiry, canonical_binding={**binding, "attemptId": "attempt-1", "fencingVersion": 3},
            )
            evidence = root / "evidence"
            evidence.mkdir()
            receipt_path = evidence / "authorization-receipt.json"
            receipt = {
                "schema": "developer-local-workunit-authorization.v1", "taskId": task_id,
                "workspaceId": contract["workspaceId"], "sourceSha": contract["sourceRevision"],
                "developerIdentity": identity, "ownerSessionId": "initial-session", "ownerPid": 1,
                "ownerFencingVersion": 1, "allowedFiles": contract["allowedFiles"],
                "writableFiles": contract["writableFiles"], "allowedTools": contract["allowedTools"],
                "budget": contract["budget"], "scopeExpiresAt": original_expiry,
                "productionAccess": False, "runnerDispatch": False,
            }
            receipt_path.write_text(json.dumps(receipt), encoding="utf-8")
            receipt_digest = hashlib.sha256(receipt_path.read_bytes()).hexdigest()
            original_receipt, digest = developer_workunit._verify_resume_scope(contract, request, binding, receipt_path)
            self.assertEqual(digest, receipt_digest)
            self.assertEqual(original_receipt["scopeExpiresAt"], original_expiry)

            issued = time.time()
            canonical_scope = {key: request[key] for key in (
                "developerLogin", "sourceRevision", "task", "allowedFiles", "writableFiles", "patchableFiles",
                "tests", "acceptanceCriteria", "budget", "browserUat", "implementationGuidance", "scopeTtlSeconds",
            ) if key in request}
            grant = {
                "schema": "spec224.developer-continuation-grant.v1", "continuationId": "continuation-1",
                "continuationOrdinal": 1, **binding,
                "developerLogin": "developer", "workspaceId": contract["workspaceId"],
                "sourceRevision": request["sourceRevision"], "originalAuthorizationReceiptSha256": receipt_digest,
                "scopeDigest": developer_workunit._canonical_digest(canonical_scope),
                "issuedAt": datetime.fromtimestamp(issued, timezone.utc).isoformat(),
                "scopeExpiresAt": datetime.fromtimestamp(issued + 3600, timezone.utc).isoformat(),
            }
            continuation_path = evidence / "continuation-receipts.jsonl"
            validated = developer_workunit._validate_continuation_grant(
                grant, contract=contract, request=request, binding=binding, receipt_digest=receipt_digest,
                receipt_path=receipt_path, continuation_path=continuation_path,
            )
            self.assertAlmostEqual(validated["scopeExpiresAtEpoch"], issued + 3600, places=3)
            self.assertEqual(grant["continuationOrdinal"], 1)

            receipt_path.write_text(json.dumps({**receipt, "allowedFiles": ["src/other.py"]}), encoding="utf-8")
            with self.assertRaisesRegex(ContractError, "receipt changed|does not match"):
                developer_workunit._verify_resume_scope({**contract, "originalAuthorizationReceiptSha256": receipt_digest}, request, binding, receipt_path)

    def test_resume_scope_rejects_widened_request_and_expired_scope_without_grant(self) -> None:
        contract = {"canonicalJobBinding": {"jobId": "job", "runId": "run", "tenantId": "tenant", "actorId": 4},
                    "sourceRevision": "a" * 40}
        request = {"sourceRevision": "b" * 40}
        with self.assertRaisesRegex(ContractError, "source baseline changed"):
            developer_workunit._verify_resume_scope(contract, request,
                {"jobId": "job", "runId": "run", "tenantId": "tenant", "actorId": 4}, Path("/missing/receipt"))

    def test_default_fast_lane_resume_after_three_day_scope_expiry_keeps_baseline_and_applies_bounded_continuation(self) -> None:
        task_id = "12345678-90ab-cdef-1234-567890abcdef"
        request = {
            "developerLogin": "developer", "sourceRevision": "a" * 40,
            "task": "Resume without rebasing", "allowedFiles": ["src/main.py"],
            "writableFiles": ["src/main.py"], "tests": {"runner": "pytest", "cwd": ".", "paths": ["src/main.py"]},
            "acceptanceCriteria": ["Keep the original source baseline"],
            "budget": {"maxAttempts": 2, "implementationMaxTurns": 2, "planMaxTurns": 1, "reviewMaxTurns": 1},
            "scopeTtlSeconds": 3600,
        }
        binding = {"jobId": "job-1", "runId": task_id, "tenantId": "tenant-1", "actorId": 42,
                   "attemptId": "attempt-2", "fencingVersion": 7}
        identity = {"login": "developer", "permission": "write", "repository": "team/project", "host": "github.com"}
        with tempfile.TemporaryDirectory() as raw_dir, patch.dict(os.environ, {"CODEX_SESSION_ID": "session-test"}):
            root = Path(raw_dir)
            workspace = root / "workspace"
            workspace.mkdir()
            scope_expiry = time.time() - 3 * 24 * 60 * 60
            contract = developer_workunit._request_contract(
                request, identity=identity, workspace=workspace,
                registered={"base_sha": request["sourceRevision"], "workspace_id": "workspace:test",
                            "owner_fencing_version": 1, "owner_lease_expires_at": scope_expiry},
                task_id=task_id, scope_expires_at=scope_expiry,
                canonical_binding={**binding, "attemptId": "attempt-1", "fencingVersion": 3},
            )
            evidence = root / "evidence" / task_id
            evidence.mkdir(parents=True)
            contract_path = evidence / "contract.json"
            contract_path.write_text(json.dumps(contract), encoding="utf-8")
            request_path = root / "request.json"
            request_path.write_text(json.dumps(request), encoding="utf-8")
            binding_path = root / "binding.json"
            binding_path.write_text(json.dumps(binding), encoding="utf-8")
            receipt_path = evidence / "authorization-receipt.json"
            original_receipt = {
                "schema": "developer-local-workunit-authorization.v1", "taskId": task_id,
                "workspaceId": contract["workspaceId"], "sourceSha": contract["sourceRevision"],
                "developerIdentity": identity, "ownerSessionId": "initial-session", "ownerPid": 1,
                "ownerFencingVersion": 1, "allowedFiles": contract["allowedFiles"],
                "writableFiles": contract["writableFiles"], "allowedTools": contract["allowedTools"],
                "budget": contract["budget"], "scopeExpiresAt": scope_expiry,
                "productionAccess": False, "runnerDispatch": False,
            }
            receipt_path.write_text(json.dumps(original_receipt), encoding="utf-8")
            receipt_digest = hashlib.sha256(receipt_path.read_bytes()).hexdigest()
            issued_at = scope_expiry + 3 * 24 * 60 * 60
            scope = {key: request[key] for key in (
                "developerLogin", "sourceRevision", "task", "allowedFiles", "writableFiles", "patchableFiles",
                "tests", "acceptanceCriteria", "budget", "browserUat", "implementationGuidance", "scopeTtlSeconds",
            ) if key in request}
            grant = {
                "schema": "spec224.developer-continuation-grant.v1", "continuationId": "continuation-after-three-days",
                "continuationOrdinal": 1, **binding, "developerLogin": "developer",
                "workspaceId": contract["workspaceId"], "sourceRevision": request["sourceRevision"],
                "originalAuthorizationReceiptSha256": receipt_digest,
                "scopeDigest": developer_workunit._canonical_digest(scope),
                "issuedAt": datetime.fromtimestamp(issued_at, timezone.utc).isoformat(),
                "scopeExpiresAt": datetime.fromtimestamp(issued_at + 3600, timezone.utc).isoformat(),
            }
            grant_path = root / "continuation-grant.json"
            grant_path.write_text(json.dumps(grant), encoding="utf-8")
            args = SimpleNamespace(
                scope_ttl_seconds=3600, repository=root, developer_login="developer", request=request_path,
                canonical_job_binding_file=binding_path, policy=root / "policy.toml", evidence_root=root / "evidence",
                continuation_grant_file=grant_path, base_sha=request["sourceRevision"], crash_at="",
                canonical_admission_response_fd=None, canonical_admission_request_fd=None,
            )
            run_called = []
            def git_only_source_existence(argv, **kwargs):
                if argv[:3] != ["git", "cat-file", "-e"]:
                    raise AssertionError(f"resume attempted Initial Admission check: {argv}")
                return SimpleNamespace(returncode=0, stdout="", stderr="")
            os.environ["CODEX_SESSION_ID"] = "session-after-supervisor-restart"
            with patch.object(developer_workunit, "verify_github_developer_permission", return_value=identity), \
                 patch.object(developer_workunit, "_validate_request"), \
                 patch.object(developer_workunit.AUTHORITY, "load_source_policy", return_value={"source_root": str(root / "source")}), \
                 patch.object(developer_workunit.AUTHORITY, "claim_registered_workspace", return_value={
                     "workspaceId": "workspace:test", "taskId": task_id, "sourceSha": request["sourceRevision"],
                     "ownerFencingVersion": 2, "leaseExpiresAt": issued_at + 3600,
                 }) as claim_workspace, \
                 patch.object(developer_workunit.subprocess, "run", side_effect=git_only_source_existence), \
                 patch.object(developer_workunit, "_run", side_effect=lambda *a, **k: run_called.append((a, k)) or 0):
                self.assertEqual(developer_workunit.start(args), 0)
            self.assertEqual(len(run_called), 1)
            resumed = json.loads(contract_path.read_text())
            self.assertEqual(resumed["sourceRevision"], request["sourceRevision"])
            self.assertEqual(resumed["taskId"], task_id)
            self.assertEqual(resumed["ownerSessionId"], "session-after-supervisor-restart")
            self.assertEqual(claim_workspace.call_args.kwargs["expected_head_sha"], request["sourceRevision"])
            self.assertAlmostEqual(resumed["scopeExpiresAt"], issued_at + 3600, places=3)
            self.assertEqual(resumed["originalScopeExpiresAt"], scope_expiry)
            self.assertEqual(resumed["originalAuthorizationReceiptSha256"], receipt_digest)
            self.assertEqual(hashlib.sha256(receipt_path.read_bytes()).hexdigest(), receipt_digest)
            continuation = json.loads((evidence / "continuation-receipts.jsonl").read_text().splitlines()[0])
            self.assertEqual(continuation["continuationId"], grant["continuationId"])
            self.assertEqual(continuation["sourceRevision"], request["sourceRevision"])

    def test_contract_requires_explicit_paths_tests_and_acceptance(self) -> None:
        identity = {"login": "developer", "permission": "write", "repository": "team/project", "host": "github.com"}
        registered = {"base_sha": "b" * 40, "workspace_id": "workspace:test", "owner_fencing_version": 1,
                      "owner_lease_expires_at": time.time() + 300}
        request = {"task": "Implement a scoped change", "allowedFiles": [], "writableFiles": [],
                   "tests": {"runner": "pytest"}, "acceptanceCriteria": []}
        with patch.dict(os.environ, {"CODEX_SESSION_ID": "session-test"}), self.assertRaisesRegex(
            ContractError, "allowedFiles and writableFiles",
        ):
            developer_workunit._request_contract(
                request, identity=identity, workspace=Path("/tmp/owned"), registered=registered,
                task_id="87654321-90ab-cdef-1234-567890abcdef", scope_expires_at=time.time() + 300,
            )


if __name__ == "__main__":
    unittest.main()
