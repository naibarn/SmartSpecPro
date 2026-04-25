from __future__ import annotations

from copy import deepcopy

from .deliverables import (
    PREMIUM_DELIVERABLES,
    REFERENCE_FIDELITY_DELIVERABLES,
    TEXT_SENSITIVE_DELIVERABLES,
    guidance_for,
    profile_modifiers,
    reference_paths,
)
from .factual_references import build_reference_research


SUBAGENT_ROLES = {
    "intent_triage": "Classifies prompt intent and complexity.",
    "visual_director": "Improves composition, subject hierarchy, background, and mood.",
    "cinematographer": "Improves camera, lens, depth of field, movement, lighting, and film language.",
    "layout_multiframe": "Improves multi-frame, storyboard, grid, before/after, and contact sheet layouts.",
    "deliverable_designer": "Reviews deliverable-specific layout, hook, hierarchy, and premium production requirements.",
    "reference_fidelity": "Reviews reference-image identity, product, logo, label, and packaging preservation.",
    "reference_researcher": "Plans product/place reference research from official or reputable sources without overriding user details.",
    "localization": "Keeps multilingual prompts natural while preserving technical image language.",
    "safety_policy": "Reviews age, public figure, brand, character, and regulated-claim risks.",
    "prompt_critic": "Scores and optimizes clarity, contradictions, and prompt usefulness."
}


def _contains_any(text: str, words: list[str]) -> bool:
    t = text.lower()
    return any(w.lower() in t for w in words)


def _complexity(normalized: dict, safety: dict) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    topic = normalized.get("topic", "")
    if normalized.get("image_style") in {"cinematic", "product_ad", "infographic", "ui_mockup", "fashion_lookbook"}:
        score += 1
        reasons.append("specialized style")
    if normalized.get("deliverable_type") in PREMIUM_DELIVERABLES or normalized.get("deliverable_type") in TEXT_SENSITIVE_DELIVERABLES:
        score += 1
        reasons.append("specialized deliverable")
    if normalized.get("deliverable_type") in REFERENCE_FIDELITY_DELIVERABLES or reference_paths(normalized):
        score += 1
        reasons.append("reference or fidelity-sensitive workflow")
    if build_reference_research(normalized).get("required"):
        score += 1
        reasons.append("product/place factual research required")
    if normalized.get("multi_frame_mode") not in {"single", None}:
        score += 2
        reasons.append("multi-frame workflow")
    if normalized.get("mode") == "edit":
        score += 1
        reasons.append("image edit workflow")
    if normalized.get("exact_text"):
        score += 1
        reasons.append("exact text handling")
    if safety.get("flags"):
        score += 2
        reasons.append("safety flags")
    if _contains_any(topic, ["cinematic", "storyboard", "โฆษณา", "product", "infographic", "หลายเฟรม", "หลายช่อง"]):
        score += 1
        reasons.append("complex topic keywords")
    return score, reasons


def choose_orchestration(payload: dict, normalized: dict, safety: dict) -> dict:
    requested = normalized.get("orchestration_mode", payload.get("orchestration_mode", "auto"))
    enabled = bool(normalized.get("enable_subagents", payload.get("enable_subagents", True)))
    complexity, reasons = _complexity(normalized, safety)

    if requested == "off" or not enabled:
        mode = "off"
        selected: list[str] = []
        reason = "subagents disabled by request"
    elif requested == "single_pass":
        mode = "single_pass"
        selected = ["prompt_critic"] if normalized.get("quality_review_passes", 1) > 0 else []
        reason = "single-pass review requested"
    elif requested == "subagents" or (requested == "auto" and complexity >= 2):
        mode = "subagents"
        selected = ["intent_triage", "visual_director", "prompt_critic"]
        if normalized.get("deliverable_type") in PREMIUM_DELIVERABLES or normalized.get("deliverable_type") in TEXT_SENSITIVE_DELIVERABLES:
            selected.append("deliverable_designer")
        if normalized.get("deliverable_type") in REFERENCE_FIDELITY_DELIVERABLES or reference_paths(normalized):
            selected.append("reference_fidelity")
        if build_reference_research(normalized).get("required"):
            selected.append("reference_researcher")
        if normalized.get("image_style") == "cinematic" or normalized.get("cinematic_mode") == "on":
            selected.append("cinematographer")
        if normalized.get("multi_frame_mode") not in {"single", None}:
            selected.append("layout_multiframe")
        if normalized.get("target_language") != "en":
            selected.append("localization")
        if safety.get("flags") or normalized.get("safety_review_level") in {"strict", "auto"}:
            selected.append("safety_policy")
        budget = normalized.get("subagent_budget", "balanced")
        if budget == "low":
            selected = selected[:3]
        elif budget == "high":
            for extra in ["deliverable_designer", "reference_fidelity", "reference_researcher", "cinematographer", "layout_multiframe", "localization", "safety_policy"]:
                if extra not in selected:
                    selected.append(extra)
        reason = "; ".join(reasons) if reasons else "auto complexity threshold reached"
    else:
        mode = "single_pass"
        selected = ["prompt_critic"] if normalized.get("quality_review_passes", 1) > 0 else []
        reason = "simple prompt; deterministic core plus critic is sufficient"

    return {
        "mode": mode,
        "strategy": "agents_as_tools_ready" if mode == "subagents" else "deterministic_core",
        "subagents_enabled": bool(selected),
        "selected_subagents": selected,
        "reason": reason,
    }


