from __future__ import annotations

import importlib.util
import hashlib
import json
import os
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("linux_backend_release.py")
spec = importlib.util.spec_from_file_location("linux_backend_release", SCRIPT)
assert spec is not None and spec.loader is not None
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
DEPLOY_SCRIPT = SCRIPT.with_name("build-main-deploy.py")
deploy_spec = importlib.util.spec_from_file_location("build_main_deploy", DEPLOY_SCRIPT)
assert deploy_spec is not None and deploy_spec.loader is not None
deploy = importlib.util.module_from_spec(deploy_spec)
deploy_spec.loader.exec_module(deploy)


class IsolatedSystemdRuntime:
    """Disposable runtime adapter with systemd-like activation and readiness."""

    def __init__(self, current_link: Path, legacy: Path):
        self.current_link = current_link
        self.legacy = legacy
        self.active_path = legacy
        self.fail_restart_once = False
        self.unhealthy_revision: str | None = None
        self.restart_count = 0
        self.reload_count = 0

    def assert_supported_target(self):
        return None

    def daemon_reload(self):
        self.reload_count += 1

    def restart(self):
        self.restart_count += 1
        if self.fail_restart_once:
            self.fail_restart_once = False
            raise release.ReleaseError("injected systemd restart failure")
        if self.current_link.is_symlink():
            self.active_path = self.current_link.resolve()
        else:
            self.active_path = self.legacy

    def working_directory(self):
        return str(self.active_path)

    def verify(self, release_path: Path, source_sha: str):
        if self.unhealthy_revision == source_sha:
            raise release.ReleaseError("injected readiness failure")
        if self.active_path.resolve() != release_path.resolve():
            raise release.ReleaseError("runtime is serving a different release")
        manifest = json.loads((release_path / "release-manifest.json").read_text())
        if manifest["source_revision"] != source_sha:
            raise release.ReleaseError("runtime manifest revision mismatch")
        return {
            "status": "HEALTHY",
            "service": release.SERVICE,
            "workingDirectory": str(release_path.resolve()),
            "runtimeRevision": source_sha,
            "healthHttp": 200,
            "anonymousDiagnosticsHttp": 401,
        }

    def verify_rollback(self, previous_working_directory: str):
        expected = Path(previous_working_directory)
        if self.active_path.resolve() != expected.resolve():
            raise release.ReleaseError("rollback did not restore previous runtime")
        return {"status": "ROLLED_BACK_HEALTHY", "workingDirectory": str(expected)}


class LinuxBackendReleaseIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source_root = self.root / "canonical-sources"
        self.workspace = self.source_root / "workspace"
        self.workspace.mkdir(parents=True)
        subprocess.run(["git", "init", "-q", str(self.workspace)], check=True)
        subprocess.run(["git", "-C", str(self.workspace), "config", "user.email", "test@example.invalid"], check=True)
        subprocess.run(["git", "-C", str(self.workspace), "config", "user.name", "Release Test"], check=True)
        repository_key = hashlib.sha256(b"fixture-release-repository").hexdigest()[:20]
        self.ledger_root = self.source_root / ".development-build-results" / repository_key
        self.ledger_root.mkdir(parents=True)
        lease_root = self.root / "canonical-leases"
        policy = (
            "[repository]\n"
            'repository_id = "fixture-release-repository"\n'
            'remote = "origin"\n'
            'canonical_ref = "refs/heads/main"\n'
            f'source_root = "{self.source_root}"\n'
            f'lease_root = "{lease_root}"\n'
        )
        (self.workspace / ".development-repository.toml").write_text(policy)
        (self.workspace / ".gitignore").write_text("apps/web/dist/\n")
        (self.workspace / "apps/web/package.json").parent.mkdir(parents=True)
        (self.workspace / "apps/web/package.json").write_text('{"name":"@smartspec/web"}\n')
        subprocess.run(["git", "-C", str(self.workspace), "add", "."], check=True)
        subprocess.run(["git", "-C", str(self.workspace), "commit", "-qm", "fixture source"], check=True)
        subprocess.run(["git", "-C", str(self.workspace), "branch", "-M", "main"], check=True)
        self.source_sha = subprocess.check_output(
            ["git", "-C", str(self.workspace), "rev-parse", "HEAD"], text=True
        ).strip()
        staging_output = self.workspace / "apps/cloudflare/.staging-artifact"
        staging_output.mkdir(parents=True)
        (staging_output / "bundle-manifest.json").write_text('{"sourceSha":"fixture"}\n')
        self.dist = self.workspace / "apps/web/dist"
        self.public = self.dist / "public"
        self.backend = self.dist / "backend-runtime"
        (self.public / "assets").mkdir(parents=True)
        (self.backend / "server/_core").mkdir(parents=True)
        (self.backend / "server/routers").mkdir(parents=True)
        (self.backend / "node_modules/tsx").mkdir(parents=True)
        (self.backend / "dist/public").mkdir(parents=True)
        (self.public / "index.html").write_text("<html>fixture</html>")
        (self.public / "assets/app.js").write_text(release.PROCEDURE)
        (self.backend / "dist/public/index.html").write_text("<html>fixture</html>")
        (self.backend / "server/_core/index.ts").write_text("export const app = true;\n")
        (self.backend / "server/routers/infrastructure.ts").write_text(
            f"{release.ADMIN_REGISTRATION}.query(() => null)\n"
        )
        (self.backend / "node_modules/tsx/package.json").write_text('{"name":"tsx"}\n')
        (self.backend / "release-build.json").write_text(json.dumps({
            "schemaVersion": 1,
            "sourceSha": self.source_sha,
            "frontendSourceSha": self.source_sha,
            "backendSourceSha": self.source_sha,
            "package": "@smartspec/web",
            "packageManager": "pnpm@10.4.1",
            "runtime": "node --import tsx server/_core/index.ts",
        }))
        ledger_artifact = release.build_artifact_manifest(self.dist)
        self.build_record = {
            "status": "BUILD_PASSED",
            "source_verified": True,
            "canonical_ref": "refs/heads/main",
            "source_revision": self.source_sha,
            "canonical_tip_after_build": self.source_sha,
            "isolated_workspace": str(self.workspace),
            "artifact": {**ledger_artifact, "artifact_path": str(self.dist)},
        }
        self.build_result_path = self.ledger_root / "fixture-build.json"
        self.build_result_path.write_text(json.dumps(self.build_record))
        self.artifact_store = self.ledger_root / "artifacts"
        self.artifact_store.mkdir()
        self.release_root = self.root / "production-releases"
        self.runtime_data_root = self.release_root / "smartspec-web-data"
        self.current_link = self.release_root / "smartspec-web-current"
        self.dropin_path = self.root / "systemd/smartspec-web.service.d/96-canonical-release.conf"
        self.lock_path = self.root / "canonical-leases/fixture/production-release.lock"
        self.receipt_root = self.ledger_root
        self.legacy = self.root / "legacy-runtime"
        self.legacy.mkdir()
        (self.legacy / "logs").mkdir()
        (self.legacy / "logs/legacy.log").write_text("preserve existing runtime data\n")
        self.runtime = IsolatedSystemdRuntime(self.current_link, self.legacy)
        self.tip = lambda manifest: self.source_sha

    def tearDown(self):
        self.temp.cleanup()

    def prepare(self):
        with patch.object(release, "canonical_tip", return_value=self.source_sha):
            result = release.prepare_artifact(self.build_result_path, self.artifact_store)
        self.assertEqual(result["status"], "ARTIFACT_READY")
        return Path(result["artifact_path"])

    def promote(self, artifact: Path):
        return release.promote_artifact(
            artifact,
            release_root=self.release_root,
            dropin_path=self.dropin_path,
            current_link=self.current_link,
            lock_path=self.lock_path,
            receipt_root=self.receipt_root,
            runtime_data_root=self.runtime_data_root,
            runtime=self.runtime,
            current_tip=self.tip,
            require_root=False,
        )

    def test_successful_promotion_pins_frontend_backend_and_runtime_receipt(self):
        artifact = self.prepare()
        result = self.promote(artifact)
        self.assertEqual(result["status"], "DEPLOYED_VERIFIED")
        self.assertEqual(result["runtime_verification"]["runtimeRevision"], self.source_sha)
        self.assertEqual(result["runtime_verification"]["anonymousDiagnosticsHttp"], 401)
        self.assertEqual(self.current_link.resolve(), Path(result["release_path"]))
        self.assertIn(f"Environment=RELEASE={self.source_sha}", self.dropin_path.read_text())
        self.assertEqual(result["generation"], 1)
        release_path = Path(result["release_path"])
        self.assertTrue((release_path / "logs").is_symlink())
        self.assertEqual(
            (release_path / "logs/legacy.log").read_text(),
            "preserve existing runtime data\n",
        )
        (release_path / "server-debug.log").write_text("runtime append target\n")
        self.assertEqual(
            (self.runtime_data_root / "logs/server-debug.log").read_text(),
            "runtime append target\n",
        )
        self.assertTrue((release_path / "tmp").is_symlink())
        self.assertTrue((release_path / "uploads").is_symlink())
        repository_key = hashlib.sha256(b"fixture-release-repository").hexdigest()[:20]
        status_file = self.root / "canonical-leases" / repository_key / "production-release.json"
        status = deploy.release_status(status_file, Path(result["release_path"]) / "dist/public", self.source_sha)
        self.assertTrue(status["target_matches_release"])
        self.assertEqual(status["backend_runtime_revision"], self.source_sha)

    def test_missing_procedure_registration_is_rejected_before_publication(self):
        router = self.backend / "server/routers/infrastructure.ts"
        router.write_text("export const infrastructureRouter = {};\n")
        self.build_record["artifact"] = {
            **release.build_artifact_manifest(self.dist), "artifact_path": str(self.dist)
        }
        self.build_result_path.write_text(json.dumps(self.build_record))
        with patch.object(release, "canonical_tip", return_value=self.source_sha):
            with self.assertRaisesRegex(release.ReleaseError, "exact-admin guard"):
                release.prepare_artifact(self.build_result_path, self.artifact_store)
        self.assertFalse(list(self.artifact_store.glob("smartspec-web-*")))

    def test_frontend_backend_source_mismatch_is_rejected(self):
        metadata_path = self.backend / "release-build.json"
        metadata = json.loads(metadata_path.read_text())
        metadata["backendSourceSha"] = "f" * 40
        metadata_path.write_text(json.dumps(metadata))
        self.build_record["artifact"] = {
            **release.build_artifact_manifest(self.dist), "artifact_path": str(self.dist)
        }
        self.build_result_path.write_text(json.dumps(self.build_record))
        with self.assertRaisesRegex(release.ReleaseError, "revisions are incompatible"):
            release.validate_build_result(self.build_result_path)

    def test_dirty_canonical_source_workspace_is_rejected(self):
        source_file = self.workspace / "apps/web/package.json"
        source_file.write_text('{"name":"@smartspec/web","localEdit":true}\n')
        with self.assertRaisesRegex(release.ReleaseError, "source changes outside generated dist"):
            release.validate_build_result(self.build_result_path)

    def test_artifact_digest_mismatch_is_rejected(self):
        artifact = self.prepare()
        file_path = artifact / "public/assets/app.js"
        file_path.chmod(0o644)
        file_path.write_text("mutated after publication")
        with self.assertRaisesRegex(release.ReleaseError, "digest mismatch"):
            self.promote(artifact)

    def test_failed_restart_restores_previous_configuration_and_runtime(self):
        artifact = self.prepare()
        self.dropin_path.parent.mkdir(parents=True)
        original_dropin = "[Service]\nWorkingDirectory=/legacy/runtime\n"
        self.dropin_path.write_text(original_dropin)
        self.runtime.fail_restart_once = True
        with self.assertRaisesRegex(release.ReleaseError, "rollback=ROLLED_BACK_HEALTHY"):
            self.promote(artifact)
        self.assertEqual(self.runtime.active_path, self.legacy)
        self.assertFalse(self.current_link.exists())
        self.assertEqual(self.dropin_path.read_text(), original_dropin)
        receipt = next((self.ledger_root / "production-deployments").glob("*.json"))
        self.assertEqual(json.loads(receipt.read_text())["status"], "ROLLED_BACK")

    def test_health_check_failure_rolls_back_to_previous_healthy_runtime(self):
        artifact = self.prepare()
        self.runtime.unhealthy_revision = self.source_sha
        with self.assertRaisesRegex(release.ReleaseError, "rollback=ROLLED_BACK_HEALTHY"):
            self.promote(artifact)
        self.assertEqual(self.runtime.active_path, self.legacy)
        self.assertFalse(self.current_link.exists())

    def test_retry_after_success_is_idempotent(self):
        artifact = self.prepare()
        first = self.promote(artifact)
        second = self.promote(artifact)
        self.assertEqual(first["status"], "DEPLOYED_VERIFIED")
        self.assertEqual(second["status"], "ALREADY_PROMOTED")
        self.assertEqual(self.runtime.restart_count, 1)

    def test_stale_source_is_rejected_before_runtime_changes(self):
        artifact = self.prepare()
        with self.assertRaisesRegex(release.ReleaseError, "Stale source rejected"):
            release.promote_artifact(
                artifact,
                release_root=self.release_root,
                dropin_path=self.dropin_path,
                current_link=self.current_link,
                lock_path=self.lock_path,
                receipt_root=self.receipt_root,
                runtime_data_root=self.runtime_data_root,
                runtime=self.runtime,
                current_tip=lambda _manifest: "f" * 40,
                require_root=False,
            )
        self.assertEqual(self.runtime.restart_count, 0)
        self.assertFalse(self.current_link.exists())

    def test_production_promotion_requires_explicit_root_authority(self):
        artifact = self.prepare()
        with patch.object(release.os, "geteuid", return_value=1001):
            with self.assertRaisesRegex(release.ReleaseError, "explicit root authorization"):
                release.promote_artifact(
                    artifact,
                    release_root=self.release_root,
                    dropin_path=self.dropin_path,
                    current_link=self.current_link,
                    lock_path=self.lock_path,
                    receipt_root=self.receipt_root,
                    runtime_data_root=self.runtime_data_root,
                    runtime=self.runtime,
                    current_tip=self.tip,
                )
        self.assertEqual(self.runtime.restart_count, 0)

    def test_restart_preflight_rejects_port_owner_outside_target_systemd_unit(self):
        service_cgroup = "/system.slice/smartspec-web.service"
        release.validate_listener_ownership(
            'LISTEN 0 128 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=41,fd=20))',
            service_cgroup,
            lambda _pid: "0::/system.slice/smartspec-web.service\n",
        )
        with self.assertRaisesRegex(release.ReleaseError, "outside smartspec-web.service"):
            release.validate_listener_ownership(
                'LISTEN 0 128 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=42,fd=20))',
                service_cgroup,
                lambda _pid: "0::/user.slice/other.service\n",
            )

    def test_canonical_packaging_script_copies_portable_runtime_and_frontend(self):
        repo = self.root / "packaging-fixture"
        web = repo / "apps/web"
        (web / "scripts").mkdir(parents=True)
        (web / "dist/public").mkdir(parents=True)
        (web / "dist/public/index.html").write_text("<html>packaged frontend</html>")
        release_files = web / "client/public/releases"
        release_files.mkdir(parents=True)
        (release_files / "desktop-release.zip").write_bytes(b"release-fixture")
        (web / "dist/public/releases").symlink_to("../../client/public/releases")
        (web / "scripts/package-linux-backend.sh").write_text(SCRIPT.with_name("package-linux-backend.sh").read_text())
        (web / "scripts/materialize-public-releases.sh").write_text(
            SCRIPT.with_name("materialize-public-releases.sh").read_text()
        )
        (repo / ".gitignore").write_text("apps/web/dist/\n")
        subprocess.run(["git", "init", "-q", str(repo)], check=True)
        subprocess.run(["git", "-C", str(repo), "config", "user.email", "test@example.invalid"], check=True)
        subprocess.run(["git", "-C", str(repo), "config", "user.name", "Release Test"], check=True)
        subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
        subprocess.run(["git", "-C", str(repo), "commit", "-qm", "package fixture"], check=True)
        generated_stage = repo / "apps/cloudflare/.staging-artifact"
        generated_stage.mkdir(parents=True)
        (generated_stage / "bundle-manifest.json").write_text('{"fixture":true}\n')
        fake_bin = self.root / "fake-bin"
        fake_bin.mkdir()
        fake_pnpm = fake_bin / "pnpm"
        fake_pnpm.write_text(
            "#!/bin/sh\n"
            "for target in \"$@\"; do :; done\n"
            "mkdir -p \"$target/server/_core\" \"$target/server/routers\" \"$target/node_modules/tsx\"\n"
            "mkdir -p \"$target/node_modules/.pnpm/node_modules/@smartspec\"\n"
            "ln -s \"$PWD/apps/web\" \"$target/node_modules/.pnpm/node_modules/@smartspec/web\"\n"
            "printf 'export const entry = true;\\n' > \"$target/server/_core/index.ts\"\n"
            "printf '{\"name\":\"tsx\"}\\n' > \"$target/node_modules/tsx/package.json\"\n",
            encoding="utf-8",
        )
        fake_pnpm.chmod(0o755)
        env = {**os.environ, "PATH": f"{fake_bin}:{os.environ['PATH']}"}
        result = subprocess.run(
            ["bash", "apps/web/scripts/package-linux-backend.sh"],
            cwd=repo,
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        runtime = web / "dist/backend-runtime"
        self.assertTrue((runtime / "server/_core/index.ts").is_file())
        self.assertTrue((runtime / "node_modules/tsx/package.json").is_file())
        self.assertFalse((runtime / "node_modules/.pnpm/node_modules/@smartspec/web").exists())
        self.assertFalse((runtime / "node_modules/.pnpm/node_modules/@smartspec/web").is_symlink())
        self.assertFalse((runtime / "dist/public/releases").is_symlink())
        self.assertEqual((runtime / "dist/public/releases/desktop-release.zip").read_bytes(), b"release-fixture")
        self.assertTrue((runtime / "dist/public/index.html").is_file())
        self.assertFalse((web / "dist/public/releases").is_symlink())
        self.assertEqual((web / "dist/public/releases/desktop-release.zip").read_bytes(), b"release-fixture")
        metadata = json.loads((runtime / "release-build.json").read_text())
        self.assertEqual(metadata["sourceSha"], subprocess.check_output(
            ["git", "-C", str(repo), "rev-parse", "HEAD"], text=True
        ).strip())
        (web / "package.json").write_text('{"name":"@smartspec/web","sourceEdit":true}\n')
        rejected_source_edit = subprocess.run(
            ["bash", "apps/web/scripts/package-linux-backend.sh"],
            cwd=repo,
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(rejected_source_edit.returncode, 2)
        self.assertIn("clean pinned source checkout", rejected_source_edit.stderr)

    def test_concurrent_retry_is_fenced_and_does_not_restart_twice(self):
        artifact = self.prepare()
        results: list[dict] = []
        errors: list[Exception] = []

        def run():
            try:
                results.append(self.promote(artifact))
            except Exception as exc:  # surfaced in the test thread
                errors.append(exc)

        threads = [threading.Thread(target=run) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=5)
        self.assertFalse(errors)
        self.assertEqual(len(results), 2)
        self.assertEqual(sorted(item["status"] for item in results), ["ALREADY_PROMOTED", "DEPLOYED_VERIFIED"])
        self.assertEqual(self.runtime.restart_count, 1)


if __name__ == "__main__":
    unittest.main()
