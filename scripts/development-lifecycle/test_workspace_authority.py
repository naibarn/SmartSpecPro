from __future__ import annotations

import json
import importlib.util
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

AUTHORITY_PATH = Path(__file__).with_name("workspace_authority.py")
AUTHORITY_SPEC = importlib.util.spec_from_file_location("workspace_authority", AUTHORITY_PATH)
if AUTHORITY_SPEC is None or AUTHORITY_SPEC.loader is None:
    raise ImportError("workspace authority resolver module is unavailable")
authority = importlib.util.module_from_spec(AUTHORITY_SPEC)
sys.modules[AUTHORITY_SPEC.name] = authority
AUTHORITY_SPEC.loader.exec_module(authority)


def git(cwd: Path, *args: str) -> str:
    result = subprocess.run(["git", "-C", str(cwd), *args], text=True, capture_output=True)
    if result.returncode:
        raise AssertionError(f"git {args}: {result.stderr}")
    return result.stdout.strip()


class WorkspaceAuthorityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.remote = self.root / "remote.git"
        self.seed = self.root / "seed"
        self.canonical = self.root / "user-project"
        self.recovery = self.root / "recovery"
        git(self.root, "init", "--bare", "--initial-branch=main", str(self.remote))
        subprocess.run(["git", "clone", str(self.remote), str(self.seed)], check=True, capture_output=True)
        git(self.seed, "config", "user.email", "test@example.invalid")
        git(self.seed, "config", "user.name", "Workspace Authority Test")
        (self.seed / "tracked.txt").write_text("v1\n", encoding="utf-8")
        git(self.seed, "add", "tracked.txt")
        git(self.seed, "commit", "-m", "initial")
        git(self.seed, "push", "origin", "main")
        subprocess.run(["git", "clone", "--branch", "main", str(self.remote), str(self.canonical)], check=True, capture_output=True)
        git(self.canonical, "config", "user.email", "test@example.invalid")
        git(self.canonical, "config", "user.name", "Workspace Authority Test")
        self.policy = self.root / "repository.toml"
        self.write_policy()
        self.repo_id = "test-repository"
        self.project_id = "test-project"

    def tearDown(self) -> None:
        self.temp.cleanup()

    def write_policy(self) -> None:
        self.policy.write_text(
            "[repository]\n"
            'project_id = "test-project"\n'
            'repository_id = "test-repository"\n'
            'remote = "origin"\n'
            'canonical_ref = "refs/heads/main"\n'
            f'source_root = "{self.root / "source"}"\n'
            f'canonical_user_workspace = "{self.canonical}"\n'
            f'recovery_root = "{self.recovery}"\n',
            encoding="utf-8",
        )

    def test_explicit_registry_roles_ignore_path_and_branch_names(self) -> None:
        project = authority.resolve_project_authority(self.canonical, self.policy)
        canonical = authority.get_canonical_user_workspace(self.canonical, self.policy)
        self.assertEqual(project["project_id"], self.project_id)
        self.assertEqual(canonical["role"], "CANONICAL_USER_WORKSPACE")
        branch_worktree = self.root / "looks-like-canonical"
        git(self.canonical, "worktree", "add", "-b", "looks-like-main", str(branch_worktree), "HEAD")
        workspace = authority.register_workspace(
            self.canonical, self.policy, branch_worktree, role="TASK_WORKTREE", task_id="task-1"
        )
        self.assertEqual(workspace["role"], "TASK_WORKTREE")
        self.assertNotEqual(workspace["workspace_id"], canonical["workspace_id"])

    def test_unknown_workspace_does_not_gain_authority_from_branch_or_path(self) -> None:
        other = self.root / "main-canonical"
        git(self.canonical, "worktree", "add", str(other), "HEAD")
        workspace = authority.observe_workspace(self.canonical, self.policy, other)
        self.assertEqual(workspace["role"], "UNKNOWN_WORKSPACE")
        self.assertNotEqual(workspace["workspace_id"], authority.get_canonical_user_workspace(self.canonical, self.policy)["workspace_id"])

    def test_external_workspace_requires_explicit_role_and_matching_canonical_remote(self) -> None:
        external = self.root / "external-clone"
        subprocess.run(["git", "clone", str(self.remote), str(external)], check=True, capture_output=True)
        with self.assertRaisesRegex(authority.WorkspaceAuthorityError, "WORKSPACE_REPOSITORY_INSTANCE_MISMATCH"):
            authority.register_workspace(self.canonical, self.policy, external, role="UNKNOWN_WORKSPACE")
        registered = authority.register_workspace(self.canonical, self.policy, external, role="EXTERNAL_WORKSPACE")
        self.assertEqual(registered["role"], "EXTERNAL_WORKSPACE")
        foreign_remote = self.root / "foreign.git"
        git(self.root, "init", "--bare", str(foreign_remote))
        git(external, "remote", "set-url", "origin", str(foreign_remote))
        with self.assertRaisesRegex(authority.WorkspaceAuthorityError, "WORKSPACE_REPOSITORY_INSTANCE_MISMATCH"):
            authority.register_workspace(self.canonical, self.policy, external, role="EXTERNAL_WORKSPACE")

    def test_duplicate_canonical_role_is_rejected(self) -> None:
        authority.get_canonical_user_workspace(self.canonical, self.policy)
        other = self.root / "second-canonical"
        git(self.canonical, "worktree", "add", str(other), "HEAD")
        with self.assertRaisesRegex(authority.WorkspaceAuthorityError, "CANONICAL_WORKSPACE_ALREADY_REGISTERED"):
            authority.register_workspace(self.canonical, self.policy, other, role="CANONICAL_USER_WORKSPACE")

    def test_dirty_state_does_not_imply_active_session_and_dead_owner_is_stale(self) -> None:
        workspace = authority.register_workspace(
            self.canonical,
            self.policy,
            self.canonical,
            role="CANONICAL_USER_WORKSPACE",
            owner_session_id="session-dead",
            owner_pid=2_000_000_000,
            owner_lease_seconds=300,
        )
        (self.canonical / "tracked.txt").write_text("dirty\n", encoding="utf-8")
        facts = authority.observe_workspace(self.canonical, self.policy, self.canonical)
        self.assertTrue(facts["dirty"])
        self.assertEqual(facts["session_state"], "STALE_CLOSED_SESSION")
        self.assertEqual(facts["workspace_id"], workspace["workspace_id"])

    def test_live_process_lease_is_active_even_when_workspace_is_clean(self) -> None:
        authority.register_workspace(
            self.canonical,
            self.policy,
            self.canonical,
            role="CANONICAL_USER_WORKSPACE",
            owner_session_id="session-live",
            owner_pid=os.getpid(),
            owner_lease_seconds=300,
        )
        facts = authority.observe_workspace(self.canonical, self.policy, self.canonical)
        self.assertFalse(facts["dirty"])
        self.assertEqual(facts["session_state"], "ACTIVE_SESSION")

    def test_dirty_snapshot_preserves_index_worktree_and_untracked_content_without_mutation(self) -> None:
        (self.canonical / "tracked.txt").write_text("staged\n", encoding="utf-8")
        git(self.canonical, "add", "tracked.txt")
        (self.canonical / "tracked.txt").write_text("unstaged\n", encoding="utf-8")
        (self.canonical / "new.txt").write_bytes(b"untracked\x00bytes")
        before = git(self.canonical, "status", "--porcelain=v1", "--untracked-files=all")
        receipt = authority.preserve_dirty_workspace(self.canonical, self.policy)
        after = git(self.canonical, "status", "--porcelain=v1", "--untracked-files=all")
        self.assertEqual(before, after)
        self.assertEqual((self.canonical / "new.txt").read_bytes(), b"untracked\x00bytes")
        snapshot = Path(receipt["recovery_path"])
        manifest = json.loads((snapshot / "manifest.json").read_text(encoding="utf-8"))
        self.assertTrue(manifest["staged_patch"]["sha256"])
        self.assertTrue(manifest["unstaged_patch"]["sha256"])
        self.assertEqual((snapshot / "untracked" / "new.txt").read_bytes(), b"untracked\x00bytes")

    def test_clean_registered_canonical_workspace_fast_forwards_to_integrated_sha(self) -> None:
        (self.seed / "tracked.txt").write_text("v2\n", encoding="utf-8")
        git(self.seed, "add", "tracked.txt")
        git(self.seed, "commit", "-m", "integrated v2")
        integrated = git(self.seed, "rev-parse", "HEAD")
        git(self.seed, "push", "origin", "main")
        result = authority.converge_canonical_workspace(self.canonical, self.policy, integrated_sha=integrated, task_id="run-224")
        self.assertEqual(result["status"], "USER_WORKSPACE_CONVERGED")
        self.assertEqual(git(self.canonical, "rev-parse", "HEAD"), integrated)
        self.assertEqual(git(self.canonical, "status", "--porcelain=v1"), "")
        self.assertEqual(result["receipt"]["canonical_user_workspace_sha"], integrated)
        self.assertEqual(result["receipt"]["task_id"], "run-224")

    def test_canonical_workspace_fast_forwards_when_main_is_checked_out_elsewhere(self) -> None:
        git(self.canonical, "switch", "-c", "user-session")
        main_checkout = self.root / "main-checkout"
        git(self.canonical, "worktree", "add", str(main_checkout), "main")
        main_checkout_sha = git(main_checkout, "rev-parse", "HEAD")
        (self.seed / "tracked.txt").write_text("v2\n", encoding="utf-8")
        git(self.seed, "add", "tracked.txt")
        git(self.seed, "commit", "-m", "integrated v2")
        integrated = git(self.seed, "rev-parse", "HEAD")
        git(self.seed, "push", "origin", "main")

        result = authority.converge_canonical_workspace(
            self.canonical, self.policy, integrated_sha=integrated
        )

        self.assertEqual(result["status"], "USER_WORKSPACE_CONVERGED")
        self.assertEqual(git(self.canonical, "branch", "--show-current"), "user-session")
        self.assertEqual(git(self.canonical, "rev-parse", "HEAD"), integrated)
        self.assertEqual(git(main_checkout, "branch", "--show-current"), "main")
        self.assertEqual(git(main_checkout, "rev-parse", "HEAD"), main_checkout_sha)

    def test_dirty_canonical_workspace_is_snapshotted_and_never_overwritten(self) -> None:
        original = (self.canonical / "tracked.txt").read_text(encoding="utf-8")
        (self.canonical / "tracked.txt").write_text("user work\n", encoding="utf-8")
        before = git(self.canonical, "status", "--porcelain=v1", "--untracked-files=all")
        result = authority.converge_canonical_workspace(self.canonical, self.policy)
        self.assertEqual(result["status"], "DIRTY_WORK_PRESERVED")
        self.assertTrue(Path(result["recovery_receipt"]["recovery_path"]).is_dir())
        self.assertEqual((self.canonical / "tracked.txt").read_text(encoding="utf-8"), "user work\n")
        self.assertEqual(git(self.canonical, "status", "--porcelain=v1", "--untracked-files=all"), before)
        self.assertNotEqual(original, "user work\n")
        self.assertNotIn("completion_receipt", result)

    def test_workspace_retirement_is_dry_run_by_default_and_refuses_live_or_dirty_work(self) -> None:
        task = self.root / "task-tree"
        git(self.canonical, "worktree", "add", "-b", "task/retire", str(task), "HEAD")
        registered = authority.register_workspace(self.canonical, self.policy, task, role="TASK_WORKTREE", task_id="task-2")
        dry_run = authority.retire_completed_worktree(self.canonical, self.policy, registered["workspace_id"])
        self.assertEqual(dry_run["status"], "RETIREMENT_DRY_RUN")
        self.assertTrue(task.exists())
        authority.register_workspace(
            self.canonical,
            self.policy,
            task,
            role="TASK_WORKTREE",
            task_id="task-2",
            owner_session_id="live",
            owner_pid=os.getpid(),
            owner_lease_seconds=300,
        )
        blocked = authority.retire_completed_worktree(
            self.canonical, self.policy, registered["workspace_id"], apply=True
        )
        self.assertEqual(blocked["status"], "RETIREMENT_BLOCKED_LIVE_OWNER")
        self.assertTrue(task.exists())
        (task / "user.txt").write_text("keep\n", encoding="utf-8")
        authority.clear_workspace_owner(self.canonical, self.policy, registered["workspace_id"])
        blocked_dirty = authority.retire_completed_worktree(
            self.canonical, self.policy, registered["workspace_id"], apply=True
        )
        self.assertEqual(blocked_dirty["status"], "RETIREMENT_BLOCKED_DIRTY")
        self.assertTrue((task / "user.txt").exists())

    def test_workspace_retirement_blocks_stash_and_missing_unproven_workspace(self) -> None:
        task = self.root / "task-with-stash"
        git(self.canonical, "worktree", "add", "-b", "task/stash", str(task), "HEAD")
        (task / "tracked.txt").write_text("stashed work\n", encoding="utf-8")
        git(task, "stash", "push", "-m", "keep this work")
        workspace = authority.register_workspace(self.canonical, self.policy, task, role="TASK_WORKTREE")
        result = authority.retire_completed_worktree(self.canonical, self.policy, workspace["workspace_id"], apply=True)
        self.assertEqual(result["status"], "RETIREMENT_BLOCKED_STASH_PRESENT")
        self.assertTrue(task.exists())
        git(self.canonical, "worktree", "remove", "--force", str(task))
        missing = authority.retire_completed_worktree(self.canonical, self.policy, workspace["workspace_id"], apply=True)
        self.assertEqual(missing["status"], "RETIREMENT_BLOCKED_MISSING_WITHOUT_RECOVERY_PROOF")

    def test_retirement_requires_fresh_dry_run_and_writes_receipt(self) -> None:
        task = self.root / "task-safe-retire"
        git(self.canonical, "worktree", "add", "-b", "task/safe-retire", str(task), "HEAD")
        workspace = authority.register_workspace(self.canonical, self.policy, task, role="TASK_WORKTREE", task_id="task-safe")
        blocked = authority.retire_completed_worktree(self.canonical, self.policy, workspace["workspace_id"], apply=True)
        self.assertEqual(blocked["status"], "RETIREMENT_DRY_RUN_REQUIRED")
        preview = authority.retire_completed_worktree(self.canonical, self.policy, workspace["workspace_id"])
        self.assertEqual(preview["status"], "RETIREMENT_DRY_RUN")
        retired = authority.retire_completed_worktree(self.canonical, self.policy, workspace["workspace_id"], apply=True)
        self.assertEqual(retired["status"], "WORKTREE_RETIRED")
        self.assertEqual(retired["receipt"]["result"], "WORKTREE_RETIRED")
        self.assertFalse(task.exists())

    def test_scenario_matrix_has_all_thirty_incident_cases_and_repeats_race_cases(self) -> None:
        scenarios_path = Path(__file__).with_name("workspace_authority_scenarios.json")
        matrix = json.loads(scenarios_path.read_text(encoding="utf-8"))
        scenarios = matrix["scenarios"]
        self.assertEqual(len(scenarios), 30)
        self.assertEqual({row["number"] for row in scenarios}, set(range(1, 31)))
        repeated = {row["number"] for row in scenarios if row.get("repetitions", 1) >= 2}
        self.assertTrue({18, 19, 20, 21, 22, 30}.issubset(repeated))
        self.assertTrue(all(row.get("proof_kind") in {"LOCAL_EXECUTABLE", "CONTRACT_SIMULATION"} for row in scenarios))


if __name__ == "__main__":
    unittest.main()
