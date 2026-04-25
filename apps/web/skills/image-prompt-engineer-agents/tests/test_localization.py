import sys
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from gpt_image_prompt_engineer import run_skill


class LocalizationTest(unittest.TestCase):
    def test_thai_prompt_localizes_common_camera_terms(self):
        result = run_skill({
            "topic": "หญิงสาวแฟชั่นเกาหลี",
            "target_language": "th",
            "camera_angle": "low_angle",
            "shot_framing": "close_up",
            "image_style": "fashion_lookbook",
        })
        detailed = result["prompts"]["detailed"]
        self.assertIn("มุมต่ำ", detailed)
        self.assertIn("ระยะใกล้", detailed)
        self.assertNotIn("low_angle", detailed)
        self.assertNotIn("close_up", detailed)


if __name__ == "__main__":
    unittest.main()
