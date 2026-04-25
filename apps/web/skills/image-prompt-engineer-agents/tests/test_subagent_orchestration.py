import sys
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from gpt_image_prompt_engineer import run_skill


class SubagentOrchestrationTest(unittest.TestCase):
    def test_auto_selects_specialists_for_cinematic_storyboard(self):
        result = run_skill({
            "topic": "cinematic storyboard หลายเฟรม of a hero entering a neon alley",
            "target_language": "th",
            "orchestration_mode": "auto",
            "multi_frame_mode": "auto",
            "frame_layout": "2x2"
        })
        selected = set(result["orchestration"]["selected_subagents"])
        self.assertEqual(result["orchestration"]["mode"], "subagents")
        self.assertIn("intent_triage", selected)
        self.assertIn("cinematographer", selected)
        self.assertIn("layout_multiframe", selected)
        self.assertTrue(result["subagent_reports"])
        self.assertTrue(result["merge_report"]["applied_recommendations"])

    def test_off_disables_subagent_reports(self):
        result = run_skill({
            "topic": "simple realistic apple on a table",
            "orchestration_mode": "off"
        })
        self.assertEqual(result["orchestration"]["mode"], "off")
        self.assertFalse(result["subagent_reports"])
        self.assertFalse(result["orchestration"]["subagents_enabled"])

    def test_conflict_resolution_for_infographic_blur(self):
        result = run_skill({
            "topic": "infographic chart about coffee brewing",
            "image_style": "infographic",
            "deliverable_type": "infographic",
            "depth_of_field": "shallow",
            "background_blur": "strong",
            "orchestration_mode": "subagents"
        })
        self.assertEqual(result["normalized"]["depth_of_field"], "deep")
        self.assertEqual(result["normalized"]["background_blur"], "none")
        self.assertGreaterEqual(len(result["conflict_resolution"]), 2)


if __name__ == "__main__":
    unittest.main()
