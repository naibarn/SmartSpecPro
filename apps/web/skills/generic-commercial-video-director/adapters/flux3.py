from __future__ import annotations
from typing import Any
from .flux3_reference_planner import plan_flux3_inputs

CREATE_URL="https://api.bfl.ai/v1/flux-3-video"

class Flux3AdapterError(ValueError):
    pass

def _input_value(value:str|dict[str,Any])->str:
    """FLUX keyframes/start_video accept provider-compatible image/video strings.
    SmartAIHub may pass a data URI or other BFL-supported encoded/url value.
    """
    if isinstance(value,str):
        return value
    if isinstance(value,dict):
        for k in ("data_uri","url","value"):
            if value.get(k):
                return str(value[k])
    raise Flux3AdapterError("FLUX media input must resolve to a provider-compatible string.")

def validate_duration(mode:str,duration:int)->None:
    maximum=15 if mode=="v2v" else 20
    if not 5<=int(duration)<=maximum:
        raise Flux3AdapterError(f"FLUX 3 {mode} duration must be 5-{maximum}s.")

def build_payload(
    *,
    keyframe_plan:dict[str,Any],
    prompt_text:str,
    duration:int,
    resolution:str="hd",
    aspect_ratio:str="auto",
    generate_audio:bool=True,
    media_inputs:dict[str,str|dict[str,Any]]|None=None,
    draft:bool=False,
    safety_tolerance:int=2,
    version:str="latest",
    draft_cache:str|None=None,
) -> dict[str,Any]:
    media_inputs=media_inputs or {}
    mode=keyframe_plan["mode"]
    if keyframe_plan.get("blocked"):
        raise Flux3AdapterError("FLUX keyframe/reference plan is blocked.")
    if keyframe_plan.get("prebakeRequired"):
        raise Flux3AdapterError("FLUX plan requires approved prebaked keyframe(s) before video submission.")
    if mode=="draft_enhance":
        if not draft_cache:
            raise Flux3AdapterError("FLUX draft_enhance requires draft_cache.")
        return {"mode":"draft_enhance","draft_cache":draft_cache}

    validate_duration(mode,duration)
    if resolution not in {"hd","fhd"}:
        raise Flux3AdapterError("FLUX resolution must be hd or fhd.")
    if aspect_ratio not in {"auto","21:9","2:1","16:9","4:3","1:1","3:4","9:16"}:
        raise Flux3AdapterError("Unsupported FLUX aspect ratio.")
    if not 0<=int(safety_tolerance)<=4:
        raise Flux3AdapterError("FLUX safety_tolerance must be 0-4.")

    payload={
        "mode":mode,
        "prompt":prompt_text,
        "aspect_ratio":aspect_ratio,
        "duration":int(duration),
        "resolution":resolution,
        "version":version,
        "generate_audio":bool(generate_audio),
        "safety_tolerance":int(safety_tolerance),
        "draft":bool(draft),
    }

    if mode=="i2v":
        kfs=keyframe_plan.get("keyframes") or []
        if not kfs:
            raise Flux3AdapterError("FLUX i2v requires at least one literal keyframe.")
        if len(kfs)>10:
            raise Flux3AdapterError("FLUX i2v supports at most 10 keyframes.")
        resolved=[]
        for k in kfs:
            aid=k["assetId"]
            if aid not in media_inputs:
                raise Flux3AdapterError(f"Missing FLUX media input for keyframe {aid}.")
            resolved.append([float(k["timeSeconds"]),_input_value(media_inputs[aid])])
        # Official shorthand: a single image represents exact opening frame.
        if len(resolved)==1 and abs(resolved[0][0])<1e-9:
            payload["keyframes"]=resolved[0][1]
        else:
            payload["keyframes"]=resolved

    elif mode=="v2v":
        aid=keyframe_plan.get("startVideoAssetId")
        if not aid or aid not in media_inputs:
            raise Flux3AdapterError("FLUX v2v requires start_video input.")
        payload["start_video"]=_input_value(media_inputs[aid])

    elif mode!="t2v":
        raise Flux3AdapterError(f"Unsupported FLUX mode {mode}.")

    return payload

