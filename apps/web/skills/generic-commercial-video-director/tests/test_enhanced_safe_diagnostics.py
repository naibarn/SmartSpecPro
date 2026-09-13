from smartaihub_video_director.errors import (
    StageContractError, StageExecutionError, safe_bridge_error_line,
)


def test_shot_nine_three_lines_fit_grok_without_reassigning_or_truncating():
    from smartaihub_video_director.enhanced_bridge import _terminal_prompt, _prompt_char_length
    cast = [
        {"characterKey": "character-3-look-casual_home", "name": "ภูมิ", "position": "viewer-left"},
        {"characterKey": "character-look-casual_home", "name": "พิมพ์ชนก", "position": "viewer-center"},
        {"characterKey": "character-2-look-casual_home", "name": "ธีร์", "position": "viewer-right"},
    ]
    texts = [
        "พรุ่งนี้คุณไปโรงพยาบาลกับฉันได้ ในฐานะคนที่ฉันเลือกให้ช่วย",
        "ผมจะจำไว้ และจะไม่ก้าวข้ามเส้นของคุณ",
        "แต่ถ้ามยุรีตามเราไปถึงที่นั่น เราจะไม่มีที่ให้หลบอีกแล้ว",
    ]
    payload = {
        "videoPromptMaxChars": 4096,
        "targetVideoModel": {"id": "grok-imagine-video-1-5-preview"},
        "mediaBundle": {"startFrame": {"assetId": "6425"}},
        "shot": {"durationSeconds": 8, "verifiedCastPositions": cast},
        "dialogue": [
            {"speakerId": cast[index]["characterKey"], "speaker": cast[index]["name"], "text": text}
            for index, text in zip([1, 2, 1], texts)
        ],
    }
    observed = {"characters": [
        {"characterId": c["characterKey"], "screenPosition": c["position"]}
        for c in cast
    ]}
    prompt = _terminal_prompt(payload, {"camera": "Eye-level tight three-shot; slow forward track."}, observed)
    assert _prompt_char_length(prompt) <= 4096
    for text in texts:
        assert prompt.count(text) == 1
    for c in cast:
        assert f'{c["characterKey"]} = {c["name"]}: {c["position"]}' in prompt
    assert "Characters without a dialogue event remain silent throughout" in prompt
    assert "พิมพ์ชนก on viewer-center; พิมพ์ชนก says with" in prompt
    assert "ธีร์ on viewer-right; ธีร์ says with" in prompt
    assert "turn face and eyes away from the camera lens toward ธีร์ on viewer-right" in prompt
    payload["dialogue"][0]["text"] = "ก" * 5000
    try:
        _terminal_prompt(payload, {}, observed)
    except RuntimeError as error:
        assert "VIDEO_PROMPT_BUDGET_EXCEEDED" in str(error)
    else:
        raise AssertionError("Must not truncate dialogue to hide a real budget overflow")


def test_local_errors_keep_reason_without_prompt_or_provider_secrets():
    cases = [
        (RuntimeError("SPEAKER_POSITION_BINDING_FAILED: private dialogue"),
         "ENHANCED_SPEAKER_POSITION_BINDING_FAILED:"),
        (RuntimeError("VIDEO_PROMPT_BUDGET_EXCEEDED: private prompt"),
         "ENHANCED_VIDEO_PROMPT_BUDGET_EXCEEDED:"),
        (StageContractError("private schema payload"), "ENHANCED_CONTRACT_FAILED:"),
        (StageExecutionError("private stage payload"), "ENHANCED_STAGE_FAILED:"),
        (TimeoutError("private provider URL"), "ENHANCED_PROVIDER_TIMEOUT:"),
    ]
    for error, prefix in cases:
        diagnostic = safe_bridge_error_line(error)
        assert diagnostic.startswith(prefix)
        assert "private" not in diagnostic


