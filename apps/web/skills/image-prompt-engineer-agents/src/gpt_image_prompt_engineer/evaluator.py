from .deliverables import REFERENCE_FIDELITY_DELIVERABLES, TEXT_SENSITIVE_DELIVERABLES, guidance_for, reference_paths
from .factual_references import build_reference_research


def evaluate(normalized: dict, prompts: dict, render_request: dict, safety_review: dict) -> dict:
    detailed = prompts.get("detailed","")
    detailed_lower = detailed.lower()
    reference_research = build_reference_research(normalized)
    checks = []
    def check(name, passed, note):
        checks.append({"name": name, "passed": bool(passed), "note": note})
    check("subject", len(normalized.get("topic","")) >= 3, "Topic is present.")
    check("style", normalized.get("image_style") not in (None, "auto"), "Style has been resolved.")
    check("camera", all(normalized.get(k) not in (None, "auto") for k in ["camera_angle","shot_framing","camera_system","lens_focal_length"]), "Camera language is resolved.")
    check("lighting", all(normalized.get(k) not in (None, "auto") for k in ["lighting_preset","light_source","light_direction"]), "Lighting is resolved.")
    check("render_request", bool(render_request.get("image_api")), "Render request is available.")
    check("negative_constraints", bool(prompts.get("negative_constraints")), "Avoid constraints are present.")
    check("length", 180 <= len(detailed) <= 6000, "Detailed prompt has usable length.")
    check("safety", safety_review.get("risk_level") != "high", "No high-risk safety condition.")
    check("deliverable_requirements", bool(guidance_for(normalized, normalized.get("target_language", "en"))), "Deliverable-specific requirements are present.")
    if normalized.get("deliverable_type") in TEXT_SENSITIVE_DELIVERABLES:
        check("text_legibility", "read" in detailed_lower or "อ่าน" in detailed, "Text-sensitive output includes readability and safe-margin guidance.")
    if normalized.get("deliverable_type") in REFERENCE_FIDELITY_DELIVERABLES or reference_paths(normalized):
        check("reference_fidelity", "reference" in detailed_lower or "อ้างอิง" in detailed, "Reference-sensitive output includes fidelity guidance.")
    if reference_research.get("required"):
        check("factual_reference_grounding", "user-provided details as authoritative" in detailed_lower or "ข้อมูลที่ผู้ใช้ระบุเป็นหลัก" in detailed, "Real product/place output preserves user facts and requires verified references.")
    score = int(round(sum(1 for c in checks if c["passed"]) / len(checks) * 100))
    suggestions = []
    if score < 100:
        for c in checks:
            if not c["passed"]:
                suggestions.append(c["note"])
    if normalized.get("deliverable_type") in TEXT_SENSITIVE_DELIVERABLES and normalized.get("quality") != "high":
        suggestions.append("Use quality=high for text-heavy or layout-sensitive images.")
        score = min(score, 92)
    return {"score": score, "checks": checks, "suggestions": suggestions}