def build_execution_plan(
    *,
    assets:list[dict[str,Any]],
    prompt:dict[str,Any],
    media_inputs:dict[str,str|dict[str,Any]],
    requested_mode:str="auto",
    duration_seconds:int=8,
    resolution:str="hd",
    aspect_ratio:str="auto",
    keyframe_strategy:str="auto",
    soft_reference_policy:str="prebake_keyframe",
    timed_keyframes:list[dict[str,Any]]|None=None,
    draft_workflow:str="draft_then_enhance",
    generate_audio:str="auto",
    continuation_tail_seconds:float=4,
    safety_tolerance:int=2,
    prebaked_keyframes:list[dict[str,Any]]|None=None,
) -> dict[str,Any]:
    plan=plan_flux3_inputs(
        assets,
        requested_mode=requested_mode,
        duration_seconds=duration_seconds,
        timed_keyframes=timed_keyframes,
        keyframe_strategy=keyframe_strategy,
        soft_reference_policy=soft_reference_policy,
        continuation_tail_seconds=continuation_tail_seconds,
    )

    if plan["blocked"]:
        raise Flux3AdapterError("FLUX input plan is blocked by required unsupported references or invalid keyframes.")

    if plan["prebakeRequired"]:
        if not prebaked_keyframes:
            raise Flux3AdapterError("FLUX soft references require prebaked_keyframes before current public i2v submission.")
        # Replace planner's future dependency with approved literal keyframes.
        plan=dict(plan)
        plan["keyframes"]=list(prebaked_keyframes)
        plan["prebakeRequired"]=False
        plan["mode"]="i2v"

    # A V2V continuation receives only the selected tail/current source. The controller
    # owns actual tail extraction before this adapter.
    payload=build_payload(
        keyframe_plan=plan,
        prompt_text=prompt["promptText"],
        duration=duration_seconds,
        resolution=resolution,
        aspect_ratio=aspect_ratio,
        generate_audio=generate_audio!="off",
        media_inputs=media_inputs,
        draft=draft_workflow in {"draft_then_enhance","draft_only"},
        safety_tolerance=safety_tolerance,
    )

    qc=[
        "FLUX_PROMPT_ADHERENCE","FLUX_CHARACTER_IDENTITY","FLUX_PRODUCT_PLACE_IDENTITY",
        "FLUX_ACTION_CHRONOLOGY","FLUX_NATIVE_AUDIO_SYNC","FLUX_DIALOGUE_LIPSYNC"
    ]
    if plan["mode"]=="i2v":
        qc+=["FLUX_KEYFRAME_ADHERENCE","FLUX_START_END_STATE"]
    if plan["mode"]=="v2v":
        qc+=["FLUX_CONTINUATION_SEAM","FLUX_AUDIO_CONTINUITY"]

    return {
        "model":"flux-3-video",
        "mode":plan["mode"],
        "durationSeconds":int(duration_seconds),
        "resolution":resolution,
        "aspectRatio":aspect_ratio,
        "keyframePlan":plan,
        "prompt":prompt,
        "generationPayload":payload,
        "draftStrategy":{
            "workflow":draft_workflow,
            "initialDraft":draft_workflow in {"draft_then_enhance","draft_only"},
            "enhanceSelectedDraft":draft_workflow=="draft_then_enhance"
        },
        "postGeneration":{
            "postCompositeExactTextUI":True,
            "optionalVideoUpscale":True,
            "downloadResultPromptly":True
        },
        "qcRequirements":qc,
        "warnings":list(plan.get("warnings",[]))+list(prompt.get("warnings",[]))
    }

def build_draft_enhance_payload(draft_cache:str)->dict[str,Any]:
    if not draft_cache:
        raise Flux3AdapterError("draft_cache is required.")
    return {"mode":"draft_enhance","draft_cache":draft_cache}

def normalize_submit_response(response:dict[str,Any])->dict[str,Any]:
    return {
        "providerJobId":response.get("id"),
        "pollingUrl":response.get("polling_url"),
        "cost":response.get("cost"),
        "inputMegapixels":response.get("input_mp"),
        "outputMegapixels":response.get("output_mp"),
        "status":"submitted" if response.get("id") else "unknown",
        "raw":response,
    }

def normalize_result_response(response:dict[str,Any])->dict[str,Any]:
    status=str(response.get("status") or "").lower()
    result=response.get("result")
    output_url=None
    draft_cache=None
    if isinstance(result,dict):
        output_url=result.get("sample") or result.get("url") or result.get("video_url")
        draft_cache=result.get("draft_cache")
    elif isinstance(result,str):
        output_url=result
    return {
        "status":{
            "ready":"succeeded","succeeded":"succeeded","pending":"running",
            "requesting":"running","processing":"running","error":"failed","failed":"failed"
        }.get(status,status or "unknown"),
        "outputUrl":output_url,
        "draftCache":draft_cache,
        "raw":response,
    }
