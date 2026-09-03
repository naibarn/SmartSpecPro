from __future__ import annotations
from typing import Any
from .wan3_reference_planner import plan_wan3_references, validate_wan3_limits

class Wan3AdapterError(ValueError):
    pass

REGION_HOSTS={
    "ap-southeast-1":"ap-southeast-1.maas.aliyuncs.com",
    "cn-beijing":"cn-beijing.maas.aliyuncs.com",
    "us-east-1":"us-east-1.maas.aliyuncs.com",
    "ap-northeast-1":"ap-northeast-1.maas.aliyuncs.com",
    "eu-central-1":"eu-central-1.maas.aliyuncs.com",
    "cn-hongkong":"cn-hongkong.maas.aliyuncs.com",
}

def build_create_url(workspace_id:str,region:str="ap-southeast-1")->str:
    if not workspace_id:raise Wan3AdapterError("workspace_id is required.")
    host=REGION_HOSTS.get(region)
    if not host:raise Wan3AdapterError(f"Unsupported Wan region {region!r}.")
    return f"https://{workspace_id}.{host}/api/v1/services/aigc/video-generation/video-synthesis"

def build_query_url(workspace_id:str,task_id:str,region:str="ap-southeast-1")->str:
    if not task_id:raise Wan3AdapterError("task_id is required.")
    host=REGION_HOSTS.get(region)
    if not host:raise Wan3AdapterError(f"Unsupported Wan region {region!r}.")
    return f"https://{workspace_id}.{host}/api/v1/tasks/{task_id}"

def required_headers()->dict[str,str]:
    return {"Content-Type":"application/json","X-DashScope-Async":"enable"}

def _media_value(asset_id:str,asset_inputs:dict[str,str])->str:
    v=asset_inputs.get(asset_id)
    if not v:raise Wan3AdapterError(f"Missing Wan provider input for asset {asset_id}.")
    return v

def _asset_meta(assets:list[dict[str,Any]])->dict[str,dict[str,Any]]:
    return {a["assetId"]:dict(a.get("mediaMetadata") or {}) for a in assets}

def _validate_video_input_plus_output(plan:dict[str,Any],assets:list[dict[str,Any]],duration:int|None,smart_duration:bool)->list[str]:
    warnings=[]
    if not plan.get("referenceVideos"):
        return warnings
    meta=_asset_meta(assets)
    total=0.0
    missing=[]
    for r in plan["referenceVideos"]:
        d=meta.get(r["assetId"],{}).get("durationSeconds")
        if d is None:
            missing.append(r["assetId"])
        else:
            total+=float(d)
    if missing:
        raise Wan3AdapterError(
            "Wan 3.0 video-input requests require duration metadata for preflight because input-video + output must be <=30s. "
            f"Missing duration for: {', '.join(missing)}"
        )
    if not smart_duration and duration is not None and total+float(duration)>30:
        raise Wan3AdapterError(
            f"Wan 3.0 video input total {total:g}s + requested output {duration}s exceeds 30s."
        )
    if smart_duration:
        warnings.append(
            f"Wan smart-duration request contains {total:g}s input video; provider must choose an output that keeps input+output <=30s."
        )
    return warnings

def choose_resolution(requested:str="auto")->str:
    if requested=="auto":return "1080P"
    if requested not in {"480P","720P","1080P"}:
        raise Wan3AdapterError("Wan resolution must be 480P/720P/1080P.")
    return requested

