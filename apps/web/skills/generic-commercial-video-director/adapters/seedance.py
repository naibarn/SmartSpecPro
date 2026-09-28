from __future__ import annotations
from typing import Any
from .seedance_reference_planner import plan_seedance_references, validate_seedance_limits, MODELS

CREATE_URL="https://operator.las.ap-southeast-1.bytepluses.com/api/v1/contents/generations/tasks"
QUERY_URL_TEMPLATE="https://operator.las.ap-southeast-1.bytepluses.com/api/v1/contents/generations/tasks/{task_id}"

class SeedanceAdapterError(ValueError):
    pass

def _url_item(asset_id:str,media_type:str,role:str,
              asset_inputs:dict[str,str],asset_map:dict[str,dict[str,Any]])->dict[str,Any]:
    a=asset_map.get(asset_id,{})
    bh=((a.get("providerHints") or {}).get("byteplus") or {})
    if bh.get("materialLibraryApproved") and bh.get("materialLibraryAssetId"):
        value=f"asset://{bh['materialLibraryAssetId']}"
    else:
        value=asset_inputs.get(asset_id)
    if not value:
        raise SeedanceAdapterError(f"Missing BytePlus provider input for asset {asset_id}.")
    if media_type=="image":
        return {"type":"image_url","image_url":{"url":value},"role":role}
    if media_type=="video":
        return {"type":"video_url","video_url":{"url":value},"role":role}
    if media_type=="audio":
        return {"type":"audio_url","audio_url":{"url":value},"role":role}
    raise SeedanceAdapterError(f"Unsupported Seedance media type {media_type}.")

def choose_resolution(model:str,mode:str,requested:str="auto",has_reference_images:bool=False)->str:
    if model not in MODELS:
        raise SeedanceAdapterError("Unsupported Seedance model.")
    if requested=="auto":
        # Production default favors 720p because it is accepted by all current 2.x modes.
        return "720p"
    if model=="dreamina-seedance-2-5-260628" and requested not in {"480p","720p"}:
        raise SeedanceAdapterError("Seedance 2.5 current BytePlus endpoint supports only 480p/720p.")
    if model=="dreamina-seedance-2-0-260128":
        if requested not in {"480p","720p","1080p","4k"}:
            raise SeedanceAdapterError("Invalid Seedance 2.0 resolution.")
        if requested=="1080p" and has_reference_images:
            raise SeedanceAdapterError("Seedance 2.0 1080p is not supported in reference-image scenarios.")
    return requested

def validate_duration(model:str,duration:int)->None:
    caps=MODELS[model]
    if not caps["min_duration"]<=int(duration)<=caps["max_duration"]:
        raise SeedanceAdapterError(
            f"{caps['name']} duration must be {caps['min_duration']}-{caps['max_duration']} seconds."
        )

def build_generation_payload(
    *,
    reference_plan:dict[str,Any],
    prompt_text:str,
    assets:list[dict[str,Any]],
    asset_inputs:dict[str,str],
    duration:int,
    resolution:str,
    ratio:str="adaptive",
    generate_audio:bool=True,
    return_last_frame:bool=True,
    watermark:bool=False,
    seed:int|None=None,
    callback_url:str|None=None,
    execution_expires_after:int=172800,
) -> dict[str,Any]:
    model=reference_plan["model"]
    validate_duration(model,duration)
    errors=validate_seedance_limits(reference_plan)
    if errors:
        raise SeedanceAdapterError("; ".join(errors))
    if reference_plan.get("conflictResolution") in {"blocked","split_generation","prebake_hard_frame"}:
        raise SeedanceAdapterError(
            f"Seedance reference plan requires {reference_plan.get('conflictResolution')} before a single provider request can be built."
        )

    mode=reference_plan["mode"]
    has_ref_images=bool(reference_plan.get("referenceImages"))
    resolution=choose_resolution(model,mode,resolution,has_reference_images=has_ref_images)
    if ratio not in {"16:9","4:3","1:1","3:4","9:16","21:9","adaptive"}:
        raise SeedanceAdapterError("Unsupported Seedance aspect ratio.")

    asset_map={a["assetId"]:a for a in assets}
    content=[{"type":"text","text":prompt_text}]

    # BytePlus exposes first-frame / first-last capabilities in the model matrix.
    # SmartAIHub maps those explicit roles into the content contract.
    first=reference_plan["hardFrames"].get("firstFrameAssetId")
    last=reference_plan["hardFrames"].get("lastFrameAssetId")
    if first:
        content.append(_url_item(first,"image","first_frame",asset_inputs,asset_map))
    if last:
        content.append(_url_item(last,"image","last_frame",asset_inputs,asset_map))

    for r in reference_plan.get("referenceImages",[]):
        content.append(_url_item(r["assetId"],"image","reference_image",asset_inputs,asset_map))
    for r in reference_plan.get("referenceVideos",[]):
        content.append(_url_item(r["assetId"],"video","reference_video",asset_inputs,asset_map))
    for r in reference_plan.get("referenceAudios",[]):
        content.append(_url_item(r["assetId"],"audio","reference_audio",asset_inputs,asset_map))

    payload={
        "model":model,
        "content":content,
        "return_last_frame":bool(return_last_frame),
        "execution_expires_after":int(execution_expires_after),
        "generate_audio":bool(generate_audio),
        "resolution":resolution,
        "ratio":ratio,
        "duration":int(duration),
        "watermark":bool(watermark),
    }
    if seed is not None:payload["seed"]=int(seed)
    if callback_url:payload["callback_url"]=callback_url
    return payload

