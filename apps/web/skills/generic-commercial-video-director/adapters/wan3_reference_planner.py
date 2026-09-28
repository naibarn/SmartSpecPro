from __future__ import annotations
from typing import Any

IMAGE_ROLES = {
    "product_reference","character_reference","environment_reference","style_reference",
    "place_reference","venue_reference","storefront_reference","interior_reference",
    "exterior_reference","signage_reference","menu_reference","service_reference",
    "property_reference","facility_reference","map_reference","logo","ui_reference",
    "mechanism_reference","mid_keyframe","clay_render_reference"
}
VIDEO_ROLES = {"video_reference","motion_reference","camera_reference","source_video"}
AUDIO_ROLES = {"audio_reference","voice_reference","music_reference","sound_reference"}

def semantic_roles(asset: dict[str, Any]) -> list[str]:
    result = list(asset.get("referencePurposes") or [])
    defaults = {
        "product_reference":["product_geometry","product_label"],
        "character_reference":["identity"],
        "environment_reference":["environment"],
        "style_reference":["style"],
        "place_reference":["place_identity","venue_layout","place_atmosphere"],
        "venue_reference":["place_identity","venue_layout","visible_feature"],
        "storefront_reference":["place_identity","storefront","signage"],
        "interior_reference":["interior_layout","visible_feature","place_atmosphere"],
        "exterior_reference":["exterior_architecture","location_context"],
        "signage_reference":["signage","place_identity"],
        "menu_reference":["menu"],
        "service_reference":["service_flow"],
        "property_reference":["property_layout","visible_feature"],
        "facility_reference":["facility","visible_feature"],
        "map_reference":["location_context","wayfinding"],
        "motion_reference":["motion"],
        "camera_reference":["camera_motion"],
        "video_reference":["motion","temporal_structure"],
        "source_video":["source_video_edit","source_video_continuation"],
        "voice_reference":["voice_timbre","voice_delivery"],
        "audio_reference":["audio_continuity"],
        "music_reference":["music_style"],
        "sound_reference":["sound_effect"],
        "ui_reference":["ui_source"],
        "mechanism_reference":["mechanism_reference"],
        "clay_render_reference":["clay_render","blocking_reference","trajectory_reference"],
        "document_reference":["document_content"],
        "web_reference":["web_content"],
    }
    for x in defaults.get(asset.get("role"), []):
        if x not in result:
            result.append(x)
    return result

def _policy(asset: dict[str, Any]) -> str:
    return asset.get("providerUsePolicy", "auto")

def _eligible(asset: dict[str, Any]) -> bool:
    return _policy(asset) not in {"analysis_only","post_only"}

def _kind(asset: dict[str, Any]) -> str | None:
    role = asset.get("role")
    mt = asset.get("mediaType")
    if role in {"start_frame","end_frame"}:
        return role
    if role == "document_reference" or mt == "document":
        return "file"
    if role == "web_reference" or mt == "web":
        return "link"
    if mt == "image" and (role in IMAGE_ROLES or asset.get("referencePurposes")):
        return "image"
    if mt == "video" or role in VIDEO_ROLES:
        return "video"
    if mt == "audio" or role in AUDIO_ROLES:
        return "audio"
    return None

def _priority(asset: dict[str, Any]) -> tuple[int,int,int]:
    sem = set(semantic_roles(asset))
    semantic_score = 30
    if "identity" in sem: semantic_score = 100
    elif {"product_geometry","product_label"} & sem: semantic_score = 95
    elif {"place_identity","venue_layout"} & sem: semantic_score = 90
    elif {"motion","camera_motion"} & sem: semantic_score = 88
    elif {"voice_timbre","voice_delivery"} & sem: semantic_score = 86
    elif {"document_content","web_content"} & sem: semantic_score = 80
    elif {"environment","place_atmosphere"} & sem: semantic_score = 70
    elif "style" in sem: semantic_score = 50
    return (
        1 if _policy(asset) == "must_use_raw" else 0,
        1 if asset.get("sourceOfTruth") else 0,
        semantic_score,
    )

