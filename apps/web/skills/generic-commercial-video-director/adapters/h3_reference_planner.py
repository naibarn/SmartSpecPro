from __future__ import annotations
from typing import Any

def _is_image(asset: dict[str, Any]) -> bool:
    return asset.get("mediaType") == "image" or asset.get("role") in {
        "product_reference","character_reference","environment_reference","style_reference",
        "place_reference","venue_reference","storefront_reference","interior_reference",
        "exterior_reference","signage_reference","menu_reference","service_reference",
        "property_reference","facility_reference","map_reference",
        "start_frame","end_frame","mid_keyframe","logo","ui_reference","mechanism_reference"
    }

def _is_video(asset: dict[str, Any]) -> bool:
    return asset.get("mediaType") == "video" or asset.get("role") in {
        "video_reference","motion_reference","camera_reference","source_video"
    }

def _is_audio(asset: dict[str, Any]) -> bool:
    return asset.get("mediaType") == "audio" or asset.get("role") in {
        "audio_reference","voice_reference","music_reference","sound_reference"
    }

def semantic_roles(asset: dict[str, Any]) -> list[str]:
    result = list(asset.get("referencePurposes") or [])
    defaults = {
        "product_reference":["product_geometry","product_label"],
        "character_reference":["identity"],
        "environment_reference":["environment"],
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
        "style_reference":["style"],
        "motion_reference":["motion"],
        "camera_reference":["camera_motion"],
        "video_reference":["motion","temporal_structure"],
        "source_video":["source_video_continuation"],
        "voice_reference":["voice_timbre","voice_delivery"],
        "audio_reference":["audio_continuity"],
        "music_reference":["music_style"],
        "sound_reference":["sound_effect"],
        "start_frame":["first_frame"],
        "end_frame":["last_frame"],
        "mid_keyframe":["mid_keyframe"],
        "ui_reference":["ui_source"],
        "mechanism_reference":["mechanism_reference"],
    }
    for role in defaults.get(asset.get("role"), []):
        if role not in result:
            result.append(role)
    return result