def build_execution_plan(
    *,
    assets:list[dict[str,Any]],
    prompt:dict[str,Any],
    asset_inputs:dict[str,str],
    model:str,
    requested_mode:str="auto",
    duration_seconds:int=8,
    requested_resolution:str="auto",
    ratio:str="adaptive",
    conflict_policy:str="auto",
    reference_budget_policy:str="quality_first",
    real_human_face_policy:str="require_material_library",
    direct_hard_frame_reference_mix_verified:bool=False,
    generate_audio:str="auto",
    return_last_frame:bool=True,
    watermark:bool=False,
    seed:int|None=None,
    callback_url:str|None=None,
    execution_expires_after:int=172800,
    prebaked_first_frame_asset_id:str|None=None,
) -> dict[str,Any]:
    plan=plan_seedance_references(
        assets,
        model=model,
        requested_mode=requested_mode,
        conflict_policy=conflict_policy,
        reference_budget_policy=reference_budget_policy,
        real_human_face_policy=real_human_face_policy,
        direct_hard_frame_reference_mix_verified=direct_hard_frame_reference_mix_verified,
    )
    if plan["conflictResolution"]=="blocked":
        raise SeedanceAdapterError("Seedance planning blocked by invalid/unsupported required inputs or material-library requirements.")
    if plan["conflictResolution"]=="split_generation":
        raise SeedanceAdapterError("Seedance hard frame + must-use raw multimodal refs require a split workflow.")
    if plan["conflictResolution"]=="prebake_hard_frame":
        if not prebaked_first_frame_asset_id:
            raise SeedanceAdapterError("Seedance prebake_hard_frame requires an approved prebaked first frame before video generation.")
        plan=dict(plan)
        plan["hardFrames"]=dict(plan["hardFrames"])
        plan["hardFrames"]["firstFrameAssetId"]=prebaked_first_frame_asset_id
        plan["conflictResolution"]="none"
        # The prebaked asset may have been created after initial asset list.
        if prebaked_first_frame_asset_id not in {a["assetId"] for a in assets}:
            assets=list(assets)+[{"assetId":prebaked_first_frame_asset_id,"role":"start_frame","mediaType":"image"}]

    has_ref_images=bool(plan["referenceImages"])
    res=choose_resolution(model,plan["mode"],requested_resolution,has_reference_images=has_ref_images)
    payload=build_generation_payload(
        reference_plan=plan,prompt_text=prompt["promptText"],assets=assets,asset_inputs=asset_inputs,
        duration=duration_seconds,resolution=res,ratio=ratio,generate_audio=generate_audio!="off",
        return_last_frame=return_last_frame,watermark=watermark,seed=seed,
        callback_url=callback_url,execution_expires_after=execution_expires_after
    )

    qc=[
        "SEEDANCE_REFERENCE_RETENTION","SEEDANCE_CHARACTER_IDENTITY","SEEDANCE_PRODUCT_PLACE_IDENTITY",
        "SEEDANCE_ACTION_CHRONOLOGY","SEEDANCE_NATIVE_AUDIO_SYNC","SEEDANCE_DIALOGUE_LIPSYNC"
    ]
    if plan["hardFrames"]["firstFrameAssetId"]:qc.append("SEEDANCE_START_FRAME_ADHERENCE")
    if plan["hardFrames"]["lastFrameAssetId"]:qc.append("SEEDANCE_LAST_FRAME_ADHERENCE")
    if plan["referenceVideos"]:qc+=["SEEDANCE_MOTION_REFERENCE","SEEDANCE_CAMERA_REFERENCE"]
    if model=="dreamina-seedance-2-5-260628":qc.append("SEEDANCE_2_5_LONGFORM_CONTINUITY")

    return {
        "model":model,
        "mode":plan["mode"],
        "durationSeconds":int(duration_seconds),
        "resolution":res,
        "ratio":ratio,
        "referencePlan":plan,
        "prompt":prompt,
        "generationPayload":payload,
        "preProcessing":{
            "materialLibraryRequired":bool(plan["materialLibraryRequirements"]),
            "prebakeHardFrame":False,
            "referenceBudgetResolved":True
        },
        "postGeneration":{
            "returnLastFrame":bool(return_last_frame),
            "externalAssemblyForLongForm":model=="dreamina-seedance-2-5-260628",
            "postCompositeExactTextUI":True
        },
        "qcRequirements":qc,
        "warnings":list(plan.get("warnings",[]))+list(prompt.get("warnings",[]))
    }

def build_query_url(task_id:str)->str:
    if not task_id:raise SeedanceAdapterError("task_id is required.")
    return QUERY_URL_TEMPLATE.format(task_id=task_id)

def normalize_task_response(response:dict[str,Any])->dict[str,Any]:
    content=response.get("content") or {}
    status=str(response.get("status") or "").lower()
    return {
        "providerJobId":response.get("id"),
        "model":response.get("model"),
        "status":{
            "queued":"queued","running":"running","cancelled":"cancelled",
            "succeeded":"succeeded","failed":"failed","expired":"expired"
        }.get(status,"unknown"),
        "outputUrl":content.get("video_url"),
        "lastFrameUrl":content.get("last_frame_url") or content.get("last_frame"),
        "resolution":response.get("resolution"),
        "ratio":response.get("ratio"),
        "actualDurationSeconds":response.get("duration"),
        "fps":response.get("framespersecond"),
        "generateAudio":response.get("generate_audio"),
        "seed":response.get("seed"),
        "usage":response.get("usage"),
        "error":response.get("error"),
        "raw":response,
    }
