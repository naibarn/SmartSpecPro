from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))

from adapters.wan3_reference_planner import plan_wan3_references, validate_wan3_limits
from adapters.wan3_prompt_compiler import compile_wan3_prompt
from adapters.wan3 import (
    build_generation_payload, build_execution_plan, normalize_create_response,
    normalize_task_response, build_create_url, build_query_url, required_headers,
    Wan3AdapterError
)

def run():
    # 1. Hard Start => image_to_video.
    start=[{"assetId":"s","role":"start_frame","mediaType":"image","providerUsePolicy":"must_use_raw"}]
    p=plan_wan3_references(start)
    assert p["mode"]=="image_to_video" and p["hardFrames"]["firstFrameAssetId"]=="s"

    # 2. First+last => strict first_last_to_video.
    p2=plan_wan3_references(start+[{"assetId":"e","role":"end_frame","mediaType":"image"}])
    assert p2["mode"]=="first_last_to_video"

    # 3. Image+video+audio refs remain raw with independent labels.
    refs=[
      {"assetId":"i","role":"character_reference","mediaType":"image","referencePurposes":["identity"]},
      {"assetId":"v","role":"motion_reference","mediaType":"video","referencePurposes":["motion","camera_motion"]},
      {"assetId":"a","role":"voice_reference","mediaType":"audio","referencePurposes":["voice_timbre"]},
    ]
    p3=plan_wan3_references(refs)
    assert p3["mode"]=="reference_to_video"
    assert p3["referenceImages"][0]["label"]=="Image 1"
    assert p3["referenceVideos"][0]["label"]=="Video 1"
    assert p3["referenceAudios"][0]["label"]=="Audio 1"

    # 4. Start + visual ref => production auto prebake.
    p4=plan_wan3_references(start+[refs[0]],conflict_policy="auto")
    assert p4["conflictResolution"]=="prebake_hard_frame"

    # 5. Start + must-use raw motion => split.
    p5=plan_wan3_references(start+[dict(refs[1],providerUsePolicy="must_use_raw")])
    assert p5["conflictResolution"]=="split_generation"

    # 6. Hard/ref raw mix is never left in one normal plan.
    assert not (p4["hardFrames"]["firstFrameAssetId"] and p4["referenceImages"])

    # 7. File + link conflict blocks.
    p7=plan_wan3_references([
      {"assetId":"doc","role":"document_reference","mediaType":"document"},
      {"assetId":"web","role":"web_reference","mediaType":"web"}
    ])
    assert p7["conflictResolution"]=="blocked"

    # 8. Ref limits validate durations.
    errors=validate_wan3_limits(p3,{"v":{"durationSeconds":16},"a":{"durationSeconds":4}})
    assert any("1-15s" in x for x in errors)

    # 9. Wan video input + output >30 is rejected.
    prompt=compile_wan3_prompt(
      reference_plan=p3,duration_seconds=20,scene_description="A product demo.",
      action_chronology=["presenter raises product"],camera_intent="slow push"
    )
    try:
        build_generation_payload(
          reference_plan=p3,prompt_text=prompt["promptText"],
          assets=[
            {"assetId":"i","mediaMetadata":{}},
            {"assetId":"v","mediaMetadata":{"durationSeconds":15}},
            {"assetId":"a","mediaMetadata":{"durationSeconds":4}}
          ],
          asset_inputs={"i":"https://x/i.png","v":"https://x/v.mp4","a":"https://x/a.mp3"},
          duration=20,resolution="720P",ratio="9:16"
        )
    except Wan3AdapterError:
        pass
    else:
        raise AssertionError("Wan input video + output duration >30 must fail.")

    # 10. Missing video duration metadata also fail-closes.
    try:
        build_generation_payload(
          reference_plan=p3,prompt_text=prompt["promptText"],
          assets=[{"assetId":"i"},{"assetId":"v"},{"assetId":"a"}],
          asset_inputs={"i":"https://x/i.png","v":"https://x/v.mp4","a":"https://x/a.mp3"},
          duration=10
        )
    except Wan3AdapterError:
        pass
    else:
        raise AssertionError("Wan video preflight requires duration metadata.")

    # 11. Legal multimodal payload.
    payload,warnings=build_generation_payload(
      reference_plan=p3,prompt_text="Image 1 follows Video 1 with Audio 1.",
      assets=[{"assetId":"i"},{"assetId":"v","mediaMetadata":{"durationSeconds":4}},{"assetId":"a","mediaMetadata":{"durationSeconds":4}}],
      asset_inputs={"i":"https://x/i.png","v":"https://x/v.mp4","a":"https://x/a.mp3"},
      duration=10,resolution="1080P",ratio="9:16"
    )
    assert payload["model"]=="wan3.0-video"
    assert [x["type"] for x in payload["input"]["media"]]==["reference_image","reference_video","reference_audio"]

    # 12. Smart duration maps to -1.
    payload2,w2=build_generation_payload(
      reference_plan=p3,prompt_text="continue naturally",
      assets=[{"assetId":"i"},{"assetId":"v","mediaMetadata":{"durationSeconds":4}},{"assetId":"a","mediaMetadata":{"durationSeconds":4}}],
      asset_inputs={"i":"https://x/i.png","v":"https://x/v.mp4","a":"https://x/a.mp3"},
      duration=None,smart_duration=True
    )
    assert payload2["parameters"]["duration"]==-1 and w2

    # 13. Timestamped native multi-shot compiler.
    cp=compile_wan3_prompt(
      reference_plan=plan_wan3_references([]),duration_seconds=12,scene_description="Commercial.",
      shots=[
        {"shotId":"S1","startSeconds":0,"endSeconds":4,"description":"Hook"},
        {"shotId":"S2","startSeconds":4,"endSeconds":8,"description":"Demo"},
        {"shotId":"S3","startSeconds":8,"endSeconds":12,"description":"Hero"},
      ]
    )
    assert len(cp["shotTimeline"])==3 and "(00:00.00 - 00:04.00)" in cp["promptText"]

    # 14. Edit/extend require video reference.
    pe=plan_wan3_references([refs[1]],requested_mode="video_extend")
    assert pe["mode"]=="video_extend"

    # 15. Async transport endpoints/header.
    assert "video-synthesis" in build_create_url("workspace","ap-southeast-1")
    assert build_query_url("workspace","task","ap-southeast-1").endswith("/api/v1/tasks/task")
    assert required_headers()["X-DashScope-Async"]=="enable"

    # 16. Response normalization.
    c=normalize_create_response({"output":{"task_id":"t1","task_status":"PENDING"},"request_id":"r"})
    assert c["status"]=="queued"
    q=normalize_task_response({"output":{"task_id":"t1","task_status":"SUCCEEDED","video_url":"https://x/o.mp4"}})
    assert q["status"]=="succeeded" and q["outputUrl"].endswith("o.mp4")

    # 17. Prime profile ID is preserved.
    pp=plan_wan3_references([],model="wan3.0-video-prime")
    assert pp["model"]=="wan3.0-video-prime"

    print("PASS: 17 Wan 3.0 integration regression checks")

if __name__=="__main__":
    run()
