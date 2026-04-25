import sys
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from gpt_image_prompt_engineer import run_skill


class MultiFrameTest(unittest.TestCase):
    def test_multiframe_storyboard_sets_panel_count_and_wide_size(self):
        result = run_skill({
            "topic": "cinematic storyboard หลายเฟรม of a hero entering a neon alley",
            "multi_frame_mode": "auto",
            "frame_layout": "2x2",
        })
        self.assertEqual(result["normalized"]["multi_frame_mode"], "storyboard")
        self.assertEqual(result["normalized"]["panel_count"], 4)
        self.assertEqual(result["normalized"]["render_size"], "1536x1024")
        self.assertIn("แนวทางหลายเฟรม", result["prompts"]["detailed"])
        self.assertIn("ช่องที่ 1", result["prompts"]["detailed"])


if __name__ == "__main__":
    unittest.main()
