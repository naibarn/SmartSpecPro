from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import test_workspace_authority

authority = test_workspace_authority.authority
canonical_source = authority._CANONICAL_SOURCE


@unittest.skipUnless(os.name == "nt", "Windows-native platform policy resolution")
class PlatformPolicyResolutionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).parent / ".test-temp")
        self.root = Path(self.temp.name)
        self.repo = self.root / "repository"
        self.repo.mkdir()
        self.policy = self.root / "repository.toml"

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_canonical_source_uses_windows_source_cache_and_fallback_roots(self) -> None:
        source = self.root / "source"
        lease = self.root / "lease"
        fallback = self.root / "fallback"
        self.policy.write_text(
            "[repository]\n"
            'repository_id = "fixture"\n'
            'remote = "origin"\n'
            'canonical_ref = "refs/heads/main"\n'
            'source_root = "/mnt/linux/source"\n'
            'lease_root = "/mnt/linux/lease"\n'
            'source_fallback_roots = ["/mnt/linux/fallback"]\n'
            "[repository.platforms.windows]\n"
            f"source_root = {json.dumps(str(source))}\n"
            f"lease_root = {json.dumps(str(lease))}\n"
            f"source_fallback_roots = [{json.dumps(str(fallback))}]\n",
            encoding="utf-8",
        )

        with patch.object(canonical_source, "git", return_value=str(self.repo)):
            resolved = canonical_source.load_policy(self.repo, self.policy)

        self.assertEqual(Path(resolved["source_root"]), source.resolve())
        self.assertEqual(Path(resolved["lease_root"]), lease.resolve())
        self.assertEqual(resolved["source_fallback_roots"], [fallback.resolve()])

    def test_canonical_source_requires_native_roots_when_policy_is_linux_only(self) -> None:
        self.policy.write_text(
            "[repository]\n"
            'repository_id = "fixture"\n'
            'remote = "origin"\n'
            'canonical_ref = "refs/heads/main"\n'
            'source_root = "/mnt/linux/source"\n'
            'lease_root = "/mnt/linux/lease"\n',
            encoding="utf-8",
        )

        with patch.object(canonical_source, "git", return_value=str(self.repo)):
            with self.assertRaisesRegex(
                canonical_source.LifecycleError,
                "PLATFORM_POLICY_REQUIRED: repository.platforms.windows.source_root",
            ):
                canonical_source.load_policy(self.repo, self.policy)

    def test_workspace_authority_uses_windows_workspace_and_recovery_roots(self) -> None:
        workspace = self.root / "canonical-workspace"
        recovery = self.root / "recovery"
        self.policy.write_text(
            "[repository]\n"
            'project_id = "fixture-project"\n'
            'repository_id = "fixture"\n'
            'remote = "origin"\n'
            'canonical_ref = "refs/heads/main"\n'
            'canonical_user_workspace = "/home/linux/project"\n'
            'recovery_root = "/mnt/linux/recovery"\n'
            "[repository.platforms.windows]\n"
            f"canonical_user_workspace = {json.dumps(str(workspace))}\n"
            f"recovery_root = {json.dumps(str(recovery))}\n",
            encoding="utf-8",
        )

        with patch.object(authority, "_git", return_value=str(self.repo)):
            resolved = authority.load_workspace_policy(self.repo, self.policy)

        self.assertEqual(Path(resolved["canonical_user_workspace"]), workspace.resolve())
        self.assertEqual(Path(resolved["recovery_root"]), recovery.resolve())

    def test_workspace_authority_rejects_linux_only_canonical_root(self) -> None:
        self.policy.write_text(
            "[repository]\n"
            'project_id = "fixture-project"\n'
            'repository_id = "fixture"\n'
            'remote = "origin"\n'
            'canonical_ref = "refs/heads/main"\n'
            'canonical_user_workspace = "/home/linux/project"\n',
            encoding="utf-8",
        )

        with patch.object(authority, "_git", return_value=str(self.repo)):
            with self.assertRaisesRegex(
                authority.WorkspaceAuthorityError,
                "PLATFORM_POLICY_REQUIRED: repository.platforms.windows.canonical_user_workspace",
            ):
                authority.load_workspace_policy(self.repo, self.policy)
