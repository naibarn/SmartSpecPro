from __future__ import annotations

import hashlib
import importlib.util
import json
import sqlite3
import subprocess
import tempfile
import sys
import os
import time
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from spec_workunit_contract import (
    ContractError,
    developer_workspace_write_guard,
    load_contract,
    verify_developer_workspace_claim,
)


class WorkUnitContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / "repo"
        self.root.mkdir()
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        subprocess.run(["git", "config", "user.email", "contract-test@example.invalid"], cwd=self.root, check=True)
        subprocess.run(["git", "config", "user.name", "Contract Test"], cwd=self.root, check=True)
        self.spec_dir = self.root / "specs/feature/001-contract-test"
        (self.spec_dir / "handoff").mkdir(parents=True)
        self.test_file = self.root / "apps/web/server/test.test.ts"
        self.test_file.parent.mkdir(parents=True)
        self.test_file.write_text("// fixture\n", encoding="utf-8")
        self.requirement_text = "Show correlated cost per generated artifact."
        self.requirement_digest = hashlib.sha256(b"canonical requirement digest").hexdigest()
        self.source_spec_digest = "a" * 64
        (self.root / "specs/_status").mkdir(parents=True)
        (self.root / "specs/_status/spec-index.json").write_text(json.dumps({"records": [{
            "record_kind": "CANONICAL_SPEC", "spec_id": "001", "path": "specs/feature/001-contract-test",
            "authority": "ACTIVE_CANONICAL", "disposition": "ACTIVE_CANONICAL",
        }]}), encoding="utf-8")
        (self.spec_dir / "handoff/manifest.json").write_text(json.dumps({
            "identity": {"digest": self.source_spec_digest},
            "continuation": {"next_ready_workunit": "SPEC001_CONTRACT_TEST"},
            "integration": {"pending_workunit": None},
        }), encoding="utf-8")
        (self.spec_dir / "handoff/requirement-ledger.json").write_text(json.dumps({"requirements": [{
            "requirement_id": "REQ-0123456789AB", "requirement_text": self.requirement_text,
            "requirement_digest": self.requirement_digest, "final_state": "PARTIAL",
        }]}), encoding="utf-8")
        subprocess.run(["git", "add", "."], cwd=self.root, check=True)
        subprocess.run(["git", "commit", "-qm", "fixture"], cwd=self.root, check=True)
        self.head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.root, text=True, capture_output=True, check=True).stdout.strip()
        common = Path(subprocess.run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], cwd=self.root, text=True, capture_output=True, check=True).stdout.strip())
        self.registry = common / "workspace-authority.sqlite3"
        db = sqlite3.connect(self.registry)
        db.execute("CREATE TABLE workspaces (workspace_id TEXT, location TEXT, role TEXT, task_id TEXT, lifecycle_state TEXT, owner_session_id TEXT)")
        db.execute("INSERT INTO workspaces VALUES(?,?,?,?,?,?)", ("workspace-test", str(self.root), "TASK_WORKTREE", "task-test", "ACTIVE", "session-test"))
        db.commit()
        db.close()
        self.contract_path = Path(self.temp.name) / "contract.json"
        self.contract = {
            "schema": "agents-sdk-spec-workunit-contract.v1", "specId": "SPEC-001",
            "workUnit": "SPEC001_CONTRACT_TEST", "requirementId": "REQ-0123456789AB",
            "requirementText": self.requirement_text, "requirementDigest": self.requirement_digest,
            "sourceSpecDigest": self.source_spec_digest, "sourceRevision": self.head,
            "workspace": str(self.root), "workspaceId": "workspace-test", "taskId": "task-test", "ownerSessionId": "session-test",
            "allowedFiles": ["apps/web/server/test.test.ts"], "writableFiles": ["apps/web/server/test.test.ts"],
            "patchableFiles": [], "contextRanges": {},
            "tests": {"runner": "vitest", "cwd": "apps/web", "paths": ["apps/web/server/test.test.ts"]},
            "browserUat": {"status": "unavailable"},
            "acceptanceCriteria": ["Cost is bound to one artifact by explicit correlation identity."],
            "budget": {"maxAttempts": 2, "implementationMaxTurns": 12, "planMaxTurns": 4, "reviewMaxTurns": 4},
            "authority": {"source": "canonical-spec-handoff", "productionAccess": False, "sharedDatabaseWrite": False, "gateway": False, "provider": "codex-subscription", "isolatedTestDatabase": False},
        }

    def tearDown(self) -> None:
        self.temp.cleanup()

    def write_contract(self) -> None:
        self.contract_path.write_text(json.dumps(self.contract), encoding="utf-8")

    def test_accepts_contract_bound_to_canonical_requirement_and_owned_workspace(self) -> None:
        self.write_contract()
        parsed = load_contract(self.contract_path, self.root)
        self.assertEqual(parsed.work_unit, "SPEC001_CONTRACT_TEST")
        self.assertEqual(parsed.test_command, ["pnpm", "--dir", "apps/web", "exec", "vitest", "run", "server/test.test.ts"])
        self.assertEqual(parsed.binding["workspaceId"], "workspace-test")

    def test_pytest_command_uses_the_active_runtime_interpreter(self) -> None:
        self.contract["tests"] = {"runner": "pytest", "cwd": ".", "paths": ["tests/test_example.py"]}
        self.contract["allowedFiles"] = ["apps/web/server/test.test.ts", "tests/test_example.py"]
        (self.root / "tests").mkdir()
        (self.root / "tests/test_example.py").write_text("# fixture\\n", encoding="utf-8")
        self.write_contract()
        parsed = load_contract(self.contract_path, self.root)
        expected = [sys.executable, "-m", "pytest", *( ["--no-cov"] if importlib.util.find_spec("pytest_cov") else []), "-q", "tests/test_example.py"]
        self.assertEqual(parsed.test_command, expected)

    def test_pytest_command_prefers_the_worktree_python_backend_environment(self) -> None:
        test_path = "python-backend/tests/test_example.py"
        self.contract["tests"] = {"runner": "pytest", "cwd": ".", "paths": [test_path]}
        self.contract["allowedFiles"] = ["apps/web/server/test.test.ts", test_path]
        (self.root / "python-backend/tests").mkdir(parents=True)
        (self.root / test_path).write_text("# fixture\\n", encoding="utf-8")
        interpreter = self.root / "python-backend/.venv/bin/python"
        interpreter.parent.mkdir(parents=True)
        interpreter.write_text("test interpreter marker\\n", encoding="utf-8")
        self.write_contract()
        parsed = load_contract(self.contract_path, self.root)
        expected = [str(interpreter), "-m", "pytest", *( ["--no-cov"] if importlib.util.find_spec("pytest_cov") else []), "-q", test_path]
        self.assertEqual(parsed.test_command, expected)

    def test_rejects_requirement_text_or_digest_not_matching_canonical_ledger(self) -> None:
        self.contract["requirementText"] = "Different requirement"
        self.write_contract()
        with self.assertRaisesRegex(ContractError, "canonical ledger"):
            load_contract(self.contract_path, self.root)

    def test_rejects_unowned_or_wrong_task_worktree(self) -> None:
        self.contract["taskId"] = "other-task"
        self.write_contract()
        with self.assertRaisesRegex(ContractError, "workspace ownership"):
            load_contract(self.contract_path, self.root)

    def test_rejects_widened_authority_and_path_traversal(self) -> None:
        self.contract["authority"]["productionAccess"] = True
        self.write_contract()
        with self.assertRaisesRegex(ContractError, "explicitly denied"):
            load_contract(self.contract_path, self.root)
        self.contract["authority"]["productionAccess"] = False
        self.contract["allowedFiles"] = ["../outside"]
        self.write_contract()
        with self.assertRaisesRegex(ContractError, "unsafe path"):
            load_contract(self.contract_path, self.root)

    def test_rejects_stale_revision(self) -> None:
        self.contract["sourceRevision"] = "0" * 40
        self.write_contract()
        with self.assertRaisesRegex(ContractError, "sourceRevision"):
            load_contract(self.contract_path, self.root)

    def test_accepts_developer_fast_lane_only_with_authenticated_identity_and_live_registered_lease(self) -> None:
        test_path = "apps/web/server/fast-lane.test.ts"
        (self.root / test_path).write_text("// developer fixture\n", encoding="utf-8")
        requirement = "Build a bounded, disposable Mini-App and verify it in a local browser."
        identity = {"login": "dev-owner", "permission": "write", "repository": "example/smartspec", "host": "github.com"}
        self.contract.update({
            "schema": "agents-sdk-developer-workunit-contract.v1", "specId": "DEVELOPER-TASK",
            "workUnit": "DEV-WU-0123456789AB", "requirementId": "DEV-0123456789AB",
            "requirementText": requirement, "requirementDigest": hashlib.sha256(requirement.encode()).hexdigest(),
            "authorizationDigest": "b" * 64, "sourceSpecDigest": "b" * 64,
            "scopeExpiresAt": time.time() + 300,
            "allowedTools": ["list_files", "read_file", "read_range", "write_file", "patch_file", "run_focused_tests", "run_browser_uat"],
            "allowedFiles": ["apps/web/server/test.test.ts", test_path], "writableFiles": [test_path],
            "tests": {"runner": "vitest", "cwd": "apps/web", "paths": [test_path]},
            "developerIdentity": identity,
            "ownerSessionId": "current-session", "ownerPid": os.getpid(),
            "ownerProcessStart": __import__("spec_workunit_contract")._process_start(os.getpid()),
            "ownerFencingVersion": 1, "workspaceLeaseExpiresAt": time.time() + 300,
            "browserUat": {"status": "configured", "projectPath": "apps/web/server"},
            "authority": {"source": "authenticated-github-developer-policy", "productionAccess": False,
                          "sharedDatabaseWrite": False, "gateway": False, "provider": "codex-subscription",
                          "isolatedTestDatabase": False},
        })
        self.contract["canonicalJobBinding"] = {"jobId": "job-test", "runId": "task-test", "tenantId": "tenant-test",
                                                 "actorId": 1, "attemptId": "attempt-test", "fencingVersion": 1}
        auth_scope = {
            "canonicalJobIdentity": {key: self.contract["canonicalJobBinding"][key] for key in ("jobId", "runId", "tenantId", "actorId")},
            "developer": identity, "taskId": "task-test", "task": requirement,
            "acceptanceCriteria": self.contract["acceptanceCriteria"], "sourceSha": self.head,
            "workspaceId": "workspace-test", "allowedFiles": self.contract["allowedFiles"],
            "writableFiles": self.contract["writableFiles"], "patchableFiles": self.contract["patchableFiles"],
            "allowedTools": self.contract["allowedTools"], "tests": self.contract["tests"],
            "browserUat": self.contract["browserUat"], "budget": self.contract["budget"],
            "expiresAt": self.contract["scopeExpiresAt"], "productionAccess": False,
            "sharedDatabaseWrite": False, "runnerDispatch": False,
        }
        self.contract["authorizationDigest"] = hashlib.sha256(
            json.dumps(auth_scope, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        self.contract["sourceSpecDigest"] = self.contract["authorizationDigest"]
        db = sqlite3.connect(self.registry)
        db.execute("DROP TABLE workspaces")
        db.execute("CREATE TABLE workspaces (workspace_id TEXT, location TEXT, role TEXT, task_id TEXT, lifecycle_state TEXT, owner_session_id TEXT, owner_pid INTEGER, owner_process_start TEXT, owner_lease_expires_at REAL, owner_fencing_version INTEGER)")
        db.execute("INSERT INTO workspaces VALUES(?,?,?,?,?,?,?,?,?,?)", (
            "workspace-test", str(self.root), "TASK_WORKTREE", "task-test", "ACTIVE", "current-session",
            os.getpid(), self.contract["ownerProcessStart"], self.contract["workspaceLeaseExpiresAt"], 1,
        ))
        db.commit()
        db.close()
        self.write_contract()
        with patch.dict(os.environ, {"CODEX_SESSION_ID": "current-session"}), patch(
            "spec_workunit_contract.verify_github_developer_permission", return_value=identity,
        ):
            parsed = load_contract(self.contract_path, self.root)
            with developer_workspace_write_guard(self.root, parsed.raw):
                pass
        self.assertEqual(parsed.work_unit, "DEV-WU-0123456789AB")
        self.assertEqual(parsed.browser_uat["status"], "configured")
        original_budget = dict(self.contract["budget"])
        supplemental = {"authorizationReference": "explicit-owner-continuation",
                        "budget": {"maxAttempts": 2, "planMaxTurns": 8, "implementationMaxTurns": 16, "reviewMaxTurns": 8}}
        self.contract["continuationBudgetAuthorization"] = supplemental
        # Independently reproduce the producer's complete scope hash. The old
        # loader omitted this field and rejected every real amended continuation.
        auth_scope["continuationBudgetAuthorization"] = supplemental
        self.contract["authorizationDigest"] = hashlib.sha256(
            json.dumps(auth_scope, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        self.contract["sourceSpecDigest"] = self.contract["authorizationDigest"]
        self.write_contract()
        with patch.dict(os.environ, {"CODEX_SESSION_ID": "current-session"}), patch(
            "spec_workunit_contract.verify_github_developer_permission", return_value=identity,
        ):
            amended = load_contract(self.contract_path, self.root)
            self.assertEqual(amended.raw["continuationBudgetAuthorization"], supplemental)
            self.assertEqual(amended.raw["budget"], original_budget)
            self.contract["continuationBudgetAuthorization"] = {**supplemental, "authorizationReference": "tampered"}
            self.write_contract()
            with self.assertRaisesRegex(ContractError, "authorization digest does not match"):
                load_contract(self.contract_path, self.root)
        self.contract["continuationBudgetAuthorization"] = supplemental
        self.write_contract()
        db = sqlite3.connect(self.registry)
        renewed_expiry = parsed.raw["workspaceLeaseExpiresAt"] + 60
        db.execute(
            "UPDATE workspaces SET owner_lease_expires_at=? WHERE workspace_id='workspace-test'",
            (renewed_expiry,),
        )
        db.commit()
        db.close()
        with patch.dict(os.environ, {"CODEX_SESSION_ID": "current-session"}):
            self.assertEqual(verify_developer_workspace_claim(self.root, parsed.raw), 1)
            with developer_workspace_write_guard(self.root, parsed.raw):
                pass
        db = sqlite3.connect(self.registry)
        db.execute(
            "UPDATE workspaces SET owner_lease_expires_at=? WHERE workspace_id='workspace-test'",
            (parsed.raw["workspaceLeaseExpiresAt"] - 1,),
        )
        db.commit()
        db.close()
        with patch.dict(os.environ, {"CODEX_SESSION_ID": "current-session"}), self.assertRaisesRegex(
            ContractError, "lease, source owner, or fence",
        ):
            verify_developer_workspace_claim(self.root, parsed.raw)
        db = sqlite3.connect(self.registry)
        db.execute(
            "UPDATE workspaces SET owner_lease_expires_at=? WHERE workspace_id='workspace-test'",
            (renewed_expiry,),
        )
        db.commit()
        db.close()
        self.contract["writableFiles"] = [test_path, "newly-added-path.txt"]
        self.write_contract()
        with patch.dict(os.environ, {"CODEX_SESSION_ID": "current-session"}), patch(
            "spec_workunit_contract.verify_github_developer_permission", return_value=identity,
        ), self.assertRaisesRegex(ContractError, "digest does not match"):
            load_contract(self.contract_path, self.root)
        db = sqlite3.connect(self.registry)
        db.execute("UPDATE workspaces SET owner_fencing_version=2 WHERE workspace_id='workspace-test'")
        db.commit()
        db.close()
        with patch.dict(os.environ, {"CODEX_SESSION_ID": "current-session"}), self.assertRaisesRegex(
            ContractError, "lease, source owner, or fence",
        ):
            with developer_workspace_write_guard(self.root, parsed.raw):
                self.fail("stale fence acquired a mutation lock")


if __name__ == "__main__":
    unittest.main()
