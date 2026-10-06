import tempfile
import unittest
from pathlib import Path

from tools.spec_handoff.relationships import build_relationship_graph


class RelationshipTests(unittest.TestCase):
    def test_explicit_multi_successor_and_requirement_edges_are_candidates(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            (repo / "specs/_config").mkdir(parents=True)
            (repo / "specs/_config/handoff-roots.toml").write_text('[spec_handoff]\nschema_version=1\ncanonical_roots=["specs/feature"]\nalternate_roots=[]\n', encoding="utf-8")
            for number, text in [("001", "# Old\nR1 must be supported.\n"), ("002", "# New A\nThis spec supersedes Spec 001 and absorbs requirement R1.\n"), ("003", "# New B\nThis Spec replaces Spec 001.\n")]:
                path = repo / f"specs/feature/{number}-spec"
                path.mkdir(parents=True)
                (path / "spec.md").write_text(text, encoding="utf-8")
            graph = build_relationship_graph(repo)
            edges = [edge for edge in graph["edges"] if edge["predecessor_spec_id"] == "001"]
            self.assertEqual({edge["successor_spec_id"] for edge in edges}, {"002", "003"})
            self.assertTrue(all(edge["confidence"] == "LOW" for edge in edges))
            self.assertTrue(all(edge["source"].startswith("specs/feature/") for edge in edges))
            self.assertTrue(all(str(repo) not in edge["source"] for edge in edges))
            self.assertTrue(any("R1" in edge["requirement_ids"] for edge in edges))
            self.assertIn("candidates only", graph["authority_note"])


if __name__ == "__main__":
    unittest.main()
