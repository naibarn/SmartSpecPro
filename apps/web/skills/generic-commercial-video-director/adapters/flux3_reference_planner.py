from __future__ import annotations
from typing import Any

SOFT_IMAGE_ROLES={
    "product_reference","character_reference","environment_reference","style_reference",
    "place_reference","venue_reference","storefront_reference","interior_reference",
    "exterior_reference","signage_reference","menu_reference","service_reference",
    "property_reference","facility_reference","map_reference","logo","ui_reference",
    "mechanism_reference","clay_render_reference"
}

def semantic_roles(asset:dict[str,Any])->list[str]:
    result=list(asset.get("referencePurposes") or [])
    defaults={
        "product_reference":["product_geometry","product_label"],
        "character_reference":["identity"],
        "environment_reference":["environment"],
        "style_reference":["style"],
        "place_reference":["place_identity","venue_layout","place_atmosphere"],
        "venue_reference":["place_identity","venue_layout"],
        "motion_reference":["motion"],
        "camera_reference":["camera_motion"],
        "video_reference":["motion","temporal_structure"],
        "source_video":["source_video_continuation"],
        "ui_reference":["ui_source"],
        "clay_render_reference":["clay_render","blocking_reference","trajectory_reference"],
    }
    for x in defaults.get(asset.get("role"),[]):
        if x not in result: result.append(x)
    return result

def _policy(a:dict[str,Any])->str:
    return a.get("providerUsePolicy","auto")

def _derive_kind(a:dict[str,Any])->str:
    sem=set(semantic_roles(a))
    if "identity" in sem:return "identity_description"
    if {"product_geometry","product_label"} & sem:return "product_description"
    if {"place_identity","venue_layout","place_atmosphere"} & sem:return "place_description"
    if "motion" in sem:return "motion_description"
    if "camera_motion" in sem:return "camera_description"
    return "visual_description"

