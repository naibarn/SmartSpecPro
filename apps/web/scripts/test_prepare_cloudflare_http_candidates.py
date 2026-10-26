"""Paired candidates reuse canonical artifact authority without deployment."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from linux_backend_release import ReleaseError
from prepare_cloudflare_http_candidates import prepare_candidates

SHA = "a" * 40
DIGEST = "sha256:" + "b" * 64


class HttpCandidatePairTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.record = {"source_revision": SHA, "artifact": {"artifact_digest": DIGEST}}
        self.authority = patch("prepare_cloudflare_http_candidates.validate_build_result",
            return_value=(self.record, self.root / "artifact", self.root / "source"))
        self.authority.start()
        self.addCleanup(self.authority.stop)

    def preparer(self, runtime, changes=None):
        def prepare(_receipt, output, _base, _connector):
            output.mkdir()
            (output / "Containerfile").write_text("# immutable fixture\n")
            return {"sourceSha": SHA, "packagerSourceSha": SHA, "canonicalArtifactDigest": DIGEST,
                "runtime": runtime, "providerMutations": 0, "publish": False,
                "context": str(output), **(changes or {})}
        return prepare

    def test_pair_requires_one_canonical_revision_and_records_no_acceptance(self):
        with patch("prepare_cloudflare_http_candidates.prepare_node", self.preparer("node-http")), \
             patch("prepare_cloudflare_http_candidates.prepare_python", self.preparer("python-http")):
            result = prepare_candidates(self.root / "receipt.json", self.root / "pair")
        stored = json.loads((self.root / "pair/candidate-pair.json").read_text())
        self.assertEqual(stored["sourceSha"], SHA)
        self.assertEqual(stored["images"]["node-http"]["context"], "node-http")
        self.assertEqual(stored["images"]["python-http"]["context"], "python-http")
        self.assertEqual(result["publicationStatus"], "NOT_PUBLISHED")
        self.assertEqual(result["runtimeAcceptance"], "NOT_TESTED")
        self.assertEqual(result["providerMutations"], 0)
        self.assertFalse(result["productionTrafficChanged"])

    def test_stale_or_foreign_python_cannot_publish_a_partial_pair(self):
        for change in ({"sourceSha": "c" * 40}, {"packagerSourceSha": "c" * 40},
            {"canonicalArtifactDigest": "sha256:" + "c" * 64}, {"runtime": "node-http"},
            {"providerMutations": 1}, {"publish": True}):
            with self.subTest(change=change), \
                 patch("prepare_cloudflare_http_candidates.prepare_node", self.preparer("node-http")), \
                 patch("prepare_cloudflare_http_candidates.prepare_python", self.preparer("python-http", change)):
                with self.assertRaisesRegex(ReleaseError, "CANDIDATE_PAIR_SOURCE_DENIED"):
                    prepare_candidates(self.root / "receipt.json", self.root / "pair")
                self.assertFalse((self.root / "pair").exists())
                self.assertEqual(list(self.root.glob(".http-candidates-*")), [])

    def test_existing_output_is_preserved(self):
        output = self.root / "pair"
        output.mkdir()
        (output / "preserved").write_text("owned elsewhere")
        with self.assertRaisesRegex(ReleaseError, "OUTPUT_ALREADY_EXISTS"):
            prepare_candidates(self.root / "receipt.json", output)
        self.assertEqual((output / "preserved").read_text(), "owned elsewhere")


if __name__ == "__main__":
    unittest.main()
