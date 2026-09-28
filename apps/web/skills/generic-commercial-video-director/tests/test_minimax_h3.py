from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from adapters.h3_reference_planner import plan_h3_references
from adapters.minimax_h3_prompt_compiler import compile_base_prompt, compile_reference_prompt, default_keyframe_alignment
from adapters.temporal_planner import plan_reference_continuation_chain
from adapters.registry import load_profiles, reference_continuation_ready
from adapters.minimax_h3 import build_generation_payload, build_regenerate_2k_payload, build_local_worker_plan, normalize_task_response, handle_callback_challenge, validate_context_ir_result, H3AdapterError

def run():
    # Roundtrip 1: image + video + audio => full Ref2VA
    assets = [
        {"assetId":"p","role":"product_reference","mediaType":"image","referencePurposes":["product_geometry"],"providerUsePolicy":"must_use_raw"},
        {"assetId":"c","role":"character_reference","mediaType":"image","referencePurposes":["identity"],"providerUsePolicy":"must_use_raw"},
        {"assetId":"v","role":"motion_reference","mediaType":"video","referencePurposes":["motion","camera_motion"],"providerUsePolicy":"must_use_raw"},
        {"assetId":"a","role":"voice_reference","mediaType":"audio","referencePurposes":["voice_timbre"],"providerUsePolicy":"must_use_raw"},
    ]
    plan = plan_h3_references(assets)
    assert plan["mode"] == "ref2va"
    assert plan["rawReferences"] == {"images":["p","c"],"videos":["v"],"audio":["a"]}
    assert [x["label"] for x in plan["referenceLabels"]] == ["<Picture 1>","<Picture 2>","<Video 1>","<Audio 1>"]

    # Roundtrip 2: authoritative hard Start + must-use raw video => split, not dropped/mixed
    conflict_assets = [
        {"assetId":"s","role":"start_frame","mediaType":"image","providerUsePolicy":"must_use_raw"},
        {"assetId":"v","role":"motion_reference","mediaType":"video","providerUsePolicy":"must_use_raw"},
    ]
    cp = plan_h3_references(conflict_assets, authoritative_start=True)
    assert cp["conflictDetected"] is True
    assert cp["conflictResolution"] == "split_generation"
    assert cp["hardFrames"]["firstFrameAssetId"] == "s"
    assert cp["rawReferences"]["videos"] == []

    # Roundtrip 3: hard Start + derivable motion => I2VA and derived guidance
    cp2 = plan_h3_references(
        [{"assetId":"s","role":"start_frame","mediaType":"image"},
         {"assetId":"v","role":"motion_reference","mediaType":"video","providerUsePolicy":"may_derive"}],
        authoritative_start=True
    )
    assert cp2["mode"] == "i2va"
    assert cp2["conflictResolution"] == "derive_references_to_text"
    assert any(x["derivation"] == "motion_description" for x in cp2["derivedReferences"])

    # Roundtrip 4: H3 native 15-second multi-shot
    base = compile_base_prompt(
        mode="t2va", duration_seconds=15,
        shots=[
            {"shotId":"S1","startSeconds":0,"description":"Live-action product hook."},
            {"shotId":"S2","startSeconds":5,"description":"Cut to the product-use demonstration."},
            {"shotId":"S3","startSeconds":10,"description":"Cut to the product hero shot."},
        ],
        overall_soundscape="Clean studio ambience.",
        non_diegetic_music="Minimal electronic rhythm.",
    )
    assert "[Shot 2] At 00:05.000" in base["promptText"]
    assert "[Shot 3] At 00:10.000" in base["promptText"]

    # Roundtrip 5: Thai dialogue is preserved and flagged variable
    ref = compile_reference_prompt(
        duration_seconds=10,
        subject_definitions="<Subject 1> is the presenter.",
        summary="[reference generation] The presenter demonstrates the product.",
        retention_analysis="<Subject 1>: fully_preserved - preserve identity.",
        shots=[{
            "shotId":"S1","startSeconds":0,
            "description":"The presenter holds the product.",
            "dialogue":[{"speakerId":"presenter","language":"Thai","text":"สวัสดีค่ะ นี่คือสินค้ารุ่นใหม่"}]
        }],
        overall_soundscape="Quiet studio ambience.",
        non_diegetic_music="N/A",
        speaker_assignments=[{"speakerId":"presenter","h3SpeakerId":"S1","lineIds":["L1"],"language":"Thai"}]
    )
    assert "สวัสดีค่ะ นี่คือสินค้ารุ่นใหม่" in ref["promptText"]
    assert ref["speakerMap"][0]["languageSupport"] == "variable"

    # Roundtrip 6: 40-second H3 continuation uses legal standalone segments
    chain = plan_reference_continuation_chain(
        target_total_seconds=40, preferred_segment_seconds=15, tail_seconds=4
    )
    assert chain.exact and abs(chain.total_seconds - 40) < 1e-9
    assert [x.duration_seconds for x in chain.segments] == [15,15,10]
    assert all(4 <= x.duration_seconds <= 15 for x in chain.segments)
    assert chain.segments[1].tail_seconds == 4

    # Roundtrip 7: T2VA adaptive ratio is rejected
    rp = plan_h3_references([])
    try:
        build_generation_payload(
            model="MiniMax-H3", prompt_text="test", duration=8, resolution="768P",
            ratio="adaptive", reference_plan=rp, asset_urls={}
        )
    except H3AdapterError:
        pass
    else:
        raise AssertionError("H3 T2VA adaptive ratio must be rejected.")

    # Roundtrip 8: hard I2VA + Ref2VA raw media must never reach request payload together
    hard = plan_h3_references(
        [{"assetId":"s","role":"start_frame","mediaType":"image"},
         {"assetId":"a","role":"voice_reference","mediaType":"audio","providerUsePolicy":"may_derive"}]
    )
    assert hard["mode"] == "i2va"
    assert not hard["rawReferences"]["audio"]

    # Roundtrip 9: V2 task response normalization
    norm = normalize_task_response({"task":{
        "id":"task-1","model":"MiniMax-H3","status":"succeeded",
        "content":{"url":"https://cdn.example/video.mp4"},"resolution":"768P",
        "duration":10,"ratio":"9:16","task_type":"generation","modality":"video",
        "usage":{"total_seconds":10,"input_audio_seconds":4}
    }})
    assert norm["status"] == "succeeded"
    assert norm["outputUrl"].endswith("video.mp4")
    assert norm["usage"]["inputAudioSeconds"] == 4

    # Roundtrip 10: callback challenge
    assert handle_callback_challenge({"challenge":"abc"}) == {"challenge":"abc"}
    assert handle_callback_challenge({"status":"running"}) is None

    # Roundtrip 11: Context-IR exact dialogue/reference validation
    errs = validate_context_ir_result(
        canonical={"exactDialogue":["ข้อความเดิม"],"requiredReferenceLabels":["<Picture 1>"]},
        enhanced_prompt="subject_definitions: <Picture 1> ... detailed_description: ข้อความเดิม"
    )
    assert errs == []

    # Roundtrip 12: H3-Max raw Ref2VA is blocked
    mx = plan_h3_references(
        [{"assetId":"p","role":"product_reference","mediaType":"image","providerUsePolicy":"must_use_raw"}],
        model="MiniMax-H3-Max"
    )
    assert mx["conflictResolution"] == "blocked"

    # Roundtrip 13: embedded audio from a reference video receives an Audio semantic label
    embedded = plan_h3_references([
        {"assetId":"v1","role":"video_reference","mediaType":"video",
         "referencePurposes":["motion","audio_continuity"],"useEmbeddedAudio":True}
    ])
    assert embedded["mode"] == "ref2va"
    assert any(x["kind"]=="Audio" and x["assetId"]=="v1" for x in embedded["referenceLabels"])
    assert len(embedded["contentOrder"]) == 1  # video is uploaded only once

    # Roundtrip 14: local/base-video 2K regeneration retains prompt and original context
    regen = build_regenerate_2k_payload(
        base_video_url="https://cdn.example/local-h3.mp4",
        prompt_text="expanded H3 prompt",
        supporting_content=[{"type":"image_url","image_url":{"url":"https://cdn.example/ref.png"},"role":"first_frame"}]
    )
    assert regen["content"][0]["type"] == "text"
    assert regen["content"][-1]["role"] == "base_video"

    # Roundtrip 15: local H3-Base Ref2VA disallows audio-only raw reference
    audio_only = plan_h3_references([
        {"assetId":"a","role":"voice_reference","mediaType":"audio","providerUsePolicy":"must_use_raw"}
    ])
    try:
        build_local_worker_plan(
            reference_plan=audio_only,prompt_text="test",duration=8,
            assets=[{"assetId":"a","role":"voice_reference","mediaType":"audio"}]
        )
    except H3AdapterError:
        pass
    else:
        raise AssertionError("Local H3-Base Ref2VA must reject audio-only reference.")

    # Roundtrip 16: registry recognizes H3 reference continuation separately from native append
    profiles = load_profiles()
    hp = profiles["minimax-h3"]
    assert reference_continuation_ready(hp) is True

    # Roundtrip 17: FL2VA/L2VA alignment instruction is auto-generated from exact duration
    assert "15.00-second mark" in default_keyframe_alignment("fl2va",15,1)
    assert "10.00-second mark" in default_keyframe_alignment("l2va",10,1)

    # Roundtrip 18: H3-Max rejects 2K generation
    try:
        build_generation_payload(
            model="MiniMax-H3-Max",prompt_text="test",duration=8,resolution="2K",
            ratio="16:9",reference_plan=plan_h3_references([],model="MiniMax-H3-Max"),asset_urls={}
        )
    except H3AdapterError:
        pass
    else:
        raise AssertionError("MiniMax-H3-Max must reject 2K.")

    print("PASS: 18 MiniMax H3 integration regression checks")

if __name__ == "__main__":
    run()
