"""CPU lock and image contexts cannot ingest credentials or external files."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from linux_backend_release import ReleaseError
from package_cloudflare_python_http_image import prepare_context, validate_cpu_lock

SHA = "a" * 40
IMAGE = "docker.io/library/python@sha256:" + "b" * 64
ROOT = Path(__file__).parents[3]


class PythonHttpImageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = self.root / "source"
        self.source.mkdir()
        subprocess.run(["git", "init", "-q", str(self.source)], check=True)
        for name in ("main.py", "core/application_runtime.py", "core/application_database_tls.py"):
            path = self.source / "python-backend/app" / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("# tracked fixture\n")
        subprocess.run(["git", "-C", str(self.source), "add", "--", "python-backend/app"], check=True)
        self.record = {"source_revision": SHA, "artifact": {"artifact_digest": "sha256:" + "c" * 64}}
        self.authority = patch("package_cloudflare_python_http_image.validate_build_result", return_value=(self.record, self.root / "artifact", self.source))
        self.packager = patch("package_cloudflare_python_http_image.packager_source_sha", return_value="d" * 40)
        self.authority.start()
        self.packager.start()
        self.addCleanup(self.authority.stop)
        self.addCleanup(self.packager.stop)

    def test_locked_cpu_dependencies_require_hashes_and_deny_gpu_or_foreign_urls(self):
        lock = (ROOT / "python-backend/requirements-cloudflare-http.lock").read_text()
        validate_cpu_lock(lock)
        for changed in (
            lock + "\nnvidia-cublas-cu12==1.0 --hash=sha256:" + "a" * 64,
            lock + "\ntriton==1.0 --hash=sha256:" + "a" * 64,
            lock + "\nfixture @ https://other.example/wheel.whl --hash=sha256:" + "a" * 64,
            lock + "\nfixture>=1.0", lock + "\nfixture==1.0", lock + "\n--extra-index-url https://other.example",
        ):
            with self.assertRaises(ReleaseError):
                validate_cpu_lock(changed)

    def test_context_preserves_canonical_source_and_excludes_untracked_environment(self):
        (self.source / "python-backend/app/.env").write_text("PRIVATE=fixture")
        result = prepare_context(self.root / "receipt.json", self.root / "image", IMAGE, IMAGE)
        self.assertEqual(result["sourceSha"], SHA)
        self.assertFalse(result["publish"])
        self.assertEqual(result["providerMutations"], 0)
        self.assertFalse((self.root / "image/app/.env").exists())
        self.assertTrue((self.root / "image/app/core/cloudflare_http_entrypoint.py").is_file())
        self.assertEqual(json.loads((self.root / "image/image-input.json").read_text())["files"], result["files"])
        with self.assertRaisesRegex(ReleaseError, "OUTPUT_ALREADY_EXISTS"):
            prepare_context(self.root / "receipt.json", self.root / "image", IMAGE, IMAGE)

    def test_rejects_tracked_secrets_symlinks_and_unpinned_images(self):
        with self.assertRaisesRegex(ReleaseError, "PINNED_BASE_REQUIRED"):
            prepare_context(self.root / "receipt.json", self.root / "image", "python:latest", IMAGE)
        secret = self.source / "python-backend/app/.env"
        secret.write_text("PRIVATE=fixture")
        subprocess.run(["git", "-C", str(self.source), "add", "-f", "--", "python-backend/app/.env"], check=True)
        with self.assertRaisesRegex(ReleaseError, "ENV_FILE_DENIED"):
            prepare_context(self.root / "receipt.json", self.root / "image", IMAGE, IMAGE)
        secret.unlink()
        secret.symlink_to(self.root / "outside")
        with self.assertRaisesRegex(ReleaseError, "EXTERNAL_LINK_DENIED"):
            prepare_context(self.root / "receipt.json", self.root / "image", IMAGE, IMAGE)


if __name__ == "__main__":
    unittest.main()
