from __future__ import annotations

import hashlib
import json
import sqlite3
import subprocess
import tempfile
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from spec_workunit_contract import ContractError, load_contract


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
        self.assertEqual(parsed.test_command, [sys.executable, "-m", "pytest", "-q", "tests/test_example.py"])

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


if __name__ == "__main__":
    unittest.main()
