import sys
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from gpt_image_prompt_engineer import run_skill


class EditValidationTest(unittest.TestCase):
    def test_edit_requires_source_image_path(self):
        with self.assertRaises(ValueError):
            run_skill({"topic": "change background to neon city", "mode": "edit"})

    def test_edit_prompt_generated_with_source_path(self):
        result = run_skill({"topic": "change background to neon city", "mode": "edit", "source_image_path": "input.png"})
        self.assertTrue(result["prompts"]["edit"])
        self.assertEqual(result["normalized"]["render_action"], "edit")


if __name__ == "__main__":
    unittest.main()
