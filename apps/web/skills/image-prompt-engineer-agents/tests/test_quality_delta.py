import sys
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from gpt_image_prompt_engineer import run_skill


class QualityDeltaTest(unittest.TestCase):
    def test_quality_delta_present_and_non_negative_for_subagents(self):
        result = run_skill({
            "topic": "luxury product ad with cinematic lighting",
            "image_style": "auto",
            "orchestration_mode": "subagents",
            "subagent_budget": "high"
        })
        delta = result["final_quality_delta"]
        self.assertIn("before_score", delta)
        self.assertIn("after_score", delta)
        self.assertGreaterEqual(delta["after_score"], delta["before_score"])
        self.assertGreaterEqual(delta["delta"], 0)

    def test_model_free_with_subagents(self):
        result = run_skill({
            "topic": "cinematic luxury perfume product ad",
            "orchestration_mode": "subagents"
        })
        def walk(obj):
            if isinstance(obj, dict):
                for k, v in obj.items():
                    yield k, v
                    yield from walk(v)
            elif isinstance(obj, list):
                for item in obj:
                    yield from walk(item)
        forbidden = {"model", "custom_model_name", "response_model"}
        found = {k for k, _ in walk(result) if k in forbidden}
        self.assertFalse(found)


if __name__ == "__main__":
    unittest.main()
