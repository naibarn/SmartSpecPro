from __future__ import annotations

import os
import hashlib
import json
import sys
import time
import unittest
from pathlib import Path
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
