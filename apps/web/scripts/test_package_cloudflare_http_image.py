"""Image preparation cannot ingest env files, outside links or stale source."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from linux_backend_release import ReleaseError
from package_cloudflare_http_image import prepare_context, validate_runtime

SHA = "a" * 40
IMAGE = "docker.io/library/node@sha256:" + "b" * 64


class HttpImageTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.patch_source = patch("package_cloudflare_http_image.packager_source_sha", return_value="d" * 40)
        self.patch_source.start()
        self.addCleanup(self.patch_source.stop)
        self.root = Path(self.tmp.name)
        self.runtime = self.root / "artifact/backend-runtime"
        for name in ("server/_core/index.ts", "server/_core/applicationRuntime.ts", "server/_core/applicationDatabaseTls.ts", "node_modules/tsx/package.json", "dist/public/index.html"):
            path = self.runtime / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("fixture")
        (self.runtime / "release-build.json").write_text(json.dumps({key: SHA for key in ("sourceSha", "frontendSourceSha", "backendSourceSha")}))

    def test_rejects_env_outside_link_and_missing_runtime(self):
        (self.runtime / ".env").write_text("fixture")
        with self.assertRaisesRegex(ReleaseError, "ENV_FILE_DENIED"):
            validate_runtime(self.runtime, SHA)
        (self.runtime / ".env").unlink()
        (self.runtime / "outside").symlink_to(self.root)
        with self.assertRaisesRegex(ReleaseError, "EXTERNAL_LINK_DENIED"):
            validate_runtime(self.runtime, SHA)
        (self.runtime / "outside").unlink()
        (self.runtime / "absolute").symlink_to(self.runtime / "server")
        with self.assertRaisesRegex(ReleaseError, "EXTERNAL_LINK_DENIED"):
            validate_runtime(self.runtime, SHA)
        (self.runtime / "absolute").unlink()
        (self.runtime / "relative").symlink_to("server")
        validate_runtime(self.runtime, SHA)
        (self.runtime / "server/_core/applicationRuntime.ts").unlink()
        with self.assertRaisesRegex(ReleaseError, "REQUEST_RUNTIME_REQUIRED"):
            validate_runtime(self.runtime, SHA)

    def test_only_pinned_base_and_matching_source_are_accepted(self):
        with self.assertRaisesRegex(ReleaseError, "PINNED_BASE_REQUIRED"):
            prepare_context(self.root / "result.json", self.root / "image", "node:latest", IMAGE)
        with self.assertRaisesRegex(ReleaseError, "SOURCE_MISMATCH"):
            validate_runtime(self.runtime, "c" * 40)

    def test_context_reuses_existing_authority_and_preserves_source(self):
        record = {"source_revision": SHA, "artifact": {"artifact_digest": "sha256:" + "c" * 64}}
        with patch("package_cloudflare_http_image.validate_build_result", return_value=(record, self.runtime.parent, self.root)) as authority:
            result = prepare_context(self.root / "receipt.json", self.root / "image", IMAGE, IMAGE)
        authority.assert_called_once_with(self.root / "receipt.json")
        self.assertFalse(result["publish"])
        self.assertEqual(result["providerMutations"], 0)
        self.assertTrue((self.runtime / "dist/public/index.html").exists())
        self.assertFalse((self.root / "image/runtime/dist").exists())
        self.assertTrue((self.root / "image/runtime/server/_core/index.ts").exists())
        with self.assertRaisesRegex(ReleaseError, "OUTPUT_ALREADY_EXISTS"), patch("package_cloudflare_http_image.validate_build_result", return_value=(record, self.runtime.parent, self.root)):
            prepare_context(self.root / "receipt.json", self.root / "image", IMAGE, IMAGE)
