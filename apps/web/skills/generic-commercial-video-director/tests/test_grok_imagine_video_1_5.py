from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from adapters.grok_reference_planner import plan_grok_references, validate_grok_reference_plan
from adapters.grok_prompt_compiler import compile_grok_prompt
from adapters.temporal_planner import plan_single_extension
from adapters.registry import load_profiles, multi_turn_native_append_ready
from adapters.grok_imagine_video_1_5 import (
    build_generation_payload,
    build_execution_plan,
    build_companion_extension_payload,
    build_companion_edit_payload,
    normalize_generation_response,
    choose_resolution,
    GrokImagineAdapterError,
)

def run():
    # 1. Start Frame => Image-to-Video.
    start_assets = [{
        "assetId": "start", "role": "start_frame", "mediaType": "image",
        "sourceOfTruth": True, "providerUsePolicy": "must_use_raw"
    }]
    p = plan_grok_references(start_assets)
    assert p["mode"] == "image_to_video"
    assert p["startFrameAssetId"] == "start"
    assert p["referenceImages"] == []
    assert p["resolutionLimit"] == "1080p"

    # 2. Character + product refs => Reference-to-Video with official 1-based image labels.
    refs = [
        {"assetId": "person", "role": "character_reference", "mediaType": "image",
         "entityId": "host", "referencePurposes": ["identity"], "providerUsePolicy": "must_use_raw"},
        {"assetId": "product", "role": "product_reference", "mediaType": "image",
         "entityId": "product", "referencePurposes": ["product_geometry"], "providerUsePolicy": "must_use_raw"},
    ]
    p2 = plan_grok_references(refs)
    assert p2["mode"] == "reference_to_video"
    assert [x["label"] for x in p2["referenceImages"]] == ["<IMAGE_1>", "<IMAGE_2>"]
    assert p2["resolutionLimit"] == "720p"

    # 3. Preset voices use official zero-based AUDIO labels.
    p3 = plan_grok_references(
        refs,
        preset_voice_mappings=[
            {"speakerId": "host", "voiceId": "eve"},
            {"speakerId": "guest", "voiceId": "leo"},
        ],
    )
    assert [x["label"] for x in p3["referenceAudios"]] == ["<AUDIO_0>", "<AUDIO_1>"]
    assert [x["voiceId"] for x in p3["referenceAudios"]] == ["eve", "leo"]

    # 4. Start + must-use references => explicit prebake by auto policy.
    p4 = plan_grok_references(
        start_assets + refs,
        conflict_policy="auto",
        authoritative_start=True,
        start_frame_covers_reference_entities=False,
    )
    assert p4["conflictDetected"] is True
    assert p4["conflictResolution"] == "prebake_start_frame"
    assert p4["mode"] == "image_to_video"
    assert p4["referenceImages"] == []
    assert any(x["preservedAs"] == "prebake_input" for x in p4["nonProviderReferences"])

    # 5. Prefer references turns Start Frame into a soft reference rather than literal frame 0.
    p5 = plan_grok_references(
        start_assets + refs,
        conflict_policy="prefer_references",
        authoritative_start=False,
    )
    assert p5["mode"] == "reference_to_video"
    assert p5["startFrameAssetId"] is None
    assert p5["referenceImages"][0]["assetId"] == "start"
    assert p5["referenceImages"][0]["label"] == "<IMAGE_1>"

    # 6. More than 7 images under quality-first is capped and overflow is preserved as guidance.
    many = [
        {"assetId": f"img{i}", "role": "character_reference", "mediaType": "image",
         "referencePurposes": ["identity"]} for i in range(9)
    ]
    p6 = plan_grok_references(many, reference_image_policy="quality_first")
    assert len(p6["referenceImages"]) == 7
    assert len([x for x in p6["nonProviderReferences"] if x["preservedAs"] == "derived_guidance"]) == 2

    # 7. Strict over-budget policy blocks while keeping schema-safe <=7 provider refs.
    p7 = plan_grok_references(many, reference_image_policy="block_if_over_limit")
    assert p7["conflictResolution"] == "blocked"
    assert len(p7["referenceImages"]) == 7

    # 8. Motion/camera reference video is derived to prompt by default, not sent raw.
    video_assets = refs[:1] + [{
        "assetId": "motion", "role": "motion_reference", "mediaType": "video",
        "referencePurposes": ["motion", "camera_motion"], "providerUsePolicy": "may_derive"
    }]
    p8 = plan_grok_references(video_assets, video_reference_policy="derive_to_prompt")
    assert p8["mode"] == "reference_to_video"
    assert any(x["derivation"] == "motion_description" for x in p8["derivedReferences"])
    assert any(x["derivation"] == "camera_description" for x in p8["derivedReferences"])

    # 9. Must-use raw video ref with fallback-provider policy blocks this provider route.
    p9 = plan_grok_references(
        [{
            "assetId": "motion", "role": "motion_reference", "mediaType": "video",
            "referencePurposes": ["motion"], "providerUsePolicy": "must_use_raw"
        }],
        video_reference_policy="fallback_provider",
    )
    assert p9["conflictResolution"] == "blocked"

    # 10. Uploaded custom voice without trusted entitlement falls back externally.
    p10 = plan_grok_references([{
        "assetId": "voice", "role": "voice_reference", "mediaType": "audio",
        "entityId": "host", "referencePurposes": ["voice_timbre"],
        "providerUsePolicy": "prefer_raw"
    }], custom_voice_policy="external_fallback")
    assert p10["referenceAudios"] == []
    assert any(x["preservedAs"] == "external_audio" for x in p10["nonProviderReferences"])

    # 11. Verified custom voice entitlement enters plan but public adapter requires connector payload.
    entitled = [{
        "assetId": "voice", "role": "voice_reference", "mediaType": "audio",
        "entityId": "host", "referencePurposes": ["voice_timbre"],
        "providerUsePolicy": "must_use_raw",
        "providerHints": {"xai": {"customVoiceEntitlementVerified": True}}
    }]
    p11 = plan_grok_references(entitled)
    assert p11["mode"] == "reference_to_video"
    assert p11["referenceAudios"][0]["sourceType"] == "custom_audio"
    try:
        build_generation_payload(
            reference_plan=p11,
            prompt_text="host speaks",
            duration=8,
            aspect_ratio="9:16",
            resolution="720p",
            asset_inputs={},
            generate_audio=True,
        )
    except GrokImagineAdapterError:
        pass
    else:
        raise AssertionError("Custom trusted-partner voice must require connector-specific payload.")

    # 12. Reference-to-Video cannot request 1080p.
    try:
        build_generation_payload(
            reference_plan=p2,
            prompt_text="presenter holds product",
            duration=8,
            aspect_ratio="9:16",
            resolution="1080p",
            asset_inputs={
                "person": "https://example.com/person.png",
                "product": "https://example.com/product.png",
            },
        )
    except GrokImagineAdapterError:
        pass
    else:
        raise AssertionError("Grok 1.5 reference-to-video must reject 1080p.")

    # 13. Image-to-Video supports 1080p and preserve-source aspect omits aspect_ratio.
    image_payload = build_generation_payload(
        reference_plan=p,
        prompt_text="continue from frame zero",
        duration=12,
        aspect_ratio="9:16",
        resolution="1080p",
        asset_inputs={"start": "https://example.com/start.png"},
        start_frame_aspect_policy="preserve_source",
    )
    assert image_payload["resolution"] == "1080p"
    assert "image" in image_payload
    assert "aspect_ratio" not in image_payload

    # 14. Reference prompt compiler binds images and preset voice correctly.
    p14 = plan_grok_references(
        refs,
        preset_voice_mappings=[{"speakerId": "host", "voiceId": "eve"}]
    )
    prompt = compile_grok_prompt(
        mode=p14["mode"],
        duration_seconds=10,
        scene_description="A clean vertical commercial set.",
        action_chronology=["The presenter raises the product", "The presenter demonstrates it"],
        camera_intent="Slow push-in, no cut.",
        continuity_locks=["preserve presenter face", "preserve product geometry"],
        reference_plan=p14,
        dialogue_lines=[{
            "speakerId": "host",
            "text": "รุ่นนี้ใช้งานง่ายค่ะ",
            "lipSyncRequired": True
        }]
    )
    assert "<IMAGE_1>" in prompt["promptText"]
    assert "<AUDIO_0>" in prompt["promptText"]
    assert "รุ่นนี้ใช้งานง่ายค่ะ" in prompt["promptText"]

    # 15. Reference voice + generate_audio=false is rejected.
    try:
        build_generation_payload(
            reference_plan=p14,
            prompt_text=prompt["promptText"],
            duration=10,
            aspect_ratio="9:16",
            resolution="720p",
            asset_inputs={
                "person": "https://example.com/person.png",
                "product": "https://example.com/product.png",
            },
            generate_audio=False,
        )
    except GrokImagineAdapterError:
        pass
    else:
        raise AssertionError("Reference voice cannot be used with generate_audio=false.")

    # 16. Hard End Frame is unsupported and blocks when must_use_raw.
    p16 = plan_grok_references([{
        "assetId": "end", "role": "end_frame", "mediaType": "image",
        "providerUsePolicy": "must_use_raw"
    }])
    assert p16["conflictResolution"] == "blocked"
    assert any("last-frame" in x["reason"] for x in p16["nonProviderReferences"])

    # 17. Prebake is a real dependency before execution.
    p17_prompt = compile_grok_prompt(
        mode="image_to_video",
        duration_seconds=8,
        scene_description="Approved commercial Start Frame.",
        action_chronology=["The presenter begins the next action"],
        camera_intent="Subtle push-in.",
        continuity_locks=["preserve exact frame-zero state"],
        reference_plan=p4,
    )
    try:
        build_execution_plan(
            assets=start_assets + refs,
            prompt=p17_prompt,
            asset_inputs={"start": "https://example.com/start.png"},
            aspect_ratio="9:16",
            requested_resolution="1080p",
            start_reference_conflict_policy="prebake_start_frame",
        )
    except GrokImagineAdapterError:
        pass
    else:
        raise AssertionError("Prebake conflict resolution must require the new approved Start Frame.")

    # 18. Companion extension/edit use grok-imagine-video and enforce extension duration.
    ext = build_companion_extension_payload(
        video_input="https://example.com/base.mp4",
        prompt_text="Continue the action naturally.",
        extension_seconds=6,
    )
    assert ext["model"] == "grok-imagine-video"
    assert ext["duration"] == 6
    edit = build_companion_edit_payload(
        video_input="https://example.com/base.mp4",
        prompt_text="Make the lighting warmer.",
    )
    assert edit["model"] == "grok-imagine-video"

    # 19. Async response normalization.
    norm = normalize_generation_response({
        "status": "done",
        "model": "grok-imagine-video-1.5",
        "video": {
            "url": "https://vidgen.x.ai/output.mp4",
            "duration": 8,
            "respect_moderation": True,
        }
    })
    assert norm["status"] == "done"
    assert norm["actualDurationSeconds"] == 8
    assert norm["outputUrl"].endswith("output.mp4")

    # 20. Auto resolution respects mode boundary.
    assert choose_resolution("image_to_video", "auto", "quality") == "1080p"
    assert choose_resolution("reference_to_video", "auto", "quality") == "720p"

    # 21. Companion xAI extension is explicitly single-turn, not an unlimited chain.
    one = plan_single_extension(
        base_seconds=8,
        target_total_seconds=24,
        min_additional_seconds=2,
        max_additional_seconds=10,
        source_input_min_seconds=2,
        source_input_max_seconds=15,
        step_seconds=1,
    )
    assert one.exact is False
    assert one.extension_seconds == (10,)
    assert one.total_seconds == 18

    # 22. Registry does not advertise Grok companion as multi-turn native append.
    profiles = load_profiles()
    assert multi_turn_native_append_ready(profiles["grok-imagine-video"]) is False

    print("PASS: 22 Grok Imagine Video 1.5 integration regression checks")

if __name__ == "__main__":
    run()
