from __future__ import annotations
from typing import Any

IMAGE_REFERENCE_ROLES = {
    "product_reference", "character_reference", "environment_reference", "style_reference",
    "place_reference", "venue_reference", "storefront_reference", "interior_reference",
    "exterior_reference", "signage_reference", "menu_reference", "service_reference",
    "property_reference", "facility_reference", "map_reference", "logo",
    "ui_reference", "mechanism_reference", "mid_keyframe"
}
VIDEO_REFERENCE_ROLES = {
    "video_reference", "motion_reference", "camera_reference", "source_video"
}
AUDIO_REFERENCE_ROLES = {
    "audio_reference", "voice_reference", "music_reference", "sound_reference"
}

def semantic_roles(asset: dict[str, Any]) -> list[str]:
    result = list(asset.get("referencePurposes") or [])
    defaults = {
        "product_reference": ["product_geometry", "product_label"],
        "character_reference": ["identity"],
        "environment_reference": ["environment"],
        "style_reference": ["style"],
        "place_reference": ["place_identity", "venue_layout", "place_atmosphere"],
        "venue_reference": ["place_identity", "venue_layout", "visible_feature"],
        "storefront_reference": ["place_identity", "storefront", "signage"],
        "interior_reference": ["interior_layout", "visible_feature", "place_atmosphere"],
        "exterior_reference": ["exterior_architecture", "location_context"],
        "signage_reference": ["signage", "place_identity"],
        "menu_reference": ["menu"],
        "service_reference": ["service_flow"],
        "property_reference": ["property_layout", "visible_feature"],
        "facility_reference": ["facility", "visible_feature"],
        "map_reference": ["location_context", "wayfinding"],
        "motion_reference": ["motion"],
        "camera_reference": ["camera_motion"],
        "video_reference": ["motion", "temporal_structure"],
        "source_video": ["source_video_continuation"],
        "voice_reference": ["voice_timbre", "voice_delivery"],
        "audio_reference": ["audio_continuity"],
        "music_reference": ["music_style"],
        "sound_reference": ["sound_effect"],
        "ui_reference": ["ui_source"],
        "mechanism_reference": ["mechanism_reference"],
        "mid_keyframe": ["mid_keyframe"],
    }
    for x in defaults.get(asset.get("role"), []):
        if x not in result:
            result.append(x)
    return result

def _provider_eligible(asset: dict[str, Any]) -> bool:
    return asset.get("providerUsePolicy", "auto") not in {"analysis_only", "post_only"}

def _is_image_ref(asset: dict[str, Any]) -> bool:
    return (
        asset.get("mediaType") == "image"
        and asset.get("role") != "start_frame"
        and (asset.get("role") in IMAGE_REFERENCE_ROLES or bool(asset.get("referencePurposes")))
    )

def _is_video_ref(asset: dict[str, Any]) -> bool:
    return asset.get("mediaType") == "video" or asset.get("role") in VIDEO_REFERENCE_ROLES

def _is_audio_ref(asset: dict[str, Any]) -> bool:
    return asset.get("mediaType") == "audio" or asset.get("role") in AUDIO_REFERENCE_ROLES

