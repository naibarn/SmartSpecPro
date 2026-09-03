from __future__ import annotations
from typing import Any

MODELS={
    "dreamina-seedance-2-0-260128":{
        "name":"Seedance 2.0","min_duration":4,"max_duration":15,
        "max_images":9,"max_videos":3,"max_audios":3,
        "video_each_max":15,"video_total_max":15,
        "audio_each_max":15,"audio_total_max":15,
        "audio_only":False,
    },
    "dreamina-seedance-2-5-260628":{
        "name":"Seedance 2.5","min_duration":4,"max_duration":30,
        "max_images":30,"max_videos":10,"max_audios":10,
        "video_each_max":30,"video_total_max":30,
        "audio_each_max":30,"audio_total_max":30,
        "audio_only":True,
    }
}

IMAGE_ROLES={
    "product_reference","character_reference","environment_reference","style_reference",
    "place_reference","venue_reference","storefront_reference","interior_reference",
    "exterior_reference","signage_reference","menu_reference","service_reference",
    "property_reference","facility_reference","map_reference","logo","ui_reference",
    "mechanism_reference","clay_render_reference"
}
VIDEO_ROLES={"video_reference","motion_reference","camera_reference","source_video"}
AUDIO_ROLES={"audio_reference","voice_reference","music_reference","sound_reference"}

def semantic_roles(a:dict[str,Any])->list[str]:
    result=list(a.get("referencePurposes") or [])
    defaults={
      "product_reference":["product_geometry","product_label"],
      "character_reference":["identity"],
      "environment_reference":["environment"],
      "style_reference":["style"],
      "place_reference":["place_identity","venue_layout","place_atmosphere"],
      "venue_reference":["place_identity","venue_layout","visible_feature"],
      "motion_reference":["motion"],
      "camera_reference":["camera_motion"],
      "video_reference":["motion","temporal_structure"],
      "source_video":["source_video_edit","source_video_continuation"],
      "voice_reference":["voice_timbre","voice_delivery"],
      "audio_reference":["audio_continuity"],
      "music_reference":["music_style"],
      "sound_reference":["sound_effect"],
      "ui_reference":["ui_source"],
      "clay_render_reference":["clay_render","blocking_reference","trajectory_reference"],
    }
    for x in defaults.get(a.get("role"),[]):
        if x not in result: result.append(x)
    return result

def _policy(a:dict[str,Any])->str:
    return a.get("providerUsePolicy","auto")

def _rank(a:dict[str,Any])->tuple[int,int,int]:
    sem=set(semantic_roles(a))
    score=30
    if "identity" in sem:score=100
    elif {"product_geometry","product_label"} & sem:score=96
    elif {"motion","camera_motion"} & sem:score=94
    elif {"voice_timbre","voice_delivery"} & sem:score=92
    elif {"place_identity","venue_layout"} & sem:score=90
    elif "clay_render" in sem:score=88
    elif "environment" in sem:score=70
    elif "style" in sem:score=50
    return (1 if _policy(a)=="must_use_raw" else 0,1 if a.get("sourceOfTruth") else 0,score)

def _derive(a:dict[str,Any])->str:
    sem=set(semantic_roles(a))
    if "identity" in sem:return "identity_description"
    if {"product_geometry","product_label"}&sem:return "product_description"
    if "motion" in sem:return "motion_description"
    if "camera_motion" in sem:return "camera_description"
    if {"voice_timbre","voice_delivery","audio_continuity"}&sem:return "audio_description"
    if {"place_identity","venue_layout"}&sem:return "place_description"
    if "clay_render" in sem:return "blocking_description"
    return "visual_description"

def _cap(items:list[dict[str,Any]],limit:int,policy:str,kind:str,
         derived:list[dict[str,Any]],non_provider:list[dict[str,Any]],warnings:list[str])->tuple[list[dict[str,Any]],bool]:
    if len(items)<=limit:return items,False
    total=len(items)
    if policy=="quality_first":
        items=sorted(items,key=_rank,reverse=True)
    keep=items[:limit];overflow=items[limit:]
    blocked=policy=="block_if_over_limit"
    warnings.append(f"{kind} reference count {total} exceeds Seedance model limit {limit}.")
    for a in overflow:
        if blocked or _policy(a)=="must_use_raw":
            blocked=True
            non_provider.append({"assetId":a["assetId"],"reason":f"{kind} reference budget exceeded.","preservedAs":"separate_stage"})
        else:
            derived.append({"sourceAssetId":a["assetId"],"derivation":_derive(a),"resultRole":"prompt_guidance"})
            non_provider.append({"assetId":a["assetId"],"reason":f"{kind} reference budget exceeded.","preservedAs":"derived_guidance"})
    return keep,blocked