def plan_flux3_inputs(
    assets:list[dict[str,Any]],
    *,
    requested_mode:str="auto",
    duration_seconds:int=8,
    timed_keyframes:list[dict[str,Any]]|None=None,
    keyframe_strategy:str="auto",
    soft_reference_policy:str="prebake_keyframe",
    continuation_tail_seconds:float=4,
) -> dict[str,Any]:
    if not 5<=int(duration_seconds)<=20:
        raise ValueError("FLUX 3 T2V/I2V duration must be 5-20 seconds.")
    timed_keyframes=list(timed_keyframes or [])

    first=next((a for a in assets if a.get("role")=="start_frame"),None)
    last=next((a for a in assets if a.get("role")=="end_frame"),None)
    mid=[a for a in assets if a.get("role")=="mid_keyframe"]

    asset_by_id={a["assetId"]:a for a in assets}
    timed_map={x["assetId"]:float(x["timeSeconds"]) for x in timed_keyframes}

    # Existing-source continuation is distinct from arbitrary video reference.
    start_video=None
    unsupported_video_refs=[]
    for a in assets:
        if a.get("mediaType")!="video":
            continue
        sem=set(semantic_roles(a))
        if a.get("role")=="source_video" or "source_video_continuation" in sem:
            if start_video is None:
                start_video=a
            else:
                unsupported_video_refs.append(a)
        else:
            unsupported_video_refs.append(a)

    soft_images=[
        a for a in assets
        if a.get("mediaType")=="image"
        and a.get("role") in SOFT_IMAGE_ROLES
        and _policy(a) not in {"analysis_only","post_only"}
    ]

    non_provider=[];derived=[];warnings=[]
    prebake_required=False
    blocked=False

    # FLUX public GA does not expose arbitrary soft Omni Reference yet.
    if soft_images:
        policy=soft_reference_policy
        if keyframe_strategy=="prebake_references_to_keyframes":
            policy="prebake_keyframe"
        elif keyframe_strategy=="derive_soft_references":
            policy="derive_to_prompt"
        elif keyframe_strategy=="fallback_provider":
            policy="fallback_provider"
        elif keyframe_strategy=="block":
            policy="block"

        if policy=="prebake_keyframe":
            prebake_required=True
            for a in soft_images:
                non_provider.append({
                    "assetId":a["assetId"],
                    "reason":"Current FLUX 3 public i2v images are literal clip keyframes, not soft Omni references.",
                    "preservedAs":"prebake_input"
                })
                derived.append({
                    "sourceAssetId":a["assetId"],
                    "derivation":"prebaked_keyframe",
                    "resultRole":"shot_keyframe_composite_input"
                })
        elif policy=="derive_to_prompt":
            for a in soft_images:
                if _policy(a)=="must_use_raw":
                    blocked=True
                    non_provider.append({"assetId":a["assetId"],"reason":"Must-use-raw soft reference is unsupported by current FLUX 3 public API.","preservedAs":"fallback_provider"})
                else:
                    derived.append({"sourceAssetId":a["assetId"],"derivation":_derive_kind(a),"resultRole":"prompt_guidance"})
                    non_provider.append({"assetId":a["assetId"],"reason":"Soft Omni Reference not public yet; represented as prompt guidance.","preservedAs":"derived_guidance"})
        elif policy=="fallback_provider":
            for a in soft_images:
                non_provider.append({"assetId":a["assetId"],"reason":"Soft image reference requires another provider or future FLUX Omni Reference.","preservedAs":"fallback_provider"})
            blocked=any(_policy(a)=="must_use_raw" for a in soft_images)
        else:
            blocked=True
            for a in soft_images:
                non_provider.append({"assetId":a["assetId"],"reason":"Soft reference policy blocks FLUX 3 generation.","preservedAs":"separate_stage"})

    for a in unsupported_video_refs:
        if _policy(a)=="must_use_raw":
            blocked=True
            non_provider.append({"assetId":a["assetId"],"reason":"FLUX 3 v2v accepts one start_video continuation source, not arbitrary raw motion/video reference bundles.","preservedAs":"fallback_provider"})
        else:
            sem=set(semantic_roles(a))
            if "motion" in sem:
                derived.append({"sourceAssetId":a["assetId"],"derivation":"motion_description","resultRole":"prompt_guidance"})
            if "camera_motion" in sem:
                derived.append({"sourceAssetId":a["assetId"],"derivation":"camera_description","resultRole":"prompt_guidance"})
            non_provider.append({"assetId":a["assetId"],"reason":"Arbitrary video reference converted to motion/camera guidance; current FLUX 3 public API exposes v2v continuation rather than generic video reference.","preservedAs":"derived_guidance"})

    # Arbitrary audio refs are not public FLUX 3 inputs yet.
    for a in [x for x in assets if x.get("mediaType")=="audio" and _policy(x) not in {"analysis_only","post_only"}]:
        if _policy(a)=="must_use_raw":
            blocked=True
            non_provider.append({"assetId":a["assetId"],"reason":"Current public FLUX 3 endpoint has no arbitrary audio-reference input.","preservedAs":"fallback_provider"})
        else:
            derived.append({"sourceAssetId":a["assetId"],"derivation":"audio_description","resultRole":"prompt_audio_guidance"})
            non_provider.append({"assetId":a["assetId"],"reason":"Arbitrary audio-reference input is not public yet.","preservedAs":"derived_guidance"})

    keyframes=[]
    if first:
        keyframes.append({"assetId":first["assetId"],"timeSeconds":0.0,"purpose":"start_frame"})
    # Mid keyframes require explicit time; otherwise they are storyboard inputs for prebake/planning only.
    for a in mid:
        if a["assetId"] in timed_map:
            t=timed_map[a["assetId"]]
            if not 0<t<float(duration_seconds):
                blocked=True
                warnings.append(f"Timed keyframe {a['assetId']} must be inside (0, duration).")
            else:
                keyframes.append({"assetId":a["assetId"],"timeSeconds":t,"purpose":"timed_keyframe"})
        else:
            non_provider.append({"assetId":a["assetId"],"reason":"FLUX mid keyframe needs an explicit timeSeconds mapping.","preservedAs":"prebake_input"})
            prebake_required=True
    if last:
        keyframes.append({"assetId":last["assetId"],"timeSeconds":float(duration_seconds),"purpose":"end_frame"})

    # Explicit timedKeyframes may point to arbitrary image assets: those become literal pinned frames.
    existing={x["assetId"] for x in keyframes}
    for x in timed_keyframes:
        aid=x["assetId"]
        if aid in existing:
            continue
        a=asset_by_id.get(aid)
        if not a or a.get("mediaType")!="image":
            blocked=True
            warnings.append(f"FLUX timed keyframe {aid} must reference an uploaded image asset.")
            continue
        t=float(x["timeSeconds"])
        if not 0<=t<=float(duration_seconds):
            blocked=True
            warnings.append(f"FLUX timed keyframe {aid} time is outside clip duration.")
            continue
        keyframes.append({"assetId":aid,"timeSeconds":t,"purpose":"timed_keyframe"})

    keyframes.sort(key=lambda x:x["timeSeconds"] if x["timeSeconds"] is not None else -1)
    if len(keyframes)>10:
        blocked=True
        warnings.append("FLUX 3 accepts at most 10 keyframes.")

    if requested_mode=="v2v" or (requested_mode=="auto" and start_video):
        mode="v2v"
        if not start_video:
            blocked=True
            warnings.append("FLUX v2v requires start_video.")
        if keyframes:
            blocked=True
            warnings.append("FLUX v2v uses start_video; do not mix i2v keyframes in the same request.")
        if not 1<=float(continuation_tail_seconds)<=4:
            blocked=True
            warnings.append("FLUX v2v continuation context must be <=4 seconds.")
    elif requested_mode=="t2v":
        mode="t2v"
        if keyframes:
            blocked=True
            warnings.append("Requested t2v conflicts with supplied FLUX keyframes.")
    elif requested_mode in {"i2v","auto"}:
        mode="i2v" if (keyframes or prebake_required) else "t2v"
    else:
        raise ValueError(f"Unsupported FLUX requested mode {requested_mode!r}.")

    return {
        "mode":mode,
        "keyframes":keyframes,
        "startVideoAssetId":start_video.get("assetId") if start_video else None,
        "softReferences":[{"assetId":a["assetId"],"semanticRoles":semantic_roles(a)} for a in soft_images],
        "derivedReferences":derived,
        "prebakeRequired":bool(prebake_required),
        "nonProviderReferences":non_provider,
        "continuationTailSeconds":float(continuation_tail_seconds) if mode=="v2v" else None,
        "blocked":bool(blocked),
        "warnings":warnings,
    }
