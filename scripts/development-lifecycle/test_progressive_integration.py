"""SPEC-agnostic regression coverage for progressive integration behavior."""

from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path

from skills.orchestra.tools import lifecycle_policy


ROOT = Path(__file__).resolve().parents[2]


def git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args], text=True, capture_output=True, check=False
    )
    if result.returncode:
        raise AssertionError(f"git {args}: {result.stderr}")
    return result.stdout.strip()


class ProgressiveIntegrationTests(unittest.TestCase):
    def test_spec_can_stay_open_while_verified_workunit_integrates_and_next_starts(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            remote, task = root / "remote.git", root / "task"
            git(root, "init", "--bare", "--initial-branch=main", str(remote))
            git(root, "clone", str(remote), str(task))
            git(task, "config", "user.name", "Lifecycle Test")
            git(task, "config", "user.email", "test@example.invalid")
            (task / "base.txt").write_text("main base\n", encoding="utf-8")
            git(task, "add", "base.txt")
            git(task, "commit", "-m", "main base")
            git(task, "push", "origin", "main")
            git(task, "checkout", "-b", "codex/wu-01")
            (task / "slice.txt").write_text("verified slice\n", encoding="utf-8")
            git(task, "add", "slice.txt")
            git(task, "commit", "-m", "integrate verified slice")
            slice_sha = git(task, "rev-parse", "HEAD")

            spec_state = "OPEN"
            unresolved_requirements = ["REQ-later"]
            self.assertEqual(
                "INTEGRATE_AND_CONTINUE",
                lifecycle_policy.decide_closure({
                    "event": "safe_partial_checkpoint",
                    "facts": {"fast_gate_passed": True, "requirements_remain": True},
                }),
            )
            git(task, "push", "origin", "codex/wu-01")
            git(task, "switch", "main")
            git(task, "merge", "--ff-only", "codex/wu-01")
            git(task, "push", "origin", "main")
            integrated_sha = git(task, "rev-parse", "origin/main")
            git(task, "merge-base", "--is-ancestor", slice_sha, integrated_sha)
            self.assertEqual("OPEN", spec_state)
            self.assertEqual(["REQ-later"], unresolved_requirements)

            continuation = lifecycle_policy.resume_capsule(
                {"canonical_sha": integrated_sha, "evidence_fresh": True},
                [{
                    "id": "WU-02",
                    "status": "READY",
                    "prerequisites": [],
                    "completion_predicate": {"kind": "test_passes", "source": "tests/wu02.log"},
                }],
                reconciled_canonical_sha=integrated_sha,
            )
            self.assertEqual("WU-02", continuation["next_workunit"])
            self.assertTrue(continuation["canonical_reconciled"])

    def test_waiting_external_unit_does_not_block_independent_slice(self) -> None:
        action = lifecycle_policy.decide_closure({
            "event": "local_blocker_with_independent_work",
            "facts": {"blocker_scoped": True, "independent_work": True},
        })
        self.assertEqual("ISOLATE_BLOCKER_AND_CONTINUE", action)
        units = [
            {"id": "WU-external", "status": "WAITING_EXTERNAL", "prerequisites": []},
            {"id": "WU-independent", "status": "READY", "prerequisites": [],
             "completion_predicate": {"kind": "test_passes", "source": "tests/independent.log"}},
        ]
        self.assertEqual("WU-independent", lifecycle_policy.next_ready_workunit(units, canonical_sha="main-1"))

    def test_concurrent_nonoverlapping_work_can_integrate_sequentially(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo = Path(temporary)
            git(repo, "init", "--initial-branch=main")
            git(repo, "config", "user.name", "Lifecycle Test")
            git(repo, "config", "user.email", "test@example.invalid")
            (repo / "base.txt").write_text("base\n", encoding="utf-8")
            git(repo, "add", "base.txt")
            git(repo, "commit", "-m", "base")
            git(repo, "branch", "codex/spec-alpha")
            git(repo, "branch", "codex/spec-beta")
            for branch, filename in (("codex/spec-alpha", "alpha.txt"), ("codex/spec-beta", "beta.txt")):
                git(repo, "switch", branch)
                (repo / filename).write_text(f"{branch}\n", encoding="utf-8")
                git(repo, "add", filename)
                git(repo, "commit", "-m", f"add {filename}")
            git(repo, "switch", "main")
            git(repo, "merge", "--no-ff", "codex/spec-alpha", "-m", "integrate alpha")
            git(repo, "merge", "--no-ff", "codex/spec-beta", "-m", "integrate beta")
            self.assertTrue((repo / "alpha.txt").is_file())
            self.assertTrue((repo / "beta.txt").is_file())
            self.assertEqual(
                "ISOLATE_WORKTREE",
                lifecycle_policy.decide_closure({
                    "event": "concurrent_writer_collision",
                    "facts": {"isolated_workspace_available": True},
                }),
            )

    def test_required_security_failure_blocks_integration(self) -> None:
        self.assertEqual(
            "TRUE_BLOCKER",
            lifecycle_policy.decide_closure({
                "event": "critical_security_finding", "facts": {"critical": True},
            }),
        )

    def test_post_merge_regression_routes_to_repair_before_more_integration(self) -> None:
        self.assertEqual(
            "DEBUG_FIX_AND_RETEST",
            lifecycle_policy.decide_closure({
                "event": "unrelated_baseline_failure",
                "facts": {"task_regression": True, "independent_work": False},
            }),
        )

    def test_stale_canonical_base_requires_reconciliation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            remote, task = root / "remote.git", root / "task"
            git(root, "init", "--bare", "--initial-branch=main", str(remote))
            git(root, "clone", str(remote), str(task))
            git(task, "config", "user.name", "Lifecycle Test")
            git(task, "config", "user.email", "test@example.invalid")
            (task / "base.txt").write_text("base\n", encoding="utf-8")
            git(task, "add", "base.txt")
            git(task, "commit", "-m", "base")
            git(task, "push", "origin", "main")
            git(task, "checkout", "-b", "codex/unrelated")
            before = git(task, "rev-parse", "HEAD")
            git(task, "switch", "main")
            (task / "main.txt").write_text("unrelated canonical update\n", encoding="utf-8")
            git(task, "add", "main.txt")
            git(task, "commit", "-m", "advance canonical")
            git(task, "push", "origin", "main")
            git(task, "switch", "codex/unrelated")
            git(task, "fetch", "origin", "refs/heads/main")
            current = git(task, "rev-parse", "FETCH_HEAD")
            contains = subprocess.run(
                ["git", "-C", str(task), "merge-base", "--is-ancestor", current, before],
                capture_output=True,
            ).returncode == 0
            self.assertFalse(contains)
            self.assertNotEqual(before, current)

    def test_merge_does_not_count_as_preview_or_requirement_acceptance(self) -> None:
        lifecycle = (ROOT / "skills/development-lifecycle/SKILL.md").read_text(encoding="utf-8")
        controller = (ROOT / "skills/integration-controller/SKILL.md").read_text(encoding="utf-8")
        self.assertIn("never implies\nrequirement acceptance or overall completion", lifecycle)
        self.assertIn("time-to-first-preview", controller)
        self.assertIn("feature", lifecycle.lower())

    def test_handoff_only_no_delta_loop_stops_blind_retry(self) -> None:
        self.assertEqual(
            "STALLED_STRATEGY",
            lifecycle_policy.decide_closure({
                "event": "same_blocker_no_delta",
                "facts": {"repeat_count": 3, "meaningful_delta": False},
            }),
        )


if __name__ == "__main__":
    unittest.main()