def plan_h3_references(
    assets: list[dict[str, Any]],
    *,
    model: str = "MiniMax-H3",
    hard_frame_conflict_policy: str = "auto",
    authoritative_start: bool = True,
) -> dict[str, Any]:
    """Map SmartAIHub raw image/video/audio references into an H3-compatible request plan.

    Hosted H3 V2 has two mutually-exclusive raw-media families:
      A) first_frame / last_frame hard anchors
      B) Ref2VA reference_image / reference_video / reference_audio

    This planner never silently discards a supplied reference. Incompatible raw references
    are either represented as derived structured guidance, moved to a separate/post stage,
    softened into Ref2VA, or the plan is blocked/split.
    """
    first = next((a for a in assets if a.get("role") == "start_frame"), None)
    last = next((a for a in assets if a.get("role") == "end_frame"), None)

    non_provider = []
    def provider_eligible(a: dict[str, Any]) -> bool:
        policy = a.get("providerUsePolicy", "auto")
        if policy == "analysis_only":
            non_provider.append({"assetId":a["assetId"],"reason":"providerUsePolicy=analysis_only","preservedAs":"analysis_only"})
            return False
        if policy == "post_only":
            non_provider.append({"assetId":a["assetId"],"reason":"providerUsePolicy=post_only","preservedAs":"post_only"})
            return False
        return True

    ref_images = [a for a in assets if _is_image(a) and a.get("role") not in {"start_frame","end_frame"} and provider_eligible(a)]
    ref_videos = [a for a in assets if _is_video(a) and provider_eligible(a)]
    ref_audio = [a for a in assets if _is_audio(a) and provider_eligible(a)]

    hard_exists = bool(first or last)
    raw_refs_exist = bool(ref_images or ref_videos or ref_audio)

    # H3-Max cannot use raw multimodal Ref2VA.
    if model == "MiniMax-H3-Max" and raw_refs_exist:
        return {
            "mode": "fl2va" if first and last else ("i2va" if first else ("l2va" if last else "t2va")),
            "model": model,
            "hardFrames": {
                "firstFrameAssetId": first.get("assetId") if first else None,
                "lastFrameAssetId": last.get("assetId") if last else None
            },
            "rawReferences": {"images":[],"videos":[],"audio":[]},
            "referenceLabels": [],
            "contentOrder": [],
            "conflictDetected": True,
            "conflictResolution": "blocked",
            "derivedReferences": [],
            "nonProviderReferences": non_provider + [
                {"assetId":a["assetId"],"reason":"MiniMax-H3-Max does not accept raw Ref2VA media","preservedAs":"separate_stage"}
                for a in ref_images + ref_videos + ref_audio
            ],
            "warnings": [
                "MiniMax-H3-Max does not support Ref2VA raw image/video/audio references. "
                "Route to MiniMax-H3 or explicitly derive/prebake references."
            ]
        }

    conflict = hard_exists and raw_refs_exist
    resolution = "none"
    derived: list[dict[str, Any]] = []
    warnings: list[str] = []

    # Default production behavior: authoritative Start Frame wins unless a raw asset explicitly
    # requires preservation (especially voice/motion), in which case split rather than discard.
    if conflict:
        policy = hard_frame_conflict_policy
        if policy == "auto":
            must_preserve_raw = any(a.get("providerUsePolicy") == "must_use_raw" for a in ref_images + ref_videos + ref_audio)
            if authoritative_start and must_preserve_raw:
                policy = "split_generation"
            elif authoritative_start:
                policy = "prefer_hard_start_end"
            else:
                policy = "prefer_raw_multimodal_refs"

        if policy == "prefer_hard_start_end":
            resolution = "derive_references_to_text"
            for a in ref_images:
                derived.append({"sourceAssetId":a["assetId"],"derivation":"visual_description","resultRole":"prompt_reference","resultAssetId":None})
            for a in ref_videos:
                derived.append({"sourceAssetId":a["assetId"],"derivation":"motion_description","resultRole":"prompt_reference","resultAssetId":None})
                if "camera_motion" in semantic_roles(a):
                    derived.append({"sourceAssetId":a["assetId"],"derivation":"camera_description","resultRole":"prompt_reference","resultAssetId":None})
            for a in ref_audio:
                derivation = "voice_profile" if any(x in semantic_roles(a) for x in ["voice_timbre","voice_delivery"]) else "audio_description"
                derived.append({"sourceAssetId":a["assetId"],"derivation":derivation,"resultRole":"external_audio_or_prompt_reference","resultAssetId":None})
            for a in ref_images + ref_videos:
                non_provider.append({"assetId":a["assetId"],"reason":"hard-frame mode selected","preservedAs":"derived_guidance"})
            for a in ref_audio:
                non_provider.append({"assetId":a["assetId"],"reason":"hard-frame mode selected","preservedAs":"separate_stage"})
            warnings.append("Raw H3 Ref2VA media cannot coexist with hard first/last frame roles; references are retained as derived guidance/post-audio instructions.")
        elif policy == "prefer_raw_multimodal_refs":
            resolution = "soft_keyframe_full_reference"
            if first:
                ref_images.insert(0, first)
            if last:
                ref_images.append(last)
            first = last = None
            warnings.append("Start/end images are now soft Ref2VA image references, not hard H3 frame anchors.")
        elif policy == "prebake_then_hard_frame":
            resolution = "prebake_keyframe_then_hard_frame"
            for a in ref_images:
                derived.append({"sourceAssetId":a["assetId"],"derivation":"prebaked_keyframe","resultRole":"hard_frame_composite_input","resultAssetId":None})
            for a in ref_videos:
                derived.append({"sourceAssetId":a["assetId"],"derivation":"motion_description","resultRole":"prompt_reference","resultAssetId":None})
            for a in ref_audio:
                derived.append({"sourceAssetId":a["assetId"],"derivation":"audio_description","resultRole":"external_audio_or_prompt_reference","resultAssetId":None})
            for a in ref_images:
                non_provider.append({"assetId":a["assetId"],"reason":"prebake hard-frame strategy","preservedAs":"prebake_input"})
            for a in ref_videos:
                non_provider.append({"assetId":a["assetId"],"reason":"prebake hard-frame strategy","preservedAs":"derived_guidance"})
            for a in ref_audio:
                non_provider.append({"assetId":a["assetId"],"reason":"prebake hard-frame strategy","preservedAs":"separate_stage"})
            warnings.append("Preprocess references into a validated hard keyframe before H3 generation.")
        elif policy == "split_generation":
            resolution = "split_generation"
            for a in ref_images + ref_videos + ref_audio:
                non_provider.append({"assetId":a["assetId"],"reason":"split-generation strategy","preservedAs":"separate_stage"})
            warnings.append("Use multiple H3/post stages because exact hard frame and raw Ref2VA references are both required.")
        elif policy == "block":
            resolution = "blocked"
        else:
            resolution = "blocked"

    if resolution in {"derive_references_to_text","prebake_keyframe_then_hard_frame","split_generation","blocked"}:
        raw_images, raw_videos, raw_audio = [], [], []
    else:
        raw_images, raw_videos, raw_audio = ref_images, ref_videos, ref_audio

    if first and last:
        mode = "fl2va"
    elif first:
        mode = "i2va"
    elif last:
        mode = "l2va"
    elif raw_images or raw_videos or raw_audio:
        mode = "ref2va"
    else:
        mode = "t2va"

    labels: list[dict[str, Any]] = []
    content_order: list[dict[str, Any]] = []
    pic_i = vid_i = aud_i = 0

    if mode == "ref2va":
        for a in raw_images:
            pic_i += 1
            labels.append({"label":f"<Picture {pic_i}>","assetId":a["assetId"],"kind":"Picture","semanticRoles":semantic_roles(a),"entityId":a.get("entityId")})
            content_order.append({"assetId":a["assetId"],"providerType":"image_url","providerRole":"reference_image","ordinal":len(content_order)+1})
        for a in raw_videos:
            vid_i += 1
            sem = semantic_roles(a)
            labels.append({"label":f"<Video {vid_i}>","assetId":a["assetId"],"kind":"Video","semanticRoles":sem,"entityId":a.get("entityId")})
            content_order.append({"assetId":a["assetId"],"providerType":"video_url","providerRole":"reference_video","ordinal":len(content_order)+1})
            if a.get("useEmbeddedAudio") or any(x in sem for x in ["voice_timbre","voice_delivery","audio_continuity","music_style","sound_effect"]):
                aud_i += 1
                labels.append({"label":f"<Audio {aud_i}>","assetId":a["assetId"],"kind":"Audio","semanticRoles":[x for x in sem if x in {"voice_timbre","voice_delivery","audio_continuity","music_style","sound_effect","dialogue_content"}] or ["audio_continuity"],"entityId":a.get("entityId")})
        for a in raw_audio:
            aud_i += 1
            labels.append({"label":f"<Audio {aud_i}>","assetId":a["assetId"],"kind":"Audio","semanticRoles":semantic_roles(a),"entityId":a.get("entityId")})
            content_order.append({"assetId":a["assetId"],"providerType":"audio_url","providerRole":"reference_audio","ordinal":len(content_order)+1})
    else:
        if first:
            content_order.append({"assetId":first["assetId"],"providerType":"image_url","providerRole":"first_frame","ordinal":len(content_order)+1})
        if last:
            content_order.append({"assetId":last["assetId"],"providerType":"image_url","providerRole":"last_frame","ordinal":len(content_order)+1})

    return {
        "mode": mode,
        "model": model,
        "hardFrames": {
            "firstFrameAssetId": first.get("assetId") if first else None,
            "lastFrameAssetId": last.get("assetId") if last else None
        },
        "rawReferences": {
            "images":[a["assetId"] for a in raw_images],
            "videos":[a["assetId"] for a in raw_videos],
            "audio":[a["assetId"] for a in raw_audio]
        },
        "referenceLabels": labels,
        "contentOrder": content_order,
        "conflictDetected": conflict,
        "conflictResolution": resolution,
        "derivedReferences": derived,
        "nonProviderReferences": non_provider,
        "warnings": warnings
    }

