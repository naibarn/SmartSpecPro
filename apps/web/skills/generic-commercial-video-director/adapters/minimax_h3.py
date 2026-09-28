from __future__ import annotations
from typing import Any

from .h3_reference_planner import plan_h3_references, validate_h3_reference_limits

CREATE_URL = "https://api.minimax.io/v2/video_generation"
CONTEXT_IR_URL = "https://api.minimax.io/v2/h3_context_ir"
REGENERATE_URL = "https://api.minimax.io/v2/video_regeneration"

class H3AdapterError(ValueError):
    pass

def validate_duration(model: str, duration: int) -> None:
    minimum = 4 if model == "MiniMax-H3" else 5
    if not minimum <= duration <= 15:
        raise H3AdapterError(f"{model} duration must be {minimum}-15 seconds.")

def validate_resolution(model: str, resolution: str) -> None:
    allowed = {"MiniMax-H3":{"768P","2K"}, "MiniMax-H3-Max":{"480P","768P"}}[model]
    if resolution not in allowed:
        raise H3AdapterError(f"{model} resolution must be one of {sorted(allowed)}.")

def _content_item(asset_id: str, provider_type: str, role: str, asset_urls: dict[str,str]) -> dict[str,Any]:
    url=asset_urls.get(asset_id)
    if not url:
        raise H3AdapterError(f"Missing provider-accessible URL for asset {asset_id}.")
    if provider_type=="image_url":
        return {"type":"image_url","image_url":{"url":url},"role":role}
    if provider_type=="video_url":
        return {"type":"video_url","video_url":{"url":url},"role":role}
    if provider_type=="audio_url":
        return {"type":"audio_url","audio_url":{"url":url},"role":role}
    raise H3AdapterError(f"Unsupported content type: {provider_type}")

def build_generation_payload(*, model:str, prompt_text:str, duration:int, resolution:str,
                             ratio:str, reference_plan:dict[str,Any],
                             asset_urls:dict[str,str], callback_url:str|None=None) -> dict[str,Any]:
    validate_duration(model,duration)
    validate_resolution(model,resolution)
    if not prompt_text.strip():
        raise H3AdapterError("H3 requires a non-empty text content item.")
    if reference_plan.get("conflictResolution")=="blocked":
        raise H3AdapterError("H3 reference plan is blocked.")
    mode=reference_plan["mode"]
    if mode=="t2va" and ratio=="adaptive":
        raise H3AdapterError("H3 T2VA requires a concrete non-adaptive ratio.")
    if mode in {"i2va","l2va","fl2va"}:
        ratio="adaptive"

    content=[{"type":"text","text":prompt_text}]
    for item in reference_plan.get("contentOrder",[]):
        content.append(_content_item(item["assetId"],item["providerType"],item["providerRole"],asset_urls))

    payload={"model":model,"content":content,"resolution":resolution,"duration":int(duration),"ratio":ratio}
    if callback_url:
        payload["callback_url"]=callback_url
    return payload

def build_context_ir_payload(*, prompt_text:str, duration:int, ratio:str,
                             reference_plan:dict[str,Any], asset_urls:dict[str,str],
                             callback_url:str|None=None) -> dict[str,Any]:
    if reference_plan["model"]!="MiniMax-H3":
        raise H3AdapterError("Current H3-Context-IR profile is for MiniMax-H3.")
    validate_duration("MiniMax-H3",duration)
    mode=reference_plan["mode"]
    if mode=="t2va" and ratio=="adaptive":
        raise H3AdapterError("H3 Context-IR T2VA requires a concrete ratio.")
    if mode in {"i2va","l2va","fl2va"}:
        ratio="adaptive"
    content=[{"type":"text","text":prompt_text}]
    for item in reference_plan.get("contentOrder",[]):
        content.append(_content_item(item["assetId"],item["providerType"],item["providerRole"],asset_urls))
    payload={"model":"MiniMax-H3","content":content,"duration":int(duration),"ratio":ratio}
    if callback_url:
        payload["callback_url"]=callback_url
    return payload

