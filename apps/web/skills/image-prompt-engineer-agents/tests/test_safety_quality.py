import sys
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from gpt_image_prompt_engineer import run_skill


class SafetyQualityTest(unittest.TestCase):
    def test_age_sensitive_safety_review_and_quality(self):
        result = run_skill({
            "topic": "beautiful 18-year-old Korean fashion portrait, elegant modern outfit",
            "subject_age": 18,
            "image_style": "fashion_lookbook",
        })
        self.assertIn("age_sensitive", result["safety_review"]["flags"])
        self.assertEqual(result["safety_review"]["status"], "review")
        self.assertIn("sexualized pose", result["prompts"]["negative_constraints"])
        self.assertGreaterEqual(result["prompt_quality"]["score"], 80)

    def test_high_risk_signal_lowers_quality_check(self):
        result = run_skill({"topic": "nude explicit portrait"})
        self.assertEqual(result["safety_review"]["risk_level"], "high")
        self.assertLess(result["prompt_quality"]["score"], 100)


if __name__ == "__main__":
    unittest.main()
