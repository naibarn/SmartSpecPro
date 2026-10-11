"""Guard visible web publication against a source SHA that advanced mid-swap."""
from __future__ import annotations

import importlib.util
import tempfile
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


if __name__ == "__main__":
    unittest.main()