def _report(name: str, confidence: float, summary: str, recommendations: list[str], patch: dict | None = None) -> dict:
    return {
        "name": name,
        "role": SUBAGENT_ROLES[name],
        "status": "completed",
        "confidence": round(float(confidence), 3),
        "summary": summary,
        "recommendations": recommendations,
        "patch": patch or {},
    }


def build_subagent_reports(orchestration: dict, normalized: dict, safety: dict, prompt_quality_before: dict) -> list[dict]:
    reports: list[dict] = []
    selected = orchestration.get("selected_subagents", [])
    style = normalized.get("image_style")
    deliverable = normalized.get("deliverable_type")
    lang = normalized.get("target_language")
    topic = normalized.get("topic", "")

    if "intent_triage" in selected:
        reports.append(_report(
            "intent_triage", 0.88,
            f"Intent resolved as style={style}, deliverable={deliverable}, mode={normalized.get('mode')}.",
            ["Keep the skill output structured and model-free.", "Route only complex prompts to specialist subagents."],
            {"metadata_tags": [style, deliverable, normalized.get("mode")]}
        ))

    if "visual_director" in selected:
        reports.append(_report(
            "visual_director", 0.84,
            "Visual composition should emphasize subject hierarchy, clean negative space, and coherent background choices.",
            ["Add subject separation and visual hierarchy.", "Keep background supportive rather than distracting."],
            {"append_modifiers": ["clear subject separation", "intentional visual hierarchy", "coherent background supporting the subject"]}
        ))

    if "cinematographer" in selected:
        reports.append(_report(
            "cinematographer", 0.86,
            "Camera and lighting language should remain cinematic but not over-constrain the renderer.",
            ["Use film-still composition.", "Keep lens/depth/lighting consistent.", "Avoid conflicting blur for text-heavy layouts."],
            {"append_modifiers": ["film-still composition", "motivated lighting", "controlled depth and shadow transitions"]}
        ))

    if "layout_multiframe" in selected:
        panel_count = normalized.get("panel_count", 4)
        reports.append(_report(
            "layout_multiframe", 0.82,
            f"Multi-frame layout should keep {panel_count} panels readable and consistent.",
            ["Use per-panel descriptions when none are supplied.", "Keep subject continuity explicit across panels."],
            {"panel_descriptions_if_empty": [f"Panel {i+1}: distinct but consistent view of the same concept" for i in range(min(int(panel_count), 6))]}
        ))

    if "deliverable_designer" in selected:
        guidance = guidance_for(normalized, lang if lang in {"th", "en"} else "en")
        reports.append(_report(
            "deliverable_designer", 0.87,
            f"{deliverable} requires deliverable-specific hierarchy, format, and production cues.",
            ["Apply deliverable-specific layout rules.", "Keep auto choices aligned with the user's topic and platform context.", "Prioritize premium spacing and readability for commercial outputs."],
            {"append_modifiers": profile_modifiers(normalized), "deliverable_guidance": guidance}
        ))

    if "reference_fidelity" in selected:
        reports.append(_report(
            "reference_fidelity", 0.89,
            "Reference-sensitive workflows must preserve source image geometry, identity, labels, logos, and proportions unless explicitly edited.",
            ["Use supplied references as the source of truth.", "For product and packaging mockups, keep labels readable and product shape undistorted.", "Do not invent extra logos, claims, or text."],
            {"append_modifiers": ["reference-image fidelity", "locked product geometry", "readable labels and logos"], "append_avoid": ["warped reference identity", "invented logo details", "changed product proportions"]}
        ))

    if "reference_researcher" in selected:
        research = build_reference_research(normalized)
        reports.append(_report(
            "reference_researcher", 0.88,
            f"Product/place reference research status is {research['status']}.",
            [
                "Search official or reputable product/place sources before claiming factual visual accuracy.",
                "Use verified references only to supplement missing visual details.",
                "Never replace user-supplied details; preserve them and flag conflicts."
            ],
            {
                "reference_research_status": research["status"],
                "search_queries": research["search_queries"],
                "source_priority": research["source_priority"],
            }
        ))

    if "localization" in selected:
        reports.append(_report(
            "localization", 0.8,
            f"Prompt language is {lang}; preserve core technical camera terms only when useful.",
            ["Use natural localized prose.", "Keep essential visual terms understandable to the renderer."],
            {"append_modifiers": ["natural localized wording with preserved visual technique terms"]}
        ))

    if "safety_policy" in selected:
        recs = ["Keep the final prompt non-deceptive, respectful, and rights-aware."]
        patch = {}
        if "age_sensitive" in safety.get("flags", []):
            recs.append("For an 18-year-old or younger-looking subject, keep styling non-sexualized and age-appropriate.")
            patch["append_avoid"] = ["sexualized styling", "revealing outfit emphasis", "adult-coded pose for a young subject"]
        if "brand_or_logo" in safety.get("flags", []):
            recs.append("Use brand/logo references only with rights or supplied assets.")
        reports.append(_report(
            "safety_policy", 0.9,
            f"Safety flags: {', '.join(safety.get('flags', [])) or 'none'}.",
            recs,
            patch
        ))

    if "prompt_critic" in selected:
        score = prompt_quality_before.get("score", 0)
        reports.append(_report(
            "prompt_critic", 0.83,
            f"Initial prompt quality score is {score}. Optimize clarity, avoid contradictions, and keep prompt concise enough for rendering.",
            ["Resolve contradictory constraints.", "Ensure camera, light, background, and deliverable all agree.", "Keep final output JSON-valid."],
            {"append_modifiers": ["resolved constraints", "concise renderer-friendly detail"]}
        ))

    return reports


