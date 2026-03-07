from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

TEST_ROOT = Path(__file__).resolve().parent.parent
if str(TEST_ROOT) not in sys.path:
    sys.path.insert(0, str(TEST_ROOT))

from isc import registry  # noqa: E402
from isc.exemplars import format_exemplar_context, select_relevant_skill_exemplars  # noqa: E402


class ExemplarSelectionTests(unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self._old_canonical = registry.CANONICAL_SKILLS_DIR
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self._tmp.name)
        registry.CANONICAL_SKILLS_DIR = self.tmp_path / "skills"
        registry.CANONICAL_SKILLS_DIR.mkdir(parents=True, exist_ok=True)

        self._write_skill(
            "thai-date-converter",
            description="Convert Thai dates between Buddhist Era and Common Era",
            category="productivity",
            tags="[date, thai, calendar]",
        )
        self._write_skill(
            "seo-meta-generator",
            description="Generate SEO metadata from article content",
            category="marketing",
            tags="[seo, metadata, article]",
        )

    def tearDown(self) -> None:
        registry.CANONICAL_SKILLS_DIR = self._old_canonical
        self._tmp.cleanup()
        super().tearDown()

    def _write_skill(self, skill_name: str, *, description: str, category: str, tags: str) -> None:
        skill_dir = registry.CANONICAL_SKILLS_DIR / skill_name
        skill_dir.mkdir(parents=True, exist_ok=True)
        (skill_dir / "skill.md").write_text(
            "\n".join(
                [
                    "---",
                    f"name: {skill_name}",
                    f"description: \"{description}\"",
                    f"category: {category}",
                    f"tags: {tags}",
                    "execution_mode: python",
                    "triggerPatterns:",
                    f"  - \"{description}\"",
                    "---",
                    "",
                    f"# {skill_name}",
                ]
            ),
            encoding="utf-8",
        )

    def test_select_relevant_skill_exemplars_prefers_overlap(self) -> None:
        exemplars = select_relevant_skill_exemplars(
            "build a thai date conversion skill for buddhist era calendar support",
            top_k=2,
        )

        self.assertEqual(exemplars[0].skill_name, "thai-date-converter")

    def test_format_exemplar_context_handles_empty_results(self) -> None:
        self.assertEqual(format_exemplar_context([]), "(no close local skill exemplars found)")


if __name__ == "__main__":
    unittest.main()
