"""Guard visible web publication against a source SHA that advanced mid-swap."""
from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("build-main-deploy.py")
spec = importlib.util.spec_from_file_location("build_main_deploy_freshness", SCRIPT)
assert spec is not None and spec.loader is not None
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PublishedSourceFreshnessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.index = Path(self.temp.name) / "index.html"
        self.index.write_text("<html>latest</html>", encoding="utf-8")
        self.digest = module.sha256(self.index)

    def tearDown(self):
        self.temp.cleanup()

    def verify(self):
        module.verify_published_revision(
            Path("/fixture/repo"), "origin", "refs/heads/main",
            "expected-source-sha", self.index, self.digest,
        )

    def test_matching_published_index_and_canonical_tip_pass(self):
        with patch.object(module, "remote_canonical_tip", return_value="expected-source-sha") as tip:
            self.verify()
            tip.assert_called_once()

    def test_main_advancing_after_swap_rejects_latest_claim(self):
        with patch.object(module, "remote_canonical_tip", return_value="newer-source-sha"):
            with self.assertRaises(module.CanonicalAdvanced):
                self.verify()

    def test_index_mismatch_blocks_success_even_when_main_is_unchanged(self):
        self.index.write_text("<html>unexpected build</html>", encoding="utf-8")
        with patch.object(module, "remote_canonical_tip", return_value="expected-source-sha") as tip:
            with self.assertRaises(module.DeployError):
                self.verify()
            tip.assert_not_called()


class ReleaseIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.workspace = self.root / "source"
        self.workspace.mkdir()
        subprocess.run(["git", "init", "-q", str(self.workspace)], check=True)
        subprocess.run(["git", "-C", str(self.workspace), "config", "user.email", "test@example.invalid"], check=True)
        subprocess.run(["git", "-C", str(self.workspace), "config", "user.name", "Release Test"], check=True)
        (self.workspace / ".gitignore").write_text("apps/web/dist/\n", encoding="utf-8")
        (self.workspace / "source.txt").write_text("clean source\n", encoding="utf-8")
        subprocess.run(["git", "-C", str(self.workspace), "add", ".gitignore", "source.txt"], check=True)
        subprocess.run(["git", "-C", str(self.workspace), "commit", "-qm", "fixture"], check=True)
        subprocess.run(["git", "-C", str(self.workspace), "branch", "-M", "main"], check=True)
        self.revision = subprocess.check_output(
            ["git", "-C", str(self.workspace), "rev-parse", "HEAD"], text=True
        ).strip()
        self.artifact = self.workspace / "apps/web/dist"
        (self.artifact / "public").mkdir(parents=True)
        (self.artifact / "public/index.html").write_text("<html>new</html>", encoding="utf-8")

    def tearDown(self):
        self.temp.cleanup()

    def build_record(self):
        manifest = module.artifact_manifest(self.artifact)
        return {
            "status": "BUILD_PASSED",
            "source_verified": True,
            "canonical_ref": "refs/heads/main",
            "source_revision": self.revision,
            "canonical_tip_after_build": self.revision,
            "isolated_workspace": str(self.workspace),
            "artifact": {**manifest, "artifact_path": str(self.artifact)},
        }

    def test_clean_integrated_artifact_with_matching_provenance_passes(self):
        record = self.build_record()
        self.assertEqual(module.validate_build_provenance(record, "refs/heads/main"), self.artifact)

    def test_deploy_requires_clean_canonical_main_checkout_at_current_tip(self):
        module.validate_deploy_checkout(self.workspace, self.workspace, self.revision)

    def test_deploy_rejects_dirty_checkout(self):
        (self.workspace / "source.txt").write_text("local edits\n", encoding="utf-8")
        with self.assertRaisesRegex(module.DeployError, "dirty"):
            module.validate_deploy_checkout(self.workspace, self.workspace, self.revision)

    def test_deploy_rejects_unmerged_feature_branch(self):
        subprocess.run(["git", "-C", str(self.workspace), "checkout", "-qb", "feature"], check=True)
        with self.assertRaisesRegex(module.DeployError, "main branch"):
            module.validate_deploy_checkout(self.workspace, self.workspace, self.revision)

    def test_deploy_rejects_checkout_behind_origin_main(self):
        with self.assertRaisesRegex(module.DeployError, "not at the current origin/main"):
            module.validate_deploy_checkout(self.workspace, self.workspace, "f" * 40)

    def test_frontend_publication_requires_matching_active_backend_revision(self):
        with patch.object(module, "active_backend_revision", return_value=self.revision):
            self.assertEqual(module.require_compatible_release(self.workspace / "apps/web", self.revision), self.revision)
        with patch.object(module, "active_backend_revision", return_value="f" * 40):
            with self.assertRaisesRegex(module.DeployError, "Frontend publication blocked"):
                module.require_compatible_release(self.workspace / "apps/web", self.revision)

    def test_immutable_fullstack_release_cannot_be_updated_frontend_only(self):
        service_root = self.root / "versioned-release"
        service_root.mkdir()
        (service_root / "release-manifest.json").write_text(
            json.dumps({"release_mode": "linux_systemd_fullstack"}), encoding="utf-8"
        )
        with self.assertRaisesRegex(module.DeployError, "Frontend-only publication is disabled"):
            module.reject_static_publish_for_fullstack_release(service_root)

    def test_backend_revision_is_read_from_versioned_release_manifest(self):
        service_root = self.root / "versioned-release"
        service_root.mkdir()
        (service_root / "release-manifest.json").write_text(
            json.dumps({"backend_source_revision": self.revision}), encoding="utf-8"
        )
        self.assertEqual(module.active_backend_revision(service_root), self.revision)

    def test_missing_trpc_procedure_blocks_frontend_backend_release_pair(self):
        public = self.root / "built-public"
        backend = self.root / "backend"
        (public / "assets").mkdir(parents=True)
        (backend / "server/routers").mkdir(parents=True)
        procedure = "infrastructure.getSpec224DatabaseDiagnostics"
        (public / "assets/app.js").write_text(procedure, encoding="utf-8")
        router = backend / "server/routers/infrastructure.ts"
        router.write_text("export const infrastructureRouter = {};", encoding="utf-8")
        with self.assertRaisesRegex(module.DeployError, "does not register it"):
            module.validate_trpc_compatibility(public, backend)
        router.write_text(
            "getSpec224DatabaseDiagnostics: exactAdminProcedure.query(() => null)",
            encoding="utf-8",
        )
        module.validate_trpc_compatibility(public, backend)

    def test_dirty_source_worktree_is_rejected(self):
        (self.workspace / "source.txt").write_text("modified source\n", encoding="utf-8")
        with self.assertRaisesRegex(module.DeployError, "worktree is dirty"):
            module.validate_build_provenance(self.build_record(), "refs/heads/main")

    def test_stale_or_unmerged_source_revision_is_rejected(self):
        record = self.build_record()
        record["canonical_tip_after_build"] = "f" * 40
        with self.assertRaisesRegex(module.DeployError, "provenance"):
            module.validate_build_provenance(record, "refs/heads/main")

    def test_artifact_modified_after_build_is_rejected(self):
        record = self.build_record()
        (self.artifact / "public/index.html").write_text("<html>changed</html>", encoding="utf-8")
        with self.assertRaisesRegex(module.DeployError, "digest"):
            module.validate_build_provenance(record, "refs/heads/main")

    def test_artifact_without_provenance_is_rejected(self):
        record = self.build_record()
        record.pop("artifact")
        with self.assertRaisesRegex(module.DeployError, "provenance"):
            module.validate_build_provenance(record, "refs/heads/main")

    def test_status_detects_stale_or_modified_published_artifact(self):
        target = self.root / "public"
        target.mkdir()
        index = target / "index.html"
        index.write_text("<html>published</html>", encoding="utf-8")
        release = {
            "source_revision": self.revision,
            "frontend_source_revision": self.revision,
            "backend_source_revision": self.revision,
            "index_sha256": module.sha256(index),
            "public_artifact_digest": module.artifact_manifest(target)["artifact_digest"],
        }
        # The release manifest is excluded from the public artifact digest.
        module.write_json_atomic(target / "release-manifest.json", release)
        status_file = self.root / "production-release.json"
        module.write_json_atomic(status_file, release)
        with patch.object(module, "active_backend_revision", return_value=self.revision):
            status = module.release_status(status_file, target, self.revision)
        self.assertTrue(status["target_matches_release"])
        index.write_text("<html>unexpected</html>", encoding="utf-8")
        with patch.object(module, "active_backend_revision", return_value=self.revision):
            status = module.release_status(status_file, target, self.revision)
        self.assertFalse(status["target_matches_release"])

    def test_status_rejects_release_when_backend_runtime_revision_differs(self):
        target = self.root / "public"
        target.mkdir()
        index = target / "index.html"
        index.write_text("<html>published</html>", encoding="utf-8")
        release = {
            "source_revision": self.revision,
            "frontend_source_revision": self.revision,
            "backend_source_revision": self.revision,
            "index_sha256": module.sha256(index),
            "public_artifact_digest": module.artifact_manifest(target)["artifact_digest"],
        }
        module.write_json_atomic(target / "release-manifest.json", release)
        status_file = self.root / "production-release.json"
        module.write_json_atomic(status_file, release)
        with patch.object(module, "active_backend_revision", return_value="f" * 40):
            status = module.release_status(status_file, target, self.revision)
        self.assertEqual(status["backend_runtime_revision"], "f" * 40)
        self.assertFalse(status["target_matches_release"])

    def test_failed_publish_preserves_previous_index_and_retry_succeeds(self):
        source = self.root / "new-public"
        destination = self.root / "published"
        source.mkdir()
        destination.mkdir()
        (source / "index.html").write_text("new index", encoding="utf-8")
        (source / "new-app.js").write_text("new app", encoding="utf-8")
        (destination / "index.html").write_text("old index", encoding="utf-8")
        (destination / "app.js").write_text("old app", encoding="utf-8")
        failed_backup = self.root / "failed-backup"
        with self.assertRaisesRegex(RuntimeError, "injected failure"):
            module.publish_public_tree(
                source, destination, failed_backup,
                before_index_swap=lambda: (_ for _ in ()).throw(RuntimeError("injected failure")),
            )
        module.restore_previous_public_tree(failed_backup, destination)
        self.assertEqual((destination / "index.html").read_text(encoding="utf-8"), "old index")
        self.assertEqual((destination / "app.js").read_text(encoding="utf-8"), "old app")
        self.assertFalse((destination / "new-app.js").exists())
        module.publish_public_tree(source, destination, self.root / "retry-backup")
        self.assertEqual((destination / "index.html").read_text(encoding="utf-8"), "new index")

    def test_asset_path_collision_cannot_mutate_files_used_by_current_release(self):
        source = self.root / "collision-source"
        destination = self.root / "collision-public"
        source.mkdir()
        destination.mkdir()
        (source / "index.html").write_text("new index", encoding="utf-8")
        (source / "app.js").write_text("new app", encoding="utf-8")
        (destination / "index.html").write_text("old index", encoding="utf-8")
        (destination / "app.js").write_text("old app", encoding="utf-8")
        with self.assertRaisesRegex(module.DeployError, "immutable content"):
            module.publish_public_tree(source, destination, self.root / "collision-backup")
        self.assertEqual((destination / "app.js").read_text(encoding="utf-8"), "old app")
        self.assertEqual((destination / "index.html").read_text(encoding="utf-8"), "old index")

    def test_concurrent_deploy_callers_are_serialized_by_shared_lock(self):
        lock_path = self.root / "shared-state/production-deploy.lock"
        first_acquired = threading.Event()
        release_first = threading.Event()
        second_acquired = threading.Event()

        def first_deploy():
            lock = module.acquire_production_deploy_lock(lock_path)
            first_acquired.set()
            release_first.wait(timeout=3)
            lock.close()

        def second_deploy():
            lock = module.acquire_production_deploy_lock(lock_path)
            second_acquired.set()
            lock.close()

        first = threading.Thread(target=first_deploy)
        second = threading.Thread(target=second_deploy)
        first.start()
        self.assertTrue(first_acquired.wait(timeout=2))
        second.start()
        time.sleep(0.1)
        self.assertFalse(second_acquired.is_set())
        release_first.set()
        self.assertTrue(second_acquired.wait(timeout=2))
        first.join(timeout=2)
        second.join(timeout=2)

    def test_local_atomic_build_cannot_swap_the_live_service_dist(self):
        checkout = self.root / "checkout/apps/web"
        scripts = checkout / "scripts"
        scripts.mkdir(parents=True)
        shutil.copy2(SCRIPT.with_name("guard-live-build-target.sh"), scripts / "guard-live-build-target.sh")
        shutil.copy2(SCRIPT.with_name("live-build-target-guard.mjs"), scripts / "live-build-target-guard.mjs")
        (checkout / "dist").mkdir()
        fake_bin = self.root / "bin"
        fake_bin.mkdir()
        systemctl = fake_bin / "systemctl"
        systemctl.write_text(
            "#!/bin/sh\nprintf '%s\\n' \"$SSP_TEST_SERVICE_ROOT\"\n",
            encoding="utf-8",
        )
        systemctl.chmod(0o755)
        environment = os.environ.copy()
        environment.update({
            "PATH": f"{fake_bin}:{environment['PATH']}",
            "SSP_BUILD_SYSTEMD_SCOPE": "1",
            "SSP_TEST_SERVICE_ROOT": str(checkout),
        })
        result = subprocess.run(
            ["bash", str(scripts / "guard-live-build-target.sh")],
            text=True,
            capture_output=True,
            cwd=checkout,
            env=environment,
            check=False,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("Production build target blocked", result.stderr)

        guard_module = SCRIPT.with_name("live-build-target-guard.mjs").as_uri()
        plugin_check = (
            f'import {{ liveBuildTargetGuardPlugin }} from {json.dumps(guard_module)}; '
            f'liveBuildTargetGuardPlugin({json.dumps(str(checkout))}).configResolved('
            f'{{ build: {{ outDir: {json.dumps(str(checkout / "dist/public"))} }} }});'
        )
        plugin_result = subprocess.run(
            ["node", "--input-type=module", "-e", plugin_check],
            text=True,
            capture_output=True,
            env=environment,
            check=False,
        )
        self.assertNotEqual(plugin_result.returncode, 0)
        self.assertIn("Production build target blocked", plugin_result.stderr)

    def test_build_guard_fails_closed_when_service_target_cannot_be_read(self):
        checkout = self.root / "unknown-target/apps/web"
        scripts = checkout / "scripts"
        scripts.mkdir(parents=True)
        shutil.copy2(SCRIPT.with_name("guard-live-build-target.sh"), scripts / "guard-live-build-target.sh")
        shutil.copy2(SCRIPT.with_name("live-build-target-guard.mjs"), scripts / "live-build-target-guard.mjs")
        (checkout / "dist/public").mkdir(parents=True)
        fake_bin = self.root / "unknown-target-bin"
        fake_bin.mkdir()
        systemctl = fake_bin / "systemctl"
        systemctl.write_text("#!/bin/sh\nexit 1\n", encoding="utf-8")
        systemctl.chmod(0o755)
        environment = os.environ.copy()
        environment["PATH"] = f"{fake_bin}:{environment['PATH']}"
        environment.pop("GITHUB_ACTIONS", None)
        environment.pop("CI", None)
        result = subprocess.run(
            ["bash", str(scripts / "guard-live-build-target.sh")],
            cwd=checkout,
            text=True,
            capture_output=True,
            env=environment,
            check=False,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("cannot be verified", result.stderr)


if __name__ == "__main__":
    unittest.main()
