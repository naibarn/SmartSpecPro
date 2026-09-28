from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))

from adapters.seedance_reference_planner import plan_seedance_references, validate_seedance_limits
from adapters.seedance_prompt_compiler import compile_seedance_prompt
from adapters.seedance import (
  build_generation_payload, build_execution_plan, choose_resolution,
  normalize_task_response, SeedanceAdapterError
)
from adapters.temporal_planner import plan_bounded_reference_continuation_chain
from adapters.registry import load_profiles

S20="dreamina-seedance-2-0-260128"
S25="dreamina-seedance-2-5-260628"

def run():
    # 1. Seedance 2.0 supports 9/3/3 multimodal refs.
    refs=[
      {"assetId":"i","role":"character_reference","mediaType":"image","referencePurposes":["identity"]},
      {"assetId":"v","role":"motion_reference","mediaType":"video","referencePurposes":["motion"]},
      {"assetId":"a","role":"voice_reference","mediaType":"audio","referencePurposes":["voice_timbre"]},
    ]
    p=plan_seedance_references(refs,model=S20)
    assert p["mode"]=="reference_to_video"
    assert p["referenceImages"][0]["label"]=="@Image 1"
    assert p["referenceVideos"][0]["label"]=="@Video 1"
    assert p["referenceAudios"][0]["label"]=="@Audio 1"

    # 2. Seedance 2.5 supports large image budget.
    many=[{"assetId":f"i{x}","role":"character_reference","mediaType":"image"} for x in range(30)]
    p2=plan_seedance_references(many,model=S25)
    assert len(p2["referenceImages"])==30

    # 3. Seedance 2.0 audio-only is blocked.
    pa=plan_seedance_references([refs[2]],model=S20)
    assert pa["conflictResolution"]=="blocked"

    # 4. Seedance 2.5 audio-only is legal.
    pa25=plan_seedance_references([refs[2]],model=S25)
    assert pa25["mode"]=="reference_to_video" and pa25["conflictResolution"]=="none"

    # 5. Start Frame alone => image_to_video.
    start=[{"assetId":"s","role":"start_frame","mediaType":"image"}]
    ps=plan_seedance_references(start,model=S20)
    assert ps["mode"]=="image_to_video"

    # 6. Hard start + image ref => prebake by default.
    pc=plan_seedance_references(start+[refs[0]],model=S20)
    assert pc["conflictResolution"]=="prebake_hard_frame"

    # 7. Hard start + must-use raw video => split.
    pc2=plan_seedance_references(start+[dict(refs[1],providerUsePolicy="must_use_raw")],model=S25)
    assert pc2["conflictResolution"]=="split_generation"

    # 8. provider_verified_mix fails closed unless endpoint verification switch is true.
    pc3=plan_seedance_references(start+refs,model=S25,conflict_policy="provider_verified_mix",direct_hard_frame_reference_mix_verified=False)
    assert pc3["conflictResolution"]=="blocked"

    # 9. Explicitly verified endpoint may retain hard+refs.
    pc4=plan_seedance_references(start+refs,model=S25,conflict_policy="provider_verified_mix",direct_hard_frame_reference_mix_verified=True)
    assert pc4["conflictResolution"]=="provider_verified_mix"
    assert pc4["hardFrames"]["firstFrameAssetId"] and pc4["referenceVideos"]

    # 10. Real-human image direct upload is blocked without material-library approval.
    human=[{
      "assetId":"person","role":"character_reference","mediaType":"image",
      "providerHints":{"byteplus":{"containsRealHumanFace":True,"materialLibraryApproved":False}}
    }]
    ph=plan_seedance_references(human,model=S25)
    assert ph["conflictResolution"]=="blocked" and ph["materialLibraryRequirements"]

    # 11. Approved material library clears that blocker.
    human_ok=[{
      "assetId":"person","role":"character_reference","mediaType":"image",
      "providerHints":{"byteplus":{"containsRealHumanFace":True,"materialLibraryApproved":True,"materialLibraryAssetId":"mat1"}}
    }]
    ph2=plan_seedance_references(human_ok,model=S25)
    assert ph2["conflictResolution"]=="none"

    # 12. Seedance 2.5 rejects 1080p.
    try:
        choose_resolution(S25,"reference_to_video","1080p",True)
    except SeedanceAdapterError:
        pass
    else:
        raise AssertionError("Seedance 2.5 must reject 1080p.")

    # 13. Seedance 2.0 allows 4K.
    assert choose_resolution(S20,"text_to_video","4k",False)=="4k"

    # 14. Seedance 2.0 rejects 1080p in reference-image scenarios.
    try:
        choose_resolution(S20,"reference_to_video","1080p",True)
    except SeedanceAdapterError:
        pass
    else:
        raise AssertionError("Seedance 2.0 ref-image 1080p must fail.")

    # 15. Material-library approved input resolves to asset://.
    prompt=compile_seedance_prompt(
      model=S25,reference_plan=ph2,duration_seconds=8,scene_description="Presenter."
    )
    payload=build_generation_payload(
      reference_plan=ph2,prompt_text=prompt["promptText"],assets=human_ok,asset_inputs={},
      duration=8,resolution="720p"
    )
    assert payload["content"][1]["image_url"]["url"]=="asset://mat1"

    # 16. 2.5 supports direct 30s prompt.
    p16=compile_seedance_prompt(model=S25,reference_plan=plan_seedance_references([],model=S25),duration_seconds=30,scene_description="30s story.")
    assert p16["durationSeconds"]==30

    # 17. 2.0 rejects 16s.
    try:
        compile_seedance_prompt(model=S20,reference_plan=plan_seedance_references([],model=S20),duration_seconds=16,scene_description="too long")
    except ValueError:
        pass
    else:
        raise AssertionError("Seedance 2.0 >15s must fail.")

    # 18. Ref duration validator is model-specific.
    errs=validate_seedance_limits(p,{"v":{"durationSeconds":16},"a":{"durationSeconds":5}})
    assert errs

    # 19. Timestamp prompt.
    cp=compile_seedance_prompt(
      model=S25,reference_plan=plan_seedance_references([],model=S25),duration_seconds=20,
      scene_description="Commercial.",shots=[
        {"startSeconds":0,"endSeconds":8,"description":"Hook"},
        {"startSeconds":8,"endSeconds":20,"description":"Demo"}
      ]
    )
    assert "(00:00.00-00:08.00)" in cp["promptText"]

    # 20. Task response normalization.
    n=normalize_task_response({
      "id":"t","model":S25,"status":"succeeded",
      "content":{"video_url":"https://x/out.mp4","last_frame_url":"https://x/last.png"},
      "duration":30,"resolution":"720p","framespersecond":24
    })
    assert n["status"]=="succeeded" and n["lastFrameUrl"].endswith("last.png")

    # 21. Current conservative Seedance 2.5 profile allows base + two extension turns.
    profiles=load_profiles()
    assert profiles["seedance-2.5-byteplus"]["temporalPlanning"]["extension"]["maxExtensionTurns"]==2
    chain=plan_bounded_reference_continuation_chain(
      target_total_seconds=90,min_segment_seconds=4,max_segment_seconds=30,
      preferred_segment_seconds=30,tail_seconds=4,tail_min_seconds=2,tail_max_seconds=30,
      max_total_segments=3
    )
    assert chain.exact and len(chain.segments)==3

    # 22. A 120s target is capped by base + two extensions.
    chain2=plan_bounded_reference_continuation_chain(
      target_total_seconds=120,min_segment_seconds=4,max_segment_seconds=30,
      preferred_segment_seconds=30,tail_seconds=4,tail_min_seconds=2,tail_max_seconds=30,
      max_total_segments=3
    )
    assert not chain2.exact and chain2.total_seconds==90

    print("PASS: 22 Seedance 2.0/2.5 integration regression checks")

if __name__=="__main__":
    run()
