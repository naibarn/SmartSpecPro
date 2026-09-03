from __future__ import annotations
from typing import Any

from .grok_reference_planner import plan_grok_references, validate_grok_reference_plan

GENERATION_URL = "https://api.x.ai/v1/videos/generations"
QUERY_URL_TEMPLATE = "https://api.x.ai/v1/videos/{request_id}"
EDIT_URL = "https://api.x.ai/v1/videos/edits"
EXTEND_URL = "https://api.x.ai/v1/videos/extensions"

class GrokImagineAdapterError(ValueError):
    pass

SUPPORTED_ASPECTS = {"1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"}
SUPPORTED_BASE_RESOLUTIONS = {"480p", "720p", "1080p"}

def validate_duration(duration: int) -> None:
    if not 1 <= int(duration) <= 15:
        raise GrokImagineAdapterError("grok-imagine-video-1.5 duration must be 1-15 seconds.")

def validate_aspect_ratio(aspect_ratio: str) -> None:
    if aspect_ratio not in SUPPORTED_ASPECTS:
        raise GrokImagineAdapterError(
            f"Unsupported Grok Imagine Video 1.5 aspect ratio {aspect_ratio!r}."
        )

def validate_resolution(mode: str, resolution: str) -> None:
    if resolution not in SUPPORTED_BASE_RESOLUTIONS:
        raise GrokImagineAdapterError(f"Unsupported resolution {resolution!r}.")
    if mode == "reference_to_video" and resolution == "1080p":
        raise GrokImagineAdapterError("Grok Imagine Video 1.5 reference-to-video is capped at 720p.")

def _media_ref(value: str | dict[str, Any]) -> dict[str, Any]:
    """Normalize SmartAIHub/xAI file input into the REST body shape.

    Accepted:
      - URL/data-URI string -> {"url": value}
      - {"url": ...}
      - {"file_id": ...}
    """
    if isinstance(value, str):
        return {"url": value}
    if not isinstance(value, dict):
        raise GrokImagineAdapterError("Asset input must be URL/data URI string or dict.")
    if "url" in value:
        return {"url": value["url"]}
    if "file_id" in value:
        return {"file_id": value["file_id"]}
    raise GrokImagineAdapterError("Asset input must contain url or file_id.")

def choose_resolution(mode: str, requested: str = "auto", optimize_for: str = "quality") -> str:
    if requested != "auto":
        validate_resolution(mode, requested)
        return requested
    if mode == "reference_to_video":
        return "720p" if optimize_for != "speed" else "480p"
    return "1080p" if optimize_for == "quality" else ("480p" if optimize_for == "speed" else "720p")

