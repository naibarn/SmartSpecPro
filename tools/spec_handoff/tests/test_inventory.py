import tempfile
import unittest
from pathlib import Path

from tools.spec_handoff.inventory import inventory


class InventoryTests(unittest.TestCase):
    def make_repo(self, root: Path) -> None:
        (root / "specs/_config").mkdir(parents=True)
        (root / "specs/_config/handoff-roots.toml").write_text(
            '[spec_handoff]\nschema_version=1\ncanonical_roots=["specs/feature","specs/quick"]\nalternate_roots=["archive/specs"]\nplanning_roots=["specs/quick"]\n',
            encoding="utf-8",
        )
        (root / "specs/feature/001-one").mkdir(parents=True)
        (root / "specs/feature/001-one/spec.md").write_text("# One\nRevision: 1.0\n", encoding="utf-8")
        (root / "specs/feature/001-copy").mkdir(parents=True)
        (root / "specs/feature/001-copy/spec.md").write_text("# Duplicate\nRevision: 1.0\n", encoding="utf-8")
        (root / "specs/feature/002-missing").mkdir()
        (root / "specs/quick/003-planning").mkdir(parents=True)
        (root / "specs/quick/003-planning/request.md").write_text("plan", encoding="utf-8")
        (root / "archive/specs/004-old").mkdir(parents=True)
        (root / "archive/specs/004-old/spec.md").write_text("# Old", encoding="utf-8")

    def test_inventory_is_dynamic_and_retains_duplicate_and_malformed_candidates(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            self.make_repo(repo)
            result = inventory(repo)
            kinds = {row["path"]: row["record_kind"] for row in result["records"]}
            self.assertEqual(kinds["specs/feature/001-one"], "CANONICAL_SPEC")
            self.assertEqual(kinds["specs/feature/002-missing"], "MALFORMED_CANDIDATE")
            self.assertEqual(kinds["specs/quick/003-planning"], "PLANNING_ARTIFACT")
            duplicates = [row for row in result["records"] if row["relationships"]["duplicate_revisions"]]
            self.assertEqual(len(duplicates), 2)
            self.assertIn("archive/specs/004-old", kinds)

    def test_output_order_and_records_are_stable(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            self.make_repo(repo)
            first = inventory(repo)
            second = inventory(repo)
            self.assertEqual(first, second)
            self.assertEqual(len({row["record_key"] for row in first["records"]}), len(first["records"]))

    def test_path_escape_in_root_config_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            self.make_repo(repo)
            (repo / "specs/_config/handoff-roots.toml").write_text(
                '[spec_handoff]\nschema_version=1\ncanonical_roots=["../outside"]\nalternate_roots=[]\n', encoding="utf-8"
            )
            with self.assertRaises(ValueError):
                inventory(repo)

    def test_nested_deep_project_requirements_are_not_malformed_specs(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            (repo / "specs/_config").mkdir(parents=True)
            (repo / "specs/_config/handoff-roots.toml").write_text(
                '[spec_handoff]\nschema_version=1\ncanonical_roots=["specs/project"]\nalternate_roots=[]\n',
                encoding="utf-8",
            )
            requirements = repo / "specs/project/013-scope/requirements.deep-project/requirements.md"
            requirements.parent.mkdir(parents=True)
            requirements.write_text("# Project requirements\n", encoding="utf-8")
            result = inventory(repo)
            parent = next(row for row in result["records"] if row["path"] == "specs/project/013-scope")
            self.assertEqual(parent["record_kind"], "PROJECT_REQUIREMENTS")
            self.assertIsNone(parent["problem"])

    def test_identical_nested_spec_copy_remains_indexed_without_authority_collision(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            self.make_repo(repo)
            original = repo / "specs/feature/001-one"
            nested = original / "specs/feature/001-one"
            nested.mkdir(parents=True)
            (nested / "spec.md").write_bytes((original / "spec.md").read_bytes())
            result = inventory(repo)
            records = {row["path"]: row for row in result["records"]}
            duplicate = records["specs/feature/001-one/specs/feature/001-one"]
            self.assertEqual(duplicate["record_kind"], "DUPLICATE_SPEC_COPY")
            self.assertEqual(duplicate["problem"], "DUPLICATE_SPEC_COPY_OF:specs/feature/001-one")
            self.assertNotIn(nested.relative_to(repo).as_posix(), records["specs/feature/001-one"]["relationships"]["duplicate_ids"])
            self.assertEqual(len(records), result["invariants"]["record_count"])

    def test_yaml_frontmatter_title_is_used_when_heading_is_beyond_scan_window(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            self.make_repo(repo)
            spec = repo / "specs/feature/005-frontmatter"
            spec.mkdir(parents=True)
            spec.joinpath("spec.md").write_text(
                "---\ntitle: Frontmatter title\nrevision: 1.7-candidate\n---\n"
                + "\n".join(f"metadata line {index}" for index in range(90))
                + "\n# Delayed heading\n",
                encoding="utf-8",
            )
            result = inventory(repo)
            record = next(row for row in result["records"] if row["path"] == "specs/feature/005-frontmatter")
            self.assertEqual(record["title"], "Frontmatter title")
            self.assertEqual(record["revision"], "1.7")
            self.assertEqual(record["record_kind"], "CANONICAL_SPEC")


if __name__ == "__main__":
    unittest.main()