def validate_h3_reference_limits(plan: dict[str, Any], asset_meta: dict[str, dict[str, Any]] | None = None) -> list[str]:
    errors: list[str] = []
    refs = plan["rawReferences"]
    if len(refs["images"]) > 9:
        errors.append("H3 reference_image count exceeds 9.")
    if len(refs["videos"]) > 3:
        errors.append("H3 reference_video count exceeds 3.")
    if len(refs["audio"]) > 3:
        errors.append("H3 reference_audio count exceeds 3.")
    if asset_meta:
        total_video = total_audio = 0.0
        for aid in refs["images"]:
            m=asset_meta.get(aid,{})
            fs=m.get("fileSizeMB")
            if fs is not None and float(fs)>30:
                errors.append(f"Reference image {aid} exceeds 30 MB.")
            w,h=m.get("width"),m.get("height")
            if w is not None and not 256<=int(w)<=5760: errors.append(f"Reference image {aid} width outside 256-5760.")
            if h is not None and not 256<=int(h)<=5760: errors.append(f"Reference image {aid} height outside 256-5760.")
        for aid in refs["videos"]:
            d = float(asset_meta.get(aid, {}).get("durationSeconds") or 0)
            if d and not 2 <= d <= 15:
                errors.append(f"Reference video {aid} duration must be 2-15 seconds.")
            total_video += d
        for aid in refs["audio"]:
            d = float(asset_meta.get(aid, {}).get("durationSeconds") or 0)
            if d and not 2 <= d <= 15:
                errors.append(f"Reference audio {aid} duration must be 2-15 seconds.")
            total_audio += d
        if total_video > 15:
            errors.append("Total H3 reference-video duration exceeds 15 seconds.")
        if total_audio > 15:
            errors.append("Total H3 reference-audio duration exceeds 15 seconds.")
    return errors
