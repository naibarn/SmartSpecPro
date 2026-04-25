import json
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PythonAdapterTest(unittest.TestCase):
    def test_media_studio_extra_params_are_ignored(self):
        envelope = {
            "prompt": "ภาพบ้านหลังรีโนเวท before after",
            "params": {
                "response_mode": "text_prompt",
                "text_prompt_field": "detailed",
                "promptLanguage": "th",
                "dialogueLanguage": "th",
            },
        }
        proc = subprocess.run(
            [sys.executable, "python/skill.py"],
            input=json.dumps(envelope, ensure_ascii=False),
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        result = json.loads(proc.stdout)
        self.assertTrue(result["success"])
        self.assertIsInstance(result["output"], str)
        self.assertIn("ภาพบ้าน", result["output"])
        self.assertNotIn("Unexpected input field", result["output"])

    def test_multiline_ui_textareas_are_normalized_to_arrays(self):
        envelope = {
            "prompt": "storyboard product launch",
            "params": {
                "response_mode": "json_bundle",
                "panel_descriptions": "Panel 1: hero product reveal\nPanel 2: label close-up",
                "verified_reference_facts": "Official page shows matte green bottle\nOfficial page shows bamboo cap",
                "reference_sources": "https://example.com/product",
            },
        }
        proc = subprocess.run(
            [sys.executable, "python/skill.py"],
            input=json.dumps(envelope, ensure_ascii=False),
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        result = json.loads(proc.stdout)
        output = json.loads(result["output"])
        self.assertEqual(output["requested"]["panel_descriptions"], ["Panel 1: hero product reveal", "Panel 2: label close-up"])
        self.assertEqual(len(output["requested"]["verified_reference_facts"]), 2)
        self.assertEqual(output["requested"]["reference_sources"], ["https://example.com/product"])


if __name__ == "__main__":
    unittest.main()
