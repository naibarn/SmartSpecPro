import unittest
from pathlib import Path
from smartaihub_video_director.enhanced_bridge import (
    _normalize_position_bucket,
    _terminal_prompt,
    _package_input,
)
from smartaihub_video_director.schema_registry import StageContractRegistry


class TestEnhancedAudioBridge(unittest.TestCase):
    def test_normalizes_six_character_viewer_position_buckets(self):
        self.assertEqual(_normalize_position_bucket("viewer-far-left"), "viewer-far-left")
        self.assertEqual(_normalize_position_bucket("viewer-far-right"), "viewer-far-right")

    def test_terminal_prompt_uses_server_selected_cast_over_narrative_mentions(self):
        payload = {
            "targetVideoModel": {"id": "grok-imagine-video-1-5-preview"},
            "shot": {
                "description": "หน้าคลินิก มยุรีถูกเอ่ยถึงในเรื่องย่อ แต่ไม่อยู่ในภาพ",
                "visualCastPolicy": {
                    "physicalCharacterRefs": ["pim", "thir", "phum"],
                    "physicalCharacterNames": ["พิมพ์ชนก", "ธีร์", "ภูมิ"],
                    "screenCallerCharacterRefs": [],
                    "narrativeOnlyCharacterRefs": ["mayuree"],
                    "narrativeOnlyCharacterNames": ["มยุรี"],
                },
            },
        }
        prompt = _terminal_prompt(payload, {"scene": "The woman checks a folder"})

        self.assertIn("Physical scene cast ONLY: พิมพ์ชนก (pim), ธีร์ (thir), ภูมิ (phum)", prompt)
        self.assertIn("Narrative-only references (context only, NEVER visible in this shot): มยุรี (mayuree)", prompt)
        self.assertIn("Do not render, cast, or place them on screen.", prompt)
        self.assertNotIn("Physical scene cast ONLY: มยุรี", prompt)

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
        self.assertIn(
            "[0-2s] Line 1: use the canonical timed speech event for Somchai (Somchai); preserve its exact text.",
            prompt,
        )
        self.assertEqual(prompt.count("สวัสดีครับ"), 1)

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
        self.assertIn("SPEAKER AND LINE-ORDER LOCK", prompt)
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
        self.assertIn("[0-2s] Line 1: use the canonical timed speech event for ธันวา (thanwa); preserve its exact text.", prompt)
        self.assertIn("[2-4s] Line 2: use the canonical timed speech event for ธันวา (thanwa); preserve its exact text.", prompt)
        self.assertEqual(prompt.count("พอแล้ว วันนี้เป็นโชคเกินไปแบบนั้น"), 1)
        self.assertEqual(prompt.count("จ่ายแพง ก็หาเงินไป"), 1)

        # 6. Negative constraints
        self.assertIn("CONTINUITY AND NEGATIVE CONSTRAINTS", prompt)

        # 7. Fits safely under the Omni 1.1 Flash 20,000-character limit
        self.assertLessEqual(len(prompt), 20_000)
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
        self.assertIn(
            "- Line 1 [แม่ค้า (character-2) on viewer-left]: speak only in the matching timed event below.",
            prompt,
        )
        self.assertIn(
            "- Line 2 [Thanwa (thanwa) on viewer-right]: speak only in the matching timed event below.",
            prompt,
        )
        self.assertIn("Silent Listener Constraint", prompt)
        self.assertIn("Only speaker ID character-2 (แม่ค้า) is allowed to speak", prompt)
        self.assertIn("Only speaker ID thanwa (Thanwa) is allowed to speak", prompt)
        self.assertEqual(prompt.count("เฮ้ย ตรงนี้ขายของนะ อย่าเข้ามาใกล้ปลา"), 1)
        self.assertEqual(prompt.count("ผมแค่ขอหลบฝนแป๊บเดียว"), 1)

        # 5. The binding block is adjacent to the observed character state,
        # before motion/camera prose, so providers do not have to reconnect a
        # detached dialogue section to the visible left/right cast.
        observed_index = prompt.index("OBSERVED STATE AT T=0")
        binding_index = prompt.index("CHARACTER, POSITION, AND DIALOGUE LOCK")
        motion_index = prompt.index("MOTION AND PERFORMANCE")
        self.assertLess(observed_index, binding_index)
        self.assertLess(binding_index, motion_index)

    def test_terminal_prompt_uses_custom_character_identity_instead_of_screen_position(self):
        payload = {
            "nativeAudioEnabled": True,
            "targetVideoModel": {"id": "gemini-omni-flash-1-1"},
            "shot": {
                "shotNumber": 5,
                "description": "A mother and son review a document",
                "durationSeconds": 8.0,
                "verifiedCastPositions": [
                    {"characterKey": "mother", "name": "แม่", "position": "viewer-left"},
                    {"characterKey": "son", "name": "ลูก", "position": "viewer-right"},
                ],
                "characterDescriptionOverrides": {
                    "mother": "ผู้หญิงที่นั่งอยู่ สวมเสื้อสีครีม",
                },
            },
            "dialogue": [
                {
                    "characterKey": "mother",
                    "speaker": "แม่",
                    "lineTh": "ช่วยดูเอกสารนี้หน่อย",
                },
                {
                    "characterKey": "son",
                    "speaker": "ลูก",
                    "lineTh": "ได้ครับ ผมกำลังดูอยู่",
                },
            ],
        }
        prompt = _terminal_prompt(payload, {"actions": ["They review the document together"]})

        self.assertIn("CUSTOM CHARACTER IDENTIFICATION OVERRIDES (AUTHORITATIVE", prompt)
        self.assertIn("แม่ [characterKey=mother]: ผู้หญิงที่นั่งอยู่ สวมเสื้อสีครีม", prompt)
        self.assertIn("แม่ identified by ผู้หญิงที่นั่งอยู่ สวมเสื้อสีครีม", prompt)
        self.assertNotIn("แม่ on viewer-left", prompt)
        self.assertIn("ลูก on viewer-right", prompt)

    def test_terminal_prompt_keeps_dialogue_speaker_offscreen_when_not_in_observed_frame(self):
        payload = {
            "targetVideoModel": {"id": "grok-imagine-video-1-5-preview"},
            "shot": {
                "shotNumber": 1,
                "description": "A mother and son walk through a playground",
                "durationSeconds": 8,
            },
            "dialogue": [
                {
                    "characterKey": "character-3-look-casual_home",
                    "speaker": "ภูมิ",
                    "lineTh": "แม่ วันนี้ผมจะวาดบ้านของเรา",
                }
            ],
        }
        observed = {
            "characters": [
                {
                    "characterId": "character-variant-2",
                    "screenPosition": "left foreground",
                    "pose": "walking upright",
                }
            ]
        }

        prompt = _terminal_prompt(payload, {"actions": ["They continue walking"]}, observed)

        self.assertIn("ภูมิ on viewer-offscreen; ภูมิ says with", prompt)
        self.assertIn("off-screen/narrative voice only", prompt)
        self.assertIn("do not render this speaker, add a body or face", prompt)

    def test_packaged_offscreen_dialogue_is_not_required_to_be_on_screen(self):
        packaged = _package_input({
            "targetVideoModel": {"id": "grok-imagine-video-1-5-preview"},
            "shot": {"description": "A woman checks a document"},
            "dialogue": [{
                "speakerId": "thir",
                "speaker": "ธีร์",
                "position": "viewer-offscreen",
                "text": "ช่วยตรวจสอบเอกสารให้หน่อย",
            }],
        })

        line = packaged["dialogue"]["lines"][0]
        self.assertFalse(line["mustBeOnScreen"])
        self.assertFalse(line["lipSyncRequired"])

    def test_episode_20_shot_1_keeps_each_thai_line_with_its_observed_speaker_position(self):
        payload = {
            "targetVideoModel": {"id": "grok-imagine-video-1-5-preview"},
            "shot": {
                "shotNumber": 1,
                "description": "A mother and son walk through a playground",
                "durationSeconds": 8,
            },
            "dialogue": [
                {
                    "characterKey": "character-3-look-casual_home",
                    "speaker": "ภูมิ",
                    "lineTh": "แม่ วันนี้ผมจะวาดบ้านของเรา",
                },
                {
                    "characterKey": "character-variant-2",
                    "speaker": "พิมพ์ชนก",
                    "lineTh": "ได้เลยลูก แต่อยู่ในสายตาแม่นะ",
                },
            ],
        }
        observed = {
            "characters": [
                {
                    "characterId": "character-variant-2",
                    "screenPosition": "left foreground",
                    "pose": "walking upright",
                },
                {
                    "characterId": "character-3-look-casual_home",
                    "screenPosition": "right foreground",
                    "pose": "walking upright",
                },
            ]
        }

        prompt = _terminal_prompt(
            payload,
            {"actions": ["They continue walking together"]},
            observed,
        )

        self.assertIn(
            "- Line 1 [ภูมิ (character-3-look-casual_home) on viewer-right]: speak only in the matching timed event below.",
            prompt,
        )
        self.assertIn(
            "- Line 2 [พิมพ์ชนก (character-variant-2) on viewer-left]: speak only in the matching timed event below.",
            prompt,
        )
        self.assertEqual(prompt.count("แม่ วันนี้ผมจะวาดบ้านของเรา"), 1)
        self.assertEqual(prompt.count("ได้เลยลูก แต่อยู่ในสายตาแม่นะ"), 1)
        self.assertNotIn("DIALOGUE POLICY: No spoken dialogue", prompt)

    def test_episode_258_style_actions_never_reassign_mouth_motion_to_the_wrong_speaker(self):
        payload = {
            "videoPromptMaxChars": 4096,
            "targetVideoModel": {"id": "grok-imagine-video-1-5-preview"},
            "shot": {
                "shotNumber": 1,
                "description": "A mother and son walk through a playground",
                "durationSeconds": 8,
                "verifiedCastPositions": [
                    {"characterKey": "son", "name": "ภูมิ", "position": "viewer-left"},
                    {"characterKey": "mother", "name": "พิมพ์ชนก", "position": "viewer-right"},
                ],
            },
            "dialogue": [
                {"characterKey": "son", "speaker": "ภูมิ", "lineTh": "แม่ วันนี้ผมจะวาดบ้านของเรา"},
                {"characterKey": "mother", "speaker": "พิมพ์ชนก", "lineTh": "ได้เลยลูก แต่อยู่ในสายตาแม่นะ"},
            ],
        }
        observed = {
            "characters": [
                {"characterId": "son", "screenPosition": "viewer-left", "pose": "walking"},
                {"characterId": "mother", "screenPosition": "viewer-right", "pose": "walking"},
            ]
        }
        intent = {
            "actions": [
                "พิมพ์ชนก on viewer-right watches ภูมิ แล้วขยับปากพูดว่า แม่ วันนี้ผมจะวาดบ้านของเรา",
                "ภูมิ on viewer-left turns to his mother and speaks with precise lip-sync: ได้เลยลูก แต่อยู่ในสายตาแม่นะ",
            ]
        }

        prompt = _terminal_prompt(payload, intent, observed)

        self.assertLessEqual(len(prompt), 4096)
        self.assertIn('ภูมิ on viewer-left; ภูมิ says with', prompt)
        self.assertIn('พิมพ์ชนก on viewer-right; พิมพ์ชนก says with', prompt)
        self.assertNotIn("พิมพ์ชนก on viewer-right as they", prompt)
        self.assertNotIn("ภูมิ on viewer-left as they", prompt)
        self.assertNotRegex(prompt, r"MOTION AND PERFORMANCE[\s\S]*(?:ขยับปาก|speaks with precise lip-sync)")

    def test_grok_multicharacter_prompt_uses_one_hard_cast_map_for_the_first_speaker(self):
        payload = {
            "videoPromptMaxChars": 4096,
            "targetVideoModel": {"id": "grok-imagine-video-1-5-preview"},
            "mediaBundle": {
                "startFrame": {"assetId": 6420},
                "stopFrame": None,
                "references": [],
            },
            "shot": {
                "shotNumber": 7,
                "description": "Three people walk together through a clinic corridor.",
                "durationSeconds": 8,
                "verifiedCastPositions": [
                    {"characterKey": "character-look-casual_home", "name": "พิมพ์ชนก", "position": "viewer-left"},
                    {"characterKey": "character-3-look-casual_home", "name": "ภูมิ", "position": "viewer-center"},
                    {"characterKey": "character-2-look-casual_home", "name": "ธีร์", "position": "viewer-right"},
                ],
            },
            "dialogue": [
                {
                    "characterKey": "character-3-look-casual_home",
                    "speaker": "ภูมิ",
                    "lineTh": "ธีร์กลับด้วยกันได้ไหมครับ",
                },
                {
                    "characterKey": "character-look-casual_home",
                    "speaker": "พิมพ์ชนก",
                    "lineTh": "ได้ แต่ช่วยเดินข้างนอก ไม่ต้องอุ้มเขา",
                },
            ],
        }
        # Deliberately provide contradictory vision labels. The stable cast
        # position lock must win and the prompt must not repeat that ambiguity.
        observed = {
            "characters": [
                {"characterId": "character-2-look-casual_home", "screenPosition": "viewer-center"},
                {"characterId": "character-3-look-casual_home", "screenPosition": "viewer-right"},
                {"characterId": "character-look-casual_home", "screenPosition": "viewer-left"},
            ]
        }

        prompt = _terminal_prompt(payload, {"actions": ["They continue walking together"]}, observed)

        self.assertLessEqual(len(prompt), 4096)
        self.assertIn("START FRAME LOCK: Continue from the approved START_FRAME_IMAGE", prompt)
        self.assertIn("HARD SPEAKER MAP (MANDATORY CAST POSITION LOCK", prompt)
        self.assertIn("character-look-casual_home = พิมพ์ชนก: viewer-left", prompt)
        self.assertIn("character-3-look-casual_home = ภูมิ: viewer-center", prompt)
        self.assertIn("character-2-look-casual_home = ธีร์: viewer-right", prompt)
        self.assertIn("Line 1 ONLY: ภูมิ (character-3-look-casual_home) on viewer-center", prompt)
        self.assertIn("Silent entire shot, mouth fully closed from 0.0–8.0 seconds: ธีร์ (character-2-look-casual_home) on viewer-right", prompt)
        self.assertIn("FIRST SPEAKER LOCK: The first moving mouth must be ภูมิ (character-3-look-casual_home) on viewer-center", prompt)
        self.assertIn("do not cut away, isolate a face, or re-center onto the right-hand character", prompt)
        self.assertNotIn("Observed character character-2-look-casual_home: viewer-center", prompt)
        self.assertNotIn("Observed character character-3-look-casual_home: viewer-right", prompt)
        self.assertEqual(prompt.count("ธีร์กลับด้วยกันได้ไหมครับ"), 1)
        self.assertEqual(prompt.count("ได้ แต่ช่วยเดินข้างนอก ไม่ต้องอุ้มเขา"), 1)

    def test_thai_and_english_speech_clauses_are_removed_from_physical_action_events(self):
        payload = {
            "videoPromptMaxChars": 20_000,
            "targetVideoModel": {"id": "gemini-omni-flash-1-1"},
            "shot": {
                "durationSeconds": 8,
                "verifiedCastPositions": [
                    {"characterKey": "a", "name": "เอ", "position": "viewer-left"},
                    {"characterKey": "b", "name": "บี", "position": "viewer-right"},
                ],
            },
            "dialogue": [
                {"characterKey": "a", "speaker": "เอ", "lineTh": "ไปกันเถอะ"},
            ],
        }
        observed = {
            "characters": [
                {"characterId": "a", "screenPosition": "viewer-left"},
                {"characterId": "b", "screenPosition": "viewer-right"},
            ]
        }
        prompt = _terminal_prompt(
            payload,
            {
                "actions": [
                    "บี turns toward เอ แล้วขยับปากพูดว่า ไปกันเถอะ",
                    "เอ raises one hand and speaks with precise lip-sync: ไปกันเถอะ",
                ]
            },
            observed,
        )
        motion = prompt.split("MOTION AND PERFORMANCE", 1)[1].split("CAMERA", 1)[0]
        self.assertIn("บี turns toward เอ", motion)
        self.assertIn("เอ raises one hand", motion)
        self.assertNotRegex(motion, r"ขยับปาก|พูดว่า|speaks with precise lip-sync")

    def test_protected_dialogue_core_fails_when_budget_cannot_hold_it(self):
        payload = {
            "videoPromptMaxChars": 200,
            "targetVideoModel": {"id": "grok-imagine-video-1-5-preview"},
            "shot": {
                "durationSeconds": 8,
                "verifiedCastPositions": [
                    {"characterKey": "a", "name": "เอ", "position": "viewer-left"},
                ],
            },
            "dialogue": [
                {"characterKey": "a", "speaker": "เอ", "lineTh": "ข้อความสำคัญที่ห้ามตัดทิ้ง" * 8},
            ],
        }
        observed = {"characters": [{"characterId": "a", "screenPosition": "viewer-left"}]}
        with self.assertRaisesRegex(RuntimeError, "VIDEO_PROMPT_BUDGET_EXCEEDED"):
            _terminal_prompt(payload, {"actions": ["เอ raises one hand"]}, observed)

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
