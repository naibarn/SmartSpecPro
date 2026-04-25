from .validators import validate_input, validate_output
from .decision_engine import resolve, confidence
from .safety import review as safety_review
from .prompt_builder import build_prompts
from .render_request import build_render_request
from .evaluator import evaluate
from .subagents import orchestrate, quality_delta
from .final_reviewer import review_and_repair


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

    # Optional subagent-ready orchestration layer. This is deterministic by default,
    # but its reports mirror the structure that real Agents SDK subagents/tools can return.
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
            "skill_version": "5.4.0-subagents-model-free-final-review-reference-grounding",
            "api_notes": {
                "renderer_external": True,
                "external_renderer_note": "The API caller supplies the rendering engine outside this skill; current deployment uses gpt-image-2.",
                "size_quality_background_auto": True,
                "supported_sizes": ["1024x1024", "1536x1024", "1024x1536", "auto"],
                "compression_for": ["jpeg", "webp"],
                "transparent_requires": ["png", "webp"],
                "subagent_pattern": "Use agents-as-tools for specialist review; reserve handoffs for conversation ownership transfer."
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