def build_regenerate_2k_payload(*, source_task_id:str|None=None, base_video_url:str|None=None,
                                prompt_text:str|None=None,
                                supporting_content:list[dict[str,Any]]|None=None,
                                callback_url:str|None=None, aigc_watermark:bool=False) -> dict[str,Any]:
    """Build H3 Regenerate-2K payload.

    source_task_id route reuses a succeeded hosted H3 generation task.

    base_video route is intended for a compatible H3 768P base video (including local
    H3-Base output). The official Full-2K examples submit the expanded prompt and, when
    applicable, the original keyframe/reference content again, followed by role=base_video.
    """
    if bool(source_task_id)==bool(base_video_url):
        raise H3AdapterError("Provide exactly one of source_task_id or base_video_url.")
    payload={"model":"MiniMax-H3","resolution":"2K","aigc_watermark":bool(aigc_watermark)}
    if source_task_id:
        payload["source_task_id"]=source_task_id
    else:
        if not prompt_text or not prompt_text.strip():
            raise H3AdapterError("base_video regeneration requires the expanded H3 prompt.")
        content=[{"type":"text","text":prompt_text}]
        content.extend(list(supporting_content or []))
        content.append({"type":"video_url","video_url":{"url":base_video_url},"role":"base_video"})
        payload["content"]=content
    if callback_url:
        payload["callback_url"]=callback_url
    return payload

def build_local_worker_plan(*, reference_plan:dict[str,Any], prompt_text:str, duration:int,
                            assets:list[dict[str,Any]], framework:str="sglang") -> dict[str,Any]:
    if framework not in {"sglang","vllm","diffusers","comfyui"}:
        raise H3AdapterError("Unsupported H3 local framework.")
    mode=reference_plan["mode"]
    variant="ref2va" if mode=="ref2va" else "fl2va"

    # Local H3-Base Ref2VA cannot use audio as the sole raw reference.
    refs=reference_plan["rawReferences"]
    if mode=="ref2va" and refs["audio"] and not (refs["images"] or refs["videos"]):
        raise H3AdapterError("Local H3-Base Ref2VA requires reference audio to be accompanied by image or video.")

    by_id={a["assetId"]:a for a in assets}
    selected_ids=[x["assetId"] for x in reference_plan.get("contentOrder",[])]
    selected=[]
    for aid in selected_ids:
        a=by_id.get(aid)
        if a:
            selected.append({
                "assetId":aid,"role":a.get("role"),"mediaType":a.get("mediaType"),
                "referencePurposes":a.get("referencePurposes",[]),
                "trim":a.get("trim"),"useEmbeddedAudio":a.get("useEmbeddedAudio")
            })

    return {
        "provider":"smartaihub-worker",
        "model":"MiniMax-H3-Base",
        "framework":framework,
        "modelVariant":variant,
        "generationMode":mode,
        "durationSeconds":duration,
        "targetResolution":"768P",
        "prompt":prompt_text,
        "assets":selected,
        "derivedReferences":reference_plan.get("derivedReferences",[]),
        "output":{"video":True,"nativeAudio":True},
        "nextStep":"optional_h3_regenerate_2k"
    }

def build_h3_execution_plan(*, assets:list[dict[str,Any]], prompt:dict[str,Any],
                            asset_urls:dict[str,str], model:str="MiniMax-H3",
                            execution_route:str="hosted_api",
                            resolution_workflow:str="draft_768p_then_regenerate_2k",
                            ratio:str="9:16", hard_frame_conflict_policy:str="auto",
                            authoritative_start:bool=True, callback_url:str|None=None,
                            local_framework:str="sglang") -> dict[str,Any]:
    ref_plan=plan_h3_references(
        assets,model=model,hard_frame_conflict_policy=hard_frame_conflict_policy,
        authoritative_start=authoritative_start
    )
    errors=validate_h3_reference_limits(ref_plan)
    if errors:
        raise H3AdapterError("; ".join(errors))
    if ref_plan["conflictResolution"]=="split_generation":
        raise H3AdapterError("H3 request requires a multi-stage split plan; a single generation payload cannot satisfy all raw-reference requirements.")

    duration=int(prompt["durationSeconds"])
    resolution="2K" if resolution_workflow=="direct_2k" else "768P"
    validate_resolution(model,resolution)

    generation_payload={}
    local_plan=None
    if execution_route=="hosted_api":
        generation_payload=build_generation_payload(
            model=model,prompt_text=prompt["promptText"],duration=duration,
            resolution=resolution,ratio=ratio,reference_plan=ref_plan,
            asset_urls=asset_urls,callback_url=callback_url
        )
    elif execution_route in {"local_worker","hybrid_local_768p_cloud_2k"}:
        if model!="MiniMax-H3":
            raise H3AdapterError("Local H3-Base route is only valid for MiniMax-H3 family, not H3-Max.")
        local_plan=build_local_worker_plan(
            reference_plan=ref_plan,prompt_text=prompt["promptText"],
            duration=duration,assets=assets,framework=local_framework
        )
    else:
        raise H3AdapterError(f"Unsupported execution route {execution_route}")

    variable_speech=any(x.get("languageSupport")=="variable" for x in prompt.get("speakerMap",[]))
    post={
        "regenerate2K": resolution_workflow=="draft_768p_then_regenerate_2k",
        "externalAssembly": False,
        "externalAudioOrLipSync": variable_speech,
        "postComposite": True
    }
    qc=[
        "H3_REFERENCE_RETENTION","H3_PRODUCT_IDENTITY","H3_CHARACTER_IDENTITY",
        "H3_ACTION_CHRONOLOGY","H3_NATIVE_AUDIO_SYNC","H3_SPEAKER_MAPPING",
        "H3_DIALOGUE_EXACTNESS","H3_NATIVE_MULTISHOT_CUT_TIMING"
    ]
    if post["regenerate2K"]:
        qc.append("H3_2K_REGENERATION_PRESERVATION")
    return {
        "model":model,"route":execution_route,"generationMode":ref_plan["mode"],
        "durationSeconds":duration,"resolutionWorkflow":resolution_workflow,
        "contextIR":None,"referencePlan":ref_plan,"prompt":prompt,
        "generationPayload":generation_payload,"localWorkerPlan":local_plan,
        "postGeneration":post,"qcRequirements":qc,
        "warnings":list(ref_plan.get("warnings",[]))+list(prompt.get("warnings",[]))
    }


