import unittest
from smartaihub_video_director.enhanced_bridge import _terminal_prompt


class TestEnhancedAudioBridge(unittest.TestCase):
    def test_terminal_prompt_when_native_audio_disabled_with_dialogue(self):
        payload = {
            "nativeAudioEnabled": False,
            "dialogue": [{"text": "ทดสอบเสียงพูดอย่างเดียว"}],
            "targetVideoModel": {"id": "seedance-2.0"},
            "shot": {"description": "Dramatic confrontation", "cameraSetup": "Close up"},
        }
        intent = {
            "scene": "Living room",
            "actions": ["Speaks firmly"],
            "dialogue": [{"text": "ทดสอบเสียงพูดอย่างเดียว"}],
            "audioIntent": "Rich cinematic foley and room tone",
        }
        prompt = _terminal_prompt(payload, intent)
        self.assertIn("AUDIO POLICY: Spoken dialogue only.", prompt)
        self.assertIn("Do not generate any background sound effects, foley, footsteps, or room tone.", prompt)
        self.assertNotIn("Rich cinematic foley", prompt)

    def test_terminal_prompt_when_native_audio_disabled_without_dialogue(self):
        payload = {
            "nativeAudioEnabled": False,
            "dialogue": [],
            "targetVideoModel": {"id": "seedance-2.0"},
            "shot": {"description": "Silent stare", "cameraSetup": "Extreme close up"},
        }
        intent = {
            "scene": "Living room",
            "actions": ["Stares silently"],
            "dialogue": [],
        }
        prompt = _terminal_prompt(payload, intent)
        self.assertIn("AUDIO POLICY: Complete silence. Silent visual acting only.", prompt)

    def test_terminal_prompt_when_native_audio_enabled_with_structured_intent(self):
        payload = {
            "nativeAudioEnabled": True,
            "dialogue": [{"text": "เสียงบทพูด"}],
            "targetVideoModel": {"id": "seedance-2.0"},
            "shot": {"description": "Living room tea time"},
        }
        intent = {
            "scene": "Living room",
            "actions": ["Pours tea"],
            "dialogue": [{"text": "เสียงบทพูด"}],
            "audioIntent": {
                "mustHearFoley": [{"description": "porcelain cup clink"}],
                "atmosphere": {"description": "rain outside window"},
            },
        }
        prompt = _terminal_prompt(payload, intent)
        self.assertIn("AUDIO DIRECTION:", prompt)
        self.assertIn("Motivated foley: porcelain cup clink.", prompt)
        self.assertIn("Room tone: rain outside window.", prompt)

    def test_terminal_prompt_gemini_omni_timecode_tags(self):
        payload = {
            "nativeAudioEnabled": True,
            "dialogue": [{"text": "สวัสดีครับ", "speakerId": "Somchai"}],
            "targetVideoModel": {"id": "gemini-omni-v1"},
            "shot": {"description": "Meeting"},
        }
        intent = {
            "dialogue": [{"text": "สวัสดีครับ", "speakerId": "Somchai"}],
            "audioIntent": {
                "mustHearFoley": [{"description": "handshake"}],
            },
        }
        prompt = _terminal_prompt(payload, intent)
        self.assertIn("TIMECODED AUDIO EVENTS (OMNI):", prompt)
        self.assertIn("[0-2s] Somchai: \"สวัสดีครับ\"", prompt)

    def test_terminal_prompt_seedance_physical_pairing(self):
        payload = {
            "nativeAudioEnabled": True,
            "targetVideoModel": {"id": "seedance-2.5"},
            "shot": {"description": "Running"},
        }
        intent = {"scene": "Hallway"}
        prompt = _terminal_prompt(payload, intent)
        self.assertIn("PHYSICAL ACOUSTIC PAIRING (SEEDANCE):", prompt)

    def test_terminal_prompt_h3_brevity(self):
        payload = {
            "nativeAudioEnabled": True,
            "targetVideoModel": {"id": "minimax-h3"},
            "shot": {"description": "Tea time"},
        }
        intent = {"scene": "Café"}
        prompt = _terminal_prompt(payload, intent)
        self.assertIn("ACOUSTIC BREVITY (H3):", prompt)


if __name__ == "__main__":
    unittest.main()
