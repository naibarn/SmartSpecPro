#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from typing import Any


def value(data: dict[str, Any], key: str, default: Any = "") -> Any:
    item = data.get(key, default)
    if isinstance(item, str):
        raw = item.strip()
        if raw.startswith(("{", "[")):
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return item
    return item


def as_list(item: Any) -> list[Any]:
    if item in (None, ""):
        return []
    if isinstance(item, list):
        return item
    return [item]


def compact(item: Any) -> str:
    if item in (None, "", [], {}):
        return ""
    if isinstance(item, str):
        return item.strip()
    return json.dumps(item, ensure_ascii=False)


def enabled_labels(item: Any) -> list[str]:
    if not isinstance(item, dict):
        return []
    return [key.replace("_", " ") for key, is_enabled in item.items() if is_enabled is True]


def continuity_text(subject_preservation: Any, continuity_locks: Any) -> str:
    subject_parts = enabled_labels(subject_preservation)
    lock_parts = enabled_labels(continuity_locks)
    lines = []
    if subject_parts:
        lines.append("Preserve exactly: " + ", ".join(subject_parts) + ".")
    else:
        lines.append("Preserve identity, face, hair, wardrobe, materials, lighting, environment, and color grade.")
    if lock_parts:
        lines.append("Do not change: " + ", ".join(lock_parts) + ".")
    else:
        lines.append("Do not redesign wardrobe, background, lighting direction, or color interpretation.")
    return "\n".join(lines)


def reference_summary(refs: list[Any]) -> str:
    if not refs:
        return "No reference images supplied; preserve only the written continuity notes."
    lines = []
    for index, ref in enumerate(refs, 1):
        if isinstance(ref, str):
            lines.append(f"{index}. uploaded reference image")
            continue
        role = ref.get("role") or ref.get("image_id_or_path") or ref.get("id") or "reference"
        note = ref.get("description") or ref.get("notes") or ""
        lines.append(f"{index}. {role}: {note}".strip(": "))
    return "\n".join(lines)


def negative_text(items: list[Any], allow_text_in_image: bool = False) -> str:
    cleaned = []
    for item in items:
        text = str(item).strip().rstrip(".")
        lowered = text.lower()
        if lowered.startswith("no "):
            text = text[3:].strip()
        if text:
            cleaned.append(text)
    if not allow_text_in_image:
        cleaned.extend([
            "captions",
            "panel labels",
            "watermarks",
            "logos",
            "UI text",
            "random glyphs",
        ])
    if cleaned:
        return "Avoid " + ", avoid ".join(dict.fromkeys(cleaned)) + "."
    return "Avoid adding extra people, warped anatomy, watermarks, style drift, reference mismatch, wardrobe redesign, product redesign, and background changes."


def reference_phrase(refs: list[Any]) -> str:
    if not refs:
        return "Use the provided reference image"
    names = [f"@image{index}" for index, _ in enumerate(refs, 1)]
    if len(names) == 1:
        return f"Use reference image {names[0]}"
    return "Use reference images " + ", ".join(names[:-1]) + f", and {names[-1]}"


def environment_multiview_instruction(mode: str) -> str:
    if mode == "angle_grid_3x3":
        return (
            "For an environment or room reference, each of the nine panels must be a genuinely different camera station and viewing direction inside the same space, not a zoom/crop series from one viewpoint. "
            "Use this coverage order: 1) entry-door establishing view looking into the room, 2) reverse angle looking back toward the entry or opposite wall, 3) left-corner diagonal view, 4) right-corner diagonal view, 5) window-side view looking inward, 6) opposite-side view looking toward the window or main light source, 7) low eye-level view across the floor/furniture plane, 8) elevated corner view showing ceiling-floor relationships, 9) one controlled material/fixture detail insert. "
            "At least seven panels must show a wide or medium-wide spatial view from different physical positions. Detail inserts are allowed in no more than two panels. "
            "Do not repeat the same bed/wall/window composition, do not solve variation by zooming in or out, and do not use crops from the same base camera angle."
        )
    return (
        "For an environment or room reference, each of the six frames must be a genuinely different camera station and viewing direction inside the same space, not a zoom/crop series from one viewpoint. "
        "Use this coverage order: 1) entry-door establishing view looking into the room, 2) reverse angle looking back toward the entry or opposite wall, 3) left-corner diagonal view, 4) right-corner diagonal view, 5) window-side or main-light-side view looking inward, 6) one controlled material/fixture detail insert. "
        "At least five frames must show wide or medium-wide spatial views from different physical positions. Detail inserts are allowed in no more than one frame. "
        "Do not repeat the same bed/wall/window composition, do not solve variation by zooming in or out, and do not use crops from the same base camera angle."
    )


