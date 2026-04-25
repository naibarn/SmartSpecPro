import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from gpt_image_prompt_engineer import run_skill


class DeliverableFinalReviewTest(unittest.TestCase):
    def test_social_post_auto_uses_thumb_stopping_profile(self):
        result = run_skill({
            "topic": "Instagram social post for premium coffee launch with a limited offer",
            "image_style": "auto",
            "deliverable_type": "auto",
            "target_language": "en",
        })

        self.assertEqual(result["normalized"]["deliverable_type"], "social_post")
        self.assertEqual(result["normalized"]["aspect_ratio"], "4:5")
        self.assertEqual(result["normalized"]["quality"], "high")
        self.assertIn("thumb-stopping", result["prompts"]["detailed"])
        self.assertIn("mobile-readable", result["prompts"]["detailed"])
        self.assertIn("deliverable_designer", result["orchestration"]["selected_subagents"])

    def test_story_post_auto_uses_vertical_safe_zones(self):
        result = run_skill({
            "topic": "Instagram story post for a premium skincare flash sale",
            "target_language": "en",
        })

        self.assertEqual(result["normalized"]["deliverable_type"], "story_post")
        self.assertEqual(result["normalized"]["aspect_ratio"], "9:16")
        self.assertIn("safe top and bottom UI zones", result["prompts"]["detailed"])
        self.assertIn("swipe-stopping contrast", result["prompts"]["detailed"])

    def test_presentation_slide_profile_prioritizes_modern_readability(self):
        result = run_skill({
            "topic": "presentation slide about Q4 revenue growth strategy",
            "target_language": "en",
        })

        self.assertEqual(result["normalized"]["deliverable_type"], "presentation_slide")
        self.assertEqual(result["normalized"]["aspect_ratio"], "16:9")
        self.assertEqual(result["normalized"]["depth_of_field"], "deep")
        self.assertEqual(result["normalized"]["background_blur"], "none")
        self.assertIn("one clear idea", result["prompts"]["detailed"])
        self.assertIn("modern premium presentation slide", result["prompts"]["detailed"])

    def test_product_mockup_preserves_reference_images(self):
        result = run_skill({
            "topic": "product mockup of a matte black smart bottle on a clean studio set",
            "target_language": "en",
            "aspect_ratio": "16:9",
            "source_image_path": ["bottle-front.png", "label-detail.png"],
        })

        self.assertEqual(result["normalized"]["deliverable_type"], "product_mockup")
        self.assertEqual(result["normalized"]["aspect_ratio"], "16:9")
        self.assertEqual(result["locked_user_params"]["fields"]["aspect_ratio"]["normalized"], "16:9")
        self.assertEqual(result["render_request"]["image_api"]["input_images"], ["bottle-front.png", "label-detail.png"])
        self.assertIn("supplied reference image(s)", result["prompts"]["detailed"])
        self.assertIn("preserve the supplied reference image geometry", result["prompts"]["detailed"])
        self.assertIn("do not stretch, redraw, replace, or invent package details", result["prompts"]["detailed"])
        self.assertIn("reference_fidelity", result["orchestration"]["selected_subagents"])
        check_names = {check["name"] for check in result["final_review"]["checks"]}
        self.assertIn("reference_product_geometry_lock", check_names)
        self.assertIn("reference_label_logo_lock", check_names)

    def test_packaging_mockup_reports_missing_source_and_exact_text(self):
        result = run_skill({
            "topic": "premium packaging mockup for organic tea box",
            "target_language": "en",
        })

        self.assertEqual(result["normalized"]["deliverable_type"], "packaging_mockup")
        self.assertEqual(result["normalized"]["aspect_ratio"], "4:5")
        self.assertIn("premium packaging mockup", result["prompts"]["detailed"])
        self.assertIn("front label readability", result["prompts"]["detailed"])
        self.assertIn("source_image_path", result["final_review"]["missing_inputs"])
        self.assertIn("exact_text", result["final_review"]["missing_inputs"])
        self.assertTrue(result["final_review"]["clarifying_questions"])
        self.assertEqual(result["final_review"]["reference_preflight"]["next_action"], "collect_official_or_reputable_sources")
        self.assertTrue(result["final_review"]["reference_preflight"]["search_queries"])

    def test_locked_user_params_and_reference_preflight_are_reported(self):
        result = run_skill({
            "topic": "poster for real cafe landmark product launch",
            "target_language": "en",
            "deliverable_type": "poster",
            "aspect_ratio": "9:16",
            "exact_text": "LAUNCH NIGHT",
        })

        locked = result["locked_user_params"]["fields"]
        self.assertEqual(locked["deliverable_type"]["normalized"], "poster")
        self.assertEqual(locked["aspect_ratio"]["normalized"], "9:16")
        self.assertEqual(locked["exact_text"]["requested"], "LAUNCH NIGHT")
        self.assertEqual(result["normalized"]["aspect_ratio"], "9:16")
        self.assertEqual(result["reference_research"]["status"], "needed")
        self.assertTrue(result["final_review"]["reference_preflight"]["required"])

    def test_storyboard_final_review_reinforces_continuity(self):
        result = run_skill({
            "topic": "storyboard of a founder entering a bright product lab",
            "target_language": "en",
            "deliverable_type": "storyboard",
            "multi_frame_mode": "auto",
            "frame_layout": "2x2",
        })

        self.assertEqual(result["normalized"]["multi_frame_mode"], "storyboard")
        self.assertEqual(result["normalized"]["panel_count"], 4)
        self.assertIn("locked character identity", result["prompts"]["detailed"])
        self.assertIn("one continuous story", result["prompts"]["detailed"])
        self.assertTrue(any("storyboard continuity" in repair for repair in result["final_review"]["applied_repairs"]))

    def test_unsafe_text_prompt_is_repaired_before_return(self):
        text_result = run_skill({
            "topic": "nude explicit portrait",
            "response_mode": "text_prompt",
            "target_language": "en",
        })
        self.assertIsInstance(text_result, str)
        self.assertNotIn("nude explicit portrait", text_result.lower())
        self.assertIn("non-explicit", text_result.lower())

        bundle = run_skill({
            "topic": "nude explicit portrait",
            "response_mode": "json_bundle",
            "target_language": "en",
        })
        self.assertEqual(bundle["safety_review"]["status"], "blocked")
        self.assertEqual(bundle["final_review"]["status"], "blocked")
        self.assertTrue(bundle["final_review"]["applied_repairs"])
        self.assertNotIn("nude explicit portrait", bundle["prompts"]["detailed"].lower())


if __name__ == "__main__":
    unittest.main()
