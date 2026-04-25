import sys
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from gpt_image_prompt_engineer import run_skill


def walk(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield k, v
            yield from walk(v)
    elif isinstance(obj, list):
        for item in obj:
            yield from walk(item)


class ModelFreeContractTest(unittest.TestCase):
    def test_model_input_is_rejected(self):
        with self.assertRaises(ValueError):
            run_skill({"topic": "luxury product ad", "model": "gpt-image-2"})

    def test_output_contains_no_model_fields(self):
        result = run_skill({"topic": "luxury product ad", "image_style": "auto"})
        forbidden = {"model", "custom_model_name", "response_model"}
        found = {k for k, _ in walk(result) if k in forbidden}
        self.assertFalse(found, f"Forbidden model fields found: {found}")
        self.assertTrue(result["render_request"]["external_renderer_required"])
        self.assertIn("gpt-image-2", result["render_request"]["external_renderer_note"])


if __name__ == "__main__":
    unittest.main()