def mode_instruction(mode: str, aspect: str, subject_type: str, allow_text_in_image: bool) -> str:
    text_policy = (
        "Use small white labels in the top-left corner of each panel only when labels are explicitly requested."
        if allow_text_in_image
        else "Do not place any text, captions, panel labels, watermarks, logos, UI text, or random glyphs inside the image."
    )
    subject_word = {
        "product": "product",
        "environment": "environment or set",
        "mixed": "referenced subject, product, and environment",
    }.get(subject_type, "subject")
    if mode == "angle_grid_3x3":
        environment_clause = (
            " " + environment_multiview_instruction(mode)
            if subject_type == "environment"
            else ""
        )
        return (
            "Create one photorealistic cinematic 3x3 angle grid as a single clean contact-sheet image with nine panels. "
            "Arrange the panels in this order: row one MCU, MS, OS; row two WS, HA, LA; row three P, ThreeQ, B. "
            f"Adapt each panel to the {subject_word}: for people use portrait angle grammar, for products use front, side, back, top, three-quarter, detail, material, scale, and hero views, and for environments use wide, corner, reverse angle, window-side, entry, elevated, low spatial, and limited detail views. "
            f"{environment_clause} "
            f"{text_policy} Keep clean editorial borders, with the overall contact sheet in {aspect}."
        )
    if mode == "contact_sheet_2x3":
        environment_clause = (
            " " + environment_multiview_instruction(mode)
            if subject_type == "environment"
            else ""
        )
        return (
            "Create one photorealistic 2x3 cinematic contact sheet with exactly six frames, all captured as different camera placements within the same scene. "
            f"Adapt the six frames to the {subject_word}: people should vary portrait angles, products should show multiple product sides plus material/detail views, and environments should show consistent room/set views from different physical camera positions plus very limited detail inserts. "
            f"{environment_clause} "
            f"Use thin clean borders and keep the overall contact sheet in {aspect}. {text_policy}"
        )
    if mode == "cinematic_variation_pack":
        return f"Create a set of distinct cinematic {subject_word} variations in {aspect}, varying only camera distance, camera height, crop, lens feel, and composition while preserving the same locked reference and scene."
    if mode == "macro_detail_pack":
        return f"Create a cinematic macro detail pack in {aspect}, focusing only on real visible or conservatively inferred details from the referenced {subject_word}, such as skin, hair, fabric, product material, product seams, texture, hardware, surface finish, room materials, fixtures, or set texture."
    if mode == "video_start_stop_frames":
        return f"Create two distinct reference-locked still frames in {aspect}: a start frame and a stop frame. The stop frame should clearly differ by camera distance, pose, gaze, crop, or camera angle while remaining the same scene."
    return f"Create one cinematic editorial {subject_word} image in {aspect}, improving camera placement, framing, focus, and composition while staying faithful to the reference."


def build_final_prompt(
    mode: str,
    aspect: str,
    style: str,
    style_notes: str,
    refs: list[Any],
    negatives: list[Any],
    subject_preservation: Any,
    continuity_locks: Any,
    subject_type: str,
    allow_text_in_image: bool,
) -> str:
    lock_statement = {
        "product": "Preserve the exact product category, silhouette, proportions, materials, colors, finish, visible markings, construction details, lighting direction, background, color grade, and photographic style from the reference image. ",
        "environment": "Preserve the exact environment layout, architecture, furniture inventory, material finishes, fixtures, spatial relationships, lighting direction, color grade, and photographic style from the reference image. ",
        "mixed": "Preserve the exact referenced people, products, environment, materials, proportions, lighting direction, color grade, and photographic style from the reference image. ",
    }.get(
        subject_type,
        "Preserve the exact subject identity, face structure, body proportions, hairstyle, makeup, wardrobe, fabric material, accessories, lighting direction, background, color grade, and photographic style from the reference image. ",
    )
    realism_statement = {
        "product": "sharp realistic product detail, faithful material texture, accurate reflections, correct perspective, and physically plausible shadows",
        "environment": "sharp realistic architectural detail, faithful material texture, correct perspective, coherent spatial depth, and physically plausible shadows",
        "mixed": "natural human texture, faithful product and environment detail, correct perspective, and physically plausible shadows",
    }.get(subject_type, "natural skin texture, sharp realistic detail, and physically plausible shadows")
    drift_statement = {
        "product": "Do not create a different product, altered silhouette, changed material, different markings, different lighting setup, or different background unless explicitly requested. ",
        "environment": "Do not create a different room layout, changed furniture inventory, altered architecture, different lighting setup, or different background unless explicitly requested. ",
        "mixed": "Do not create different characters, products, outfits, lighting setups, environments, or backgrounds unless explicitly requested. ",
    }.get(subject_type, "Do not create different characters, different outfits, different lighting setups, or different backgrounds unless explicitly requested. ")
    prompt = (
        f"{reference_phrase(refs)} as the primary visual reference. "
        f"{mode_instruction(mode, aspect, subject_type, allow_text_in_image)} "
        f"{lock_statement}"
        f"Use a {style.replace('_', ' ')} cinematic editorial look with {realism_statement}. "
    )
    if style_notes:
        prompt += f"Follow this extra direction: {style_notes}. "
    prompt += (
        "If a detail is hidden in the reference, infer it conservatively and keep that inference consistent across the whole result. "
        f"{drift_statement}"
        f"{negative_text(negatives, allow_text_in_image)}"
    )
    return " ".join(prompt.split())


