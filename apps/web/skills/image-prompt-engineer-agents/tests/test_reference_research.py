import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from gpt_image_prompt_engineer import run_skill


class ReferenceResearchTest(unittest.TestCase):
    def test_product_reference_research_is_required_without_sources(self):
        result = run_skill({
            "topic": "product ad for Acme AeroBottle stainless steel bottle",
            "brand_or_logo": "Acme",
            "target_language": "en",
            "response_mode": "json_bundle",
        })

        research = result["reference_research"]
        self.assertTrue(research["required"])
        self.assertTrue(research["product_reference_needed"])
        self.assertEqual(research["status"], "needed")
        self.assertIn("verified_reference_facts", result["final_review"]["missing_inputs"])
        self.assertIn("reference_sources", result["final_review"]["missing_inputs"])
        self.assertFalse(result["final_review"]["approved"])
        self.assertIn("do not replace or correct", result["prompts"]["detailed"])
        self.assertTrue(research["search_queries"])

    def test_verified_product_references_allow_final_approval_without_replacing_user_facts(self):
        result = run_skill({
            "topic": "product ad for Acme AeroBottle in matte green with bamboo cap",
            "brand_or_logo": "Acme",
            "target_language": "en",
            "response_mode": "json_bundle",
            "verified_reference_facts": [
                "Official product page shows a matte green bottle body.",
                "Official press kit shows a bamboo cap and white vertical logo."
            ],
            "reference_sources": [
                {"title": "Acme AeroBottle official product page", "url": "https://example.com/aerobottle", "source_type": "official"}
            ],
        })

        self.assertEqual(result["reference_research"]["status"], "verified")
        self.assertNotIn("verified_reference_facts", result["final_review"]["missing_inputs"])
        self.assertNotIn("reference_sources", result["final_review"]["missing_inputs"])
        self.assertIn("matte green with bamboo cap", result["prompts"]["detailed"])
        self.assertIn("Official product page shows a matte green bottle body", result["prompts"]["detailed"])
        self.assertTrue(result["final_review"]["approved"])

    def test_place_reference_research_is_required_for_real_location(self):
        result = run_skill({
            "topic": "premium poster for a rooftop cafe at Wat Arun Bangkok during sunset",
            "target_language": "en",
            "response_mode": "json_bundle",
        })

        research = result["reference_research"]
        self.assertTrue(research["required"])
        self.assertTrue(research["place_reference_needed"])
        self.assertIn("Wat Arun", result["prompts"]["detailed"])
        self.assertIn("No verified_reference_facts/reference_sources", result["prompts"]["detailed"])
        self.assertIn("reference_sources", result["final_review"]["missing_inputs"])

    def test_fictional_product_can_disable_reference_research(self):
        result = run_skill({
            "topic": "fictional product mockup for an imaginary moon tea box",
            "target_language": "en",
            "factual_reference_mode": "off",
            "response_mode": "json_bundle",
        })

        self.assertFalse(result["reference_research"]["required"])
        self.assertEqual(result["reference_research"]["status"], "not_required")
        self.assertNotIn("reference_sources", result["final_review"]["missing_inputs"])


if __name__ == "__main__":
    unittest.main()