def _derive(asset: dict[str,Any]) -> str:
    sem=set(semantic_roles(asset))
    if "identity" in sem: return "identity_description"
    if {"product_geometry","product_label"} & sem: return "product_description"
    if {"place_identity","venue_layout","place_atmosphere"} & sem: return "place_description"
    if "motion" in sem: return "motion_description"
    if "camera_motion" in sem: return "camera_description"
    if {"voice_timbre","voice_delivery","audio_continuity"} & sem: return "audio_description"
    if "document_content" in sem: return "document_summary"
    if "web_content" in sem: return "web_summary"
    return "visual_description"

def _trim_or_block(items:list[dict[str,Any]], limit:int, policy:str,
                   non_provider:list[dict[str,Any]], derived:list[dict[str,Any]],
                   warnings:list[str], kind_name:str) -> tuple[list[dict[str,Any]],bool]:
    if len(items) <= limit:
        return items, False
    total=len(items)
    if policy=="quality_first":
        items=sorted(items,key=_priority,reverse=True)
    keep=items[:limit]
    overflow=items[limit:]
    blocked=policy=="block_if_over_limit"
    warnings.append(f"Wan 3.0 {kind_name} reference count {total} exceeds provider limit {limit}.")
    for a in overflow:
        if blocked or _policy(a)=="must_use_raw":
            non_provider.append({
                "assetId":a["assetId"],
                "reason":f"Wan 3.0 {kind_name} reference budget exceeded.",
                "preservedAs":"separate_stage"
            })
            if _policy(a)=="must_use_raw":
                blocked=True
        else:
            derived.append({
                "sourceAssetId":a["assetId"],
                "derivation":_derive(a),
                "resultRole":"prompt_guidance"
            })
            non_provider.append({
                "assetId":a["assetId"],
                "reason":f"Wan 3.0 {kind_name} reference budget exceeded.",
                "preservedAs":"derived_guidance"
            })
    return keep, blocked