def _material_library_requirement(a:dict[str,Any],real_human_policy:str)->tuple[dict[str,Any]|None,bool]:
    hints=((a.get("providerHints") or {}).get("byteplus") or {})
    contains=bool(hints.get("containsRealHumanFace"))
    if not contains:return None,False
    approved=bool(hints.get("materialLibraryApproved")) and bool(hints.get("materialLibraryAssetId"))
    if approved:
        return {"assetId":a["assetId"],"required":True,"reason":"Real-human image/video uses approved BytePlus LAS material-library asset."},False
    if real_human_policy in {"require_material_library","allow_only_if_verified","block"}:
        return {"assetId":a["assetId"],"required":True,"reason":"BytePlus Seedance 2.x direct real-human image/video reference requires approved LAS material-library asset ID."},True
    return None,False

def plan_seedance_references(
    assets:list[dict[str,Any]],
    *,
    model:str,
    requested_mode:str="auto",
    conflict_policy:str="auto",
    authoritative_start:bool=True,
    reference_budget_policy:str="quality_first",
    real_human_face_policy:str="require_material_library",
    direct_hard_frame_reference_mix_verified:bool=False,
) -> dict[str,Any]:
    if model not in MODELS:
        raise ValueError("Unsupported Seedance 2.x model.")
    caps=MODELS[model]

    first=next((a for a in assets if a.get("role")=="start_frame"),None)
    last=next((a for a in assets if a.get("role")=="end_frame"),None)
    images=[];videos=[];audios=[];derived=[];non_provider=[];warnings=[];material=[]
    blocked=False

    for a in assets:
        if a.get("role") in {"start_frame","end_frame"}:
            req,b=_material_library_requirement(a,real_human_face_policy)
            if req:material.append(req)
            blocked|=b
            continue
        pol=_policy(a)
        if pol=="analysis_only":
            non_provider.append({"assetId":a["assetId"],"reason":"providerUsePolicy=analysis_only","preservedAs":"analysis_only"})
            continue
        if pol=="post_only":
            non_provider.append({"assetId":a["assetId"],"reason":"providerUsePolicy=post_only","preservedAs":"post_only"})
            continue

        role=a.get("role");mt=a.get("mediaType")
        if mt=="image" and (role in IMAGE_ROLES or a.get("referencePurposes")):
            images.append(a)
            req,b=_material_library_requirement(a,real_human_face_policy)
            if req:material.append(req)
            blocked|=b
        elif mt=="video" or role in VIDEO_ROLES:
            videos.append(a)
            req,b=_material_library_requirement(a,real_human_face_policy)
            if req:material.append(req)
            blocked|=b
        elif mt=="audio" or role in AUDIO_ROLES:
            audios.append(a)

    images,b=_cap(images,caps["max_images"],reference_budget_policy,"image",derived,non_provider,warnings);blocked|=b
    videos,b=_cap(videos,caps["max_videos"],reference_budget_policy,"video",derived,non_provider,warnings);blocked|=b
    audios,b=_cap(audios,caps["max_audios"],reference_budget_policy,"audio",derived,non_provider,warnings);blocked|=b

    if audios and not caps["audio_only"] and not (images or videos):
        blocked=True
        warnings.append("Seedance 2.0 does not support audio-only reference; add at least one image/video reference.")

    hard=bool(first or last)
    refs=bool(images or videos or audios)
    conflict=hard and refs
    resolution="none"

    if conflict:
        policy=conflict_policy
        if direct_hard_frame_reference_mix_verified and policy in {"auto","provider_verified_mix"}:
            policy="provider_verified_mix"
        elif policy=="provider_verified_mix" and not direct_hard_frame_reference_mix_verified:
            policy="block"
            warnings.append("Direct hard-frame + arbitrary multimodal reference mixing is not verified for the configured BytePlus endpoint.")

        if policy=="auto":
            must_raw_nonvisual=any(_policy(a)=="must_use_raw" for a in videos+audios)
            if authoritative_start and must_raw_nonvisual:
                policy="split_generation"
            elif authoritative_start and images and not (videos or audios):
                policy="prebake_hard_frame"
            elif authoritative_start:
                policy="prefer_hard_frames"
            else:
                policy="prefer_references"

        if policy=="provider_verified_mix":
            resolution="provider_verified_mix"
        elif policy=="prefer_hard_frames":
            resolution="prefer_hard_frames"
            for a in images+videos+audios:
                if _policy(a)=="must_use_raw":
                    blocked=True
                    non_provider.append({"assetId":a["assetId"],"reason":"Hard-frame path selected but raw reference is mandatory.","preservedAs":"separate_stage"})
                else:
                    derived.append({"sourceAssetId":a["assetId"],"derivation":_derive(a),"resultRole":"prompt_guidance"})
                    non_provider.append({"assetId":a["assetId"],"reason":"Hard-frame path selected; reference retained as guidance.","preservedAs":"derived_guidance"})
            images=[];videos=[];audios=[]
        elif policy=="prefer_references":
            resolution="prefer_references"
            for a in [x for x in (first,last) if x]:
                images.insert(0,a)
                warnings.append(f"{a['assetId']} softened from hard frame to reference image.")
            first=last=None
            images,b=_cap(images,caps["max_images"],reference_budget_policy,"image",derived,non_provider,warnings);blocked|=b
        elif policy=="prebake_hard_frame":
            resolution="prebake_hard_frame"
            for a in images:
                derived.append({"sourceAssetId":a["assetId"],"derivation":"prebaked_hard_frame","resultRole":"hard_frame_composite_input"})
                non_provider.append({"assetId":a["assetId"],"reason":"Reference image will be integrated into approved Start/End keyframe.","preservedAs":"prebake_input"})
            for a in videos+audios:
                if _policy(a)=="must_use_raw":
                    blocked=True
                    non_provider.append({"assetId":a["assetId"],"reason":"Raw video/audio cannot be preserved by a still-frame prebake.","preservedAs":"separate_stage"})
                else:
                    derived.append({"sourceAssetId":a["assetId"],"derivation":_derive(a),"resultRole":"prompt_guidance"})
                    non_provider.append({"assetId":a["assetId"],"reason":"Reference retained as structured guidance around prebaked hard frame.","preservedAs":"derived_guidance"})
            images=[];videos=[];audios=[]
        elif policy=="split_generation":
            resolution="split_generation"
            for a in images+videos+audios:
                non_provider.append({"assetId":a["assetId"],"reason":"Hard-frame and raw multimodal requirements require separate stages.","preservedAs":"separate_stage"})
            images=[];videos=[];audios=[]
        else:
            resolution="blocked"

    if blocked:resolution="blocked"

    if resolution=="blocked":
        mode="first_last_to_video" if first and last else ("image_to_video" if first else "reference_to_video")
    elif requested_mode in {"video_edit","video_extend"}:
        mode=requested_mode
        if not videos:
            resolution="blocked"
            warnings.append(f"{requested_mode} requires at least one reference video.")
    elif first and last:
        mode="first_last_to_video"
    elif first:
        mode="image_to_video"
    elif images or videos or audios:
        mode="reference_to_video"
    else:
        mode="text_to_video"

    if requested_mode!="auto" and requested_mode not in {mode,"video_edit","video_extend"}:
        resolution="blocked"
        warnings.append(f"Requested Seedance mode {requested_mode!r} conflicts with resolved mode {mode!r}.")

    return {
        "model":model,
        "mode":mode,
        "hardFrames":{
            "firstFrameAssetId":first.get("assetId") if first else None,
            "lastFrameAssetId":last.get("assetId") if last else None
        },
        "referenceImages":[{"assetId":a["assetId"],"label":f"@Image {i}","semanticRoles":semantic_roles(a),"entityId":a.get("entityId")} for i,a in enumerate(images,1)],
        "referenceVideos":[{"assetId":a["assetId"],"label":f"@Video {i}","semanticRoles":semantic_roles(a),"entityId":a.get("entityId")} for i,a in enumerate(videos,1)],
        "referenceAudios":[{"assetId":a["assetId"],"label":f"@Audio {i}","semanticRoles":semantic_roles(a),"entityId":a.get("entityId")} for i,a in enumerate(audios,1)],
        "conflictDetected":conflict,
        "conflictResolution":resolution,
        "materialLibraryRequirements":material,
        "derivedReferences":derived,
        "nonProviderReferences":non_provider,
        "warnings":warnings,
    }

