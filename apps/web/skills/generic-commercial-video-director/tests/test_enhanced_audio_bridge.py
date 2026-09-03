import unittest
from pathlib import Path
from smartaihub_video_director.enhanced_bridge import _terminal_prompt, _package_input
from smartaihub_video_director.schema_registry import StageContractRegistry


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

    def test_terminal_prompt_preserves_thai_dialogue_and_structured_timeline(self):
        payload = {
            "nativeAudioEnabled": True,
            "targetVideoModel": {"id": "gemini-omni-flash-1-1"},
            "shot": {
                "description": "ธันวาหมอบซ่อนตัวข้างกล่องโฟมริมน้ำตลาด",
                "cameraSetup": "Eye-level 35mm lens subtle push-in",
                "durationSeconds": 10.0,
            },
            "dialogue": [
                {
                    "characterKey": "thanwa",
                    "speaker": "ธันวา",
                    "lineTh": "พอแล้ว วันนี้เป็นโชคเกินไปแบบนั้น",
                    "emotion": "ดีใจเบาๆ ปัดฝุ่น",
                },
                {
                    "characterKey": "thanwa",
                    "speaker": "ธันวา",
                    "lineTh": "จ่ายแพง ก็หาเงินไป",
                    "emotion": "ตัดสินใจเด็ดขาดผสมแฝงความเหนื่อย",
                },
            ],
        }
        observed = {
            "characters": [
                {
                    "characterId": "thanwa",
                    "screenPosition": "center-right foreground",
                    "pose": "crouching beside white cooler",
                    "gaze": "directed to left off-camera",
                    "handOccupancy": {"left": None, "right": "near shirt collar"},
                }
            ],
            "objects": [
                {"entityId": "white_cooler", "state": "open with ice", "position": "lower foreground"}
            ],
            "environment": {"description": "covered waterfront market at dusk, wet walkway"},
        }
        intent = {
            "scene": "Covered waterfront market at dusk",
            "actions": [
                "ธันวาลดตัวหมอบต่ำลงเล็กน้อย",
                "ธันวาสบตาไปยังพื้นทางเดินและกระชับปกเสื้อ",
            ],
            "camera": "Eye-level 35mm lens subtle push-in",
            "audioIntent": {
                "mustHearFoley": [{"description": "wet fabric rustle"}, {"description": "distant splashing footsteps"}],
                "atmosphere": {"description": "subdued waterfront market ambience with soft water lapping"},
            },
        }
        prompt = _terminal_prompt(payload, intent, observed)

        # 1. Thai dialogue is present
        self.assertIn("พอแล้ว วันนี้เป็นโชคเกินไปแบบนั้น", prompt)
        self.assertIn("จ่ายแพง ก็หาเงินไป", prompt)
        self.assertIn("ธันวา", prompt)

        # 2. Dialogue section and lip-sync guidance
        self.assertIn("SPOKEN DIALOGUE / LIP-SYNC", prompt)
        self.assertIn("Lip-Sync Guidance:", prompt)
        self.assertIn("Never keep the mouth closed during spoken dialogue", prompt)

        # 3. No conflicting silent acting rules when dialogue exists
        self.assertNotIn("No spoken dialogue", prompt)
        self.assertNotIn("silent acting only", prompt.lower())
        self.assertNotIn("keep every mouth closed except for natural non-speech breathing", prompt)

        # 4. Structured timeline brackets
        self.assertIn("0.0–1.5 seconds:", prompt)
        self.assertIn("MOTION AND PERFORMANCE", prompt)
        self.assertIn("CAMERA", prompt)
        self.assertIn("NATIVE AUDIO / SOUND DESIGN", prompt)

        # 5. Omni timecodes with Thai dialogue
        self.assertIn("TIMECODED AUDIO EVENTS (OMNI):", prompt)
        self.assertIn("[0-2s] ธันวา: \"พอแล้ว วันนี้เป็นโชคเกินไปแบบนั้น\"", prompt)
        self.assertIn("[2-4s] ธันวา: \"จ่ายแพง ก็หาเงินไป\"", prompt)

        # 6. Negative constraints
        self.assertIn("CONTINUITY AND NEGATIVE CONSTRAINTS", prompt)

        # 7. Fits safely under 4,096 char limit
        self.assertLess(len(prompt), 4096)
        self.assertGreater(len(prompt), 1000)

    def test_terminal_prompt_anchors_speaker_name_and_viewer_position_with_listener_closed_mouth(self):
        payload = {
            "nativeAudioEnabled": True,
            "targetVideoModel": {"id": "gemini-omni-flash-1-1"},
            "shot": {
                "shotNumber": 5,
                "description": "แม่ค้าขายปลาเผชิญหน้ากับธันวาหน้าร้านขายปลาท่ามกลางฝนตก",
                "durationSeconds": 10.0,
                "verifiedCastPositions": [
                    {"characterKey": "character-2", "name": "แม่ค้า", "position": "viewer-left"},
                    {"characterKey": "thanwa", "name": "Thanwa", "position": "viewer-right"},
                ],
            },
            "dialogue": [
                {
                    "characterKey": "character-2",
                    "speaker": "แม่ค้า",
                    "lineTh": "เฮ้ย ตรงนี้ขายของนะ อย่าเข้ามาใกล้ปลา",
                    "emotion": "ไม่พอใจและระแวง",
                },
                {
                    "characterKey": "thanwa",
                    "speaker": "Thanwa",
                    "lineTh": "ผมแค่ขอหลบฝนแป๊บเดียว",
                    "emotion": "สุภาพและเหนื่อยล้า",
                },
            ],
        }
        observed = {
            "characters": [
                {
                    "characterId": "character-2",
                    "screenPosition": "left foreground, occupying the left third of the frame",
                    "pose": "standing with arms crossed across torso",
                },
                {
                    "characterId": "thanwa",
                    "screenPosition": "right foreground, occupying the right half of the frame",
                    "pose": "standing with one hand raised defensively",
                },
            ],
        }
        intent = {
            "scene": "Fish stall in rain",
            "actions": [
                "แม่ค้า keeps their guarded stance, shifts attention firmly toward Thanwa, and speaks with natural Thai mouth movement and precise lip-sync: \"เฮ้ย ตรงนี้ขายของนะ อย่าเข้ามาใกล้ปลา\"",
                "Thanwa lowers his raised hand and folds his arms against the rain, and speaks with natural Thai mouth movement and precise lip-sync: \"ผมแค่ขอหลบฝนแป๊บเดียว\"",
            ],
        }
        prompt = _terminal_prompt(payload, intent, observed)

        # 1. Speaker name + position is anchored right in front of the speech verb
        self.assertIn("แม่ค้า on viewer-left", prompt)
        self.assertIn("Thanwa on viewer-right", prompt)
        self.assertIn("precise realistic lip sync", prompt)

        # 2. Listener is anchored with mouth closed and no mouth movement
        self.assertIn("Thanwa on viewer-right listens, mouth closed with no mouth movement", prompt)
        self.assertIn("แม่ค้า on viewer-left listens, mouth closed with no mouth movement", prompt)

        # 3. Cleaned physical action doesn't duplicate speech or mix both lines into one beat
        self.assertIn('แม่ค้า on viewer-left', prompt)
        self.assertIn('says with a ไม่พอใจและระแวง voice, precise realistic lip sync: "เฮ้ย ตรงนี้ขายของนะ อย่าเข้ามาใกล้ปลา"', prompt)
        self.assertIn('Thanwa on viewer-right', prompt)
        self.assertIn('says with a สุภาพและเหนื่อยล้า voice, precise realistic lip sync: "ผมแค่ขอหลบฝนแป๊บเดียว"', prompt)

        # 4. Spoken dialogue section includes position anchors
        self.assertIn("- Line 1 [แม่ค้า on viewer-left]: \"เฮ้ย ตรงนี้ขายของนะ อย่าเข้ามาใกล้ปลา\"", prompt)
        self.assertIn("- Line 2 [Thanwa on viewer-right]: \"ผมแค่ขอหลบฝนแป๊บเดียว\"", prompt)
        self.assertIn("Silent Listener Constraint", prompt)

    def test_package_input_schema_validation_with_thai_dialogue(self):
        root = Path(__file__).resolve().parents[1]
        contracts = StageContractRegistry(root)
        payload = {
            "targetVideoModel": {"id": "gemini-omni-flash-1-1"},
            "shot": {
                "shotNumber": 1,
                "description": "ธันวาหมอบซ่อนตัวข้างกล่องโฟมริมน้ำตลาดสดในเวลาพลบค่ำ เสื้อเปียกชุ่ม",
                "cameraSetup": "Eye-level 35mm lens subtle push-in",
                "durationSeconds": 10.0,
            },
            "dialogue": [
                {
                    "characterKey": "thanwa",
                    "speaker": "ธันวา",
                    "speakerHint": "ธันวา",
                    "speakerId": "thanwa",
                    "lineTh": "พอแล้ว วันนี้เป็นโชคเกินไปแบบนั้น",
                    "text": "พอแล้ว วันนี้เป็นโชคเกินไปแบบนั้น",
                    "emotion": "ดีใจเบาๆ ปัดฝุ่น",
                    "durationSeconds": 2.8,
                },
                {
                    "characterKey": "thanwa",
                    "speaker": "ธันวา",
                    "speakerHint": "ธันวา",
                    "speakerId": "thanwa",
                    "lineTh": "จ่ายแพง ก็หาเงินไป",
                    "text": "จ่ายแพง ก็หาเงินไป",
                    "emotion": "ตัดสินใจเด็ดขาดผสมแฝงความเหนื่อย",
                    "durationSeconds": 2.5,
                },
            ],
            "nativeAudioEnabled": True,
        }
        packaged = _package_input(payload)
        # contracts.validate_input must succeed without StageContractError
        contracts.validate_input(packaged)
        self.assertIn("lines", packaged["dialogue"])
        self.assertEqual(len(packaged["dialogue"]["lines"]), 2)
        # Check that additional properties not in input.schema.json were stripped from packaged lines
        for line in packaged["dialogue"]["lines"]:
            self.assertNotIn("durationSeconds", line)
            self.assertNotIn("emotion", line)
            self.assertNotIn("lineTh", line)
            self.assertNotIn("speaker", line)
            self.assertIn("lineId", line)
            self.assertIn("text", line)


if __name__ == "__main__":
    unittest.main()