def plan_grok_references(
    assets: list[dict[str, Any]],
    *,
    preset_voice_mappings: list[dict[str, str]] | None = None,
    conflict_policy: str = "auto",
    authoritative_start: bool = True,
    start_frame_covers_reference_entities: bool = False,
    video_reference_policy: str = "derive_to_prompt",
    custom_voice_policy: str = "external_fallback",
    reference_image_policy: str = "quality_first",
) -> dict[str, Any]:
    """Resolve xAI Grok Imagine Video 1.5 mutually-exclusive generation modes.

    grok-imagine-video-1.5 supports:
      - image-to-video: one starting image
      - reference-to-video: reference images and/or reference voices

    These are distinct modes. This planner never silently passes a Start Frame and
    reference-to-video inputs together.
    """
    preset_voice_mappings = list(preset_voice_mappings or [])
    start = next((a for a in assets if a.get("role") == "start_frame"), None)
    end_frames = [a for a in assets if a.get("role") == "end_frame"]

    non_provider: list[dict[str, Any]] = []
    derived: list[dict[str, Any]] = []
    warnings: list[str] = []

    image_refs = []
    video_refs = []
    audio_refs = []
    unsupported_anchor_blocked = False

    for asset in end_frames:
        non_provider.append({
            "assetId": asset["assetId"],
            "reason": "Grok Imagine Video 1.5 has no documented hard last-frame / first+last interpolation control.",
            "preservedAs": "fallback_provider" if asset.get("providerUsePolicy") == "must_use_raw" else "derived_guidance"
        })
        if asset.get("providerUsePolicy") == "must_use_raw":
            unsupported_anchor_blocked = True
        else:
            derived.append({
                "sourceAssetId": asset["assetId"],
                "derivation": "visual_description",
                "resultRole": "desired_end_state_guidance"
            })
        warnings.append("End Frame can only be soft prompt/reference guidance in Grok 1.5; route another provider if a hard final frame is mandatory.")

    for asset in assets:
        if asset.get("role") == "end_frame":
            continue
        policy = asset.get("providerUsePolicy", "auto")
        if policy == "analysis_only":
            non_provider.append({
                "assetId": asset["assetId"], "reason": "providerUsePolicy=analysis_only",
                "preservedAs": "analysis_only"
            })
            continue
        if policy == "post_only":
            non_provider.append({
                "assetId": asset["assetId"], "reason": "providerUsePolicy=post_only",
                "preservedAs": "post_only"
            })
            continue
        if _is_image_ref(asset) and _provider_eligible(asset):
            image_refs.append(asset)
        elif _is_video_ref(asset) and _provider_eligible(asset):
            video_refs.append(asset)
        elif _is_audio_ref(asset) and _provider_eligible(asset):
            audio_refs.append(asset)

    # Grok 1.5 reference-to-video has no raw motion-video reference input.
    video_blocked = False
    for asset in video_refs:
        if video_reference_policy == "derive_to_prompt":
            for derivation in ["motion_description"] + (
                ["camera_description"] if "camera_motion" in semantic_roles(asset) else []
            ):
                derived.append({
                    "sourceAssetId": asset["assetId"],
                    "derivation": derivation,
                    "resultRole": "prompt_guidance"
                })
            non_provider.append({
                "assetId": asset["assetId"],
                "reason": "Grok Imagine Video 1.5 reference-to-video accepts image references, not reference videos.",
                "preservedAs": "derived_guidance"
            })
        elif video_reference_policy == "fallback_provider":
            non_provider.append({
                "assetId": asset["assetId"],
                "reason": "Raw video reference requires a provider/workflow that accepts motion/video references.",
                "preservedAs": "fallback_provider"
            })
            if asset.get("providerUsePolicy") == "must_use_raw":
                video_blocked = True
        else:
            non_provider.append({
                "assetId": asset["assetId"],
                "reason": "Raw reference video is unsupported by Grok Imagine Video 1.5.",
                "preservedAs": "fallback_provider"
            })
            video_blocked = True

    # Publicly documented reference audio path is preset voice_id.
    reference_audios = []
    audio_index = 0
    for mapping in preset_voice_mappings[:3]:
        reference_audios.append({
            "label": f"<AUDIO_{audio_index}>",
            "sourceType": "preset_voice",
            "voiceId": mapping["voiceId"],
            "assetId": None,
            "speakerId": mapping["speakerId"],
            "providerEntitlementVerified": True
        })
        audio_index += 1

    custom_voice_blocked = False
    for asset in audio_refs:
        hints = (asset.get("providerHints") or {}).get("xai") or {}
        entitlement = bool(hints.get("customVoiceEntitlementVerified"))
        if entitlement:
            # Keep it in the structured plan, but execution adapter will still require
            # a connector-specific/custom-audio payload because the general public REST
            # shape is not documented as a stable contract.
            if audio_index < 3:
                reference_audios.append({
                    "label": f"<AUDIO_{audio_index}>",
                    "sourceType": "custom_audio",
                    "voiceId": None,
                    "assetId": asset["assetId"],
                    "speakerId": asset.get("entityId"),
                    "providerEntitlementVerified": True
                })
                audio_index += 1
            else:
                non_provider.append({
                    "assetId": asset["assetId"],
                    "reason": "Grok reference audio limit exceeded.",
                    "preservedAs": "external_audio"
                })
        elif custom_voice_policy == "external_fallback" or custom_voice_policy == "auto":
            derived.append({
                "sourceAssetId": asset["assetId"],
                "derivation": "voice_description",
                "resultRole": "external_voice_or_prompt_guidance"
            })
            non_provider.append({
                "assetId": asset["assetId"],
                "reason": "Uploaded custom voice reference is restricted to trusted partners and entitlement is not verified.",
                "preservedAs": "external_audio"
            })
        elif custom_voice_policy == "require_trusted_partner_entitlement":
            non_provider.append({
                "assetId": asset["assetId"],
                "reason": "Trusted-partner custom voice entitlement required.",
                "preservedAs": "separate_stage"
            })
            custom_voice_blocked = True
        else:
            custom_voice_blocked = True

    # Reference image budget.
    reference_budget_blocked = False

    if reference_image_policy == "quality_first":
        def priority(a: dict[str, Any]) -> tuple[int, int, int]:
            sem = set(semantic_roles(a))
            role_score = 0
            if "identity" in sem:
                role_score = 100
            elif {"product_geometry", "product_label"} & sem:
                role_score = 95
            elif {"place_identity", "venue_layout"} & sem:
                role_score = 90
            elif {"storefront", "signage", "ui_source"} & sem:
                role_score = 85
            elif {"environment", "place_atmosphere"} & sem:
                role_score = 70
            elif "style" in sem:
                role_score = 50
            return (
                1 if a.get("providerUsePolicy") == "must_use_raw" else 0,
                1 if a.get("sourceOfTruth") else 0,
                role_score
            )
        image_refs.sort(key=priority, reverse=True)

    if len(image_refs) > 7:
        overflow = image_refs[7:]
        image_refs = image_refs[:7]
        if reference_image_policy == "block_if_over_limit":
            reference_budget_blocked = True
            warnings.append(f"{len(image_refs) + len(overflow)} reference images supplied; Grok 1.5 allows at most 7 and policy requires blocking.")
            for a in overflow:
                non_provider.append({
                    "assetId": a["assetId"],
                    "reason": "Reference image budget exceeds Grok 1.5 maximum of 7 and strict policy blocks generation.",
                    "preservedAs": "separate_stage"
                })
        else:
            for a in overflow:
                derived.append({
                    "sourceAssetId": a["assetId"],
                    "derivation": "visual_description",
                    "resultRole": "prompt_guidance"
                })
                non_provider.append({
                    "assetId": a["assetId"],
                    "reason": "Reference image budget exceeds Grok 1.5 maximum of 7.",
                    "preservedAs": "derived_guidance"
                })

    has_ref_mode_inputs = bool(image_refs or reference_audios)
    conflict = bool(start and has_ref_mode_inputs)
    resolution = "none"

    if conflict:
        policy = conflict_policy
        if policy == "auto":
            must_raw_images = any(a.get("providerUsePolicy") == "must_use_raw" for a in image_refs)
            has_provider_voice = bool(reference_audios)
            if authoritative_start and start_frame_covers_reference_entities and not has_provider_voice:
                policy = "prefer_start_frame"
            elif authoritative_start and (must_raw_images or has_provider_voice):
                policy = "prebake_start_frame"
            elif authoritative_start:
                policy = "prefer_start_frame"
            else:
                policy = "prefer_references"

        if policy == "prefer_start_frame":
            resolution = "prefer_start_frame"
            for a in image_refs:
                deriv = "identity_description" if "identity" in semantic_roles(a) else (
                    "product_description" if any(x in semantic_roles(a) for x in ["product_geometry","product_label"])
                    else "place_description" if any(x in semantic_roles(a) for x in ["place_identity","venue_layout","place_atmosphere"])
                    else "visual_description"
                )
                derived.append({
                    "sourceAssetId": a["assetId"],
                    "derivation": deriv,
                    "resultRole": "prompt_guidance"
                })
                non_provider.append({
                    "assetId": a["assetId"],
                    "reason": "Start Frame image-to-video selected; Grok reference-to-video mode cannot be mixed into the same request.",
                    "preservedAs": "derived_guidance"
                })
            for a in reference_audios:
                if a["assetId"]:
                    non_provider.append({
                        "assetId": a["assetId"],
                        "reason": "Start Frame image-to-video selected; reference voice cannot share the same request mode.",
                        "preservedAs": "external_audio"
                    })
            reference_audios = []
            image_refs = []
            warnings.append("Grok image-to-video selected; extra image/voice references are retained as derived/pre/post guidance rather than raw reference-to-video inputs.")

        elif policy == "prefer_references":
            resolution = "prefer_references"
            # Treat the Start Frame as a soft reference image rather than literal frame 0.
            if start and len(image_refs) < 7:
                image_refs.insert(0, start)
            elif start:
                derived.append({
                    "sourceAssetId": start["assetId"],
                    "derivation": "visual_description",
                    "resultRole": "soft_start_guidance"
                })
            start = None
            warnings.append("Reference-to-video selected. The supplied Start Frame is no longer guaranteed as literal frame 0.")

        elif policy == "prebake_start_frame":
            resolution = "prebake_start_frame"
            for a in image_refs:
                derived.append({
                    "sourceAssetId": a["assetId"],
                    "derivation": "prebaked_start_frame",
                    "resultRole": "start_frame_composite_input"
                })
                non_provider.append({
                    "assetId": a["assetId"],
                    "reason": "Reference will be integrated into a validated Start Frame before Grok image-to-video.",
                    "preservedAs": "prebake_input"
                })
            image_refs = []
            # Reference voices still cannot be sent together with image-to-video.
            for a in reference_audios:
                if a["assetId"]:
                    non_provider.append({
                        "assetId": a["assetId"],
                        "reason": "Voice reference cannot share Grok image-to-video mode; route to external speech/lip-sync.",
                        "preservedAs": "external_audio"
                    })
            reference_audios = []
            warnings.append("Prebake required: compose/validate identity/product/place requirements into the authoritative Start Frame before Grok image-to-video.")

        elif policy == "split_generation":
            resolution = "split_generation"
            warnings.append("Exact Start Frame and raw reference-to-video inputs require separate stages.")
            for a in image_refs:
                non_provider.append({
                    "assetId": a["assetId"],
                    "reason": "Split-generation plan required by Grok mode exclusivity.",
                    "preservedAs": "separate_stage"
                })
            for a in reference_audios:
                if a["assetId"]:
                    non_provider.append({
                        "assetId": a["assetId"],
                        "reason": "Split-generation/audio stage required by Grok mode exclusivity.",
                        "preservedAs": "separate_stage"
                    })
            image_refs = []
            reference_audios = []

        else:
            resolution = "blocked"

    if video_blocked or custom_voice_blocked or reference_budget_blocked or unsupported_anchor_blocked:
        resolution = "blocked"

    if resolution == "blocked":
        mode = "image_to_video" if start else ("reference_to_video" if has_ref_mode_inputs else "text_to_video")
    elif start:
        mode = "image_to_video"
    elif image_refs or reference_audios:
        mode = "reference_to_video"
    else:
        mode = "text_to_video"

    reference_images = []
    for i, asset in enumerate(image_refs, 1):
        reference_images.append({
            "assetId": asset["assetId"],
            "label": f"<IMAGE_{i}>",
            "semanticRoles": semantic_roles(asset),
            "entityId": asset.get("entityId")
        })

    resolution_limit = "720p" if mode == "reference_to_video" else "1080p"

    return {
        "mode": mode,
        "startFrameAssetId": start.get("assetId") if start else None,
        "referenceImages": reference_images,
        "referenceAudios": reference_audios,
        "derivedReferences": derived,
        "nonProviderReferences": non_provider,
        "conflictDetected": conflict,
        "conflictResolution": resolution,
        "resolutionLimit": resolution_limit,
        "warnings": warnings
    }

def validate_grok_reference_plan(plan: dict[str, Any]) -> list[str]:
    errors = []
    if len(plan["referenceImages"]) > 7:
        errors.append("Grok Imagine Video 1.5 supports at most 7 reference images.")
    if len(plan["referenceAudios"]) > 3:
        errors.append("Grok Imagine Video 1.5 supports at most 3 reference voices.")
    if plan["startFrameAssetId"] and (plan["referenceImages"] or plan["referenceAudios"]):
        errors.append("Grok image-to-video Start Frame cannot be mixed with reference-to-video inputs.")
    if plan["mode"] == "reference_to_video" and plan["resolutionLimit"] != "720p":
        errors.append("Grok reference-to-video must be capped at 720p.")
    return errors