QUERY_URL_TEMPLATE = "https://api.minimax.io/v2/query/video_generation/{task_id}"
CANCEL_URL_TEMPLATE = "https://api.minimax.io/v2/video_generation/{task_id}"

def build_query_url(task_id: str) -> str:
    if not task_id:
        raise H3AdapterError("task_id is required.")
    return QUERY_URL_TEMPLATE.format(task_id=task_id)

def build_cancel_or_delete_url(task_id: str) -> str:
    if not task_id:
        raise H3AdapterError("task_id is required.")
    return CANCEL_URL_TEMPLATE.format(task_id=task_id)

def cancel_or_delete_allowed(status: str) -> bool:
    """Official V2 behavior: queued can be cancelled; succeeded/failed can be deleted.
    running and already-cancelled tasks cannot be cancelled/deleted through this action.
    """
    return str(status).lower() in {"queued","succeeded","failed"}

def normalize_task_response(response: dict[str, Any]) -> dict[str, Any]:
    """Normalize the shared H3 V2 query response used for generation, Context-IR and regeneration."""
    task=response.get("task") or {}
    status=str(task.get("status") or "").lower()
    normalized_status={
        "queued":"queued",
        "running":"running",
        "succeeded":"succeeded",
        "failed":"failed",
        "cancelled":"cancelled",
    }.get(status,"unknown")
    content=task.get("content") or {}
    usage=task.get("usage") or {}
    return {
        "providerJobId":task.get("id"),
        "model":task.get("model"),
        "status":normalized_status,
        "taskType":task.get("task_type"),
        "modality":task.get("modality"),
        "outputUrl":content.get("url"),
        "enhancedPrompt":content.get("prompt"),
        "resolution":task.get("resolution"),
        "durationSeconds":task.get("duration"),
        "ratio":task.get("ratio"),
        "usage":{
            "totalSeconds":usage.get("total_seconds"),
            "inputSeconds":usage.get("input_seconds"),
            "outputSeconds":usage.get("output_seconds"),
            "inputImageCount":usage.get("input_image_count"),
            "inputAudioSeconds":usage.get("input_audio_seconds"),
            "totalTokens":usage.get("total_tokens"),
            "promptTokens":usage.get("prompt_tokens"),
            "completionTokens":usage.get("completion_tokens"),
        },
        "raw":response,
    }

def handle_callback_challenge(body: dict[str, Any]) -> dict[str, Any] | None:
    """MiniMax callback registration sends a challenge that must be echoed by the app."""
    challenge=body.get("challenge")
    return {"challenge":challenge} if challenge is not None else None

def validate_context_ir_result(*, canonical: dict[str, Any], enhanced_prompt: str) -> list[str]:
    """Static fail-closed validations before accepting official H3 Context-IR output.
    Semantic/product-claim checks are performed by the H3ContextIRValidatorAgent.
    """
    errors=[]
    if not enhanced_prompt or not enhanced_prompt.strip():
        errors.append("H3 Context-IR returned an empty prompt.")
    for line in canonical.get("exactDialogue",[]):
        if line and line not in enhanced_prompt:
            errors.append(f"Exact dialogue missing from H3 Context-IR output: {line}")
    for token in canonical.get("requiredReferenceLabels",[]):
        if token and token not in enhanced_prompt:
            errors.append(f"Required reference label missing from H3 Context-IR output: {token}")
    return errors
