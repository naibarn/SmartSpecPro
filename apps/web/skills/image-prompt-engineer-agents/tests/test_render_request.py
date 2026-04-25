import sys
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from gpt_image_prompt_engineer import run_skill


class RenderRequestTest(unittest.TestCase):
    def test_transparent_background_switches_jpeg_to_png(self):
        result = run_skill({
            "topic": "transparent sticker asset of a cute robot mascot",
            "api_background": "transparent",
            "output_format": "jpeg",
        })
        rr = result["render_request"]["image_api"]
        self.assertEqual(rr["background"], "transparent")
        self.assertEqual(rr["output_format"], "png")
        self.assertNotIn("model", rr)
        self.assertTrue(any("Transparent background" in w for w in result["warnings"]))

    def test_compression_only_included_for_webp_or_jpeg(self):
        result = run_skill({
            "topic": "webp social post product banner",
            "output_format": "webp",
            "output_compression": 80,
        })
        self.assertEqual(result["render_request"]["image_api"]["output_compression"], 80)
        self.assertEqual(result["render_request"]["responses_tool"]["tools"][0]["compression"], 80)


if __name__ == "__main__":
    unittest.main()