def build_prompt(params: dict[str, Any]) -> dict[str, Any]:
    mode = str(value(params, "mode", "single_cinematic_portrait"))
    if mode == "auto":
        if as_list(value(params, "shot_list", [])):
            mode = "custom_shot_list"
        else:
            mode = "single_cinematic_portrait"
    project = str(value(params, "project_name", "Auto_Cinematic_Image_Generator"))
    aspect = str(value(params, "aspect_ratio", "9:16"))
    target = str(value(params, "generator_target", "GPT Image 2"))
    subject_type = str(value(params, "subject_type", "person"))
    allow_text_in_image = bool(value(params, "allow_text_in_image", False))
    style = str(value(params, "style_preset", "reference_locked"))
    style_notes = compact(value(params, "custom_style_notes", ""))
    refs = as_list(value(params, "reference_images", []))
    negatives = as_list(value(params, "negative_constraints", []))
    seed = str(value(params, "seed_strategy", "same_seed_for_continuity"))
    shot_list = as_list(value(params, "shot_list", []))
    subject_preservation = value(params, "subject_preservation", {})
    continuity_locks = value(params, "continuity_locks", {})

    prompt = build_final_prompt(
        mode,
        aspect,
        style,
        style_notes,
        refs,
        negatives,
        subject_preservation,
        continuity_locks,
        subject_type,
        allow_text_in_image,
    )
    if shot_list:
        shot_text = " Then follow these custom shot directions in sequence: " + " ".join(
            compact(shot).rstrip(".") + "." for shot in shot_list if compact(shot)
        )
        prompt = " ".join((prompt + shot_text).split())
    per_image = [{
        "id": "image_01",
        "label": mode.replace("_", " ").title(),
        "aspect_ratio": aspect,
        "prompt": prompt,
        "negative_prompt": negative_text(negatives, allow_text_in_image),
        "shot_type": mode,
        "seed_advice": seed,
    }]
    return {
        "success": True,
        "output": {
            "prompt": prompt,
            "project_name": project,
            "mode": mode,
            "subject_type": subject_type,
            "status": "ready",
            "messages": [],
            "prompt_package": {
                "master_prompt": prompt,
                "negative_prompt": per_image[0]["negative_prompt"],
                "per_image_prompts": per_image,
                "recommended_aspect_ratio": aspect,
                "reference_usage_summary": reference_summary(refs),
            },
            "keyframe_breakdown": [],
            "metadata": {"runtime": "local-python"},
        },
        "warnings": [],
    }


def run(envelope: dict[str, Any]) -> dict[str, Any]:
    params = envelope.get("params") if isinstance(envelope.get("params"), dict) else envelope
    return build_prompt(params)


def main() -> None:
    envelope = json.loads(sys.stdin.read().strip() or "{}")
    result = run(envelope)
    output = result.get("output") if isinstance(result, dict) else result
    prompt = ""
    if isinstance(output, dict):
        prompt = str(output.get("prompt") or output.get("master_prompt") or "").strip()
        if not prompt:
            prompt_package = output.get("prompt_package")
            if isinstance(prompt_package, dict):
                prompt = str(prompt_package.get("master_prompt") or "").strip()
    elif isinstance(output, str):
        prompt = output.strip()

    print(json.dumps({
        "success": True,
        "output": prompt or json.dumps(output, ensure_ascii=False),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