def plan_wan3_references(
    assets:list[dict[str,Any]],
    *,
    model:str="wan3.0-video",
    requested_mode:str="auto",
    conflict_policy:str="auto",
    authoritative_start:bool=True,
    reference_budget_policy:str="quality_first",
) -> dict[str,Any]:
    if model not in {"wan3.0-video","wan3.0-video-prime"}:
        raise ValueError("Unsupported Wan 3.0 model.")

    first=next((a for a in assets if a.get("role")=="start_frame"),None)
    last=next((a for a in assets if a.get("role")=="end_frame"),None)
    images=[]; videos=[]; audios=[]; files=[]; links=[]
    non_provider=[]; derived=[]; warnings=[]

    for a in assets:
        kind=_kind(a)
        if kind in {"start_frame","end_frame"}:
            continue
        if kind is None:
            continue
        if not _eligible(a):
            non_provider.append({
                "assetId":a["assetId"],
                "reason":f"providerUsePolicy={_policy(a)}",
                "preservedAs":_policy(a)
            })
            continue
        if kind=="image": images.append(a)
        elif kind=="video": videos.append(a)
        elif kind=="audio": audios.append(a)
        elif kind=="file": files.append(a)
        elif kind=="link": links.append(a)

    budget_blocked=False
    images,b=_trim_or_block(images,10,reference_budget_policy,non_provider,derived,warnings,"image")
    budget_blocked |= b
    videos,b=_trim_or_block(videos,5,reference_budget_policy,non_provider,derived,warnings,"video")
    budget_blocked |= b
    audios,b=_trim_or_block(audios,5,reference_budget_policy,non_provider,derived,warnings,"audio")
    budget_blocked |= b

    if len(files)>1:
        budget_blocked=True
        for a in files[1:]:
            non_provider.append({"assetId":a["assetId"],"reason":"Wan 3.0 accepts at most one file.","preservedAs":"separate_stage"})
        files=files[:1]
    if len(links)>1:
        budget_blocked=True
        for a in links[1:]:
            non_provider.append({"assetId":a["assetId"],"reason":"Wan 3.0 accepts at most one web link.","preservedAs":"separate_stage"})
        links=links[:1]
    if files and links:
        budget_blocked=True
        warnings.append("Wan 3.0 file and link inputs are mutually exclusive.")
        non_provider.append({"assetId":links[0]["assetId"],"reason":"Wan 3.0 cannot combine file and link.","preservedAs":"separate_stage"})
        links=[]

    # Up to 20 multimodal reference materials in total. Hard frames are a separate exclusive family.
    refs=images+videos+audios+files+links
    if len(refs)>20:
        ordered=sorted(refs,key=_priority,reverse=True) if reference_budget_policy=="quality_first" else refs
        keep_ids={a["assetId"] for a in ordered[:20]}
        overflow=[a for a in refs if a["assetId"] not in keep_ids]
        if reference_budget_policy=="block_if_over_limit" or any(_policy(a)=="must_use_raw" for a in overflow):
            budget_blocked=True
        for a in overflow:
            target="separate_stage" if (_policy(a)=="must_use_raw" or reference_budget_policy=="block_if_over_limit") else "derived_guidance"
            non_provider.append({"assetId":a["assetId"],"reason":"Wan 3.0 total reference material limit 20 exceeded.","preservedAs":target})
            if target=="derived_guidance":
                derived.append({"sourceAssetId":a["assetId"],"derivation":_derive(a),"resultRole":"prompt_guidance"})
        images=[a for a in images if a["assetId"] in keep_ids]
        videos=[a for a in videos if a["assetId"] in keep_ids]
        audios=[a for a in audios if a["assetId"] in keep_ids]
        files=[a for a in files if a["assetId"] in keep_ids]
        links=[a for a in links if a["assetId"] in keep_ids]

    raw_ref_exists=bool(images or videos or audios or files or links)
    hard_exists=bool(first or last)
    conflict=hard_exists and raw_ref_exists
    resolution="none"

    if conflict:
        policy=conflict_policy
        if policy=="auto":
            must_raw=any(_policy(a)=="must_use_raw" for a in images+videos+audios+files+links)
            # Prebake visual references is practical; raw video/audio/file/link cannot be
            # faithfully collapsed into a still frame.
            only_visual=not (videos or audios or files or links)
            if authoritative_start and only_visual:
                policy="prebake_hard_frame"
            elif authoritative_start and must_raw:
                policy="split_generation"
            elif authoritative_start:
                policy="prefer_hard_frames"
            else:
                policy="prefer_references"

        if policy=="prefer_hard_frames":
            resolution="prefer_hard_frames"
            for a in images+videos+audios+files+links:
                derived.append({"sourceAssetId":a["assetId"],"derivation":_derive(a),"resultRole":"prompt_guidance"})
                non_provider.append({"assetId":a["assetId"],"reason":"Wan hard-frame family selected; raw references cannot share request.","preservedAs":"derived_guidance" if _policy(a)!="must_use_raw" else "separate_stage"})
                if _policy(a)=="must_use_raw":
                    budget_blocked=True
            images=[];videos=[];audios=[];files=[];links=[]
        elif policy=="prefer_references":
            resolution="prefer_references"
            # Wan hard first/last cannot be represented as hard frames in reference mode.
            for a in [x for x in (first,last) if x]:
                images.insert(0,a)
                warnings.append(f"{a['assetId']} is softened from hard frame to reference image.")
            first=last=None
            images,b=_trim_or_block(images,10,reference_budget_policy,non_provider,derived,warnings,"image")
            budget_blocked |= b
        elif policy=="prebake_hard_frame":
            resolution="prebake_hard_frame"
            for a in images:
                derived.append({"sourceAssetId":a["assetId"],"derivation":"prebaked_hard_frame","resultRole":"hard_frame_composite_input"})
                non_provider.append({"assetId":a["assetId"],"reason":"Visual reference will be integrated into approved hard frame before Wan generation.","preservedAs":"prebake_input"})
            for a in videos+audios+files+links:
                non_provider.append({"assetId":a["assetId"],"reason":"Non-image reference cannot be preserved by a still-frame prebake.","preservedAs":"separate_stage" if _policy(a)=="must_use_raw" else "derived_guidance"})
                if _policy(a)=="must_use_raw":
                    budget_blocked=True
                else:
                    derived.append({"sourceAssetId":a["assetId"],"derivation":_derive(a),"resultRole":"prompt_guidance"})
            images=[];videos=[];audios=[];files=[];links=[]
        elif policy=="split_generation":
            resolution="split_generation"
            for a in images+videos+audios+files+links:
                non_provider.append({"assetId":a["assetId"],"reason":"Wan hard-frame and reference families require separate generation stages.","preservedAs":"separate_stage"})
            images=[];videos=[];audios=[];files=[];links=[]
        else:
            resolution="blocked"

    if budget_blocked:
        resolution="blocked"

    # Determine mode after conflict handling.
    if resolution=="blocked":
        mode="first_last_to_video" if first and last else ("image_to_video" if first else "reference_to_video")
    elif requested_mode in {"video_edit","video_extend"}:
        if not videos:
            resolution="blocked"
            warnings.append(f"{requested_mode} requires at least one reference_video.")
        mode=requested_mode
    elif first and last:
        mode="first_last_to_video"
    elif first:
        mode="image_to_video"
    elif images or videos or audios:
        mode="reference_to_video"
    elif files:
        mode="file_to_video"
    elif links:
        mode="web_to_video"
    else:
        mode="text_to_video"

    if requested_mode!="auto" and requested_mode not in {mode,"video_edit","video_extend"}:
        resolution="blocked"
        warnings.append(f"Requested Wan mode {requested_mode!r} conflicts with resolved media mode {mode!r}.")

    ref_images=[{"assetId":a["assetId"],"label":f"Image {i}","semanticRoles":semantic_roles(a),"entityId":a.get("entityId")} for i,a in enumerate(images,1)]
    ref_videos=[{"assetId":a["assetId"],"label":f"Video {i}","semanticRoles":semantic_roles(a),"entityId":a.get("entityId")} for i,a in enumerate(videos,1)]
    ref_audios=[{"assetId":a["assetId"],"label":f"Audio {i}","semanticRoles":semantic_roles(a),"entityId":a.get("entityId")} for i,a in enumerate(audios,1)]

    return {
        "model":model,
        "mode":mode,
        "hardFrames":{
            "firstFrameAssetId":first.get("assetId") if first else None,
            "lastFrameAssetId":last.get("assetId") if last else None,
        },
        "referenceImages":ref_images,
        "referenceVideos":ref_videos,
        "referenceAudios":ref_audios,
        "documentReference":{"assetId":files[0]["assetId"],"label":"File 1"} if files else None,
        "webReference":{"assetId":links[0]["assetId"],"label":"Link 1"} if links else None,
        "conflictDetected":conflict,
        "conflictResolution":resolution,
        "derivedReferences":derived,
        "nonProviderReferences":non_provider,
        "warnings":warnings,
    }