def resolve_conflicts(normalized: dict) -> tuple[dict, list[dict]]:
    n = deepcopy(normalized)
    conflicts: list[dict] = []

    if n.get("deliverable_type") in TEXT_SENSITIVE_DELIVERABLES:
        if n.get("depth_of_field") in {"shallow", "medium"}:
            n["depth_of_field"] = "deep"
            conflicts.append({
                "field": "depth_of_field",
                "issue": "Text-heavy or layout-sensitive deliverables need readable full-frame detail.",
                "decision": "deep",
                "reason": "Prioritized legibility over photographic bokeh."
            })
        if n.get("background_blur") in {"medium", "strong"}:
            n["background_blur"] = "none"
            conflicts.append({
                "field": "background_blur",
                "issue": "Background blur can reduce readability for information design.",
                "decision": "none",
                "reason": "Prioritized crisp infographic/UI elements."
            })

    if n.get("multi_frame_mode") not in {"single", None} and n.get("frame_layout") == "1x1":
        n["frame_layout"] = "2x2"
        n["panel_count"] = max(int(n.get("panel_count", 1) or 1), 4)
        conflicts.append({
            "field": "frame_layout",
            "issue": "Multi-frame mode cannot be expressed clearly with a 1x1 layout.",
            "decision": "2x2",
            "reason": "Selected a readable default grid for multi-frame output."
        })

    return n, conflicts


def merge_reports(normalized: dict, reports: list[dict]) -> tuple[dict, dict]:
    n = deepcopy(normalized)
    applied: list[str] = []
    discarded: list[str] = []
    notes: list[str] = []
    modifiers = list(n.get("modifiers", []))
    avoid = list(n.get("avoid", []))

    for report in reports:
        patch = report.get("patch", {})
        for item in patch.get("append_modifiers", []):
            if item not in modifiers:
                modifiers.append(item)
                applied.append(f"{report['name']}: modifier '{item}'")
        for item in patch.get("append_avoid", []):
            if item not in avoid:
                avoid.append(item)
                applied.append(f"{report['name']}: avoid '{item}'")
        if not n.get("panel_descriptions") and patch.get("panel_descriptions_if_empty"):
            n["panel_descriptions"] = patch["panel_descriptions_if_empty"]
            applied.append(f"{report['name']}: generated panel descriptions")
        for tag in patch.get("metadata_tags", []):
            # Tags are informational; avoid changing schema-heavy metadata.
            if tag:
                notes.append(f"{report['name']} tag: {tag}")

    n["modifiers"] = modifiers
    n["avoid"] = avoid
    return n, {
        "status": "completed",
        "applied_recommendations": applied,
        "discarded_recommendations": discarded,
        "notes": notes or ["No merge conflicts while applying subagent patches."]
    }


def quality_delta(before: dict, after: dict) -> dict:
    b = int(before.get("score", 0))
    a = int(after.get("score", 0))
    return {
        "before_score": b,
        "after_score": a,
        "delta": a - b,
        "notes": ["Quality did not decrease after orchestration." if a >= b else "Quality decreased; review subagent patches."]
    }


def orchestrate(payload: dict, normalized: dict, safety: dict, prompt_quality_before: dict) -> tuple[dict, dict, list[dict], dict, list[dict]]:
    orchestration = choose_orchestration(payload, normalized, safety)
    reports = build_subagent_reports(orchestration, normalized, safety, prompt_quality_before)
    merged, merge_report = merge_reports(normalized, reports)
    merged, conflicts = resolve_conflicts(merged)
    if conflicts:
        merge_report["notes"].append(f"Resolved {len(conflicts)} visual conflict(s).")
    return merged, orchestration, reports, merge_report, conflicts
