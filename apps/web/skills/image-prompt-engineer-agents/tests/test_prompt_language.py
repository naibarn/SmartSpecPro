import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from gpt_image_prompt_engineer import run_skill


class PromptLanguageTest(unittest.TestCase):
    def test_thai_prompt_uses_thai_template_and_includes_aspect_ratio(self):
        result = run_skill({
            "topic": "ผู้หญิงสาวสวยมาก อายุ 18 ปี เดินเล่นริมทะเล",
            "target_language": "th",
            "aspect_ratio": "9:16",
            "modifiers": ["sharp focus"],
            "avoid": ["watermark"],
        })

        prompt = result["prompts"]["detailed"]
        self.assertIn("หัวข้อภาพ:", prompt)
        self.assertIn("สัดส่วนภาพ: 9:16", prompt)
        self.assertIn("พื้นหลัง:", prompt)
        self.assertIn("โฟกัสคมชัด", prompt)
        self.assertIn("ลายน้ำ", prompt)
        self.assertNotIn("สร้างภาพคุณภาพสูงในหัวข้อ", prompt)
        self.assertNotIn("Background direction", prompt)
        self.assertNotIn("choose a coherent background", prompt)
        self.assertNotIn("resolved constraints", prompt)

    def test_english_prompt_uses_english_template_and_includes_aspect_ratio(self):
        result = run_skill({
            "topic": "cinematic fashion portrait on a beach",
            "target_language": "en",
            "aspect_ratio": "16:9",
        })

        prompt = result["prompts"]["detailed"]
        self.assertIn("Image concept:", prompt)
        self.assertIn("aspect ratio: 16:9", prompt)
        self.assertIn("Background direction:", prompt)
        self.assertNotIn("สร้างภาพคุณภาพสูงในหัวข้อ", prompt)


if __name__ == "__main__":
    unittest.main()
