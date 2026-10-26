import json
import hashlib
import errno
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock
from pathlib import Path

SCRIPT = Path(__file__).with_name("canonical_source.py")
sys.path.insert(0, str(SCRIPT.parent))


def command(*args: str, cwd: Path | None = None) -> str:
    result = subprocess.run(args, cwd=cwd, text=True, capture_output=True)
    if result.returncode:
        raise AssertionError(f"{args}: {result.stderr}")
    return result.stdout.strip()


class CanonicalSourceTests(unittest.TestCase):
    def test_staging_wrangler_bundle_uses_packager_output_directory(self) -> None:
        web_builder = SCRIPT.parent / "build_web.sh"
        source = web_builder.read_text(encoding="utf-8")
        self.assertIn(
            'WRANGLER_OUTDIR="$REPO_ROOT/apps/cloudflare/.staging-artifact/wrangler"',
            source,
        )
        self.assertIn('--outdir "$WRANGLER_OUTDIR"', source)

    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.remote = self.root / "remote.git"
        self.seed = self.root / "seed"
        self.shared = self.root / "shared"
        self.source_root = self.root / "isolated-sources"
        self.fallback_root = self.root / "fallback-sources"
        self.lease_root = self.root / "leases"
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
        fallback_line = f'source_fallback_roots = ["{self.fallback_root.as_posix()}"]\n'
        self.policy.write_text(
            "[repository]\n"
            f'repository_id = "{repository_id}"\n'
            f'remote = "{remote}"\n'
            f'canonical_ref = "{canonical_ref}"\n'
            f'source_root = "{self.source_root.as_posix()}"\n'
            f"{fallback_line}"
            f'lease_root = "{self.lease_root.as_posix()}"\n'
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

    def published_fallback_receipt(self):
        from canonical_source import load_policy

        shutil.copyfile(self.policy, self.shared / ".development-repository.toml")
        policy = load_policy(self.shared, self.policy)
        key = hashlib.sha256(policy["repository_id"].encode()).hexdigest()[:20]
        result = self.fallback_root / ".development-build-results" / key / f"{self.revision}-fixture.json"
        result.parent.mkdir(parents=True)
        payload = {
            "status": "BUILD_PASSED", "source_verified": True,
            "canonical_ref": policy["canonical_ref"], "source_revision": self.revision,
            "canonical_tip_after_build": self.revision, "result_file": str(result),
            "isolated_workspace": str(self.fallback_root / key / f"{self.revision}-build"),
            "cloudflare_staging_artifact": {
                "status": "PUBLISHED", "source_sha": self.revision,
                "build_digest": "a" * 64, "artifact_ref": "sha256:" + "a" * 64,
            },
        }
        result.write_text(json.dumps(payload) + "\n", encoding="utf-8")
        return policy, result

    def test_fallback_published_receipt_is_byte_identical_in_primary_authority(self) -> None:
        from canonical_source import _sync_published_build_receipt

        policy, source = self.published_fallback_receipt()
        # The CLI may select an approved fallback with an explicit policy file.
        policy["source_root"] = str(self.fallback_root)
        original = source.read_bytes()
        destination = _sync_published_build_receipt(self.shared, policy, source)
        self.assertEqual(destination.parents[2], self.source_root)
        self.assertEqual(destination.read_bytes(), original)
        self.assertEqual(source.read_bytes(), original)
        self.assertEqual(_sync_published_build_receipt(self.shared, policy, source), destination)

    def test_published_receipt_checks_candidate_ancestry_in_its_git_workspace(self) -> None:
        import canonical_source

        policy, source = self.published_fallback_receipt()
        policy["source_root"] = str(self.fallback_root)
        workspace = Path(json.loads(source.read_text(encoding="utf-8"))["isolated_workspace"])
        with mock.patch.object(canonical_source, "source_candidate_is_eligible", return_value=True) as eligible:
            canonical_source._sync_published_build_receipt(self.shared, policy, source)

        self.assertEqual(eligible.call_args.args[0], workspace)
        self.assertEqual(eligible.call_args.args[1], self.revision)
        self.assertEqual(eligible.call_args.args[2], self.revision)

    def test_fallback_receipt_replication_preserves_a_conflicting_primary_receipt(self) -> None:
        from canonical_source import LifecycleError, _sync_published_build_receipt

        policy, source = self.published_fallback_receipt()
        destination = self.source_root / ".development-build-results" / source.parent.name / source.name
        destination.parent.mkdir(parents=True)
        destination.write_bytes(b"existing receipt\n")
        with self.assertRaisesRegex(LifecycleError, "REPLICATION_CONFLICT"):
            _sync_published_build_receipt(self.shared, policy, source)
        self.assertEqual(destination.read_bytes(), b"existing receipt\n")
        self.assertTrue(source.is_file())

    def test_fallback_receipt_replication_rejects_unapproved_roots_and_foreign_policy(self) -> None:
        from canonical_source import LifecycleError, _sync_published_build_receipt

        policy, source = self.published_fallback_receipt()
        outside = self.root / source.name
        shutil.copyfile(source, outside)
        with self.assertRaisesRegex(LifecycleError, "ROOT_NOT_APPROVED"):
            _sync_published_build_receipt(self.shared, policy, outside)
        policy["repository_id"] = "another-repository"
        with self.assertRaisesRegex(LifecycleError, "POLICY_MISMATCH"):
            _sync_published_build_receipt(self.shared, policy, source)

    def test_fallback_receipt_replication_rejects_unpublished_or_mixed_workspace(self) -> None:
        from canonical_source import LifecycleError, _sync_published_build_receipt

        policy, source = self.published_fallback_receipt()
        original = json.loads(source.read_text())
        for changed in (dict(original, status="BUILD_FAILED"),
                        dict(original, isolated_workspace=str(self.source_root / "foreign-build")),
                        dict(original, cloudflare_staging_artifact={"status": "PUBLISH_PENDING"})):
            source.write_text(json.dumps(changed))
            with self.assertRaisesRegex(LifecycleError, "PUBLISHED_RECEIPT_REQUIRED"):
                _sync_published_build_receipt(self.shared, policy, source)

    def test_fallback_receipt_replication_classifies_full_disk_and_preserves_source(self) -> None:
        from canonical_source import LifecycleError, _sync_published_build_receipt

        policy, source = self.published_fallback_receipt()
        original = source.read_bytes()
        with mock.patch("canonical_source.os.link", side_effect=OSError(errno.ENOSPC, "full")):
            with self.assertRaisesRegex(LifecycleError, "RESOURCE_BLOCKED.*ENOSPC"):
                _sync_published_build_receipt(self.shared, policy, source)
        self.assertEqual(source.read_bytes(), original)
        self.assertEqual(list((self.source_root / ".development-build-results" / source.parent.name).iterdir()), [])

    @unittest.skipIf(os.name == "nt", "POSIX symlink fixture")
    def test_fallback_receipt_replication_rejects_redirected_primary_before_creating_paths(self) -> None:
        from canonical_source import LifecycleError, _sync_published_build_receipt

        policy, source = self.published_fallback_receipt()
        outside = self.root / "foreign-store"
        outside.mkdir()
        self.source_root.mkdir()
        (self.source_root / ".development-build-results").symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(LifecycleError, "ROOT_NOT_APPROVED"):
            _sync_published_build_receipt(self.shared, policy, source)
        self.assertEqual(list(outside.iterdir()), [])

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

    def test_preflight_fetches_configured_trunk_and_accepts_clean_branch_containing_tip(self) -> None:
        from canonical_source import inspect_workspace_baseline

        fresh = self.root / "fresh"
        command("git", "clone", "--branch", "trunk", str(self.remote), str(fresh))
        command("git", "-C", str(fresh), "checkout", "-b", "codex/fresh")
        result = inspect_workspace_baseline(fresh, self.policy)
        self.assertTrue(result["ready"])
        self.assertEqual(result["canonical_ref"], "refs/heads/trunk")
        self.assertEqual(result["canonical_sha"], result["local_sha"])

    def test_preflight_accepts_primary_canonical_branch(self) -> None:
        from canonical_source import inspect_workspace_baseline

        canonical = self.root / "canonical"
        command("git", "clone", "--branch", "trunk", str(self.remote), str(canonical))
        result = inspect_workspace_baseline(canonical, self.policy)
        self.assertTrue(result["ready"])
        self.assertTrue(result["on_canonical_branch"])
        self.assertEqual(result["next_action"], "CONTINUE_ON_CURRENT_BASELINE")

    def test_preflight_blocks_stale_clean_checkout_after_remote_advances(self) -> None:
        from canonical_source import inspect_workspace_baseline

        stale = self.root / "stale"
        command("git", "clone", "--branch", "trunk", str(self.remote), str(stale))
        command("git", "-C", str(stale), "checkout", "-b", "codex/stale")
        (self.seed / "app.txt").write_text("canonical v2\n", encoding="utf-8")
        command("git", "-C", str(self.seed), "commit", "-am", "canonical v2")
        command("git", "-C", str(self.seed), "push", "origin", "trunk")

        result = inspect_workspace_baseline(stale, self.policy)
        self.assertFalse(result["ready"])
        self.assertEqual(result["next_action"], "RECONCILE_WITH_FETCHED_CANONICAL_SHA")
        self.assertNotEqual(result["canonical_sha"], result["local_sha"])
        self.assertEqual(command("git", "-C", str(stale), "status", "--porcelain"), "")

    def test_preflight_blocks_dirty_work_without_altering_it(self) -> None:
        from canonical_source import inspect_workspace_baseline

        before = command("git", "-C", str(self.shared), "status", "--porcelain=v1", "--untracked-files=all")
        result = inspect_workspace_baseline(self.shared, self.policy)
        self.assertFalse(result["ready"])
        self.assertEqual(result["next_action"], "RECONCILE_OWNED_WORK_IN_PRIMARY_CHECKOUT")
        self.assertEqual(command("git", "-C", str(self.shared), "status", "--porcelain=v1", "--untracked-files=all"), before)
        self.assertTrue((self.shared / "local-only.txt").exists())

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

    def test_lock_open_failure_returns_structured_resource_blocked_error(self) -> None:
        import canonical_source

        with mock.patch.object(canonical_source.FileLock, "acquire", side_effect=PermissionError(13, "permission denied")):
            with self.assertRaisesRegex(canonical_source.LifecycleError, "RESOURCE_BLOCKED.*evidence="):
                canonical_source.prepare_source(
                    self.shared, purpose="build", source_revision=self.revision, policy_path=self.policy,
                )

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
            f'source_root = "{self.source_root.as_posix()}"\n',
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

    @unittest.skipUnless(os.name != "nt", "Bash wrapper integration runs in Unix CI; Windows acceptance exercises the native Python lifecycle API")
    def test_legacy_mutating_preflight_refuses_to_run(self) -> None:
        legacy = Path(__file__).resolve().parents[2] / "skills/canonical-checkout-sync/scripts/canonical-sync-preflight.sh"
        result = subprocess.run(["bash", str(legacy), str(self.shared)], text=True, capture_output=True)
        self.assertEqual(result.returncode, 64)
        self.assertIn("DEPRECATED_USE_ISOLATED_CANONICAL_SOURCE_LEASE", result.stderr)

    @unittest.skipUnless(os.name != "nt", "Bash wrapper integration runs in Unix CI; Windows acceptance exercises the native Python lifecycle API")
    def test_candidate_inventory_uses_configured_ref_and_includes_dirty_unmarked_branch(self) -> None:
        shutil.copy2(self.policy, self.shared / ".development-repository.toml")
        shared_core = self.shared / "scripts/development-lifecycle"
        shared_core.mkdir(parents=True)
        shutil.copy2(SCRIPT, shared_core / SCRIPT.name)
        shutil.copy2(SCRIPT.with_name("portable_file_lock.py"), shared_core / "portable_file_lock.py")
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

    @unittest.skipUnless(os.name != "nt", "Bash wrapper integration runs in Unix CI; Windows acceptance exercises the native Python lifecycle API")
    def test_skill_wrappers_run_command_from_leased_source(self) -> None:
        shutil.copy2(self.policy, self.shared / ".development-repository.toml")
        core_dir = self.shared / "scripts/development-lifecycle"
        core_dir.mkdir(parents=True)
        shutil.copy2(SCRIPT, core_dir / SCRIPT.name)
        shutil.copy2(SCRIPT.with_name("portable_file_lock.py"), core_dir / "portable_file_lock.py")
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

    def test_cloudflare_bundle_manifest_is_source_bound_and_rehashes_all_files(self) -> None:
        from canonical_source import _cloudflare_staging_bundle

        workspace = self.root / "bundle-workspace"
        modules = workspace / "apps/cloudflare/.staging-artifact/modules"
        assets = workspace / "apps/web/dist/public"
        public_source = workspace / "apps/web/client/public/releases"
        modules.mkdir(parents=True)
        assets.mkdir(parents=True)
        public_source.mkdir(parents=True)
        module_bytes = b"export default {};"
        asset_bytes = b"<html>spa</html>"
        release_bytes = b"{\"release\":1}"
        localized_bytes = b"localized public guide"
        (modules / "index.js").write_bytes(module_bytes)
        (assets / "index.html").write_bytes(asset_bytes)
        (assets / "คู่มือการใช้งาน.md").write_bytes(localized_bytes)
        (public_source / "current.json").write_bytes(release_bytes)
        try:
            os.symlink(os.path.relpath(public_source, assets), assets / "releases")
        except OSError as exc:
            if os.name == "nt" and getattr(exc, "winerror", None) == 1314:
                self.skipTest("Windows symlink privilege is not enabled for this account")
            raise
        module_digest = hashlib.sha256(module_bytes).hexdigest()
        asset_digest = hashlib.sha256(asset_bytes).hexdigest()
        release_digest = hashlib.sha256(release_bytes).hexdigest()
        localized_digest = hashlib.sha256(localized_bytes).hexdigest()
        entries = [
            ("modules/index.js", module_digest, len(module_bytes)),
            ("public/index.html", asset_digest, len(asset_bytes)),
            ("public/คู่มือการใช้งาน.md", localized_digest, len(localized_bytes)),
            ("public/releases/current.json", release_digest, len(release_bytes)),
        ]
        entries.sort(key=lambda entry: entry[0])
        build_digest = hashlib.sha256("\n".join(f"{name}\0{digest}\0{size}" for name, digest, size in entries).encode()).hexdigest()
        manifest = {
            "format": "cloudflare-staging-build-bundle-v1",
            "sourceSha": self.revision,
            "buildDigest": build_digest,
            "mainModule": "index.js",
            "compatibilityDate": "2026-10-17",
            "moduleFiles": [{"name": "index.js", "sha256": module_digest, "size": len(module_bytes)}],
            "assets": [
                {"name": "index.html", "sha256": asset_digest, "size": len(asset_bytes)},
                {"name": "คู่มือการใช้งาน.md", "sha256": localized_digest, "size": len(localized_bytes)},
                {"name": "releases/current.json", "sha256": release_digest, "size": len(release_bytes)},
            ],
        }
        manifest_path = workspace / "apps/cloudflare/.staging-artifact/bundle-manifest.json"
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        observed = _cloudflare_staging_bundle(workspace, self.revision)
        self.assertEqual(observed["status"], "BUNDLE_READY")
        self.assertEqual(observed["build_digest"], build_digest)
        self.assertIsNone(_cloudflare_staging_bundle(workspace, "f" * 40))

        private = workspace / "apps/web/private"
        private.mkdir(parents=True)
        (private / "current.json").write_bytes(release_bytes)
        (assets / "releases").unlink()
        os.symlink(os.path.relpath(private, assets), assets / "releases")
        self.assertIsNone(_cloudflare_staging_bundle(workspace, self.revision))

        (assets / "index.html").write_bytes(b"changed")
        self.assertIsNone(_cloudflare_staging_bundle(workspace, self.revision))

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

    def test_web_build_admission_uses_fallback_with_required_artifact_space(self) -> None:
        import canonical_source

        self.write_policy("fixture-repository", "origin", "refs/heads/trunk", "smartspec-web")
        original_evidence = canonical_source._filesystem_evidence

        def evidence(path: Path) -> dict[str, object]:
            result = original_evidence(path)
            if path == self.source_root:
                result["available_bytes"] = 4 * 1024**3
            elif path == self.fallback_root:
                result["available_bytes"] = 10 * 1024**3
            return result

        with mock.patch.object(canonical_source, "_filesystem_evidence", side_effect=evidence):
            result = canonical_source.build_canonical(
                self.shared,
                command=[sys.executable, "-c", "print('build')"],
                policy_path=self.policy,
            )

        self.assertEqual(result["status"], "BUILD_PASSED")
        self.assertTrue(str(result["isolated_workspace"]).startswith(str(self.fallback_root)))

    def test_central_build_classifies_sigkill_as_resource_blocked(self) -> None:
        from canonical_source import build_canonical

        killed_commands = [([sys.executable, "-c", "raise SystemExit(137)"], None)]
        if hasattr(__import__("signal"), "SIGKILL"):
            killed_commands.insert(
                0,
                ([sys.executable, "-c", "import os, signal; os.kill(os.getpid(), signal.SIGKILL)"], "SIGKILL"),
            )
        for command_to_kill, expected_signal in killed_commands:
            with self.subTest(command=command_to_kill[-1]):
                result = build_canonical(
                    self.shared,
                    command=command_to_kill,
                    build_target="fixture",
                    policy_path=self.policy,
                )

                self.assertEqual(result["status"], "RESOURCE_BLOCKED")
                self.assertEqual(result["exit_code"], 137)
                self.assertEqual(result["termination_signal"], expected_signal)
                self.assertEqual(result["primary_workspace_sync"]["status"], "SKIPPED_RESOURCE_BLOCKED")

    def test_central_build_result_binds_output_artifact_digest_to_source_sha(self) -> None:
        from canonical_source import build_canonical

        command_source = (
            "from pathlib import Path; p=Path('apps/web/dist'); p.mkdir(parents=True); "
            "(p/'index.html').write_text('<main>fixture</main>', encoding='utf-8')"
        )
        result = build_canonical(
            self.shared,
            command=[sys.executable, "-c", command_source],
            required_revisions=[self.revision],
            build_target="fixture",
            policy_path=self.policy,
        )
        self.assertEqual(result["status"], "BUILD_PASSED")
        self.assertEqual(result["artifact"]["artifact_file_count"], 1)
        self.assertRegex(result["artifact"]["artifact_digest"], r"^sha256:[a-f0-9]{64}$")
        manifest = json.loads(Path(str(result["result_file"])).read_text(encoding="utf-8"))
        self.assertEqual(manifest["source_revision"], result["source_revision"])
        self.assertEqual(manifest["artifact"], result["artifact"])

    def test_central_build_rejects_required_fix_not_in_canonical_history(self) -> None:
        from canonical_source import LifecycleError, build_canonical

        (self.shared / "unintegrated-fix.txt").write_text("required fix\n", encoding="utf-8")
        command("git", "-C", str(self.shared), "add", "unintegrated-fix.txt")
        command("git", "-C", str(self.shared), "commit", "-m", "unintegrated required fix")
        required_fix = command("git", "-C", str(self.shared), "rev-parse", "HEAD")
        with self.assertRaisesRegex(LifecycleError, "REQUIRED_REVISION_NOT_INCLUDED"):
            build_canonical(
                self.shared,
                command=[sys.executable, "-c", "raise SystemExit('build must not start')"],
                required_revisions=[required_fix],
                build_target="fixture",
                policy_path=self.policy,
            )

    def test_central_build_preserves_failure_as_failure_without_artifact(self) -> None:
        from canonical_source import build_canonical

        result = build_canonical(
            self.shared,
            command=[sys.executable, "-c", "raise SystemExit(19)"],
            build_target="fixture",
            policy_path=self.policy,
        )
        self.assertEqual(result["status"], "BUILD_FAILED")
        self.assertEqual(result["exit_code"], 19)
        self.assertIsNone(result["artifact"])
        manifest = json.loads(Path(result["result_file"]).read_text(encoding="utf-8"))
        self.assertEqual(manifest["status"], "BUILD_FAILED")
        self.assertIsNone(manifest["artifact"])

    def test_central_build_marks_result_stale_if_canonical_advances_during_build(self) -> None:
        from canonical_source import build_latest_canonical

        publish_new_tip = (
            "from pathlib import Path; import subprocess; "
            "artifact=Path('apps/web/dist/public'); artifact.mkdir(parents=True); "
            "(artifact/'index.html').write_text('<main>built pinned source</main>', encoding='utf-8'); "
            f"root={str(self.seed)!r}; "
            "Path(root, 'app.txt').write_text('canonical v2\\n'); "
            "subprocess.run(['git','-C',root,'add','app.txt'],check=True); "
            "subprocess.run(['git','-C',root,'commit','-m','canonical v2'],check=True); "
            "subprocess.run(['git','-C',root,'push','origin','trunk'],check=True)"
        )
        result = build_latest_canonical(
            self.shared,
            command=[sys.executable, "-c", publish_new_tip],
            build_target="fixture",
            policy_path=self.policy,
        )
        self.assertEqual(result["status"], "STALE_CANONICAL_ADVANCED")
        self.assertNotEqual(result["source_revision"], result["canonical_tip_after_build"])
        self.assertEqual(result["primary_workspace_sync"]["status"], "SKIPPED_CANONICAL_ADVANCED")
        self.assertEqual(result["build_attempts"], 1)
        self.assertEqual(result["exit_code"], 0)
        self.assertEqual(result["artifact"]["artifact_file_count"], 1)
        self.assertRegex(result["artifact"]["artifact_digest"], r"^sha256:[a-f0-9]{64}$")
        artifact = Path(result["artifact"]["artifact_path"]) / "public/index.html"
        self.assertEqual(artifact.read_text(encoding="utf-8"), "<main>built pinned source</main>")
        manifest = json.loads(Path(result["result_file"]).read_text(encoding="utf-8"))
        self.assertEqual(manifest["status"], "STALE_CANONICAL_ADVANCED")
        self.assertEqual(manifest["source_revision"], result["source_revision"])
        self.assertEqual(manifest["artifact"], result["artifact"])

    def test_central_build_keeps_policy_eligible_immutable_candidate_when_main_advances(self) -> None:
        from canonical_source import build_canonical

        release_policy = (
            "\n[repository.release]\n"
            "allow_approved_immutable_candidates = true\n"
            f'required_source_ancestors = ["{self.revision}"]\n'
        )
        configured_policy = self.policy.read_text(encoding="utf-8") + release_policy
        self.policy.write_text(configured_policy, encoding="utf-8")
        (self.seed / ".development-repository.toml").write_text(configured_policy, encoding="utf-8")
        command("git", "-C", str(self.seed), "add", ".development-repository.toml")
        command("git", "-C", str(self.seed), "commit", "-m", "enable immutable candidate policy")
        command("git", "-C", str(self.seed), "push", "origin", "trunk")
        command_source = (
            "from pathlib import Path; import subprocess; "
            "artifact=Path('apps/web/dist/public'); artifact.mkdir(parents=True); "
            "(artifact/'index.html').write_text('<main>pinned</main>', encoding='utf-8'); "
            f"root={str(self.seed)!r}; "
            "Path(root, 'app.txt').write_text('canonical v2\\n', encoding='utf-8'); "
            "subprocess.run(['git','-C',root,'add','app.txt'],check=True); "
            "subprocess.run(['git','-C',root,'commit','-m','advance after candidate pin'],check=True); "
            "subprocess.run(['git','-C',root,'push','origin','trunk'],check=True)"
        )
        result = build_canonical(
            self.shared,
            command=[sys.executable, "-c", command_source],
            build_target="fixture",
            policy_path=self.policy,
        )
        self.assertEqual(result["status"], "BUILD_PASSED")
        self.assertNotEqual(result["source_revision"], result["canonical_tip_after_build"])
        self.assertEqual(result["primary_workspace_sync"]["status"], "SKIPPED_CANONICAL_ADVANCED")
        manifest = json.loads(Path(str(result["result_file"])).read_text(encoding="utf-8"))
        self.assertEqual(manifest["source_revision"], result["source_revision"])
        self.assertEqual(manifest["canonical_tip_after_build"], result["canonical_tip_after_build"])

    def test_build_cli_returns_success_for_completed_pinned_stale_artifact(self) -> None:
        from canonical_source import main

        result = {
            "status": "STALE_CANONICAL_ADVANCED",
            "source_revision": self.revision,
            "canonical_tip_after_build": "newer-source",
            "artifact": {"artifact_digest": "sha256:" + "a" * 64},
            "exit_code": 0,
        }
        with mock.patch("canonical_source.build_latest_canonical", return_value=result) as build:
            exit_code = main([
                "build", "--repository", str(self.shared), "--policy", str(self.policy),
                "--build-target", "fixture",
            ])
        self.assertEqual(exit_code, 0)
        self.assertEqual(build.call_args.kwargs["max_stale_rebuilds"], 0)

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
            f'source_root = "{self.source_root.as_posix()}"\n',
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

    @unittest.skipUnless(os.name != "nt", "Bash wrapper integration runs in Unix CI; Windows acceptance exercises the native Python lifecycle API")
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
        shutil.copy2(SCRIPT.with_name("portable_file_lock.py"), core_path.parent / "portable_file_lock.py")
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
            self.policy.read_text(encoding="utf-8").replace(self.source_root.as_posix(), (self.shared / ".build").as_posix()),
            encoding="utf-8",
        )
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "prepare", "--repository", str(self.shared), "--policy", str(self.policy), "--purpose", "build"],
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 20)
        self.assertIn("SOURCE_ROOT_INSIDE_DEVELOPER_CHECKOUT", result.stderr)

    def test_worktree_resource_failures_retry_on_authorized_fallback_with_exact_errno(self) -> None:
        import canonical_source

        original_git = canonical_source.git
        for message, code in (("No space left on device", "ENOSPC"), ("Disk quota exceeded", "EDQUOT"), ("Permission denied", "EACCES")):
            with self.subTest(errno=code):
                calls = {"failed": False}

                def failing_first_destination(repo: Path, *args: str, check: bool = True) -> str:
                    if args[:2] == ("worktree", "add") and any(str(self.source_root) in arg for arg in args) and not calls["failed"]:
                        calls["failed"] = True
                        raise canonical_source.LifecycleError(f"GIT_COMMAND_FAILED: git worktree add: {message}")
                    return original_git(repo, *args, check=check)

                with mock.patch.object(canonical_source, "git", side_effect=failing_first_destination):
                    purpose = {"ENOSPC": "build", "EDQUOT": "test", "EACCES": "package"}[code]
                    lease = canonical_source.prepare_source(self.shared, purpose=purpose, source_revision=self.revision, policy_path=self.policy)
                self.assertEqual(Path(str(lease["isolated_workspace"])).parents[1], self.fallback_root)
                self.assertEqual(lease["workspace_recovery_attempts"][0]["resource_code"], code)
                self.assertEqual(lease["workspace_recovery_attempts"][0]["errno_number"], {"ENOSPC": 28, "EDQUOT": 122, "EACCES": 13}[code])
                self.assertFalse(Path(lease["workspace_recovery_attempts"][0]["path"]).exists())

    def test_partial_worktree_creation_is_rolled_back_before_fallback_retry(self) -> None:
        import canonical_source

        original_git = canonical_source.git
        calls = {"failed": False}

        def create_then_fail(repo: Path, *args: str, check: bool = True) -> str:
            if args[:2] == ("worktree", "add") and any(str(self.source_root) in arg for arg in args) and not calls["failed"]:
                calls["failed"] = True
                original_git(repo, *args, check=check)
                raise canonical_source.LifecycleError("GIT_COMMAND_FAILED: No space left on device")
            return original_git(repo, *args, check=check)

        with mock.patch.object(canonical_source, "git", side_effect=create_then_fail):
            lease = canonical_source.prepare_source(self.shared, purpose="build", source_revision=self.revision, policy_path=self.policy)
        failed_path = Path(lease["workspace_recovery_attempts"][0]["path"])
        self.assertFalse(failed_path.exists())
        self.assertEqual(command("git", "-C", str(self.shared), "worktree", "list", "--porcelain").count(str(failed_path)), 0)
        self.assertEqual(command("git", "-C", str(lease["isolated_workspace"]), "rev-parse", "HEAD"), self.revision)
        with tempfile.TemporaryFile(mode="w+") as output:
            exit_code = canonical_source.run_with_lease(
                Path(str(lease["lease_file"])),
                str(lease["lease_id"]),
                int(lease["fencing_generation"]),
                [sys.executable, "-c", "import subprocess; print(subprocess.check_output(['git','rev-parse','HEAD'], text=True).strip())"],
                stdout=output,
            )
            output.seek(0)
            resumed_sha = output.read().strip()
        self.assertEqual(exit_code, 0)
        self.assertEqual(resumed_sha, self.revision)

    def test_inode_exhaustion_preflight_selects_fallback_without_git_retry(self) -> None:
        import canonical_source

        original_evidence = canonical_source._filesystem_evidence

        def evidence(path: Path) -> dict[str, object]:
            result = original_evidence(path)
            if path in {self.source_root, self.fallback_root}:
                result["available_bytes"] = 2 * 1024**3
            if path == self.source_root:
                result["available_inodes"] = 0
            return result

        with mock.patch.object(canonical_source, "_filesystem_evidence", side_effect=evidence):
            lease = canonical_source.prepare_source(self.shared, purpose="build", source_revision=self.revision, policy_path=self.policy)
        self.assertTrue(str(lease["isolated_workspace"]).startswith(str(self.fallback_root)))
        self.assertEqual(lease["workspace_recovery_attempts"], [])

    def test_filesystem_without_inode_counter_is_not_treated_as_exhausted(self) -> None:
        import canonical_source
        from types import SimpleNamespace

        stats = SimpleNamespace(f_files=0, f_favail=0, f_frsize=4096, f_bavail=1024)
        usage = SimpleNamespace(total=10 * 1024**3, used=1 * 1024**3, free=9 * 1024**3)
        with mock.patch.object(canonical_source.os, "statvfs", return_value=stats), mock.patch.object(
            canonical_source.shutil, "disk_usage", return_value=usage
        ):
            evidence = canonical_source._filesystem_evidence(self.source_root)

        self.assertIsNone(evidence["available_inodes"])
        self.assertTrue(evidence["inode_capacity_not_applicable"])

    def test_unavailable_inode_counter_keeps_primary_filesystem_admissible(self) -> None:
        import canonical_source

        original_evidence = canonical_source._filesystem_evidence

        def evidence(path: Path) -> dict[str, object]:
            result = original_evidence(path)
            if path in {self.source_root, self.fallback_root}:
                result["available_bytes"] = 2 * 1024**3
            if path == self.source_root:
                result["available_inodes"] = None
                result["inode_capacity_not_applicable"] = True
            return result

        with mock.patch.object(canonical_source, "_filesystem_evidence", side_effect=evidence):
            lease = canonical_source.prepare_source(self.shared, purpose="verify", source_revision=self.revision, policy_path=self.policy)

        self.assertTrue(str(lease["isolated_workspace"]).startswith(str(self.source_root)))
        self.assertEqual(lease["workspace_recovery_attempts"], [])

    def test_no_admissible_filesystem_returns_resource_blocked_evidence(self) -> None:
        import canonical_source

        def exhausted(path: Path) -> dict[str, object]:
            return {"path": str(path), "mount_path": str(path), "available_bytes": 0, "available_inodes": 0, "writable": True}

        with mock.patch.object(canonical_source, "_filesystem_evidence", side_effect=exhausted):
            with self.assertRaisesRegex(canonical_source.LifecycleError, "RESOURCE_BLOCKED.*evidence="):
                canonical_source.prepare_source(self.shared, purpose="verify", source_revision=self.revision, policy_path=self.policy)

    def test_stale_unregistered_workspace_path_is_preserved(self) -> None:
        import canonical_source

        stale = self.source_root
        namespace = hashlib.sha256(b"fixture-repository").hexdigest()[:20]
        stale_path = stale / namespace / f"{self.revision}-build"
        stale_path.mkdir(parents=True)
        marker = stale_path / "unknown-owner.txt"
        marker.write_text("preserve", encoding="utf-8")
        with self.assertRaisesRegex(canonical_source.LifecycleError, "WORKSPACE_REGISTRY_STALE"):
            canonical_source.prepare_source(self.shared, purpose="build", source_revision=self.revision, policy_path=self.policy)
        self.assertEqual(marker.read_text(encoding="utf-8"), "preserve")


if __name__ == "__main__":
    unittest.main()
