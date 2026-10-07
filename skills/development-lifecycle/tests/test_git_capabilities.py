"""Regression coverage for safe conflict-only staging policy."""
from __future__ import annotations

import importlib.util
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

MODULE = Path(__file__).parents[1] / "git_capabilities.py"
spec = importlib.util.spec_from_file_location("git_capabilities", MODULE)
git_capabilities = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(git_capabilities)


def git(cwd: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=cwd, check=check, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


class GitCapabilitiesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        git(self.root, "init", "-q")
        self.base_branch = git(self.root, "branch", "--show-current").stdout.decode().strip()
        git(self.root, "config", "user.email", "test@example.invalid")
        git(self.root, "config", "user.name", "Test")
        (self.root / "f.txt").write_text("base\n")
        git(self.root, "add", "--", "f.txt")
        git(self.root, "commit", "-qm", "base")

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def conflict(self, path: str = "f.txt", *, binary: bool = False) -> None:
        branch = git(self.root, "branch", "--show-current").stdout.decode().strip()
        git(self.root, "checkout", "-qb", "side")
        if binary:
            (self.root / path).write_bytes(b"side\x00\n")
        else:
            (self.root / path).write_text("side\n")
        git(self.root, "add", "--", path); git(self.root, "commit", "-qm", "side")
        git(self.root, "checkout", "-q", branch)
        if binary:
            (self.root / path).write_bytes(b"main\x00\n")
        else:
            (self.root / path).write_text("main\n")
        git(self.root, "add", "--", path); git(self.root, "commit", "-qm", "main")
        git(self.root, "merge", "side", check=False)

    def resolve_markers(self, path: str = "f.txt") -> None:
        (self.root / path).write_text("resolved\n")

    def conflict_many(self, paths: list[str]) -> None:
        for path in paths:
            target = self.root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("base\n")
        git(self.root, "add", "--", *paths); git(self.root, "commit", "-qm", "add files")
        self.base_branch = git(self.root, "branch", "--show-current").stdout.decode().strip()
        git(self.root, "checkout", "-qb", "side")
        for path in paths: (self.root / path).write_text("side\n")
        git(self.root, "add", "--", *paths); git(self.root, "commit", "-qm", "side")
        git(self.root, "checkout", "-q", self.base_branch)
        for path in paths: (self.root / path).write_text("main\n")
        git(self.root, "add", "--", *paths); git(self.root, "commit", "-qm", "main")
        git(self.root, "merge", "side", check=False)

    def test_version_parsing_and_threshold(self) -> None:
        cases = {"git version 2.56.0": (2, 56, 0), "git version 2.56.0.windows.2": (2, 56, 0), "git version 3.0.1": (3, 0, 1), "git version 2.55.9": (2, 55, 9)}
        for value, expected in cases.items():
            self.assertEqual(git_capabilities.parse_git_version(value), expected)
            self.assertEqual(expected >= (2, 56, 0), expected != (2, 55, 9))

    def test_resolved_conflict_stages_successfully(self) -> None:
        self.conflict(); self.resolve_markers()
        result = git_capabilities.resolve_conflicts(self.root, ["f.txt"])
        self.assertEqual(result["intendedResolutionPaths"], ["f.txt"])
        self.assertEqual(result["remainingUnmergedPaths"], [])

    def test_unrelated_tracked_modification_remains_unstaged(self) -> None:
        (self.root / "unrelated.txt").write_text("u\n")
        git(self.root, "add", "--", "unrelated.txt"); git(self.root, "commit", "-qm", "add unrelated")
        self.conflict(); self.resolve_markers()
        (self.root / "unrelated.txt").write_text("modified\n")
        git_capabilities.resolve_conflicts(self.root, ["f.txt"])
        self.assertEqual(git_capabilities.inspect_git(self.root)["unstagedPaths"], ["unrelated.txt"])

    def test_remaining_marker_stages_nothing(self) -> None:
        self.conflict()
        with self.assertRaises(RuntimeError):
            git_capabilities.resolve_conflicts(self.root, ["f.txt"])
        self.assertEqual(git_capabilities.inspect_git(self.root)["stagedPaths"], [])

    def test_pathspec_limits_to_requested_path(self) -> None:
        self.conflict_many(["f.txt", "sub/a"])
        self.assertEqual(git_capabilities.inspect_git(self.root)["unmergedPaths"], ["f.txt", "sub/a"])
        self.resolve_markers(); git_capabilities.resolve_conflicts(self.root, ["f.txt"], ["sub/a"])
        state = git_capabilities.inspect_git(self.root)
        self.assertEqual(state["stagedPaths"], ["f.txt"])
        self.assertEqual(state["unmergedPaths"], ["sub/a"])

    def test_resolved_deletion(self) -> None:
        self.conflict()
        (self.root / "f.txt").unlink()
        git_capabilities.resolve_conflicts(self.root, ["f.txt"])
        self.assertEqual(git(self.root, "diff", "--cached", "--name-status").stdout.decode().strip(), "D\tf.txt")

    def test_binary_conflict(self) -> None:
        self.conflict(binary=True)
        git_capabilities.resolve_conflicts(self.root, ["f.txt"])
        self.assertEqual(git_capabilities.inspect_git(self.root)["unmergedPaths"], [])

    def test_pre_staged_unrelated_change_blocks_resolution(self) -> None:
        self.conflict(); self.resolve_markers()
        (self.root / "unrelated").write_text("x")
        git(self.root, "add", "--", "unrelated")
        with self.assertRaisesRegex(RuntimeError, "pre-existing staged"):
            git_capabilities.resolve_conflicts(self.root, ["f.txt"])
        self.assertEqual(git_capabilities.inspect_git(self.root)["stagedPaths"], ["unrelated"])

    def test_multi_path_native_all_or_nothing(self) -> None:
        self.conflict_many(["f.txt", "other"])
        self.resolve_markers()
        # One selected file is clean, the other still has markers: native add is atomic.
        result = git(self.root, "add", "--resolved", "--", "f.txt", "other", check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(git_capabilities.inspect_git(self.root)["stagedPaths"], [])

    def test_legacy_fallback_is_explicit_and_never_broad(self) -> None:
        (self.root / "unrelated.txt").write_text("x")
        git(self.root, "add", "--", "unrelated.txt"); git(self.root, "commit", "-qm", "unrelated")
        (self.root / "unrelated.txt").write_text("changed")
        self.conflict(); self.resolve_markers()
        old = git_capabilities.inspect_git
        try:
            git_capabilities.inspect_git = lambda root: {**old(root), "supportsAddResolved": False}
            result = git_capabilities.resolve_conflicts(self.root, ["f.txt"])
        finally:
            git_capabilities.inspect_git = old
        self.assertEqual(result["method"], "legacy explicit-path fallback")
        self.assertEqual(git_capabilities.inspect_git(self.root)["unstagedPaths"], ["unrelated.txt"])

    def test_operation_state_exposed(self) -> None:
        self.conflict()
        state = git_capabilities.inspect_git(self.root)
        self.assertTrue(state["isMergeInProgress"])
        self.assertFalse(state["isRebaseInProgress"])
        self.assertFalse(state["isCherryPickInProgress"])
        self.assertEqual(state["unmergedPaths"], ["f.txt"])

    def test_cherry_pick_operation_state(self) -> None:
        git(self.root, "checkout", "-qb", "topic")
        (self.root / "f.txt").write_text("topic\n"); git(self.root, "commit", "-qam", "topic")
        topic = git(self.root, "rev-parse", "HEAD").stdout.decode().strip()
        git(self.root, "checkout", "-q", self.base_branch)
        (self.root / "f.txt").write_text("main\n"); git(self.root, "commit", "-qam", "main")
        git(self.root, "cherry-pick", topic, check=False)
        self.assertTrue(git_capabilities.inspect_git(self.root)["isCherryPickInProgress"])

    def test_rebase_operation_state(self) -> None:
        base = git(self.root, "rev-parse", "HEAD").stdout.decode().strip()
        git(self.root, "checkout", "-qb", "topic")
        (self.root / "f.txt").write_text("topic\n"); git(self.root, "commit", "-qam", "topic")
        git(self.root, "checkout", "-q", self.base_branch)
        (self.root / "f.txt").write_text("main\n"); git(self.root, "commit", "-qam", "main")
        git(self.root, "checkout", "-q", "topic")
        git(self.root, "rebase", self.base_branch, check=False)
        self.assertTrue(git_capabilities.inspect_git(self.root)["isRebaseInProgress"])

    def test_merge_operation_can_resume_after_resolution(self) -> None:
        self.conflict(); self.resolve_markers()
        git_capabilities.resolve_conflicts(self.root, ["f.txt"])
        self.assertTrue(git_capabilities.inspect_git(self.root)["isMergeInProgress"])
        git(self.root, "commit", "-qm", "merge resolved")
        self.assertFalse(git_capabilities.inspect_git(self.root)["isMergeInProgress"])

    def test_unexpected_staged_paths_are_blocked_before_commit(self) -> None:
        self.conflict(); self.resolve_markers()
        (self.root / "outside").write_text("secretly staged")
        git(self.root, "add", "--", "outside")
        with self.assertRaises(RuntimeError):
            git_capabilities.resolve_conflicts(self.root, ["f.txt"])
        self.assertEqual(git_capabilities.inspect_git(self.root)["stagedPaths"], ["outside"])

    def test_unexpected_unmerged_paths_block_resolution(self) -> None:
        self.conflict_many(["f.txt", "sub/a"])
        self.resolve_markers()
        with self.assertRaisesRegex(RuntimeError, "unmerged path inventory"):
            git_capabilities.resolve_conflicts(self.root, ["f.txt"])

    def test_marker_causes_native_multi_path_operation_to_stage_none(self) -> None:
        self.conflict_many(["f.txt", "sub/a"])
        (self.root / "f.txt").write_text("<<<<<<< ours\nours\n=======\ntheirs\n>>>>>>> theirs\n")
        result = git(self.root, "add", "--resolved", "--", "f.txt", "sub/a", check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(git_capabilities.inspect_git(self.root)["stagedPaths"], [])

    def test_normal_path_staging_stays_explicit_and_works(self) -> None:
        (self.root / "normal").write_text("normal\n")
        git(self.root, "add", "--", "normal")
        self.assertEqual(git_capabilities.inspect_git(self.root)["stagedPaths"], ["normal"])

    def test_cached_check_passes_after_resolution(self) -> None:
        self.conflict(); self.resolve_markers()
        self.assertTrue(git_capabilities.resolve_conflicts(self.root, ["f.txt"])["cachedCheckPassed"])

    def test_staged_set_ownership_is_reported(self) -> None:
        self.conflict(); self.resolve_markers()
        result = git_capabilities.resolve_conflicts(self.root, ["f.txt"])
        self.assertEqual(set(result["stagedAfter"]), set(result["intendedResolutionPaths"]))

    @unittest.skipUnless(os.name == "nt", "Windows path behavior is exercised on Windows CI")
    def test_windows_path_separator_input(self) -> None:
        self.conflict("sub/file.txt")
        self.resolve_markers("sub/file.txt")
        git_capabilities.resolve_conflicts(self.root, ["sub\\file.txt"])


if __name__ == "__main__":
    unittest.main()