def build_generation_payload(
    *,
    reference_plan:dict[str,Any],
    prompt_text:str,
    assets:list[dict[str,Any]],
    asset_inputs:dict[str,str],
    resolution:str="1080P",
    ratio:str="adaptive",
    duration:int|None=5,
    smart_duration:bool=False,
    generate_audio:bool=True,
    prompt_extend:bool=True,
) -> tuple[dict[str,Any],list[str]]:
    if reference_plan.get("conflictResolution") in {"blocked","split_generation","prebake_hard_frame"}:
        raise Wan3AdapterError(
            f"Wan reference plan requires {reference_plan.get('conflictResolution')} before one provider request can be submitted."
        )
    errors=validate_wan3_limits(reference_plan,_asset_meta(assets))
    if errors:raise Wan3AdapterError("; ".join(errors))
    resolution=choose_resolution(resolution)
    if ratio not in {"16:9","4:3","1:1","3:4","9:16","adaptive"}:
        raise Wan3AdapterError("Unsupported Wan ratio.")
    if smart_duration:
        provider_duration=-1
    else:
        if duration is None or not 2<=int(duration)<=30:
            raise Wan3AdapterError("Wan exact duration must be 2-30 seconds.")
        provider_duration=int(duration)

    warnings=_validate_video_input_plus_output(reference_plan,assets,duration,smart_duration)

    media=[]
    first=reference_plan["hardFrames"].get("firstFrameAssetId")
    last=reference_plan["hardFrames"].get("lastFrameAssetId")
    if first:media.append({"type":"first_frame","url":_media_value(first,asset_inputs)})
    if last:media.append({"type":"last_frame","url":_media_value(last,asset_inputs)})
    for r in reference_plan.get("referenceImages",[]):
        media.append({"type":"reference_image","url":_media_value(r["assetId"],asset_inputs)})
    for r in reference_plan.get("referenceVideos",[]):
        media.append({"type":"reference_video","url":_media_value(r["assetId"],asset_inputs)})
    for r in reference_plan.get("referenceAudios",[]):
        media.append({"type":"reference_audio","url":_media_value(r["assetId"],asset_inputs)})
    if reference_plan.get("documentReference"):
        aid=reference_plan["documentReference"]["assetId"]
        media.append({"type":"file","url":_media_value(aid,asset_inputs)})
    if reference_plan.get("webReference"):
        aid=reference_plan["webReference"]["assetId"]
        media.append({"type":"link","url":_media_value(aid,asset_inputs)})

    input_obj={"prompt":prompt_text}
    if media:input_obj["media"]=media
    payload={
        "model":reference_plan["model"],
        "input":input_obj,
        "parameters":{
            "resolution":resolution,
            "ratio":ratio,
            "duration":provider_duration,
            "audio":bool(generate_audio),
            "prompt_extend":bool(prompt_extend),
        }
    }
    return payload,warnings

