import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from gpt_image_prompt_engineer import run_skill
from gpt_image_prompt_engineer.validators import validate_output


class SchemaContractTest(unittest.TestCase):
    def test_minimal_payload_validates_and_outputs_schema(self):
        result = run_skill({"topic": "cinematic luxury perfume product ad"})
        validate_output(result)
        self.assertEqual(result["status"], "completed")
        self.assertTrue(result["render_request"]["image_api"]["prompt"])
        self.assertTrue(result["decision_trace"])

    def test_text_prompt_response_mode_returns_plain_text(self):
        result = run_skill({
            "topic": "cinematic luxury perfume product ad",
            "response_mode": "text_prompt",
            "text_prompt_field": "detailed",
        })
        self.assertIsInstance(result, str)
        self.assertIn("cinematic luxury perfume product ad", result)
        self.assertNotIn('"prompt_quality"', result)
        self.assertFalse(result.lstrip().startswith("{"))

    def test_json_bundle_response_mode_keeps_structured_contract(self):
        result = run_skill({
            "topic": "cinematic luxury perfume product ad",
            "response_mode": "json_bundle",
        })
        validate_output(result)
        self.assertIn("prompts", result)


if __name__ == "__main__":
    unittest.main()
