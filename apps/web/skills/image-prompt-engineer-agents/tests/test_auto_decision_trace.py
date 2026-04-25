import sys
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from gpt_image_prompt_engineer import run_skill


def by_field(trace, field):
    return next(x for x in trace if x["field"] == field)


class AutoDecisionTraceTest(unittest.TestCase):
    def test_thai_fashion_auto_decisions_have_trace_and_confidence(self):
        result = run_skill({
            "topic": "หญิงสาวสวย ชุดทันสมัยหรู แฟชั่นเกาหลี อายุ 18 ปี ผมยาว ใบหน้าคม ดวงตากลมโต",
            "subject_age": 18,
            "target_language": "auto",
            "image_style": "auto",
        })
        self.assertEqual(result["normalized"]["target_language"], "th")
        self.assertEqual(result["normalized"]["image_style"], "fashion_lookbook")
        self.assertEqual(result["normalized"]["aspect_ratio"], "2:3")
        self.assertGreater(result["confidence_score"], 0.7)
        self.assertTrue(by_field(result["decision_trace"], "image_style")["reason"])


if __name__ == "__main__":
    unittest.main()
