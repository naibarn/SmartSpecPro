from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))

from adapters.flux3_reference_planner import plan_flux3_inputs
from adapters.flux3_prompt_compiler import compile_flux3_prompt
from adapters.flux3 import (
    build_payload, build_execution_plan, build_draft_enhance_payload,
    normalize_submit_response, normalize_result_response, Flux3AdapterError
)
from adapters.temporal_planner import plan_bounded_reference_continuation_chain

def run():
    # 1. Start Frame is a literal keyframe at t=0.
    assets=[{"assetId":"s","role":"start_frame","mediaType":"image"}]
    p=plan_flux3_inputs(assets,duration_seconds=8)
    assert p["mode"]=="i2v" and p["keyframes"][0]["timeSeconds"]==0

    # 2. First + last pins exact endpoints.
    p2=plan_flux3_inputs(assets+[{"assetId":"e","role":"end_frame","mediaType":"image"}],duration_seconds=10)
    assert [(x["timeSeconds"],x["purpose"]) for x in p2["keyframes"]]==[(0.0,"start_frame"),(10.0,"end_frame")]

    # 3. Timed storyboard image can pin exact moment.
    p3=plan_flux3_inputs(
      assets+[{"assetId":"mid","role":"mid_keyframe","mediaType":"image"}],
      duration_seconds=10,timed_keyframes=[{"assetId":"mid","timeSeconds":5}]
    )
    assert [x["timeSeconds"] for x in p3["keyframes"]]==[0.0,5.0]

    # 4. Generic product reference is NOT silently treated as keyframe.
    soft=[{"assetId":"product","role":"product_reference","mediaType":"image","referencePurposes":["product_geometry"],"providerUsePolicy":"must_use_raw"}]
    p4=plan_flux3_inputs(soft,soft_reference_policy="prebake_keyframe")
    assert p4["prebakeRequired"] is True
    assert p4["keyframes"]==[]
    assert p4["softReferences"][0]["assetId"]=="product"

    # 5. Non-exact soft ref may derive to prompt.
    p5=plan_flux3_inputs([dict(soft[0],providerUsePolicy="may_derive")],soft_reference_policy="derive_to_prompt")
    assert p5["mode"]=="t2v"
    assert any(x["derivation"]=="product_description" for x in p5["derivedReferences"])

    # 6. Must-use raw soft ref + derive policy blocks.
    p6=plan_flux3_inputs(soft,soft_reference_policy="derive_to_prompt")
    assert p6["blocked"] is True

    # 7. Source video => v2v.
    sv=[{"assetId":"tail","role":"source_video","mediaType":"video","referencePurposes":["source_video_continuation"]}]
    p7=plan_flux3_inputs(sv,requested_mode="auto",duration_seconds=8,continuation_tail_seconds=4)
    assert p7["mode"]=="v2v" and p7["startVideoAssetId"]=="tail"

    # 8. Arbitrary motion video is guidance, not start_video.
    pm=plan_flux3_inputs([{"assetId":"m","role":"motion_reference","mediaType":"video","referencePurposes":["motion","camera_motion"],"providerUsePolicy":"may_derive"}],duration_seconds=8)
    assert pm["mode"]=="t2v"
    assert any(x["derivation"]=="motion_description" for x in pm["derivedReferences"])

    # 9. Raw arbitrary audio reference is unsupported.
    pa=plan_flux3_inputs([{"assetId":"a","role":"voice_reference","mediaType":"audio","providerUsePolicy":"must_use_raw"}],duration_seconds=8)
    assert pa["blocked"] is True

    # 10. One start keyframe uses official shorthand.
    payload=build_payload(
      keyframe_plan=p,prompt_text="continue",duration=8,resolution="hd",aspect_ratio="9:16",
      media_inputs={"s":"data:image/png;base64,AAA"}
    )
    assert isinstance(payload["keyframes"],str)

    # 11. Multiple keyframes use timestamp pairs.
    payload2=build_payload(
      keyframe_plan=p2,prompt_text="transition",duration=10,resolution="fhd",aspect_ratio="16:9",
      media_inputs={"s":"start","e":"end"}
    )
    assert payload2["keyframes"]==[[0.0,"start"],[10.0,"end"]]

    # 12. V2V output duration max is 15s.
    try:
        build_payload(keyframe_plan=p7,prompt_text="continue",duration=16,media_inputs={"tail":"video"})
    except Flux3AdapterError:
        pass
    else:
        raise AssertionError("FLUX v2v >15s must fail.")

    # 13. Draft enhance is deterministic handoff.
    assert build_draft_enhance_payload("CACHE")["mode"]=="draft_enhance"

    # 14. Submit response carries polling URL.
    ns=normalize_submit_response({"id":"id1","polling_url":"https://poll","cost":1})
    assert ns["status"]=="submitted" and ns["pollingUrl"]=="https://poll"

    # 15. Result normalization handles Ready.
    nr=normalize_result_response({"status":"Ready","result":{"sample":"https://x/out.mp4","draft_cache":"https://x/cache"}})
    assert nr["status"]=="succeeded" and nr["draftCache"]

    # 16. Multi-scene prompt does not invent timestamp syntax.
    cp=compile_flux3_prompt(
      mode="t2v",duration_seconds=10,scene_description="Ad.",
      shots=[{"description":"Hook"},{"description":"Demo"}]
    )
    assert "Shot 1:" in cp["promptText"] and cp["warnings"]

    # 17. Execution blocks unresolved prebake dependency.
    cpp=compile_flux3_prompt(mode="i2v",duration_seconds=8,scene_description="Product.")
    try:
        build_execution_plan(
          assets=soft,prompt=cpp,media_inputs={},duration_seconds=8,
          soft_reference_policy="prebake_keyframe"
        )
    except Flux3AdapterError:
        pass
    else:
        raise AssertionError("FLUX soft ref must be prebaked before execution.")

    # 18. Generic bounded V2V long-form plan uses <=4s continuation tail.
    chain=plan_bounded_reference_continuation_chain(
      target_total_seconds=30,min_segment_seconds=5,max_segment_seconds=15,
      preferred_segment_seconds=15,tail_seconds=4,tail_min_seconds=1,tail_max_seconds=4
    )
    assert chain.exact and [x.duration_seconds for x in chain.segments]==[15,15]

    print("PASS: 18 FLUX 3 integration regression checks")

if __name__=="__main__":
    run()