def validate_seedance_limits(plan:dict[str,Any],asset_meta:dict[str,dict[str,Any]]|None=None)->list[str]:
    model=plan["model"];caps=MODELS[model];errors=[]
    if len(plan["referenceImages"])>caps["max_images"]:errors.append("Seedance image reference count exceeds model limit.")
    if len(plan["referenceVideos"])>caps["max_videos"]:errors.append("Seedance video reference count exceeds model limit.")
    if len(plan["referenceAudios"])>caps["max_audios"]:errors.append("Seedance audio reference count exceeds model limit.")
    if plan["referenceAudios"] and not caps["audio_only"] and not (plan["referenceImages"] or plan["referenceVideos"]):
        errors.append("Seedance 2.0 audio-only reference is unsupported.")
    if asset_meta:
        tv=ta=0.0
        for r in plan["referenceVideos"]:
            d=float(asset_meta.get(r["assetId"],{}).get("durationSeconds") or 0)
            if d and not 2<=d<=caps["video_each_max"]:errors.append(f"Reference video {r['assetId']} duration is invalid.")
            tv+=d
        for r in plan["referenceAudios"]:
            d=float(asset_meta.get(r["assetId"],{}).get("durationSeconds") or 0)
            if d and not 2<=d<=caps["audio_each_max"]:errors.append(f"Reference audio {r['assetId']} duration is invalid.")
            ta+=d
        if tv>caps["video_total_max"]:errors.append("Total reference-video duration exceeds Seedance model limit.")
        if ta>caps["audio_total_max"]:errors.append("Total reference-audio duration exceeds Seedance model limit.")
    return errors