def validate_wan3_limits(plan:dict[str,Any], asset_meta:dict[str,dict[str,Any]]|None=None) -> list[str]:
    errors=[]
    if len(plan["referenceImages"])>10: errors.append("Wan 3.0 image references exceed 10.")
    if len(plan["referenceVideos"])>5: errors.append("Wan 3.0 video references exceed 5.")
    if len(plan["referenceAudios"])>5: errors.append("Wan 3.0 audio references exceed 5.")
    total_refs=len(plan["referenceImages"])+len(plan["referenceVideos"])+len(plan["referenceAudios"])
    total_refs += 1 if plan.get("documentReference") else 0
    total_refs += 1 if plan.get("webReference") else 0
    if total_refs>20: errors.append("Wan 3.0 total reference materials exceed 20.")
    if plan.get("documentReference") and plan.get("webReference"):
        errors.append("Wan 3.0 file and link inputs are mutually exclusive.")
    if (plan["hardFrames"]["firstFrameAssetId"] or plan["hardFrames"]["lastFrameAssetId"]) and total_refs:
        errors.append("Wan 3.0 hard frames cannot coexist with reference/file/link inputs.")
    if asset_meta:
        tv=ta=0.0
        for ref in plan["referenceVideos"]:
            m=asset_meta.get(ref["assetId"],{})
            d=float(m.get("durationSeconds") or 0)
            if d and not 1<=d<=15: errors.append(f"Wan reference video {ref['assetId']} must be 1-15s.")
            tv+=d
        for ref in plan["referenceAudios"]:
            m=asset_meta.get(ref["assetId"],{})
            d=float(m.get("durationSeconds") or 0)
            if d and not 1<=d<=15: errors.append(f"Wan reference audio {ref['assetId']} must be 1-15s.")
            ta+=d
        if tv>15: errors.append("Wan total reference-video duration exceeds 15s.")
        if ta>15: errors.append("Wan total reference-audio duration exceeds 15s.")
    return errors
