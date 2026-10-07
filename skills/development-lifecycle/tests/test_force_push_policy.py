"""Regression checks for the no-force-push development lifecycle policy."""
from pathlib import Path
import unittest


ROOT = Path(__file__).parents[2]


class ForcePushPolicyTests(unittest.TestCase):
    def test_normal_lifecycle_skills_reject_force_push_variants(self) -> None:
        required = (
            "git push --force",
            "git push -f",
            "git push --force-with-lease",
            "normal non-force",
            "emergency/recovery",
        )
        for relative in (
            Path("development-lifecycle/SKILL.md"),
            Path("session-finish/SKILL.md"),
            Path("integration-controller/SKILL.md"),
        ):
            content = (ROOT / relative).read_text(encoding="utf-8").lower()
            with self.subTest(skill=str(relative)):
                for phrase in required:
                    self.assertIn(phrase.lower(), content)


if __name__ == "__main__":
    unittest.main()
