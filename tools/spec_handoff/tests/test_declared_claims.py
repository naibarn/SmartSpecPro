import tempfile
import unittest
from pathlib import Path

from tools.spec_handoff.declared_claims import collect_declared_claims, resolve_claim_targets


class DeclaredClaimTests(unittest.TestCase):
    def test_status_and_explicit_relationship_are_cited_candidates(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            spec = repo / "specs/feature/071-example"
            spec.mkdir(parents=True)
            (spec / "spec.md").write_text(
                "# Feature 071\nVersion: 1\nStatus: Proposed\nSupersedes: Feature 059 where documents conflict\n\n## Design\nStatus: Implemented\n",
                encoding="utf-8",
            )
            claims = collect_declared_claims(spec, repo)
            self.assertEqual([c["claim_kind"] for c in claims], ["DECLARED_STATUS", "DECLARED_RELATIONSHIP"])
            status, relationship = claims
            self.assertEqual(status["value"], "Proposed")
            self.assertEqual(relationship["relation"], "SUPERSEDES")
            self.assertEqual(relationship["target_spec_ids"], ["059"])
            resolved = resolve_claim_targets([relationship], [
                {"root_kind": "CANONICAL", "record_kind": "CANONICAL_SPEC", "spec_id": "059", "path": "specs/feature/059-old", "record_key": "old", "title": "Old"},
            ])[0]
            self.assertEqual(resolved["target_candidates"][0]["path"], "specs/feature/059-old")
            self.assertFalse(resolved["target_ambiguous"])
            self.assertEqual(resolved["scope_signal"], "PARTIAL_SCOPE_EXPLICIT")
            self.assertEqual(status["authority"], "AUTHOR_ASSERTION_CANDIDATE")
            self.assertEqual(status["confidence"], "LOW")
            self.assertEqual(status["source"], "specs/feature/071-example/spec.md")
            self.assertTrue(status["source_digest"])

    def test_completion_artifact_claim_does_not_become_authority(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            spec = repo / "specs/feature/001-example"
            spec.mkdir(parents=True)
            (spec / "spec.md").write_text("# Example\nStatus: Proposed\n", encoding="utf-8")
            (spec / "completion.md").write_text("Status: Complete\n", encoding="utf-8")
            claims = collect_declared_claims(spec, repo)
            self.assertEqual({claim["value"] for claim in claims}, {"Proposed", "Complete"})
            self.assertTrue(all(claim["authority"] == "AUTHOR_ASSERTION_CANDIDATE" for claim in claims))

    def test_status_like_fields_below_spec_header_are_ignored(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            spec = repo / "specs/feature/001-example"
            spec.mkdir(parents=True)
            (spec / "spec.md").write_text("# Example\n\n## Runtime model\n\n## Status model\nStatus: IMPLEMENTED\n", encoding="utf-8")
            self.assertEqual(collect_declared_claims(spec, repo), [])

    def test_duplicate_target_identity_is_exposed_not_selected(self):
        claim = {"claim_kind": "DECLARED_RELATIONSHIP", "target_spec_ids": ["001"], "value": "Spec 001"}
        targets = [
            {"root_kind": "CANONICAL", "record_kind": "CANONICAL_SPEC", "spec_id": "001", "path": "specs/feature/001-a", "record_key": "a"},
            {"root_kind": "CANONICAL", "record_kind": "CANONICAL_SPEC", "spec_id": "001", "path": "specs/feature/001-b", "record_key": "b"},
        ]
        resolved = resolve_claim_targets([claim], targets)[0]
        self.assertEqual(len(resolved["target_candidates"]), 2)
        self.assertTrue(resolved["target_ambiguous"])

    def test_deep_implement_section_states_remain_sha_cited_claims(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            spec = repo / "specs/feature/038-example"
            implementation = spec / "implementation"
            implementation.mkdir(parents=True)
            (spec / "spec.md").write_text("# Example\n", encoding="utf-8")
            (implementation / "deep_implement_config.json").write_text(
                '{"sections_state":{"section-01":{"status":"complete","commit_hash":"d1dc87ff40790a3e30d17f23fc98e46df8fa3a2f"}}}',
                encoding="utf-8",
            )
            claims = collect_declared_claims(spec, repo)
            self.assertEqual(len(claims), 1)
            self.assertEqual(claims[0]["claim_kind"], "SECTION_STATUS_ASSERTION")
            self.assertEqual(claims[0]["commit_hash_length"], 40)
            self.assertEqual(claims[0]["authority"], "AUTHOR_ASSERTION_CANDIDATE")


if __name__ == "__main__":
    unittest.main()