def build_execution_plan(
    *,
    assets:list[dict[str,Any]],
    prompt:dict[str,Any],
    asset_inputs:dict[str,str],
    model:str="wan3.0-video",
    requested_mode:str="auto",
    requested_resolution:str="auto",
    ratio:str="adaptive",
    duration_policy:str="exact",
    conflict_policy:str="auto",
    reference_budget_policy:str="quality_first",
    generate_audio:str="auto",
    prompt_extend:bool=True,
    prebaked_first_frame_asset_id:str|None=None,
    prebaked_last_frame_asset_id:str|None=None,
) -> dict[str,Any]:
    plan=plan_wan3_references(
        assets,model=model,requested_mode=requested_mode,
        conflict_policy=conflict_policy,reference_budget_policy=reference_budget_policy
    )
    if plan["conflictResolution"]=="blocked":
        raise Wan3AdapterError("Wan planning is blocked by incompatible required inputs or provider limits.")
    if plan["conflictResolution"]=="split_generation":
        raise Wan3AdapterError("Wan hard-frame + must-use raw references require a split workflow.")
    if plan["conflictResolution"]=="prebake_hard_frame":
        required=[]
        if plan["hardFrames"]["firstFrameAssetId"]:required.append("first")
        if plan["hardFrames"]["lastFrameAssetId"]:required.append("last")
        if "first" in required and not prebaked_first_frame_asset_id:
            raise Wan3AdapterError("Wan prebake_hard_frame requires approved prebaked first frame.")
        if "last" in required and not prebaked_last_frame_asset_id:
            raise Wan3AdapterError("Wan prebake_hard_frame requires approved prebaked last frame.")
        plan=dict(plan);plan["hardFrames"]=dict(plan["hardFrames"]);plan["conflictResolution"]="none"
        new_assets=list(assets)
        if prebaked_first_frame_asset_id:
            plan["hardFrames"]["firstFrameAssetId"]=prebaked_first_frame_asset_id
            if prebaked_first_frame_asset_id not in {a["assetId"] for a in new_assets}:
                new_assets.append({"assetId":prebaked_first_frame_asset_id,"role":"start_frame","mediaType":"image"})
        if prebaked_last_frame_asset_id:
            plan["hardFrames"]["lastFrameAssetId"]=prebaked_last_frame_asset_id
            if prebaked_last_frame_asset_id not in {a["assetId"] for a in new_assets}:
                new_assets.append({"assetId":prebaked_last_frame_asset_id,"role":"end_frame","mediaType":"image"})
        assets=new_assets

    smart=duration_policy=="smart" or bool(prompt.get("smartDuration"))
    duration=None if smart else prompt.get("durationSeconds")
    res=choose_resolution(requested_resolution)
    payload,warnings=build_generation_payload(
        reference_plan=plan,prompt_text=prompt["promptText"],assets=assets,asset_inputs=asset_inputs,
        resolution=res,ratio=ratio,duration=duration,smart_duration=smart,
        generate_audio=generate_audio!="off",prompt_extend=prompt_extend
    )
    qc=[
        "WAN_PROMPT_ADHERENCE","WAN_REFERENCE_RETENTION","WAN_CHARACTER_IDENTITY",
        "WAN_PRODUCT_PLACE_IDENTITY","WAN_ACTION_CHRONOLOGY","WAN_NATIVE_AUDIO_SYNC",
        "WAN_DIALOGUE_LIPSYNC"
    ]
    if plan["hardFrames"]["firstFrameAssetId"]:qc.append("WAN_START_FRAME_ADHERENCE")
    if plan["hardFrames"]["lastFrameAssetId"]:qc.append("WAN_LAST_FRAME_ADHERENCE")
    if plan["referenceVideos"]:qc+=["WAN_MOTION_REFERENCE","WAN_CAMERA_REFERENCE"]
    if len(prompt.get("shotTimeline") or [])>1:qc.append("WAN_NATIVE_MULTISHOT_TIMING")
    if plan["mode"]=="video_extend":qc.append("WAN_EXTENSION_CONTINUITY")
    if plan["mode"]=="video_edit":qc.append("WAN_EDIT_PRESERVATION")

    return {
        "model":model,
        "mode":plan["mode"],
        "durationSeconds":None if smart else int(duration),
        "resolution":res,
        "ratio":ratio,
        "referencePlan":plan,
        "prompt":prompt,
        "generationPayload":payload,
        "postGeneration":{
            "downloadBeforeUrlExpiry":True,
            "postCompositeExactTextUI":True,
            "externalAssembly":False
        },
        "qcRequirements":qc,
        "warnings":list(plan.get("warnings",[]))+list(prompt.get("warnings",[]))+warnings
    }

def normalize_create_response(response:dict[str,Any])->dict[str,Any]:
    output=response.get("output") or {}
    status=str(output.get("task_status") or "").upper()
    return {
        "providerJobId":output.get("task_id"),
        "status":{
            "PENDING":"queued","RUNNING":"running","SUCCEEDED":"succeeded",
            "FAILED":"failed","CANCELED":"cancelled","UNKNOWN":"unknown"
        }.get(status,"unknown"),
        "requestId":response.get("request_id"),
        "raw":response
    }

def normalize_task_response(response:dict[str,Any])->dict[str,Any]:
    output=response.get("output") or {}
    status=str(output.get("task_status") or "").upper()
    return {
        "providerJobId":output.get("task_id"),
        "status":{
            "PENDING":"queued","RUNNING":"running","SUCCEEDED":"succeeded",
            "FAILED":"failed","CANCELED":"cancelled","UNKNOWN":"unknown"
        }.get(status,"unknown"),
        "outputUrl":output.get("video_url"),
        "originalPrompt":output.get("orig_prompt"),
        "errorCode":output.get("code") or response.get("code"),
        "errorMessage":output.get("message") or response.get("message"),
        "requestId":response.get("request_id"),
        "raw":response
    }
