from __future__ import annotations

from copy import deepcopy

from .deliverables import (
    REFERENCE_FIDELITY_DELIVERABLES,
    TEXT_SENSITIVE_DELIVERABLES,
    guidance_for,
    profile_questions,
    reference_paths,
)
from .factual_references import build_reference_research


DELIVERABLE_MARKERS = {
    "poster": ["headline", "focal point"],
    "social_post": ["hook", "mobile"],
    "story_post": ["safe", "hook"],
    "presentation_slide": ["one clear idea", "title"],
    "product_mockup": ["proportions", "geometry"],
    "packaging_mockup": ["label", "proportions"],
    "storyboard": ["character", "continuity"],
    "infographic": ["reading order", "labels"],
    "diagram": ["connectors", "labels"],
    "ui_mockup": ["interface", "labels"],
}


def _check(checks: list[dict], name: str, passed: bool, note: str) -> None:
    checks.append({"name": name, "passed": bool(passed), "note": note})


def _safe_alternative(normalized: dict, safety: dict, lang: str) -> str:
    flags = set(safety.get("flags", []))
    deliverable = str(normalized.get("deliverable_type", "general_image"))
    if "minor_sexual_safety" in flags or "sexual_content_signal" in flags:
        return (
            "ภาพพอร์ตเทรตสุภาพ แต่งกายมิดชิด ไม่โป๊ ไม่สื่อทางเพศ และจัดแสงพรีเมี่ยม"
            if lang == "th"
            else "a respectful, non-explicit portrait with fully clothed styling, premium lighting, and no sexualized framing"
        )
    if "graphic_violence_signal" in flags:
        return (
            "ฉากดราม่าที่ไม่เห็นเลือดหรือบาดแผลรุนแรง เน้นอารมณ์และแสงเงาแทนความรุนแรง"
            if lang == "th"
            else "a non-graphic dramatic scene that avoids blood, gore, and explicit injury detail"
        )
    if "self_harm_signal" in flags:
        return (
            "ภาพเชิงให้กำลังใจและปลอดภัย เน้นการขอความช่วยเหลือ แสงอบอุ่น และบรรยากาศดูแลกัน"
            if lang == "th"
            else "a safe supportive image about seeking help, warm lighting, and care without depicting self-harm"
        )
    if "hate_signal" in flags:
        return (
            "ภาพต่อต้านความเกลียดชังที่ไม่แสดงสัญลักษณ์ข่มขู่หรือโฆษณาชวนเชื่อ"
            if lang == "th"
            else "an anti-hate visual that avoids intimidation symbols, propaganda, or praise"
        )
    return (
        f"ภาพ {deliverable} ที่ปลอดภัย เหมาะสม และไม่ทำให้เข้าใจผิด"
        if lang == "th"
        else f"a safe, appropriate, non-deceptive {deliverable} image"
    )


def _replace_topic(prompts: dict, original_topic: str, replacement: str) -> dict:
    patched = deepcopy(prompts)
    for key in ("short", "detailed", "structured", "negative_constraints", "edit"):
        value = patched.get(key)
        if isinstance(value, str):
            patched[key] = value.replace(original_topic, replacement)
    variants = []
    for variant in patched.get("variants") or []:
        variants.append(str(variant).replace(original_topic, replacement))
    patched["variants"] = variants
    return patched


def _append_to_prompt(prompts: dict, sentence: str, lang: str) -> dict:
    patched = deepcopy(prompts)
    if not sentence:
        return patched
    suffix = sentence.strip()
    if suffix and not suffix.endswith((".", "。")):
        suffix += "."
    for key in ("detailed", "structured", "edit"):
        value = patched.get(key)
        if isinstance(value, str) and suffix not in value:
            separator = "\n" if key == "structured" else " "
            patched[key] = value.rstrip() + separator + suffix
    patched["variants"] = [
        (str(variant).rstrip() + " " + suffix) if suffix not in str(variant) else str(variant)
        for variant in patched.get("variants") or []
    ]
    if lang == "th":
        patched["negative_constraints"] = patched.get("negative_constraints", "")
    return patched


def _missing_inputs(normalized: dict, reference_research: dict) -> tuple[list[str], list[str], list[str]]:
    deliverable = str(normalized.get("deliverable_type", "general_image"))
    refs = reference_paths(normalized)
    missing: list[str] = []
    assumptions: list[str] = []
    questions: list[str] = []

    if deliverable in {"product_mockup", "packaging_mockup"} and not refs:
        missing.append("source_image_path")
        assumptions.append("No reference image was supplied; the prompt uses the written topic as the visual source of truth.")
    if deliverable in TEXT_SENSITIVE_DELIVERABLES and not normalized.get("exact_text"):
        missing.append("exact_text")
        assumptions.append("No exact in-image text was supplied; the prompt reserves readable text zones without inventing mandatory copy.")
    if deliverable in {"social_post", "story_post", "poster", "thumbnail"} and not normalized.get("audience"):
        missing.append("audience")
        assumptions.append("Audience is inferred from the topic because no audience was supplied.")
    if deliverable == "storyboard" and len(normalized.get("panel_descriptions") or []) < int(normalized.get("panel_count", 1) or 1):
        missing.append("panel_descriptions")
        assumptions.append("Storyboard panel beats were auto-filled or generalized because not every panel was specified.")
    if reference_research.get("required") and reference_research.get("status") not in {"verified"}:
        if not reference_research.get("verified_reference_facts"):
            missing.append("verified_reference_facts")
        if not reference_research.get("reference_sources"):
            missing.append("reference_sources")
        if reference_research.get("status") == "visual_reference_only":
            assumptions.append("Only visual reference images were supplied; factual product/place details still need verified sources before final factual accuracy is claimed.")
        else:
            assumptions.append("Product/place factual grounding is required; use official or reputable sources and preserve user-provided facts as authoritative.")

    questions.extend(profile_questions(deliverable))
    return missing, assumptions, questions


