from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("linux_python_backend_release.py")
SPEC = importlib.util.spec_from_file_location("linux_python_backend_release", SCRIPT)
assert SPEC and SPEC.loader
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


class FakeRuntime:
    def __init__(self, original_cwd: Path, *, fail_verify: bool = False):
        self.original_cwd = original_cwd
        self.dropin: bytes | None = b"[Service]\nEnvironment=FEATURE_FLAG=true\n"
        self.exec = ["/home/dev/projects/SmartSpecPro/python-backend/.venv/bin/uvicorn",
                     "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
        self.fail_verify = fail_verify
        self.reloads = 0
        self.restarts = 0

    def assert_supported_target(self):
        return self.exec

    def dropin_bytes(self):
        return self.dropin

    def set_dropin(self, content):
        self.dropin = content

    def daemon_reload(self):
        self.reloads += 1

    def restart(self):
        self.restarts += 1

    def working_directory(self):
        return str(self.original_cwd)

    def verify(self, release_path, source_sha, original_cwd):
        if self.fail_verify:
            raise release.ReleaseError("injected readiness failure")
        assert str(release_path).encode() in self.dropin
        assert source_sha.encode() in self.dropin
        return {"status": "HEALTHY", "database_readiness_http": 200}

    def verify_rollback(self, prior_exec, prior_release, original_cwd):
        assert self.dropin == b"[Service]\nEnvironment=FEATURE_FLAG=true\n"
        return {"status": "ROLLED_BACK_SERVICE_HEALTHY", "database_readiness_http": 503}


class LinuxPythonBackendReleaseTests(unittest.TestCase):
    def test_existing_release_authority_exposes_python_subcommands(self):
        command = SCRIPT.with_name("linux_backend_release.py")
        result = subprocess.run([sys.executable, str(command), "--help"], capture_output=True, text=True, check=True)
        self.assertIn("prepare-python", result.stdout)
        self.assertIn("promote-python", result.stdout)

    def test_prepare_publishes_exact_source_without_environment_or_virtualenv(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source"
            backend = source / "python-backend"
            (backend / "app").mkdir(parents=True)
            (backend / "app/main.py").write_text("app = object()\n")
            (backend / "requirements.txt").write_text("fastapi\n")
            (backend / ".env").write_text("DATABASE_URL=must-not-copy\n")
            (backend / ".env.production").write_text("SECRET=must-not-copy\n")
            (backend / ".venv/bin").mkdir(parents=True)
            (backend / ".venv/bin/python").write_text("venv\n")
            slip_parser = source / "apps/web/skills/unified-payin-slip-parser/src/unified_slip_parser"
            slip_parser.mkdir(parents=True)
            (slip_parser / "router.py").write_text("def parse_slip(value): return value\n")
            slip_config = source / "apps/web/skills/unified-payin-slip-parser/configs"
            slip_config.mkdir(parents=True)
            (slip_config / "issuer-detection.rules.json").write_text("{}\n")
            (slip_config / "transaction-type.rules.json").write_text("{}\n")
            (source / ".development-repository.toml").write_text(
                '[repository]\nremote="origin"\ncanonical_ref="refs/heads/main"\n'
            )
            subprocess.run(["git", "init", "-q", str(source)], check=True)
            subprocess.run(["git", "-C", str(source), "config", "user.email", "test@example.invalid"], check=True)
            subprocess.run(["git", "-C", str(source), "config", "user.name", "Test"], check=True)
            subprocess.run(["git", "-C", str(source), "add", "."], check=True)
            subprocess.run(["git", "-C", str(source), "commit", "-qm", "fixture"], check=True)
            source_sha = subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip()
            original_run = release._run

            def run(command, *, cwd=None):
                if command[:2] == ["git", "ls-remote"]:
                    return f"{source_sha}\trefs/heads/main"
                return original_run(command, cwd=cwd)

            with patch.object(release, "_run", side_effect=run):
                result = release.prepare_artifact(source, root / "published")
            artifact = Path(result["artifact_path"])
            self.assertEqual(result["status"], "ARTIFACT_READY")
            self.assertTrue((artifact / "app/main.py").is_file())
            self.assertFalse((artifact / ".env").exists())
            self.assertFalse((artifact / ".env.production").exists())
            self.assertFalse((artifact / ".venv").exists())
            self.assertTrue((artifact / "vendor/unified-payin-slip-parser/src/unified_slip_parser/router.py").is_file())
            self.assertTrue((artifact / "vendor/unified-payin-slip-parser/configs/issuer-detection.rules.json").is_file())
            self.assertEqual(release.validate_artifact(artifact)["source_sha"], source_sha)

    def _artifact(self, root: Path) -> tuple[Path, str]:
        sha = "a" * 40
        artifact = root / "smartspec-python-placeholder"
        (artifact / "app").mkdir(parents=True)
        (artifact / "app/main.py").write_text("app = object()\n")
        vendor = artifact / "vendor/unified-payin-slip-parser/src/unified_slip_parser"
        vendor.mkdir(parents=True)
        (vendor / "router.py").write_text("def parse_slip(value): return value\n")
        configs = artifact / "vendor/unified-payin-slip-parser/configs"
        configs.mkdir(parents=True)
        (configs / "issuer-detection.rules.json").write_text("{}\n")
        (configs / "transaction-type.rules.json").write_text("{}\n")
        digest = release.tree_manifest(artifact)["artifact_digest"]
        artifact.rename(root / f"smartspec-python-{sha}-{digest[7:19]}")
        artifact = root / f"smartspec-python-{sha}-{digest[7:19]}"
        release.write_json_atomic(artifact / "release-manifest.json", {
            "schema_version": 1, "release_id": artifact.name, "source_sha": sha,
            "canonical_ref": "refs/heads/main", "artifact_digest": digest,
            "artifact_file_count": release.tree_manifest(artifact)["file_count"],
        })
        return artifact, sha

    def test_promote_verifies_database_readiness_and_preserves_original_dropin(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            artifact, sha = self._artifact(root)
            runtime = FakeRuntime(root)
            receipt = release.promote_artifact(artifact, runtime=runtime, receipt_root=root / "receipts", release_root=root)
            self.assertEqual(receipt["status"], "DEPLOYED_VERIFIED")
            self.assertEqual(receipt["runtime_verification"]["database_readiness_http"], 200)
            self.assertIn(sha.encode(), runtime.dropin)
            self.assertEqual(runtime.restarts, 1)
            self.assertEqual(len(list((root / "receipts").glob("*.json"))), 1)
            service_dropin = release.systemd_dropin(runtime.exec, artifact, sha).decode()
            self.assertIn("--app-dir", service_dropin)
            self.assertIn("Environment=PYTHONPATH=" + str(artifact / "vendor/unified-payin-slip-parser/src"), service_dropin)
            self.assertNotIn("EnvironmentFile", service_dropin)
            self.assertIn("ExecStart=", service_dropin)

    def test_failed_readiness_restores_dropin_restarts_and_records_rollback(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            artifact, _ = self._artifact(root)
            runtime = FakeRuntime(root, fail_verify=True)
            prior = runtime.dropin
            with self.assertRaises(release.ReleaseError):
                release.promote_artifact(artifact, runtime=runtime, receipt_root=root / "receipts", release_root=root)
            self.assertEqual(runtime.dropin, prior)
            self.assertEqual(runtime.restarts, 2)
            records = [json.loads(path.read_text()) for path in (root / "receipts").glob("*.json")]
            self.assertEqual(records[0]["status"], "ROLLED_BACK")
            self.assertEqual(records[0]["rollback_verification"]["status"], "ROLLED_BACK_SERVICE_HEALTHY")


if __name__ == "__main__":
    unittest.main()
