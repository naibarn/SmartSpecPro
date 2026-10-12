"""Regression checks for the no-force-push development lifecycle policy."""
from pathlib import Path
import unittest


ROOT = Path(__file__).parents[2]


class ForcePushPolicyTests(unittest.TestCase):
    def test_force_push_policy_has_one_explicit_enforcement_owner(self) -> None:
        finish = (ROOT / "session-finish/SKILL.md").read_text(encoding="utf-8").lower()
        for command in ("git push --force", "git push -f", "git push --force-with-lease"):
            self.assertIn(command, finish)
        self.assertIn("emergency/recovery", finish)

        for relative in ("development-lifecycle/SKILL.md", "integration-controller/SKILL.md"):
            content = (ROOT / relative).read_text(encoding="utf-8").lower()
            with self.subTest(skill=relative):
                self.assertIn("force-push", content)
                self.assertIn("protected", content)


if __name__ == "__main__":
    unittest.main()