def build_generation_payload(
    *,
    reference_plan: dict[str, Any],
    prompt_text: str,
    duration: int,
    aspect_ratio: str,
    resolution: str,
    asset_inputs: dict[str, str | dict[str, Any]],
    generate_audio: bool = True,
    start_frame_aspect_policy: str = "normalize_before_generation",
    custom_audio_payloads: dict[str, dict[str, Any]] | None = None,
    storage_options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    errors = validate_grok_reference_plan(reference_plan)
    if errors:
        raise GrokImagineAdapterError("; ".join(errors))
    if reference_plan.get("conflictResolution") in {"blocked", "split_generation"}:
        raise GrokImagineAdapterError(
            f"Reference plan requires {reference_plan.get('conflictResolution')}; cannot build one generation request."
        )

    mode = reference_plan["mode"]
    validate_duration(duration)
    validate_aspect_ratio(aspect_ratio)
    validate_resolution(mode, resolution)

    if reference_plan.get("referenceAudios") and not generate_audio:
        raise GrokImagineAdapterError(
            "Grok reference voice inputs require generated audio; generate_audio=false is incompatible."
        )

    payload: dict[str, Any] = {
        "model": "grok-imagine-video-1.5",
        "prompt": prompt_text,
        "duration": int(duration),
        "resolution": resolution,
        "generate_audio": bool(generate_audio),
    }

    # Image-to-video defaults to source aspect. To protect an authoritative Start Frame,
    # omit aspect_ratio when preserve_source is chosen; normalize externally when requested.
    if mode == "image_to_video":
        aid = reference_plan.get("startFrameAssetId")
        if not aid:
            raise GrokImagineAdapterError("image_to_video requires startFrameAssetId.")
        if aid not in asset_inputs:
            raise GrokImagineAdapterError(f"Missing provider input for Start Frame {aid}.")
        payload["image"] = _media_ref(asset_inputs[aid])

        if start_frame_aspect_policy == "preserve_source":
            pass
        elif start_frame_aspect_policy == "normalize_before_generation":
            # The preprocessor is expected to make the Start Frame match target aspect.
            payload["aspect_ratio"] = aspect_ratio
        elif start_frame_aspect_policy == "allow_provider_stretch":
            payload["aspect_ratio"] = aspect_ratio
        else:
            raise GrokImagineAdapterError("Unknown start_frame_aspect_policy.")

    elif mode == "reference_to_video":
        payload["aspect_ratio"] = aspect_ratio

        refs = []
        for ref in reference_plan.get("referenceImages", []):
            aid = ref["assetId"]
            if aid not in asset_inputs:
                raise GrokImagineAdapterError(f"Missing provider input for reference image {aid}.")
            refs.append(_media_ref(asset_inputs[aid]))
        if refs:
            payload["reference_images"] = refs

        audio_payloads = []
        custom_audio_payloads = custom_audio_payloads or {}
        for ref in reference_plan.get("referenceAudios", []):
            if ref["sourceType"] == "preset_voice":
                audio_payloads.append({"voice_id": ref["voiceId"]})
            else:
                # The general public docs state that custom audio refs are trusted-partner only.
                # Do not invent a REST shape; require the tenant/provider connector to supply it.
                aid = ref.get("assetId")
                raw = custom_audio_payloads.get(aid or "")
                if not raw:
                    raise GrokImagineAdapterError(
                        "Custom Grok voice reference requires verified trusted-partner entitlement "
                        "and connector-specific reference_audios payload."
                    )
                audio_payloads.append(raw)
        if audio_payloads:
            payload["reference_audios"] = audio_payloads

        if not refs and not audio_payloads:
            raise GrokImagineAdapterError(
                "reference_to_video requires at least one reference image or reference audio."
            )

    elif mode == "text_to_video":
        payload["aspect_ratio"] = aspect_ratio

    else:
        raise GrokImagineAdapterError(f"Unsupported mode {mode}.")

    if storage_options:
        payload["storage_options"] = storage_options

    return payload

def build_execution_plan(
    *,
    assets: list[dict[str, Any]],
    prompt: dict[str, Any],
    requested_mode: str = "auto",
    asset_inputs: dict[str, str | dict[str, Any]],
    aspect_ratio: str = "9:16",
    requested_resolution: str = "auto",
    optimize_for: str = "quality",
    generate_audio: str = "auto",
    start_reference_conflict_policy: str = "auto",
    authoritative_start: bool = True,
    start_frame_covers_reference_entities: bool = False,
    start_frame_aspect_policy: str = "normalize_before_generation",
    video_reference_policy: str = "derive_to_prompt",
    custom_voice_policy: str = "external_fallback",
    reference_image_policy: str = "quality_first",
    preset_voice_mappings: list[dict[str, str]] | None = None,
    custom_audio_payloads: dict[str, dict[str, Any]] | None = None,
    prebaked_start_asset_id: str | None = None,
) -> dict[str, Any]:
    ref_plan = plan_grok_references(
        assets,
        preset_voice_mappings=preset_voice_mappings,
        conflict_policy=start_reference_conflict_policy,
        authoritative_start=authoritative_start,
        start_frame_covers_reference_entities=start_frame_covers_reference_entities,
        video_reference_policy=video_reference_policy,
        custom_voice_policy=custom_voice_policy,
        reference_image_policy=reference_image_policy,
    )

    if ref_plan["conflictResolution"] == "blocked":
        raise GrokImagineAdapterError("Grok reference planning is blocked by an incompatible required input.")

    if requested_mode != "auto" and requested_mode != ref_plan["mode"]:
        raise GrokImagineAdapterError(
            f"Requested Grok mode {requested_mode!r} conflicts with resolved mode {ref_plan['mode']!r}. "
            "Adjust Start/Reference conflict policy or assets explicitly."
        )
    if ref_plan["conflictResolution"] == "split_generation":
        raise GrokImagineAdapterError("Grok Start Frame + raw references require a split-generation plan.")

    # A prebake plan is an actual dependency, not a warning. The controller must first
    # create/approve a new Start Frame that integrates the required image references.
    if ref_plan["conflictResolution"] == "prebake_start_frame":
        if not prebaked_start_asset_id:
            raise GrokImagineAdapterError(
                "Grok prebake_start_frame resolution requires prebaked_start_asset_id before video submission."
            )
        ref_plan = dict(ref_plan)
        ref_plan["startFrameAssetId"] = prebaked_start_asset_id

    mode = ref_plan["mode"]
    resolution = choose_resolution(mode, requested_resolution, optimize_for)
    generate_audio_bool = generate_audio != "off"

    pre = {
        "normalizeStartFrame": bool(
            mode == "image_to_video"
            and start_frame_aspect_policy == "normalize_before_generation"
        ),
        "prebakeStartFrame": ref_plan["conflictResolution"] == "prebake_start_frame",
        "deriveVideoReferences": any(
            x.get("derivation") in {"motion_description", "camera_description"}
            for x in ref_plan.get("derivedReferences", [])
        )
    }

    payload = build_generation_payload(
        reference_plan=ref_plan,
        prompt_text=prompt["promptText"],
        duration=int(prompt["durationSeconds"]),
        aspect_ratio=aspect_ratio,
        resolution=resolution,
        asset_inputs=asset_inputs,
        generate_audio=generate_audio_bool,
        start_frame_aspect_policy=start_frame_aspect_policy,
        custom_audio_payloads=custom_audio_payloads,
    )

    external_audio = any(
        x.get("preservedAs") == "external_audio"
        for x in ref_plan.get("nonProviderReferences", [])
    ) or bool(
        preset_voice_mappings
        and mode == "image_to_video"
        and ref_plan.get("conflictDetected")
    )

    qc = [
        "GROK_PROMPT_ADHERENCE",
        "GROK_CHARACTER_IDENTITY",
        "GROK_PRODUCT_PLACE_IDENTITY",
        "GROK_ACTION_CHRONOLOGY",
        "GROK_HAND_OBJECT_PHYSICS",
        "GROK_NATIVE_AUDIO_SYNC",
    ]
    if mode == "image_to_video":
        qc += ["GROK_START_FRAME_ADHERENCE", "GROK_START_STATE_CONTINUITY"]
    if mode == "reference_to_video":
        qc += ["GROK_REFERENCE_RETENTION", "GROK_REFERENCE_BINDING"]
    if prompt.get("dialogueLines"):
        qc += ["GROK_DIALOGUE_EXACTNESS", "GROK_LIPSYNC"]

    return {
        "model": "grok-imagine-video-1.5",
        "mode": mode,
        "durationSeconds": int(prompt["durationSeconds"]),
        "resolution": resolution,
        "aspectRatio": aspect_ratio,
        "referencePlan": ref_plan,
        "prompt": prompt,
        "generationPayload": payload,
        "preProcessing": pre,
        "postGeneration": {
            "externalAudioOrLipSync": external_audio,
            "postComposite": True,
            "companionExtensionModel": "grok-imagine-video"
        },
        "qcRequirements": qc,
        "warnings": list(ref_plan.get("warnings", [])) + list(prompt.get("warnings", []))
    }

def build_query_url(request_id: str) -> str:
    if not request_id:
        raise GrokImagineAdapterError("request_id is required.")
    return QUERY_URL_TEMPLATE.format(request_id=request_id)

def normalize_generation_response(response: dict[str, Any]) -> dict[str, Any]:
    status = str(response.get("status") or "").lower()
    video = response.get("video") or {}
    return {
        "providerJobId": response.get("request_id") or response.get("id"),
        "status": status if status in {"pending", "done", "failed", "expired"} else "unknown",
        "model": response.get("model"),
        "outputUrl": video.get("url"),
        "actualDurationSeconds": video.get("duration"),
        "respectModeration": video.get("respect_moderation"),
        "fileOutput": video.get("file_output") or response.get("file_output"),
        "raw": response,
    }

def build_companion_extension_payload(
    *,
    video_input: str | dict[str, Any],
    prompt_text: str,
    extension_seconds: int = 6,
) -> dict[str, Any]:
    if not 2 <= int(extension_seconds) <= 10:
        raise GrokImagineAdapterError("xAI Grok companion extension duration must be 2-10 seconds.")
    return {
        "model": "grok-imagine-video",
        "prompt": prompt_text,
        "duration": int(extension_seconds),
        "video": _media_ref(video_input)
    }

def build_companion_edit_payload(
    *,
    video_input: str | dict[str, Any],
    prompt_text: str,
) -> dict[str, Any]:
    return {
        "model": "grok-imagine-video",
        "prompt": prompt_text,
        "video": _media_ref(video_input)
    }