def review_and_repair(normalized: dict, prompts: dict, safety: dict, prompt_quality: dict) -> tuple[dict, dict, dict, list[str]]:
    lang = normalized.get("target_language", "en")
    deliverable = str(normalized.get("deliverable_type", "general_image"))
    checks: list[dict] = []
    repairs: list[str] = []
    warnings: list[str] = []
    patched = deepcopy(prompts)
    detailed = patched.get("detailed", "")
    reference_research = build_reference_research(normalized)

    _check(checks, "safety_gate", safety.get("status") != "blocked", "Safety review is not blocked.")
    _check(checks, "quality_gate", int(prompt_quality.get("score", 0)) >= 80, "Prompt quality score is at least 80.")
    _check(checks, "deliverable_guidance", bool(guidance_for(normalized, lang)), "Deliverable guidance is available.")
    _check(checks, "text_legibility", deliverable not in TEXT_SENSITIVE_DELIVERABLES or "read" in detailed.lower() or "อ่าน" in detailed, "Text-sensitive deliverables include legibility instructions.")
    _check(checks, "reference_fidelity", deliverable not in REFERENCE_FIDELITY_DELIVERABLES or "reference" in detailed.lower() or "อ้างอิง" in detailed, "Reference-sensitive deliverables include fidelity instructions.")
    _check(checks, "factual_reference_grounding", not reference_research.get("required") or reference_research.get("status") == "verified", "Real product/place references include verified facts and clear sources.")

    markers = DELIVERABLE_MARKERS.get(deliverable, [])
    if markers:
        lower = detailed.lower()
        marker_passed = True if lang == "th" else all(marker in lower for marker in markers)
        _check(checks, "deliverable_markers", marker_passed, f"{deliverable} prompt includes required markers: {', '.join(markers)}.")
        if not marker_passed:
            patched = _append_to_prompt(patched, guidance_for(normalized, lang), lang)
            repairs.append(f"Appended missing {deliverable} guidance.")

    missing, assumptions, questions = _missing_inputs(normalized, reference_research)

    if safety.get("status") == "blocked" or safety.get("risk_level") == "high":
        replacement = _safe_alternative(normalized, safety, lang)
        patched = _replace_topic(patched, normalized.get("topic", ""), replacement)
        repairs.append("Replaced unsafe topic wording with a safe alternative before return.")
        warnings.append("Unsafe or high-risk topic wording was converted to a safe alternative in the final prompt.")

    if deliverable in REFERENCE_FIDELITY_DELIVERABLES and reference_paths(normalized):
        note = (
            "Final review: preserve the supplied reference image geometry, proportions, colors, logo placement, labels, and readable text exactly unless the user explicitly asked to edit them."
            if lang != "th"
            else "ตรวจรอบสุดท้าย: รักษารูปทรง สัดส่วน สี ตำแหน่งโลโก้ ฉลาก และตัวอักษรจากภาพอ้างอิงให้ตรงที่สุด ยกเว้นส่วนที่ผู้ใช้สั่งให้แก้"
        )
        patched = _append_to_prompt(patched, note, lang)
        repairs.append("Reinforced reference-image fidelity.")

    if deliverable == "storyboard":
        note = (
            "Final review: verify every panel reads as one continuous story with locked character identity, wardrobe, props, location logic, lighting direction, and style."
            if lang != "th"
            else "ตรวจรอบสุดท้าย: ทุกช่องต้องต่อเนื่องเป็นเรื่องเดียวกัน และล็อกเอกลักษณ์ตัวละคร เสื้อผ้า พร็อพ ตรรกะสถานที่ ทิศทางแสง และสไตล์ภาพให้ตรงกัน"
        )
        patched = _append_to_prompt(patched, note, lang)
        repairs.append("Reinforced storyboard continuity.")

    if reference_research.get("required") and reference_research.get("status") != "verified":
        note = (
            "Final review: reference research is required before claiming real product/place accuracy. Search official or reputable sources, preserve all user-provided details, and use verified facts only to supplement missing visual details."
            if lang != "th"
            else "ตรวจรอบสุดท้าย: ต้องค้นและแนบข้อมูลอ้างอิงก่อนอ้างความถูกต้องของสินค้า/สถานที่จริง รักษาข้อมูลที่ผู้ใช้ระบุไว้ทั้งหมด และใช้ข้อมูลที่ตรวจแล้วเพื่อเสริมรายละเอียดที่ขาดเท่านั้น"
        )
        patched = _append_to_prompt(patched, note, lang)
        repairs.append("Added factual reference research requirement.")

    failed = [check for check in checks if not check["passed"]]
    status = "passed"
    if safety.get("status") == "blocked":
        status = "blocked"
    elif missing:
        status = "needs_input"
    elif repairs:
        status = "repaired"
    elif failed:
        status = "requires_revision"

    final_review = {
        "status": status,
        "approved": status in {"passed", "repaired"} and safety.get("status") != "blocked",
        "requires_revision": status in {"blocked", "requires_revision", "needs_input"},
        "pre_review_quality_score": int(prompt_quality.get("score", 0)),
        "post_review_quality_score": int(prompt_quality.get("score", 0)),
        "checks": checks,
        "applied_repairs": repairs,
        "missing_inputs": sorted(set(missing)),
        "assumptions": assumptions,
        "clarifying_questions": questions,
        "block_reason": "; ".join(safety.get("notes", [])) if safety.get("status") == "blocked" else None,
    }
    return patched, final_review, reference_research, warnings
