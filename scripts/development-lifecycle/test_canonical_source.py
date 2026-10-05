import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("canonical_source.py")


def command(*args: str, cwd: Path | None = None) -> str:
    result = subprocess.run(args, cwd=cwd, text=True, capture_output=True)
    if result.returncode:
        raise AssertionError(f"{args}: {result.stderr}")
    return result.stdout.strip()


class CanonicalSourceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.remote = self.root / "remote.git"
        self.seed = self.root / "seed"
        self.shared = self.root / "shared"
        self.source_root = self.root / "isolated-sources"
        command("git", "init", "--bare", "--initial-branch=trunk", str(self.remote))
        command("git", "clone", str(self.remote), str(self.seed))
        command("git", "-C", str(self.seed), "config", "user.email", "test@example.invalid")
        command("git", "-C", str(self.seed), "config", "user.name", "Lifecycle Test")
        (self.seed / "app.txt").write_text("canonical v1\n", encoding="utf-8")
        command("git", "-C", str(self.seed), "add", "app.txt")
        command("git", "-C", str(self.seed), "commit", "-m", "canonical v1")
        command("git", "-C", str(self.seed), "push", "origin", "trunk")
        self.revision = command("git", "-C", str(self.seed), "rev-parse", "HEAD")
        command("git", "clone", "--branch", "trunk", str(self.remote), str(self.shared))
        command("git", "-C", str(self.shared), "config", "user.email", "test@example.invalid")
        command("git", "-C", str(self.shared), "config", "user.name", "Lifecycle Test")
        command("git", "-C", str(self.shared), "checkout", "-b", "developer-feature")
        (self.shared / "local-only.txt").write_text("keep this local\n", encoding="utf-8")
        self.policy = self.root / "repository.toml"
        self.write_policy("fixture-repository", "origin", "refs/heads/trunk")

    def tearDown(self) -> None:
        self.temp.cleanup()

    def write_policy(
        self,
        repository_id: str,
        remote: str,
        canonical_ref: str,
        build_target: str | None = None,
    ) -> None:
        build_target_line = f'build_target = "{build_target}"\n' if build_target else ""
        self.policy.write_text(
            "[repository]\n"
            f'repository_id = "{repository_id}"\n'
            f'remote = "{remote}"\n'
            f'canonical_ref = "{canonical_ref}"\n'
            f'source_root = "{self.source_root}"\n'
            f"{build_target_line}",
            encoding="utf-8",
        )

    def prepare(self, *extra: str) -> dict[str, object]:
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "prepare",
                "--repository",
                str(self.shared),
                "--policy",
                str(self.policy),
                "--purpose",
                "build",
                *extra,
            ],
            text=True,
            capture_output=True,
        )
        if result.returncode:
            raise AssertionError(result.stderr)
        return json.loads(result.stdout)

    def test_dirty_wrong_branch_checkout_is_untouched_and_exact_source_is_prepared(self) -> None:
        before_status = command("git", "-C", str(self.shared), "status", "--porcelain=v1", "--branch")
        before_branch = command("git", "-C", str(self.shared), "branch", "--show-current")
        lease = self.prepare("--source-revision", self.revision, "--required-integrated-revision", self.revision)
        self.assertEqual(lease["source_revision"], self.revision)
        self.assertEqual(lease["required_integrated_revision"], self.revision)
        source = Path(str(lease["isolated_workspace"]))
        self.assertEqual(command("git", "-C", str(source), "rev-parse", "HEAD"), self.revision)
        self.assertEqual((source / "app.txt").read_text(encoding="utf-8"), "canonical v1\n")
        self.assertEqual(command("git", "-C", str(self.shared), "status", "--porcelain=v1", "--branch"), before_status)
        self.assertEqual(command("git", "-C", str(self.shared), "branch", "--show-current"), before_branch)
        self.assertEqual((self.shared / "local-only.txt").read_text(encoding="utf-8"), "keep this local\n")

    def test_revision_outside_configured_canonical_history_is_rejected(self) -> None:
        command("git", "-C", str(self.seed), "checkout", "-b", "unintegrated")
        (self.seed / "private.txt").write_text("not canonical\n", encoding="utf-8")
        command("git", "-C", str(self.seed), "add", "private.txt")
        command("git", "-C", str(self.seed), "commit", "-m", "unintegrated work")
        outside = command("git", "-C", str(self.seed), "rev-parse", "HEAD")
        command("git", "-C", str(self.seed), "checkout", "trunk")
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "prepare", "--repository", str(self.shared), "--policy", str(self.policy), "--purpose", "test", "--source-revision", outside],
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 20)
        self.assertIn("SOURCE_REVISION_OUTSIDE_CANONICAL_HISTORY", result.stderr)

    def test_expired_lease_reacquisition_increments_fencing_generation(self) -> None:
        first = self.prepare()
        lease_file = Path(str(first["lease_file"]))
        state = json.loads(lease_file.read_text(encoding="utf-8"))
        state["expires_at"] = 0
        lease_file.write_text(json.dumps(state), encoding="utf-8")
        second = self.prepare()
        self.assertGreater(second["fencing_generation"], first["fencing_generation"])
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "run", "--lease-file", str(lease_file), "--lease-id", str(first["lease_id"]), "--fencing-generation", str(first["fencing_generation"]), "--", "true"],
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 20)
        self.assertIn("SOURCE_LEASE_FENCED", result.stderr)

    def test_active_same_revision_lease_rejects_second_runner(self) -> None:
        lease = self.prepare()
        runner = subprocess.Popen(
            [sys.executable, str(SCRIPT), "run", "--lease-file", str(lease["lease_file"]), "--lease-id", str(lease["lease_id"]), "--fencing-generation", str(lease["fencing_generation"]), "--", sys.executable, "-c", "import time; time.sleep(1)"],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        time.sleep(0.15)
        second = subprocess.run(
            [sys.executable, str(SCRIPT), "prepare", "--repository", str(self.shared), "--policy", str(self.policy), "--purpose", "build", "--source-revision", self.revision],
            text=True,
            capture_output=True,
        )
        self.assertEqual(second.returncode, 20)
        self.assertIn("SOURCE_LEASE_ACTIVE", second.stderr)
        stdout, stderr = runner.communicate(timeout=5)
        self.assertEqual(runner.returncode, 0, stderr or stdout)

    def test_distinct_purposes_get_independent_workspaces(self) -> None:
        build_lease = self.prepare("--source-revision", self.revision)
        test_result = subprocess.run(
            [sys.executable, str(SCRIPT), "prepare", "--repository", str(self.shared), "--policy", str(self.policy), "--purpose", "test", "--source-revision", self.revision],
            text=True,
            capture_output=True,
        )
        self.assertEqual(test_result.returncode, 0, test_result.stderr)
        test_lease = json.loads(test_result.stdout)
        self.assertNotEqual(build_lease["isolated_workspace"], test_lease["isolated_workspace"])
        self.assertEqual(test_lease["source_revision"], self.revision)

    def test_distinct_revisions_get_independent_workspaces(self) -> None:
        first_lease = self.prepare("--source-revision", self.revision)
        (self.seed / "app.txt").write_text("canonical v2\n", encoding="utf-8")
        command("git", "-C", str(self.seed), "add", "app.txt")
        command("git", "-C", str(self.seed), "commit", "-m", "canonical v2")
        command("git", "-C", str(self.seed), "push", "origin", "trunk")
        second_revision = command("git", "-C", str(self.seed), "rev-parse", "HEAD")
        second_lease = self.prepare("--source-revision", second_revision)
        self.assertNotEqual(first_lease["isolated_workspace"], second_lease["isolated_workspace"])
        self.assertEqual(command("git", "-C", str(first_lease["isolated_workspace"]), "rev-parse", "HEAD"), self.revision)
        self.assertEqual(command("git", "-C", str(second_lease["isolated_workspace"]), "rev-parse", "HEAD"), second_revision)

    def test_different_repository_policy_uses_separate_canonical_namespace(self) -> None:
        command("git", "-C", str(self.seed), "branch", "develop", self.revision)
        command("git", "-C", str(self.seed), "push", "origin", "develop")
        other_repo = self.root / "other-project"
        command("git", "clone", str(self.remote), str(other_repo))
        other_policy = self.root / "other-project.toml"
        other_policy.write_text(
            "[repository]\n"
            'repository_id = "other-project"\n'
            'remote = "origin"\n'
            'canonical_ref = "refs/heads/develop"\n'
            f'source_root = "{self.source_root}"\n',
            encoding="utf-8",
        )
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "prepare", "--repository", str(other_repo), "--policy", str(other_policy), "--purpose", "build"],
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        other_lease = json.loads(result.stdout)
        self.assertEqual(other_lease["canonical_ref"], "refs/heads/develop")
        first_lease = self.prepare()
        self.assertNotEqual(other_lease["isolated_workspace"], first_lease["isolated_workspace"])
        self.assertEqual(other_lease["source_revision"], self.revision)

    def test_legacy_mutating_preflight_refuses_to_run(self) -> None:
        legacy = Path(__file__).resolve().parents[2] / "skills/canonical-checkout-sync/scripts/canonical-sync-preflight.sh"
        result = subprocess.run(["bash", str(legacy), str(self.shared)], text=True, capture_output=True)
        self.assertEqual(result.returncode, 64)
        self.assertIn("DEPRECATED_USE_ISOLATED_CANONICAL_SOURCE_LEASE", result.stderr)

    def test_candidate_inventory_uses_configured_ref_and_includes_dirty_unmarked_branch(self) -> None:
        shutil.copy2(self.policy, self.shared / ".development-repository.toml")
        shared_core = self.shared / "scripts/development-lifecycle"
        shared_core.mkdir(parents=True)
        shutil.copy2(SCRIPT, shared_core / SCRIPT.name)
        shutil.copy2(SCRIPT.with_name("resolve-policy.sh"), shared_core / "resolve-policy.sh")
        integration_scripts = self.shared / "skills/integration-controller/scripts"
        integration_scripts.mkdir(parents=True)
        source_script = SCRIPT.parents[2] / "skills/integration-controller/scripts/discover-candidates.sh"
        discovery = integration_scripts / source_script.name
        shutil.copy2(source_script, discovery)
        output = command("bash", str(discovery), cwd=self.shared)
        self.assertIn("META\trefs/heads/trunk", output)
        self.assertRegex(output, r"BRANCH\trefs/heads/developer-feature\t[^\t]+\tALREADY_CANONICAL")
        self.assertRegex(output, r"BRANCH\trefs/heads/developer-feature\t[^\n]*\tNONE\tUNKNOWN\tNONE\tDIRTY\t")
        rows = [line.split("\t") for line in output.splitlines()]
        self.assertTrue(all(len(row) == 14 for row in rows), "inventory rows must have 14 columns")
        branch_row = next(row for row in rows if row[0] == "BRANCH" and row[1] == "refs/heads/developer-feature")
        self.assertIn("local-only.txt", branch_row[12])
        worktree_row = next(row for row in rows if row[0] == "WORKTREE" and row[1] == str(self.shared))
        self.assertIn("local-only.txt", worktree_row[12])

    def test_skill_wrappers_run_command_from_leased_source(self) -> None:
        shutil.copy2(self.policy, self.shared / ".development-repository.toml")
        core_dir = self.shared / "scripts/development-lifecycle"
        core_dir.mkdir(parents=True)
        shutil.copy2(SCRIPT, core_dir / SCRIPT.name)
        shutil.copy2(SCRIPT.with_name("resolve-policy.sh"), core_dir / "resolve-policy.sh")
        canonical_scripts = self.shared / "skills/canonical-checkout-sync/scripts"
        canonical_scripts.mkdir(parents=True)
        source_scripts = SCRIPT.parents[2] / "skills/canonical-checkout-sync/scripts"
        for name in ("prepare-canonical-checkout.sh", "run-certified-command.sh"):
            shutil.copy2(source_scripts / name, canonical_scripts / name)
        before = command("git", "-C", str(self.shared), "status", "--porcelain=v1", "--branch")
        env = os.environ.copy()
        env["CODEX_SOURCE_POLICY"] = str(self.policy)
        env["CODEX_SOURCE_PURPOSE"] = "build"
        prepared = subprocess.run(
            ["bash", str(canonical_scripts / "prepare-canonical-checkout.sh"), str(self.shared), self.revision, self.revision],
            text=True,
            capture_output=True,
            env=env,
        )
        self.assertEqual(prepared.returncode, 0, prepared.stderr)
        lease = json.loads(prepared.stdout)
        ran = subprocess.run(
            ["bash", str(canonical_scripts / "run-certified-command.sh"), str(lease["lease_file"]), str(lease["lease_id"]), str(lease["fencing_generation"]), "--", sys.executable, "-c", "import subprocess; print(subprocess.check_output(['git','rev-parse','HEAD'], text=True).strip())"],
            cwd=self.shared,
            text=True,
            capture_output=True,
            env=env,
        )
        self.assertEqual(ran.returncode, 0, ran.stderr)
        self.assertEqual(ran.stdout.strip(), self.revision)
        self.assertEqual(command("git", "-C", str(self.shared), "status", "--porcelain=v1", "--branch"), before)

    def test_central_build_uses_latest_canonical_not_dirty_session_branch(self) -> None:
        from canonical_source import build_canonical

        before_status = command("git", "-C", str(self.shared), "status", "--porcelain=v1", "--branch")
        before_branch = command("git", "-C", str(self.shared), "branch", "--show-current")
        result = build_canonical(
            self.shared,
            command=[sys.executable, "-c", "import subprocess; print(subprocess.check_output(['git','rev-parse','HEAD'], text=True).strip())"],
            required_revisions=[self.revision],
            build_target="fixture",
            policy_path=self.policy,
        )
        self.assertEqual(result["status"], "BUILD_PASSED")
        self.assertEqual(result["source_revision"], self.revision)
        self.assertEqual(result["canonical_tip_after_build"], self.revision)
        self.assertEqual(result["primary_workspace_sync"]["status"], "BLOCKED_DIRTY_WRONG_BRANCH")
        self.assertEqual(command("git", "-C", str(self.shared), "status", "--porcelain=v1", "--branch"), before_status)
        self.assertEqual(command("git", "-C", str(self.shared), "branch", "--show-current"), before_branch)
        manifest = json.loads(Path(str(result["result_file"])).read_text(encoding="utf-8"))
        self.assertEqual(manifest["source_revision"], self.revision)
        self.assertEqual(manifest["status"], "BUILD_PASSED")

    def test_central_build_uses_repository_policy_build_target(self) -> None:
        from canonical_source import build_canonical

        self.write_policy("fixture-repository", "origin", "refs/heads/trunk", "fixture-policy-target")
        result = build_canonical(
            self.shared,
            command=[sys.executable, "-c", "print('build')"],
            policy_path=self.policy,
        )
        self.assertEqual(result["status"], "BUILD_PASSED")
        self.assertEqual(result["build_target"], "fixture-policy-target")

    def test_central_build_marks_result_stale_if_canonical_advances_during_build(self) -> None:
        from canonical_source import build_canonical

        publish_new_tip = (
            "from pathlib import Path; import subprocess; "
            f"root={str(self.seed)!r}; "
            "Path(root, 'app.txt').write_text('canonical v2\\n'); "
            "subprocess.run(['git','-C',root,'add','app.txt'],check=True); "
            "subprocess.run(['git','-C',root,'commit','-m','canonical v2'],check=True); "
            "subprocess.run(['git','-C',root,'push','origin','trunk'],check=True)"
        )
        result = build_canonical(
            self.shared,
            command=[sys.executable, "-c", publish_new_tip],
            build_target="fixture",
            policy_path=self.policy,
        )
        self.assertEqual(result["status"], "STALE_CANONICAL_ADVANCED")
        self.assertNotEqual(result["source_revision"], result["canonical_tip_after_build"])
        self.assertEqual(result["primary_workspace_sync"]["status"], "SKIPPED_CANONICAL_ADVANCED")

    def test_central_build_fast_forwards_clean_main_workspace_to_built_revision(self) -> None:
        from canonical_source import build_canonical

        main_workspace = self.root / "main-workspace"
        command("git", "clone", "--branch", "trunk", str(self.remote), str(main_workspace))
        policy = self.root / "main-workspace.toml"
        policy.write_text(
            "[repository]\n"
            'repository_id = "fixture-repository"\n'
            'remote = "origin"\n'
            'canonical_ref = "refs/heads/trunk"\n'
            f'source_root = "{self.source_root}"\n',
            encoding="utf-8",
        )
        (self.seed / "app.txt").write_text("canonical v2\n", encoding="utf-8")
        command("git", "-C", str(self.seed), "add", "app.txt")
        command("git", "-C", str(self.seed), "commit", "-m", "canonical v2")
        command("git", "-C", str(self.seed), "push", "origin", "trunk")
        latest = command("git", "-C", str(self.seed), "rev-parse", "HEAD")

        result = build_canonical(
            main_workspace,
            command=[sys.executable, "-c", "import subprocess; print(subprocess.check_output(['git','rev-parse','HEAD'], text=True).strip())"],
            build_target="fixture",
            policy_path=policy,
        )
        self.assertEqual(result["status"], "BUILD_PASSED")
        self.assertEqual(result["source_revision"], latest)
        self.assertEqual(result["primary_workspace_sync"]["status"], "FAST_FORWARDED")
        self.assertEqual(command("git", "-C", str(main_workspace), "rev-parse", "HEAD"), latest)
        self.assertEqual((main_workspace / "app.txt").read_text(encoding="utf-8"), "canonical v2\n")

    def test_installed_central_entrypoint_uses_builder_from_latest_canonical(self) -> None:
        main_policy = self.seed / ".development-repository.toml"
        main_policy.write_text(
            "[repository]\n"
            'repository_id = "fixture-repository"\n'
            'remote = "origin"\n'
            'canonical_ref = "refs/heads/trunk"\n'
            f'source_root = "{self.source_root}"\n',
            encoding="utf-8",
        )
        core_path = self.seed / "scripts/development-lifecycle/canonical_source.py"
        core_path.parent.mkdir(parents=True)
        shutil.copy2(SCRIPT, core_path)
        web_builder = self.seed / "scripts/development-lifecycle/build_web.sh"
        web_builder.write_text("#!/usr/bin/env bash\nset -euo pipefail\nprintf 'fixture build\\n'\n", encoding="utf-8")
        command("git", "-C", str(self.seed), "add", ".development-repository.toml", "scripts/development-lifecycle")
        command("git", "-C", str(self.seed), "commit", "-m", "publish canonical builder")
        command("git", "-C", str(self.seed), "push", "origin", "trunk")
        latest = command("git", "-C", str(self.seed), "rev-parse", "HEAD")
        (self.shared / ".development-repository.toml").write_text(main_policy.read_text(encoding="utf-8"), encoding="utf-8")

        wrapper = SCRIPT.parents[2] / "skills/canonical-checkout-sync/scripts/build-canonical-main.sh"
        result = subprocess.run(
            ["bash", str(wrapper), str(self.shared)],
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        build_result = json.loads(result.stdout)
        self.assertEqual(build_result["source_revision"], latest)
        self.assertEqual(build_result["status"], "BUILD_PASSED")
        self.assertIn(f"builder_revision={latest}", result.stderr)

    def test_source_root_inside_shared_checkout_is_rejected(self) -> None:
        self.write_policy("fixture-repository", "origin", "refs/heads/trunk")
        self.policy.write_text(
            self.policy.read_text(encoding="utf-8").replace(str(self.source_root), str(self.shared / ".build")),
            encoding="utf-8",
        )
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "prepare", "--repository", str(self.shared), "--policy", str(self.policy), "--purpose", "build"],
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 20)
        self.assertIn("SOURCE_ROOT_INSIDE_DEVELOPER_CHECKOUT", result.stderr)


if __name__ == "__main__":
    unittest.main()