def test_provider_stage_failure_uses_controller_owned_local_prompt_fallback():
    import asyncio
    import smartaihub_video_director.enhanced_bridge as bridge

    class FailingOrchestrator:
        def __init__(self, **kwargs):
            pass

        async def run_stage(self, *args, **kwargs):
            raise RuntimeError("provider payload details must not escape")

    original = bridge.DirectorOrchestrator
    bridge.DirectorOrchestrator = FailingOrchestrator
    try:
        result = asyncio.run(bridge.run({
            "videoPromptMaxChars": 4096,
            "targetVideoModel": {"id": "grok-imagine-video-1-5-preview"},
            "authoringModel": {
                "id": "openai/gpt-5.6-luna",
                "providerModelId": "openai/gpt-5.6-luna",
                "apiStyle": "chat-completions",
                "supportsFunctionTools": False,
            },
            "mediaBundle": {"startFrame": {"assetId": "6425"}},
            "shot": {
                "shotNumber": 9,
                "description": "ก่อนขึ้นรถ พิมพ์ชนกยื่นแฟ้มให้ธีร์",
                "cameraSetup": "tight three-shot",
                "durationSeconds": 8,
                "verifiedCastPositions": [
                    {"characterKey": "character-3-look-casual_home", "name": "ภูมิ", "position": "viewer-left"},
                    {"characterKey": "character-look-casual_home", "name": "พิมพ์ชนก", "position": "viewer-center"},
                    {"characterKey": "character-2-look-casual_home", "name": "ธีร์", "position": "viewer-right"},
                ],
            },
            "dialogue": [{
                "speakerId": "character-look-casual_home",
                "speaker": "พิมพ์ชนก",
                "text": "พรุ่งนี้คุณไปโรงพยาบาลกับฉันได้",
            }],
        }))
    finally:
        bridge.DirectorOrchestrator = original
    assert len(result["prompt"]) <= 4096
    assert result["prompt"].count("พรุ่งนี้คุณไปโรงพยาบาลกับฉันได้") == 1
    assert len(result["warnings"]) == 2
    assert all("provider payload details" not in warning for warning in result["warnings"])
    assert all("local prompt fallback" in warning.lower() for warning in result["warnings"])


def test_selected_caller_binds_without_an_observed_physical_cast_slot():
    from smartaihub_video_director.enhanced_bridge import (
        _resolve_character_positions, _bind_dialogue_to_character_positions,
        _build_motion_timeline, _validate_dialogue_timeline,
    )
    payload = {"shot": {"visualCastPolicy": {
        "screenCallerCharacterRefs": ["character-6-look-workwear"],
        "screenCallerCharacterNames": ["รินลดา"],
    }}}
    positions = _resolve_character_positions(payload, {"characters": []})
    lines = [{"speakerId": "character-6-look-workwear", "speaker": "รินลดา",
              "position": "viewer-left", "text": "นำต้นฉบับมาโต้สิ"}]
    bound = _bind_dialogue_to_character_positions(lines, positions)
    assert bound[0]["position"] == "viewer-screen"
    timeline = _build_motion_timeline(8, [], bound, positions)
    _validate_dialogue_timeline(timeline, bound)
    assert "รินลดา on viewer-screen" in "\n".join(timeline)


def test_speech_eye_line_targets_conversation_partner_not_camera():
    from smartaihub_video_director.enhanced_bridge import _build_motion_timeline

    dialogue = [
        {
            "speakerId": "woman",
            "speaker": "พิมพ์ชนก",
            "position": "viewer-center",
            "text": "วันนี้คุณช่วยฉันมากกว่าที่คิด",
        },
        {
            "speakerId": "man",
            "speaker": "ธีร์",
            "position": "viewer-left",
            "text": "ผมไม่ได้ช่วยเพราะอยากได้อะไรตอบแทน",
        },
    ]
    timeline = "\n".join(_build_motion_timeline(8, [], dialogue))

    assert (
        "Eye-line: at speech start, turn face and eyes away from the camera lens toward ธีร์ on viewer-left, "
        "the visible conversational partner"
    ) in timeline
    assert (
        "Eye-line: at speech start, turn face and eyes away from the camera lens toward พิมพ์ชนก on viewer-center, "
        "the visible conversational partner"
    ) in timeline
    assert "the camera is not a conversation partner" not in timeline


def test_agent_receives_the_same_nested_schema_used_by_validation():
    import json
    from pathlib import Path
    from smartaihub_video_director.schema_registry import StageContractRegistry
    from smartaihub_video_director.agent_factory import AgentFactory
    registry = StageContractRegistry(Path(__file__).resolve().parents[1])
    for stage in ("observed_start_state", "prompt_intent"):
        schema_json = registry.payload_schema_json(stage)
        agent = AgentFactory(registry).build(stage, model="test-model")
        assert schema_json in agent.instructions
        assert json.loads(schema_json)["additionalProperties"] is False
    assert '"referenceBindings":{"type":"array","items":{"type":"object"}}' in registry.payload_schema_json("prompt_intent")
