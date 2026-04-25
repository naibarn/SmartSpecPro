from .validators import validate_input, validate_output
from .decision_engine import resolve, confidence
from .safety import review as safety_review
from .prompt_builder import build_prompts
from .render_request import build_render_request
from .evaluator import evaluate
from .subagents import orchestrate, quality_delta
from .final_reviewer import review_and_repair


LOCKABLE_USER_FIELDS = [
    "topic",
    "mode",
    "target_language",
    "prompt_language",
    "image_style",
    "deliverable_type",
    "aspect_ratio",
    "render_size",
    "quality",
    "output_format",
    "api_background",
    "scene_background_mode",
    "camera_angle",
    "shot_framing",
    "composition_rule",
    "lighting_preset",
    "light_source",
    "light_direction",
    "color_grade",
    "brand_or_logo",
    "exact_text",
    "background_description",
    "audience",
    "purpose",
    "source_image_path",
    "mask_image_path",
    "multi_frame_mode",
    "frame_layout",
    "panel_count",
    "continuity_mode",
    "panel_descriptions",
    "factual_reference_mode",
    "verified_reference_facts",
    "reference_sources",
]


def _has_locked_value(value) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip()) and value.strip().lower() != "auto"
    if isinstance(value, list):
        return any(_has_locked_value(item) for item in value)
    return True


def _build_locked_user_params(requested: dict, normalized: dict) -> dict:
    fields = {}
    for field in LOCKABLE_USER_FIELDS:
        if field not in requested:
            continue
        requested_value = requested.get(field)
        if not _has_locked_value(requested_value):
            continue
        normalized_field = "target_language" if field == "prompt_language" else field
        fields[field] = {
            "requested": requested_value,
            "normalized": normalized.get(normalized_field),
            "source": "user",
        }
    return {
        "policy": "User-supplied values are authoritative. Auto decisions may fill missing details but must not override these locked fields.",
        "fields": fields,
        "field_names": sorted(fields),
    }


def _select_text_prompt(prompts: dict, field: str | None) -> str:
    selected = field or "detailed"
    if selected == "variants":
        variants = prompts.get("variants") or []
        return "\n\n".join(str(variant).strip() for variant in variants if str(variant).strip())
    if selected == "edit":
        return (prompts.get("edit") or prompts.get("detailed") or "").strip()
    if selected in {"short", "structured", "detailed"}:
        return (prompts.get(selected) or prompts.get("detailed") or "").strip()
    return (prompts.get("detailed") or "").strip()


def run_skill(payload: dict) -> dict | str:
    payload = validate_input(payload)
    normalized, trace, warnings = resolve(payload)

    # Baseline pass from deterministic core.
    safety = safety_review(payload, normalized)
    baseline_prompts = build_prompts(normalized, safety)
    baseline_render_request = build_render_request(normalized, baseline_prompts["detailed"])
    baseline_quality = evaluate(normalized, baseline_prompts, baseline_render_request, safety)

    # Optional review-module orchestration layer. This is deterministic by default,
    # but its reports mirror the structure that real Agents SDK agents-as-tools can return.
    normalized, orchestration, subagent_reports, merge_report, conflicts = orchestrate(
        payload, normalized, safety, baseline_quality
    )

    # Re-run review/prompt/render/evaluation after orchestration patches and conflict resolution.
    safety = safety_review(payload, normalized)
    prompts = build_prompts(normalized, safety)
    render_request = build_render_request(normalized, prompts["detailed"])
    prompt_quality = evaluate(normalized, prompts, render_request, safety)
    prompts, final_review, reference_research, review_warnings = review_and_repair(normalized, prompts, safety, prompt_quality)
    warnings.extend(review_warnings)
    render_request = build_render_request(normalized, prompts["detailed"])
    prompt_quality = evaluate(normalized, prompts, render_request, safety)
    final_review["post_review_quality_score"] = prompt_quality["score"]
    delta = quality_delta(baseline_quality, prompt_quality)

    result = {
        "status": "completed",
        "requested": payload,
        "normalized": normalized,
        "locked_user_params": _build_locked_user_params(payload, normalized),
        "decision_trace": trace,
        "confidence_score": confidence(trace),
        "orchestration": orchestration,
        "subagent_reports": subagent_reports,
        "merge_report": merge_report,
        "conflict_resolution": conflicts,
        "final_quality_delta": delta,
        "final_review": final_review,
        "reference_research": reference_research,
        "prompts": prompts,
        "prompt_quality": prompt_quality,
        "safety_review": safety,
        "render_request": render_request,
        "metadata": {
            "skill_version": "5.5.0-model-free-locked-params-reference-preflight",
            "api_notes": {
                "renderer_external": True,
                "external_renderer_note": "The API caller supplies the rendering engine outside this skill; current deployment uses gpt-image-2.",
                "size_quality_background_auto": True,
                "supported_sizes": ["1024x1024", "1536x1024", "1024x1536", "auto"],
                "compression_for": ["jpeg", "webp"],
                "transparent_requires": ["png", "webp"],
                "review_module_pattern": "Native execution uses deterministic review modules; host applications may replace them with agents-as-tools for specialist review.",
                "subagent_pattern": "Backward-compatible metadata alias for review modules; reserve handoffs for conversation ownership transfer."
            },
            "unsupported_or_metadata_only": {
                "seed": payload.get("seed"),
                "guidance_scale": payload.get("guidance_scale"),
                "negative_prompt_parameter": False
            }
        },
        "warnings": warnings,
    }
    validate_output(result)
    if payload.get("response_mode") == "text_prompt":
        return _select_text_prompt(prompts, payload.get("text_prompt_field"))
    return result
