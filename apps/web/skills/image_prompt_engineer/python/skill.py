"""
Image Prompt Engineer (v2.2)
- Model-agnostic prompt builder with full generation mode support
- Added: Hallucination control to prevent adding nationality/ethnicity without request
- Supports: text-to-image, image-to-image, inpaint, outpaint, variation
No external dependencies.
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional


DEFAULT_AVOID = [
    "low-res, blurry, smeared detail",
    "over-smooth plastic skin, porcelain look",
    "warped anatomy, distorted face geometry",
    "AI artifacts, extra fingers, melted textures",
    "unwanted text, watermark, signature, logo",
    "explicit sexual content, fetish content, non-consensual content",
    "graphic gore, internal anatomy depiction",
]

MENU = (
    "Menu: 1=Target behavior | 2=Edit Sacred Mods | 3=Generate | 4=Ideas×10 | 5=Angles×10 | "
    "6=Style | 7=Editorial text | 8=Infographic | 9=Compact↔Full | 0=Export | "
    "Flags: S=Storyboard V=VFX R=RealisticSkin F=IdentityLock"
)

# ============================================================================
# HALLUCINATION CONTROL - NEW IN v2.1
# ============================================================================

FORBIDDEN_NATIONALITY_TERMS = [
    # Asian (English)
    "korean", "japanese", "chinese", "thai", "vietnamese", 
    "indonesian", "malaysian", "singaporean", "filipino",
    # Asian (Thai)
    "เกาหลี", "ญี่ปุ่น", "จีน", "ไทย", "เวียดนาม",
    "อินโดนีเซีย", "มาเลเซีย", "สิงคโปร์", "ฟิลิปปินส์",
    # Western (English)
    "american", "european", "british", "french", "german",
    "italian", "spanish", "russian",
    # Western (Thai)
    "อเมริกัน", "ยุโรป", "อังกฤษ", "ฝรั่งเศส", "เยอรมัน",
    "อิตาลี", "สเปน", "รัสเซีย",
    # Other
    "african", "middle eastern", "latin", "mexican", "brazilian",
    # Fashion styles that imply nationality (English)
    "k-fashion", "korean fashion", "japanese fashion",
    "korean street fashion", "j-fashion", "k-style",
    # Fashion styles (Thai)
    "แฟชั่นเกาหลี", "แฟชั่นญี่ปุ่น", "แฟชั่นจีน", "แฟชั่นไทย",
    "สไตล์เกาหลี", "สไตล์ญี่ปุ่น", "เค-แฟชั่น"
]


def detect_hallucinated_nationality(request: str, output_prompt: str) -> Dict[str, Any]:
    """
    Detect if nationality/ethnicity was added without being in the request
    
    Returns:
        {
            "has_hallucination": bool,
            "found_terms": list,
            "suggestions": list
        }
    """
    request_lower = request.lower()
    output_lower = output_prompt.lower()
    
    found_terms = []
    
    for term in FORBIDDEN_NATIONALITY_TERMS:
        # Check if term is in output but NOT in request
        if term in output_lower and term not in request_lower:
            found_terms.append(term)
    
    has_hallucination = len(found_terms) > 0
    
    suggestions = []
    if has_hallucination:
        suggestions.append(f"Auto-corrected: Removed hallucinated nationality terms: {', '.join(found_terms)}")
        suggestions.append("Use generic descriptions instead of specific nationalities")
    
    return {
        "has_hallucination": has_hallucination,
        "found_terms": found_terms,
        "suggestions": suggestions
    }


def clean_hallucinated_content(prompt: str, request: str) -> str:
    """
    Remove hallucinated nationality/ethnicity content from prompt
    
    Args:
        prompt: The generated prompt
        request: The original user request
        
    Returns:
        Cleaned prompt without hallucinated content
    """
    cleaned = prompt
    request_lower = request.lower()
    
    # Replacements for common hallucinations
    replacements = {
        # Korean fashion (English)
        "korean fashion": "modern, stylish fashion",
        "korean street fashion": "contemporary street fashion",
        "k-fashion": "trendy fashion",
        "k-style": "trendy style",
        "typical of korean": "with contemporary",
        "with modern, trendy korean": "with modern, trendy",
        
        # Korean fashion (Thai) - only if not in request
        # These won't be applied if user wrote them in Thai
        
        # Japanese (English)
        "japanese fashion": "modern fashion",
        "japanese style": "elegant style",
        "j-fashion": "trendy fashion",
        
        # Chinese (English)
        "chinese fashion": "elegant fashion",
        "chinese style": "traditional style",
        
        # Generic nationality patterns
        "designs typical of korean street fashion": "designs with contemporary street fashion influence",
        "inspired by korean": "with contemporary",
    }
    
    # Only apply replacements if nationality wasn't in original request
    for bad_phrase, good_phrase in replacements.items():
        if bad_phrase.lower() not in request_lower:
            # Case-insensitive replace
            pattern = re.compile(re.escape(bad_phrase), re.IGNORECASE)
            cleaned = pattern.sub(good_phrase, cleaned)
    
    return cleaned




# ============================================================================
# REALITY CHECK - NEW IN v2.2
# ============================================================================

LOCATION_RULES = {
    "indoor": {
        "incompatible": ["wind-swept", "strong wind", "breeze", "rain", "raining", "direct sunlight"],
        "suggestions": {"wind-swept": "natural hair movement", "direct sunlight": "soft ambient lighting"}
    },
    "shopping mall": {
        "incompatible": ["wind-swept", "strong breeze", "rain", "direct sunlight", "sunset"],
        "suggestions": {"wind-swept": "slightly tousled hair", "direct sunlight": "warm artificial lighting"}
    },
    "underwater": {
        "incompatible": ["standing", "walking", "wind", "fire", "dry hair"],
        "suggestions": {"standing": "floating", "walking": "swimming", "wind": "water current"}
    },
    "beach": {
        "incompatible": ["heavy winter coat", "snow boots", "thick scarf"],
        "suggestions": {"heavy winter coat": "light summer clothing"}
    }
}

TIME_RULES = {
    "midnight": {
        "incompatible": ["bright sunlight", "sun rays", "daylight"],
        "suggestions": {"bright sunlight": "moonlight", "sun rays": "artificial light rays"}
    },
    "noon": {
        "incompatible": ["sunset", "sunrise", "golden hour", "moonlight"],
        "suggestions": {"sunset": "midday sun", "moonlight": "bright sunlight"}
    }
}


def detect_location(prompt: str) -> List[str]:
    """ตรวจจับสถานที่จาก prompt"""
    prompt_lower = prompt.lower()
    detected = []
    
    locations = {
        "indoor": ["indoor", "inside", "interior"],
        "shopping mall": ["shopping mall", "mall", "shopping center"],
        "underwater": ["underwater", "beneath the sea", "submerged"],
        "beach": ["beach", "shore", "seaside"]
    }
    
    for loc, keywords in locations.items():
        if any(keyword in prompt_lower for keyword in keywords):
            detected.append(loc)
    
    return detected


def detect_time(prompt: str) -> List[str]:
    """ตรวจจับเวลาจาก prompt"""
    prompt_lower = prompt.lower()
    detected = []
    
    times = {
        "midnight": ["midnight", "middle of the night"],
        "noon": ["noon", "midday"],
        "golden hour": ["golden hour", "sunset", "sunrise"]
    }
    
    for time, keywords in times.items():
        if any(keyword in prompt_lower for keyword in keywords):
            detected.append(time)
    
    return detected


def validate_realism(prompt: str) -> Dict[str, Any]:
    """
    ตรวจสอบความสอดคล้องกับความเป็นจริง
    
    Returns:
        {
            "is_realistic": bool,
            "realism_score": int,
            "issues_found": int,
            "issues": list,
            "corrected_prompt": str,
            "warnings": list
        }
    """
    issues = []
    warnings = []
    corrected_prompt = prompt
    
    # 1. ตรวจสอบ Location Rules
    locations = detect_location(prompt)
    for location in locations:
        if location in LOCATION_RULES:
            rules = LOCATION_RULES[location]
            for incompatible in rules["incompatible"]:
                if incompatible.lower() in prompt.lower():
                    suggestion = rules["suggestions"].get(incompatible, "remove this element")
                    issues.append({
                        "type": "location_inconsistency",
                        "location": location,
                        "problem": f"'{incompatible}' is incompatible with {location}",
                        "suggestion": f"Replace with: {suggestion}"
                    })
                    
                    # แก้ไขอัตโนมัติ
                    pattern = re.compile(re.escape(incompatible), re.IGNORECASE)
                    corrected_prompt = pattern.sub(suggestion, corrected_prompt)
                    
                    warnings.append(
                        f"Reality Check: '{incompatible}' in {location} → changed to '{suggestion}'"
                    )
    
    # 2. ตรวจสอบ Time Rules
    times = detect_time(prompt)
    for time in times:
        if time in TIME_RULES:
            rules = TIME_RULES[time]
            for incompatible in rules["incompatible"]:
                if incompatible.lower() in prompt.lower():
                    suggestion = rules["suggestions"].get(incompatible, "remove this element")
                    issues.append({
                        "type": "time_inconsistency",
                        "time": time,
                        "problem": f"'{incompatible}' is incompatible with {time}",
                        "suggestion": f"Replace with: {suggestion}"
                    })
                    
                    # แก้ไขอัตโนมัติ
                    pattern = re.compile(re.escape(incompatible), re.IGNORECASE)
                    corrected_prompt = pattern.sub(suggestion, corrected_prompt)
                    
                    warnings.append(
                        f"Reality Check: '{incompatible}' at {time} → changed to '{suggestion}'"
                    )
    
    # 3. ตรวจสอบ Underwater Physics
    if "underwater" in prompt.lower():
        if "standing" in prompt.lower() and "floating" not in prompt.lower():
            pattern = re.compile(r'\bstanding\b', re.IGNORECASE)
            corrected_prompt = pattern.sub("floating", corrected_prompt)
            issues.append({
                "type": "physics_violation",
                "problem": "Standing underwater (should be floating)",
                "suggestion": "Changed 'standing' to 'floating'"
            })
            warnings.append("Reality Check: Changed 'standing' to 'floating' for underwater scene")
    
    # สรุปผลลัพธ์
    is_realistic = len(issues) == 0
    realism_score = max(0, 100 - (len(issues) * 15))
    
    return {
        "is_realistic": is_realistic,
        "realism_score": realism_score,
        "issues_found": len(issues),
        "issues": issues,
        "corrected_prompt": corrected_prompt,
        "warnings": warnings,
        "original_prompt": prompt
    }


# ============================================================================
# CORE FUNCTIONS (from v2.0)
# ============================================================================

def _has(opt_list: List[str], token: str) -> bool:
    """Check if token exists in options list"""
    return any(str(x).strip().upper() == token for x in (opt_list or []))


def validate_generation_mode(payload: Dict[str, Any]) -> None:
    """Validate inputs match the generation_mode"""
    mode = payload.get("generation_mode", "text_to_image")
    ref_images = payload.get("reference_images", [])
    mask = payload.get("edit_mask", {})
    outpaint = payload.get("outpaint_config", {})
    
    if mode == "text_to_image":
        # Text-to-image should not have reference images
        pass  # We'll allow it for flexibility
    
    elif mode == "image_to_image":
        if not ref_images:
            raise ValueError("image_to_image mode requires at least one reference_image")
    
    elif mode == "inpaint":
        if not ref_images:
            raise ValueError("inpaint mode requires at least one reference_image")
        if not mask or not mask.get("segment_prompt", "").strip():
            raise ValueError("inpaint mode requires edit_mask with segment_prompt")
    
    elif mode == "outpaint":
        if not ref_images:
            raise ValueError("outpaint mode requires exactly one reference_image")
        if not outpaint:
            raise ValueError("outpaint mode requires outpaint_config")
        # Check at least one expansion
        if not any([
            outpaint.get("expand_left", 0) > 0,
            outpaint.get("expand_right", 0) > 0,
            outpaint.get("expand_top", 0) > 0,
            outpaint.get("expand_bottom", 0) > 0
        ]):
            raise ValueError("outpaint mode requires at least one expand direction > 0")


def build_text_to_image_prompt(payload: Dict[str, Any]) -> str:
    """Build prompt for text-to-image mode"""
    request = payload.get("request", "")
    style = payload.get("style", "")
    vfx = payload.get("vfx", {})
    
    lines = []
    lines.append(f"TEXT-TO-IMAGE: {request}")
    lines.append("")
    
    if style and style != "na":
        lines.append(f"Style: {style}")
    
    # VFX effects
    if isinstance(vfx, dict):
        effects = vfx.get("effects", [])
        if effects:
            effects_str = ", ".join(effects)
            lines.append(f"VFX Effects: {effects_str}")
    
    lines.append("")
    lines.append("Technical requirements:")
    lines.append("- High detail and sharpness")
    lines.append("- Coherent lighting from single direction")
    lines.append("- Physically plausible shadows")
    lines.append("- No AI artifacts or distortions")
    
    return "\n".join(lines)


def build_image_to_image_prompt(payload: Dict[str, Any]) -> str:
    """Build prompt for image-to-image mode"""
    request = payload.get("request", "")
    ref_images = payload.get("reference_images", [])
    identity_lock = payload.get("identity_lock", "none")
    adv_params = payload.get("advanced_params", {})
    
    lines = []
    lines.append(f"IMAGE-TO-IMAGE TRANSFORMATION: {request}")
    lines.append("")
    
    # Reference images info
    lines.append(f"Using {len(ref_images)} reference image(s):")
    for idx, ref in enumerate(ref_images, 1):
        role = ref.get("role", "na")
        notes = ref.get("notes", "")
        if role != "na":
            lines.append(f"  Image {idx}: {role}" + (f" - {notes}" if notes else ""))
    
    lines.append("")
    
    # Identity preservation
    if identity_lock == "soft_lock_person":
        lines.append("IDENTITY PRESERVATION (Soft Lock - Person):")
        lines.append("- Preserve key facial landmarks (~90-95% similarity)")
        lines.append("- Allow lighting, shadow, and clarity adjustments")
        lines.append("- NO geometry or facial structure changes")
    elif identity_lock == "strict_lock_product":
        lines.append("IDENTITY PRESERVATION (Strict Lock - Product):")
        lines.append("- Maintain 100% geometry and structure")
        lines.append("- Preserve all product details exactly")
        lines.append("- Allow only lighting and environment changes")
    
    lines.append("")
    
    # Denoising strength hint
    strength = adv_params.get("denoising_strength", 0.75)
    lines.append(f"Transformation strength: {strength} (0=minimal change, 1=maximum change)")
    
    return "\n".join(lines)


def build_inpaint_prompt(payload: Dict[str, Any]) -> str:
    """Build prompt for inpainting mode"""
    request = payload.get("request", "")
    mask = payload.get("edit_mask", {})
    
    segment_prompt = mask.get("segment_prompt", "")
    preserve_areas = mask.get("preserve_areas", [])
    feather = mask.get("feather", 10)
    
    lines = []
    lines.append(f"INPAINTING TASK: {request}")
    lines.append("")
    
    # Target area
    if segment_prompt:
        lines.append(f"🎯 TARGET AREA: {segment_prompt.upper()}")
        lines.append("")
    
    # Preserve areas
    if preserve_areas:
        lines.append("✋ PRESERVE EXACTLY (DO NOT MODIFY):")
        for area in preserve_areas:
            lines.append(f"  - {area}")
        lines.append("")
    
    # Editing instructions
    lines.append("🎨 EDITING INSTRUCTIONS:")
    lines.append("  - Modify ONLY the target area specified above")
    lines.append("  - Keep all other regions completely unchanged")
    lines.append("  - Blend seamlessly at boundaries")
    lines.append("  - Match lighting, color, and perspective with surrounding areas")
    lines.append("  - Maintain consistent style throughout the image")
    
    if feather > 0:
        lines.append(f"  - Soft edge transition: {feather}px feather")
    
    return "\n".join(lines)


def build_outpaint_prompt(payload: Dict[str, Any]) -> str:
    """Build prompt for outpainting mode"""
    request = payload.get("request", "")
    outpaint = payload.get("outpaint_config", {})
    
    expand_left = outpaint.get("expand_left", 0)
    expand_right = outpaint.get("expand_right", 0)
    expand_top = outpaint.get("expand_top", 0)
    expand_bottom = outpaint.get("expand_bottom", 0)
    match_style = outpaint.get("match_style", True)
    
    lines = []
    lines.append(f"OUTPAINTING TASK: {request}")
    lines.append("")
    
    lines.append("📐 EXPANSION CONFIGURATION:")
    if expand_left > 0:
        lines.append(f"  - Expand LEFT: {expand_left}px")
    if expand_right > 0:
        lines.append(f"  - Expand RIGHT: {expand_right}px")
    if expand_top > 0:
        lines.append(f"  - Expand TOP: {expand_top}px")
    if expand_bottom > 0:
        lines.append(f"  - Expand BOTTOM: {expand_bottom}px")
    
    lines.append("")
    lines.append("🎨 OUTPAINTING INSTRUCTIONS:")
    lines.append("  - Generate natural continuation of the scene in expanded areas")
    lines.append("  - Maintain perspective and vanishing points from original image")
    
    if match_style:
        lines.append("  - Match the artistic style of the original image")
        lines.append("  - Match lighting direction and color temperature")
        lines.append("  - Match detail level and texture quality")
    
    lines.append("  - Blend seamlessly at boundaries between original and extended areas")
    lines.append("  - Keep the original image region completely unchanged")
    
    return "\n".join(lines)


def build_prompts(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main prompt building function with generation mode support
    NOW WITH HALLUCINATION CONTROL (v2.1)
    """
    
    # Validate inputs
    try:
        validate_generation_mode(payload)
    except ValueError as e:
        return {
            "error": str(e),
            "prompt": "",
            "avoid": [],
            "detail_level": "standard"
        }
    
    # Get generation mode
    gen_mode = payload.get("generation_mode", "text_to_image")
    request = str(payload.get("request", "")).strip()
    
    if not request:
        return {
            "error": "Missing required field: request",
            "prompt": "",
            "avoid": [],
            "detail_level": "standard"
        }
    
    # Build mode-specific prompt
    if gen_mode == "text_to_image":
        mode_prompt = build_text_to_image_prompt(payload)
    elif gen_mode == "image_to_image":
        mode_prompt = build_image_to_image_prompt(payload)
    elif gen_mode == "inpaint":
        mode_prompt = build_inpaint_prompt(payload)
    elif gen_mode == "outpaint":
        mode_prompt = build_outpaint_prompt(payload)
    elif gen_mode == "variation":
        mode_prompt = build_image_to_image_prompt(payload)  # Similar to img2img
    else:
        mode_prompt = build_text_to_image_prompt(payload)
    
    # Add common elements
    style = str(payload.get("style", "")).strip()
    realistic_skin = payload.get("realistic_skin", False)
    text_on_image = payload.get("text_on_image", False)
    
    lines = [mode_prompt]
    
    # Realistic skin
    if realistic_skin:
        lines.append("")
        lines.append("REALISTIC SKIN PRESERVATION:")
        lines.append("- Preserve natural pores and micro-texture")
        lines.append("- Show subtle skin tone variation")
        lines.append("- Include natural imperfections (freckles, fine lines)")
        lines.append("- Avoid over-smoothing or plastic-looking skin")
    
    # Text on image
    if text_on_image:
        headline = payload.get("headline", "")
        body_text = payload.get("body_text", "")
        if headline or body_text:
            lines.append("")
            lines.append("TEXT ON IMAGE:")
            if headline:
                lines.append(f'  Headline: "{headline}"')
            if body_text:
                lines.append(f'  Body: "{body_text}"')
            lines.append("  - Text should be clear and readable")
            lines.append("  - Integrate naturally with the composition")
    
    # Aspect ratio
    ar_custom = str(payload.get("aspect_ratio_custom") or payload.get("aspectRatioCustom") or "").strip()
    ar = ar_custom or str(payload.get("aspect_ratio") or payload.get("aspectRatio") or "9:16").strip()
    lines.append("")
    lines.append(f"Aspect ratio: {ar}")
    
    # Platform-specific notes
    target_platform = payload.get("target_platform", "generic")
    if target_platform != "generic":
        lines.append(f"Target platform: {target_platform}")
    
    prompt_en = "\n".join(lines)
    
    # =========================================================================
    # HALLUCINATION CONTROL - NEW IN v2.1
    # =========================================================================
    hallucination_check = detect_hallucinated_nationality(request, prompt_en)
    
    if hallucination_check["has_hallucination"]:
        # Clean the prompt
        prompt_en = clean_hallucinated_content(prompt_en, request)
    
    # =========================================================================
    
    # =========================================================================
    # REALITY CHECK - NEW IN v2.2
    # =========================================================================
    reality_check = validate_realism(prompt_en)
    
    if not reality_check["is_realistic"]:
        # Use corrected prompt
        prompt_en = reality_check["corrected_prompt"]
    # =========================================================================
    
    # Detail level
    detail_level = str(payload.get("detail_level", "standard")).strip().lower()
    if detail_level not in ("compact", "standard", "full"):
        detail_level = "standard"
    
    # Language routing
    primary_lang = str(payload.get("languages", "en")).strip().lower() or "en"
    
    # Build result
    result: Dict[str, Any] = {
        "prompt": prompt_en,
        "avoid": list(DEFAULT_AVOID),
        "detail_level": detail_level,
        "task": str(payload.get("task", "final_prompt")),
        "generation_mode": gen_mode,
        "target_platform": target_platform,
    }
    
    # Add hallucination warnings if detected
    if hallucination_check["has_hallucination"]:
        if "warnings" not in result:
            result["warnings"] = []
        result["warnings"].extend(hallucination_check["suggestions"])
        result["hallucination_detected"] = True
        result["hallucination_terms"] = hallucination_check["found_terms"]
    
    # Add reality check results
    result["reality_check"] = {
        "is_realistic": reality_check["is_realistic"],
        "realism_score": reality_check["realism_score"],
        "issues_found": reality_check["issues_found"]
    }
    
    if not reality_check["is_realistic"]:
        if "warnings" not in result:
            result["warnings"] = []
        result["warnings"].extend(reality_check["warnings"])
        result["reality_check"]["issues"] = reality_check["issues"]
    
    # Add parameters section if standard or full
    if detail_level in ("standard", "full"):
        adv_params = payload.get("advanced_params", {})
        params = {
            "aspect_ratio": ar,
            "generation_mode": gen_mode,
        }
        
        if adv_params:
            if "denoising_strength" in adv_params:
                params["denoising_strength"] = adv_params["denoising_strength"]
            if "guidance_scale" in adv_params:
                params["cfg_scale"] = adv_params["guidance_scale"]
            if "steps" in adv_params:
                params["steps"] = adv_params["steps"]
            if "seed" in adv_params and adv_params["seed"] != -1:
                params["seed"] = adv_params["seed"]
            if "sampler" in adv_params:
                params["sampler"] = adv_params["sampler"]
        
        result["parameters"] = params
    
    # Add breakdown for full mode
    if detail_level == "full":
        breakdown = {
            "generation_mode": gen_mode,
            "subject": request,
            "style": style if style and style != "na" else "photorealistic (default)",
        }
        
        if gen_mode == "inpaint":
            mask = payload.get("edit_mask", {})
            breakdown["target_area"] = mask.get("segment_prompt", "")
            breakdown["preserve_areas"] = mask.get("preserve_areas", [])
        
        if gen_mode == "outpaint":
            outpaint = payload.get("outpaint_config", {})
            breakdown["expansion"] = {
                "left": outpaint.get("expand_left", 0),
                "right": outpaint.get("expand_right", 0),
                "top": outpaint.get("expand_top", 0),
                "bottom": outpaint.get("expand_bottom", 0),
            }
        
        result["breakdown"] = breakdown
    
    return result


def run(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for skill execution"""
    return build_prompts(input_data)


def main() -> None:
    """CLI entry point"""
    import argparse
    ap = argparse.ArgumentParser(description="Image Prompt Engineer (v2.2) - With Hallucination Control")
    ap.add_argument("--json", help="JSON string input. If omitted, reads stdin.", default=None)
    args = ap.parse_args()

    raw = args.json
    if raw is None:
        import sys
        raw = sys.stdin.read().strip()

    payload = json.loads(raw)
    out = run(payload)
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
