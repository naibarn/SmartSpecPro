from __future__ import annotations

import json
import io
import importlib.util
import os
import subprocess
import sys
import tempfile
from contextlib import contextmanager, redirect_stdout
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from unittest.mock import patch
import unittest
from pathlib import Path

AUTHORITY_PATH = Path(__file__).with_name("workspace_authority.py")
AUTHORITY_SPEC = importlib.util.spec_from_file_location("workspace_authority", AUTHORITY_PATH)
if AUTHORITY_SPEC is None or AUTHORITY_SPEC.loader is None:
    raise ImportError("workspace authority resolver module is unavailable")
authority = importlib.util.module_from_spec(AUTHORITY_SPEC)
sys.modules[AUTHORITY_SPEC.name] = authority
AUTHORITY_SPEC.loader.exec_module(authority)

CONVERGENCE_PATH = Path(__file__).with_name("convergence_contract.py")
CONVERGENCE_SPEC = importlib.util.spec_from_file_location("convergence_contract", CONVERGENCE_PATH)
if CONVERGENCE_SPEC is None or CONVERGENCE_SPEC.loader is None:
    raise ImportError("convergence contract module is unavailable")
convergence_contract = importlib.util.module_from_spec(CONVERGENCE_SPEC)
sys.modules[CONVERGENCE_SPEC.name] = convergence_contract
CONVERGENCE_SPEC.loader.exec_module(convergence_contract)


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

    def test_external_runner_session_requires_explicit_live_owner_lease(self) -> None:
        external = self.root / "external-runner"
        subprocess.run(["git", "clone", str(self.remote), str(external)], check=True, capture_output=True)

        registered = authority.register_workspace(
            self.canonical,
            self.policy,
            external,
            role="EXTERNAL_WORKSPACE",
            owner_session_id="claude-runner-session",
            owner_pid=os.getpid(),
            owner_lease_seconds=300,
        )

        self.assertEqual(registered["role"], "EXTERNAL_WORKSPACE")
        self.assertEqual(registered["session_state"], "ACTIVE_SESSION")

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

        task = self.root / "ended-session-worktree"
        git(self.canonical, "worktree", "add", "-b", "task/ended-session", str(task), "HEAD")
        task_workspace = authority.register_workspace(
            self.canonical,
            self.policy,
            task,
            role="TASK_WORKTREE",
            task_id="ended-session-task",
            owner_session_id="ended-session",
            owner_pid=2_000_000_001,
            owner_lease_seconds=300,
        )
        project = authority.resolve_project_authority(self.canonical, self.policy)
        task_state = next(row for row in project["workspaces"] if row["workspace_id"] == task_workspace["workspace_id"])
        self.assertEqual(task_state["session_state"], "STALE_CLOSED_SESSION")
        self.assertEqual(project["active_sessions"], 0)
        self.assertTrue(task.exists())

    def test_zero_session_closeout_keeps_dirty_workspaces_visible(self) -> None:
        for repetition in range(3):
            with self.subTest(repetition=repetition + 1):
                (self.canonical / "tracked.txt").write_text(f"uncommitted-{repetition}\n", encoding="utf-8")
                authority.register_workspace(
                    self.canonical,
                    self.policy,
                    self.canonical,
                    role="CANONICAL_USER_WORKSPACE",
                )

                project = authority.resolve_project_authority(self.canonical, self.policy)

                self.assertEqual(project["active_sessions"], 0)
                self.assertEqual(project["workspace_count"], 1)
                self.assertTrue(project["workspaces"][0]["dirty"])
                self.assertEqual(project["workspaces"][0]["session_state"], "NO_ACTIVE_SESSION")

    def test_project_source_projection_tracks_each_repository_identity(self) -> None:
        result = convergence_contract.evaluate_repository_sources(
            "project-a",
            [
                {"repository_id": "repo-a", "canonical_sha": "a1", "workspace_sha": "a1", "dirty": False},
                {"repository_id": "repo-b", "canonical_sha": "b2", "workspace_sha": "b1", "dirty": False},
            ],
        )
        self.assertEqual(result["status"], "SOURCE_CONVERGENCE_PENDING")
        self.assertEqual([row["state"] for row in result["repositories"]], ["SYNCED", "BEHIND_OR_DIVERGED"])
        self.assertEqual({row["project_id"] for row in result["repositories"]}, {"project-a"})

    def test_project_source_projection_does_not_share_canonical_sha_across_repositories(self) -> None:
        result = convergence_contract.evaluate_repository_sources(
            "project-a",
            [
                {"repository_id": "frontend", "canonical_sha": "front", "workspace_sha": "front", "dirty": False},
                {"repository_id": "backend", "canonical_sha": "back", "workspace_sha": "back", "dirty": False},
            ],
        )
        self.assertEqual(result["status"], "SOURCE_CONVERGED")
        self.assertEqual(result["repository_count"], 2)
        with self.assertRaisesRegex(ValueError, "REPOSITORY_ID_MISSING_OR_DUPLICATE"):
            convergence_contract.evaluate_repository_sources(
                "project-a",
                [
                    {"repository_id": "same", "canonical_sha": "x", "workspace_sha": "x"},
                    {"repository_id": "same", "canonical_sha": "y", "workspace_sha": "y"},
                ],
            )

    def test_development_completion_does_not_claim_production_convergence(self) -> None:
        development = convergence_contract.evaluate_development_completion(
            {
                "integrated": True,
                "canonical_verified": True,
                "user_workspace_converged": True,
                "worktree_lifecycle_settled": True,
                "required_tests_passed": True,
            }
        )
        production = convergence_contract.evaluate_production_convergence({"source_sha": "abc"})
        self.assertEqual(development["status"], "DEVELOPMENT_COMPLETE")
        self.assertEqual(production["status"], "PRODUCTION_CONVERGENCE_PENDING")

    def test_production_convergence_requires_applied_migrations(self) -> None:
        release = self.production_release_facts()
        release["required_migrations"] = ["migration-1", "migration-2"]
        release["migration_evidence"] = [{"migration_id": "migration-1", "state": "APPLIED_VERIFIED"}]
        result = convergence_contract.evaluate_production_convergence(release)
        self.assertEqual(result["status"], "PRODUCTION_CONVERGENCE_PENDING")
        self.assertIn("REQUIRED_MIGRATIONS_NOT_VERIFIED", result["reasons"])

    def test_partial_runtime_rollout_blocks_production_convergence(self) -> None:
        release = self.production_release_facts()
        release["required_targets"] = ["worker-a", "container-b"]
        result = convergence_contract.evaluate_production_convergence(release)
        self.assertIn("REQUIRED_RUNTIME_TARGETS_MISSING", result["reasons"])

    def test_stale_container_revision_blocks_production_convergence(self) -> None:
        release = self.production_release_facts()
        release["required_targets"] = ["container-a"]
        release["expected_runtime_revisions"] = {"container-a": "revision-1"}
        release["runtime_targets"] = [
            {
                "target_id": "container-a",
                "source_sha": "old-sha",
                "artifact_digest": release["artifact_digest"],
                "runtime_revision": "revision-old",
                "health": "HEALTHY",
            }
        ]
        result = convergence_contract.evaluate_production_convergence(release)
        self.assertIn("RUNTIME_TARGET_STALE:container-a", result["reasons"])
        self.assertIn("RUNTIME_REVISION_STALE:container-a", result["reasons"])

    def test_rollback_requires_lineage_and_converges_as_a_new_release_target(self) -> None:
        release = self.production_release_facts()
        release["release_kind"] = "ROLLBACK"
        blocked = convergence_contract.evaluate_production_convergence(release)
        self.assertIn("ROLLBACK_LINEAGE_MISSING", blocked["reasons"])
        release["rollback"] = {
            "previous_release_id": "release-current",
            "rollback_of_release_id": "release-prior",
        }
        self.assertEqual(convergence_contract.evaluate_production_convergence(release)["status"], "PRODUCTION_CONVERGED")

    @staticmethod
    def production_release_facts() -> dict[str, object]:
        return {
            "source_sha": "source-1",
            "artifact_digest": "sha256:artifact-1",
            "artifact_source_sha": "source-1",
            "deployment_id": "deployment-1",
            "deployment_status": "DEPLOYED_VERIFIED",
            "deployment_source_sha": "source-1",
            "deployment_artifact_digest": "sha256:artifact-1",
            "required_migrations": [],
            "migration_evidence": [],
            "required_targets": ["worker-a"],
            "expected_runtime_revisions": {"worker-a": "runtime-1"},
            "runtime_targets": [
                {
                    "target_id": "worker-a",
                    "source_sha": "source-1",
                    "artifact_digest": "sha256:artifact-1",
                    "runtime_revision": "runtime-1",
                    "health": "HEALTHY",
                }
            ],
        }

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

    def test_unique_local_commit_blocks_convergence_without_moving_head(self) -> None:
        (self.canonical / "tracked.txt").write_text("local intended work\n", encoding="utf-8")
        git(self.canonical, "add", "tracked.txt")
        git(self.canonical, "commit", "-m", "local intended work")
        local_head = git(self.canonical, "rev-parse", "HEAD")
        (self.seed / "tracked.txt").write_text("remote v2\n", encoding="utf-8")
        git(self.seed, "add", "tracked.txt")
        git(self.seed, "commit", "-m", "integrated v2")
        git(self.seed, "push", "origin", "main")

        result = authority.converge_canonical_workspace(self.canonical, self.policy)

        self.assertEqual(result["status"], "BLOCKED_UNPUSHED_INTENDED_WORK")
        self.assertEqual(git(self.canonical, "rev-parse", "HEAD"), local_head)
        self.assertTrue(Path(result["recovery_bundle"]).is_file())

    def test_patch_equivalent_commit_is_classified_without_deleting_refs(self) -> None:
        git(self.canonical, "switch", "-c", "local-equivalent")
        (self.canonical / "tracked.txt").write_text("equivalent patch\n", encoding="utf-8")
        git(self.canonical, "add", "tracked.txt")
        git(self.canonical, "commit", "-m", "local implementation")
        local_head = git(self.canonical, "rev-parse", "HEAD")

        (self.seed / "tracked.txt").write_text("equivalent patch\n", encoding="utf-8")
        git(self.seed, "add", "tracked.txt")
        git(self.seed, "commit", "-m", "canonical equivalent implementation")
        git(self.seed, "push", "origin", "main")
        policy = authority.load_workspace_policy(self.canonical, self.policy)
        authority._fetch_canonical(self.canonical, policy)
        canonical_tip = git(self.canonical, "rev-parse", "refs/remotes/origin/main")

        classification = authority._local_commit_classification(self.canonical, local_head, canonical_tip)

        self.assertEqual(classification["state"], "PATCH_EQUIVALENT")
        self.assertEqual(classification["patch_equivalent_commits"], [local_head])
        self.assertEqual(git(self.canonical, "rev-parse", "HEAD"), local_head)
        self.assertEqual(git(self.canonical, "branch", "--show-current"), "local-equivalent")
        with self.assertRaisesRegex(authority.WorkspaceAuthorityError, "COMMIT_EQUIVALENCE_CLASSIFICATION_FAILED"):
            authority._local_commit_classification(self.canonical, local_head, "0" * 40)

    def test_concurrent_external_workspace_registration_is_serialized(self) -> None:
        clones = [self.root / "external-a", self.root / "external-b"]
        for clone in clones:
            subprocess.run(["git", "clone", str(self.remote), str(clone)], check=True, capture_output=True)

        def register(clone: Path) -> dict[str, object]:
            return authority.register_workspace(
                self.canonical,
                self.policy,
                clone,
                role="EXTERNAL_WORKSPACE",
                task_id=clone.name,
                owner_session_id=f"session-{clone.name}",
                owner_pid=os.getpid(),
                owner_lease_seconds=300,
            )

        results = []
        with ThreadPoolExecutor(max_workers=2) as pool:
            for _ in range(5):
                results = list(pool.map(register, clones))

        self.assertEqual(len({result["workspace_id"] for result in results}), 2)
        self.assertEqual({result["task_id"] for result in results}, {"external-a", "external-b"})
        self.assertTrue(all(result["session_state"] == "ACTIVE_SESSION" for result in results))

    def test_registry_indexes_hundreds_of_temporary_worktrees(self) -> None:
        for index in range(220):
            workspace = self.root / "temporary-worktrees" / f"task-{index:03d}"
            git(self.canonical, "worktree", "add", "--detach", str(workspace), "HEAD")
            authority.register_workspace(
                self.canonical,
                self.policy,
                workspace,
                role="TASK_WORKTREE",
                task_id=f"task-{index:03d}",
            )

        resolved = authority.resolve_project_authority(self.canonical, self.policy)
        task_workspaces = [
            workspace for workspace in resolved["workspaces"]
            if workspace["role"] == "TASK_WORKTREE"
        ]
        self.assertEqual(len(task_workspaces), 220)
        self.assertEqual(len({workspace["workspace_id"] for workspace in task_workspaces}), 220)

    def test_convergence_retries_when_canonical_advances_mid_operation(self) -> None:
        original_fetch = authority._fetch_canonical
        for repetition in range(5):
            next_version = repetition * 2 + 2
            (self.seed / "tracked.txt").write_text(f"v{next_version}\n", encoding="utf-8")
            git(self.seed, "add", "tracked.txt")
            git(self.seed, "commit", "-m", f"integrated v{next_version}")
            integrated = git(self.seed, "rev-parse", "HEAD")
            git(self.seed, "push", "origin", "main")
            calls = 0

            def advancing_fetch(repo: Path, policy: dict[str, object]) -> str:
                nonlocal calls
                calls += 1
                if calls == 2:
                    newer_version = next_version + 1
                    (self.seed / "tracked.txt").write_text(f"v{newer_version}\n", encoding="utf-8")
                    git(self.seed, "add", "tracked.txt")
                    git(self.seed, "commit", "-m", f"integrated v{newer_version}")
                    git(self.seed, "push", "origin", "main")
                return original_fetch(repo, policy)

            authority._fetch_canonical = advancing_fetch
            try:
                result = authority.converge_canonical_workspace(
                    self.canonical, self.policy, integrated_sha=integrated
                )
            finally:
                authority._fetch_canonical = original_fetch

            canonical_sha = git(self.seed, "rev-parse", "HEAD")
            self.assertEqual(result["status"], "USER_WORKSPACE_CONVERGED")
            self.assertGreaterEqual(calls, 3)
            self.assertEqual(result["receipt"]["canonical_sha"], canonical_sha)
            self.assertEqual(git(self.canonical, "rev-parse", "HEAD"), canonical_sha)

    def test_repeated_convergence_to_same_integration_is_idempotent_for_workspace_state(self) -> None:
        (self.seed / "tracked.txt").write_text("v2\n", encoding="utf-8")
        git(self.seed, "add", "tracked.txt")
        git(self.seed, "commit", "-m", "integrated v2")
        integrated = git(self.seed, "rev-parse", "HEAD")
        git(self.seed, "push", "origin", "main")

        results = [
            authority.converge_canonical_workspace(self.canonical, self.policy, integrated_sha=integrated)
            for _ in range(5)
        ]

        self.assertTrue(all(result["status"] == "USER_WORKSPACE_CONVERGED" for result in results))
        self.assertEqual(len({result["receipt"]["canonical_user_workspace_sha"] for result in results}), 1)
        self.assertEqual(git(self.canonical, "status", "--porcelain=v1"), "")

    def test_dirty_canonical_workspace_is_snapshotted_and_never_overwritten(self) -> None:
        for repetition in range(3):
            with self.subTest(repetition=repetition + 1):
                content = f"user work {repetition}\n"
                (self.canonical / "tracked.txt").write_text(content, encoding="utf-8")
                before = git(self.canonical, "status", "--porcelain=v1", "--untracked-files=all")
                result = authority.converge_canonical_workspace(self.canonical, self.policy)
                self.assertEqual(result["status"], "DIRTY_WORK_PRESERVED")
                self.assertTrue(Path(result["recovery_receipt"]["recovery_path"]).is_dir())
                self.assertEqual((self.canonical / "tracked.txt").read_text(encoding="utf-8"), content)
                self.assertEqual(git(self.canonical, "status", "--porcelain=v1", "--untracked-files=all"), before)
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
        stash_before = git(task, "stash", "list", "--format=%H")
        workspace = authority.register_workspace(self.canonical, self.policy, task, role="TASK_WORKTREE")
        result = authority.retire_completed_worktree(self.canonical, self.policy, workspace["workspace_id"], apply=True)
        self.assertEqual(result["status"], "RETIREMENT_BLOCKED_STASH_PRESENT")
        self.assertEqual(result["stash_classification"][0]["state"], "UNIQUE_OR_UNPROVEN_STASH")
        self.assertTrue(task.exists())
        self.assertEqual(git(task, "stash", "list", "--format=%H"), stash_before)
        git(self.canonical, "worktree", "remove", "--force", str(task))
        missing = authority.retire_completed_worktree(self.canonical, self.policy, workspace["workspace_id"], apply=True)
        self.assertEqual(missing["status"], "RETIREMENT_BLOCKED_MISSING_WITHOUT_RECOVERY_PROOF")

    def test_retirement_classifies_integrated_stash_without_dropping_it(self) -> None:
        task = self.root / "task-with-integrated-stash"
        git(self.canonical, "worktree", "add", "-b", "task/integrated-stash", str(task), "HEAD")
        (task / "tracked.txt").write_text("integrated stash patch\n", encoding="utf-8")
        git(task, "stash", "push", "-m", "already integrated")
        stash_before = git(task, "stash", "list", "--format=%H")

        (self.seed / "tracked.txt").write_text("integrated stash patch\n", encoding="utf-8")
        git(self.seed, "add", "tracked.txt")
        git(self.seed, "commit", "-m", "integrated stash patch")
        git(self.seed, "push", "origin", "main")

        workspace = authority.register_workspace(
            self.canonical, self.policy, task, role="TASK_WORKTREE", task_id="integrated-stash"
        )
        result = authority.retire_completed_worktree(
            self.canonical, self.policy, workspace["workspace_id"], apply=True
        )

        self.assertEqual(result["status"], "RETIREMENT_BLOCKED_STASH_PRESENT")
        self.assertEqual(result["stash_classification"][0]["state"], "PATCH_EQUIVALENT_IN_CANONICAL")
        self.assertTrue(task.exists())
        self.assertEqual(git(task, "stash", "list", "--format=%H"), stash_before)

    def test_recovery_workspace_is_never_automatically_retired(self) -> None:
        recovery = self.root / "recovery-worktree"
        git(self.canonical, "worktree", "add", "-b", "recovery/keep", str(recovery), "HEAD")
        (recovery / "tracked.txt").write_text("recovery copy\n", encoding="utf-8")
        workspace = authority.register_workspace(
            self.canonical, self.policy, recovery, role="RECOVERY_WORKSPACE"
        )

        result = authority.retire_completed_worktree(
            self.canonical, self.policy, workspace["workspace_id"], apply=True
        )

        self.assertEqual(result["status"], "RETIREMENT_BLOCKED_ROLE")
        self.assertTrue(recovery.exists())
        self.assertEqual((recovery / "tracked.txt").read_text(encoding="utf-8"), "recovery copy\n")

    def test_missing_worktree_metadata_is_preserved_as_nonretirable_record(self) -> None:
        task = self.root / "stale-metadata-worktree"
        git(self.canonical, "worktree", "add", "-b", "task/stale-metadata", str(task), "HEAD")
        workspace = authority.register_workspace(self.canonical, self.policy, task, role="TASK_WORKTREE")
        git(self.canonical, "worktree", "remove", "--force", str(task))

        result = authority.retire_completed_worktree(
            self.canonical, self.policy, workspace["workspace_id"], apply=True
        )

        self.assertEqual(result["status"], "RETIREMENT_BLOCKED_MISSING_WITHOUT_RECOVERY_PROOF")
        project = authority.resolve_project_authority(self.canonical, self.policy)
        stale_record = next(row for row in project["workspaces"] if row["workspace_id"] == workspace["workspace_id"])
        self.assertEqual(stale_record["location"], str(task))

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

    def test_periodic_audit_is_conservative_and_never_classifies_canonical_as_retireable(self) -> None:
        task = self.root / "collector-clean-task"
        git(self.canonical, "worktree", "add", "-b", "task/collector-clean", str(task), "HEAD")
        registered_task = authority.register_workspace(self.canonical, self.policy, task, role="TASK_WORKTREE")
        canonical = authority.register_workspace(self.canonical, self.policy, self.canonical, role="CANONICAL_USER_WORKSPACE")

        report = authority.collect_worktrees(self.canonical, self.policy)

        self.assertEqual(report["mode"], "AUDIT_ONLY")
        classifications = {item["workspace_id"]: item["classification"] for item in report["workspaces"]}
        self.assertEqual(classifications[registered_task["workspace_id"]], "RETIREABLE")
        self.assertEqual(classifications[canonical["workspace_id"]], "ACTIVE")
        self.assertTrue(task.exists())
        self.assertTrue(self.canonical.exists())

    def test_collector_preserves_unknown_owner_and_retires_only_in_explicit_safe_mode(self) -> None:
        task = self.root / "collector-safe-task"
        unknown = self.root / "collector-unknown-owner"
        git(self.canonical, "worktree", "add", "-b", "task/collector-safe", str(task), "HEAD")
        git(self.canonical, "worktree", "add", "-b", "task/collector-unknown", str(unknown), "HEAD")
        registered_task = authority.register_workspace(self.canonical, self.policy, task, role="TASK_WORKTREE")
        registered_unknown = authority.register_workspace(self.canonical, self.policy, unknown, role="UNKNOWN_WORKSPACE")

        report = authority.collect_worktrees(self.canonical, self.policy, mode="RETIRE_SAFE")

        classifications = {item["workspace_id"]: item["classification"] for item in report["workspaces"]}
        self.assertEqual(classifications[registered_task["workspace_id"]], "RETIRED")
        self.assertEqual(classifications[registered_unknown["workspace_id"]], "UNKNOWN_OWNER")
        self.assertFalse(task.exists())
        self.assertTrue(unknown.exists())
        retired = next(item["result"]["receipt"] for item in report["workspaces"] if item["workspace_id"] == registered_task["workspace_id"])
        self.assertEqual(retired["previous_path"], str(task))
        self.assertEqual(retired["workspace_id"], registered_task["workspace_id"])

    def test_collector_cli_reports_success_for_completed_report_only_audit(self) -> None:
        arguments = [
            "workspace_authority.py", "collect", "--repository", str(self.canonical),
            "--policy", str(self.policy), "--mode", "REPORT_ONLY",
        ]
        with patch.object(authority.sys, "argv", arguments), redirect_stdout(io.StringIO()):
            result = authority._cli()
        self.assertEqual(result, 0)

    def test_integration_completion_racing_safe_retirement_is_deferred_then_resumes(self) -> None:
        task = self.root / "collector-integration-race"
        git(self.canonical, "worktree", "add", "-b", "task/collector-integration-race", str(task), "HEAD")
        (task / "tracked.txt").write_text("integrated while collector audits\n", encoding="utf-8")
        git(task, "add", "tracked.txt")
        git(task, "commit", "-m", "integration race fixture")
        registered = authority.register_workspace(self.canonical, self.policy, task, role="TASK_WORKTREE")

        fetch_canonical = authority._fetch_canonical
        completed = False

        def complete_integration_after_fetch(repo: Path, policy: dict[str, object]) -> str:
            nonlocal completed
            observed_sha = fetch_canonical(repo, policy)
            if not completed:
                git(task, "push", "origin", "HEAD:main")
                completed = True
            return observed_sha

        with patch.object(authority, "_fetch_canonical", complete_integration_after_fetch):
            raced = authority.collect_worktrees(self.canonical, self.policy, mode="RETIRE_SAFE")

        raced_item = next(row for row in raced["workspaces"] if row["workspace_id"] == registered["workspace_id"])
        self.assertEqual(raced_item["classification"], "BLOCKED")
        self.assertTrue(task.exists())

        resumed = authority.collect_worktrees(self.canonical, self.policy, mode="RETIRE_SAFE")
        resumed_item = next(row for row in resumed["workspaces"] if row["workspace_id"] == registered["workspace_id"])
        self.assertEqual(resumed_item["classification"], "RETIRED")
        self.assertFalse(task.exists())

    def test_project_mission_control_read_model_uses_authority_sessions_and_unknown_production(self) -> None:
        snapshot = {
            "project_id": "project-a",
            "repository_id": "repo-a",
            "canonical_ref": "refs/heads/main",
            "canonical_sha": "a" * 40,
            "canonical_workspace_id": "canonical",
            "convergence_state": "CANONICAL_VERIFIED",
            "convergence_receipt": {"receipt_id": "receipt-1"},
            "workspaces": [
                {"workspace_id": "canonical", "role": "CANONICAL_USER_WORKSPACE", "location": "/project", "head_sha": "a" * 40, "dirty": False, "session_state": "NO_ACTIVE_SESSION", "lifecycle_state": "ACTIVE"},
                {"workspace_id": "task-dirty", "role": "TASK_WORKTREE", "location": "/task", "head_sha": "b" * 40, "dirty": True, "dirty_path_count": 2, "session_state": "ACTIVE_SESSION", "owner_session_id": "session-1", "owner_host": "host-a", "owner_state": "LEASED", "lifecycle_state": "ACTIVE"},
                {"workspace_id": "stale-task", "role": "TASK_WORKTREE", "location": "/stale", "head_sha": "a" * 40, "dirty": False, "session_state": "STALE_CLOSED_SESSION", "owner_session_id": "old-session", "lifecycle_state": "ACTIVE"},
                {"workspace_id": "integrating", "role": "INTEGRATION_WORKTREE", "location": "/integration", "head_sha": "a" * 40, "dirty": False, "session_state": "NO_ACTIVE_SESSION", "lifecycle_state": "INTEGRATING"},
                {"workspace_id": "recovery", "role": "RECOVERY_WORKSPACE", "location": "/recovery", "head_sha": "a" * 40, "dirty": False, "session_state": "NO_ACTIVE_SESSION", "lifecycle_state": "ACTIVE"},
                {"workspace_id": "unknown", "role": "UNKNOWN_WORKSPACE", "location": "/unknown", "head_sha": "a" * 40, "dirty": False, "session_state": "NO_ACTIVE_SESSION", "lifecycle_state": "ACTIVE"},
            ],
        }

        result = authority.build_project_mission_control_read_model(snapshot)

        self.assertEqual(result["user_workspace"]["state"], "SYNCED")
        self.assertEqual(result["user_workspace"]["convergence_receipt"]["receipt_id"], "receipt-1")
        self.assertEqual(result["sessions"]["active_count"], 1)
        self.assertEqual(result["sessions"]["active"][0]["session_id"], "session-1")
        self.assertEqual(result["development_state"]["uncommitted_intended_work"][0]["workspace_id"], "task-dirty")
        self.assertEqual(result["development_state"]["unpushed_intended_commits"]["state"], "UNKNOWN")
        self.assertEqual(result["worktrees"]["integrating"][0]["workspace_id"], "integrating")
        self.assertEqual(result["worktrees"]["recovery"][0]["workspace_id"], "recovery")
        self.assertEqual({row["workspace_id"] for row in result["worktrees"]["stale_or_unknown"]}, {"stale-task", "unknown"})
        self.assertEqual(result["production"]["status"], "UNKNOWN")

    def test_registration_racing_retirement_cannot_resurrect_removed_worktree(self) -> None:
        task = self.root / "retirement-registration-race"
        git(self.canonical, "worktree", "add", "-b", "task/retirement-race", str(task), "HEAD")
        workspace = authority.register_workspace(self.canonical, self.policy, task, role="TASK_WORKTREE")
        preview = authority.retire_completed_worktree(
            self.canonical, self.policy, workspace["workspace_id"]
        )
        self.assertEqual(preview["status"], "RETIREMENT_DRY_RUN")

        original_git = authority._git
        original_db = authority._db
        removal_started = Event()
        registration_started = Event()
        registration_db_opened = Event()
        allow_removal = Event()

        def pause_removal(repo: Path, *args: str, **kwargs: object) -> str | bytes:
            if args[:2] == ("worktree", "remove"):
                removal_started.set()
                if not allow_removal.wait(timeout=5):
                    raise AssertionError("retirement race fixture timed out")
            return original_git(repo, *args, **kwargs)

        @contextmanager
        def track_db(repo: Path):
            with original_db(repo) as db:
                if removal_started.is_set() and registration_started.is_set():
                    registration_db_opened.set()
                yield db

        authority._git = pause_removal
        authority._db = track_db

        def register_live_owner() -> dict[str, object]:
            registration_started.set()
            return authority.register_workspace(
                self.canonical,
                self.policy,
                task,
                role="TASK_WORKTREE",
                owner_session_id="late-session",
                owner_pid=os.getpid(),
                owner_lease_seconds=300,
            )

        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                retire_future = pool.submit(
                    authority.retire_completed_worktree,
                    self.canonical,
                    self.policy,
                    workspace["workspace_id"],
                    apply=True,
                )
                self.assertTrue(removal_started.wait(timeout=5))
                register_future = pool.submit(register_live_owner)
                self.assertTrue(registration_started.wait(timeout=5))
                self.assertTrue(registration_db_opened.wait(timeout=5))
                self.assertFalse(register_future.done())
                allow_removal.set()
                retired = retire_future.result(timeout=5)
                self.assertEqual(retired["status"], "WORKTREE_RETIRED")
                with self.assertRaisesRegex(
                    authority.WorkspaceAuthorityError,
                    "WORKSPACE_DISAPPEARED_DURING_REGISTRATION",
                ):
                    register_future.result(timeout=5)
        finally:
            allow_removal.set()
            authority._git = original_git
            authority._db = original_db
        self.assertFalse(task.exists())

    def test_scenario_matrix_has_all_incident_cases_and_repeats_race_cases(self) -> None:
        scenarios_path = Path(__file__).with_name("workspace_authority_scenarios.json")
        matrix = json.loads(scenarios_path.read_text(encoding="utf-8"))
        scenarios = matrix["scenarios"]
        self.assertEqual(len(scenarios), 34)
        self.assertEqual({row["number"] for row in scenarios}, set(range(1, 35)))
        repeated = {row["number"] for row in scenarios if row.get("repetitions", 1) >= 2}
        self.assertTrue({18, 19, 20, 21, 22, 30}.issubset(repeated))
        repeat_counts = {row["number"]: row["repetitions"] for row in scenarios if "repetitions" in row}
        self.assertTrue(all(repeat_counts[number] >= count for number, count in {18: 5, 19: 5, 20: 5, 21: 3, 22: 5, 30: 3}.items()))
        self.assertTrue(all(row.get("proof_kind") in {"LOCAL_EXECUTABLE", "CONTRACT_SIMULATION"} for row in scenarios))
        available_tests = {name for name in dir(self) if name.startswith("test_")}
        self.assertTrue(all(row.get("test_name") in available_tests for row in scenarios))
        self.assertEqual(
            {row["number"] for row in scenarios if row.get("test_name")},
            set(range(1, 35)),
        )


if __name__ == "__main__":
    unittest.main()
