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


def duration_value(duration: Any, key: str, fallback: float) -> float:
    if isinstance(duration, dict):
        try:
            return float(duration.get(key, fallback) or fallback)
        except (TypeError, ValueError):
            return fallback
    return fallback


def reference_phrase(refs: list[Any]) -> str:
    if not refs:
        return "Use the written intent as the main visual reference"
    names = [f"@image{index}" for index, _ in enumerate(refs, 1)]
    if len(names) == 1:
        return f"Use reference image {names[0]} as the visual source of truth"
    return "Use reference images " + ", ".join(names[:-1]) + f", and {names[-1]} as the visual sources of truth"


def negative_sentence(text: str) -> str:
    cleaned_items = []
    for part in text.strip().rstrip(".").split(","):
        item = part.strip()
        if item.lower().startswith("no "):
            item = item[3:].strip()
        if item:
            cleaned_items.append(item)
    if not cleaned_items:
        cleaned_items = ["warped anatomy", "identity drift", "flicker", "watermarks", "random wardrobe changes", "unstable lighting", "incoherent motion"]
    return "Avoid " + ", ".join(cleaned_items) + "."


def build_video(params: dict[str, Any]) -> dict[str, Any]:
    mode = str(value(params, "mode", "text_to_video"))
    if mode == "auto":
        if as_list(value(params, "storyboard", [])):
            mode = "storyboard_ref_to_video" if as_list(value(params, "reference_images", [])) else "storyboard_text_to_video"
        elif as_list(value(params, "reference_images", [])):
            mode = "ref_to_video"
        else:
            mode = "text_to_video"
    output_type = str(value(params, "output_type", "single_video_prompt"))
    if output_type == "auto":
        output_type = "storyboard_prompt_pack" if "storyboard" in mode else "single_video_prompt"
    intent = str(value(params, "cinematic_intent", "")).strip()
    aspect = str(value(params, "aspect_ratio", "9:16"))
    preset = str(value(params, "preset", "soft_korean_beauty_drama"))
    fps = int(value(params, "frame_rate", 24) or 24)
    resolution = str(value(params, "resolution_target", "1080p"))
    duration = value(params, "duration", {})
    single_seconds = duration_value(duration, "single_shot_seconds", 5)
    total_seconds = duration_value(duration, "total_seconds", single_seconds)
    camera = compact(value(params, "camera_plan", "")) or "motivated cinematic camera movement"
    action = compact(value(params, "subject_action", "")) or intent
    lighting = compact(value(params, "lighting_and_grade", "")) or preset
    negative = str(value(params, "negative_prompt", "no warped anatomy, no identity drift, no flicker, no watermark"))
    refs = as_list(value(params, "reference_images", []))
    storyboard_input = as_list(value(params, "storyboard", []))

    reference_inventory = {
        "subject_identity": f"{len(refs)} reference image(s) supplied" if refs else "Use written identity only.",
        "wardrobe": "Preserve wardrobe and materials from references or text.",
        "hair_makeup": "Preserve hair and makeup continuity.",
        "environment": "Keep geography and set dressing consistent.",
        "lighting": lighting,
        "color_grade": preset,
        "materials_and_textures": "Avoid plastic skin, smeared fabric, and texture drift.",
    }
    intent_text = intent or "a cinematic subject moment based on the supplied references"
    master = (
        f"{reference_phrase(refs)}. Create a {single_seconds:g}-second cinematic video prompt in {aspect} at {resolution} and {fps} fps. "
        f"The scene should show {intent_text}. Use {camera} while the subject action is {action or intent_text}. "
        f"Shape the lighting and color grade as {lighting.replace('_', ' ')}. Preserve identity, wardrobe, hair, makeup, environment, lighting direction, material fidelity, and color grade throughout the motion. "
        "Make the movement physically plausible, keep anatomy stable, and progress clearly from the first pose to the final pose without random redesign between frames. "
        f"{negative_sentence(negative)}"
    )
    master = " ".join(master.split())

    storyboard = []
    shot_count = max(1, len(storyboard_input) or (6 if "storyboard" in mode or "storyboard" in output_type else 1))
    shot_duration = round(total_seconds / shot_count, 2)
    for index in range(shot_count):
        source = storyboard_input[index] if index < len(storyboard_input) else {}
        source_text = compact(source) if source else intent
        shot_id = f"shot_{index + 1:02d}"
        shot_prompt = " ".join(
            (
                f"{master} For shot {index + 1}, focus on {source_text or intent_text}. "
                "Use a distinct camera placement and end on a clearly different pose, crop, gaze, or action endpoint while preserving the same subject and scene."
            ).split()
        )
        storyboard.append({
            "shot_id": shot_id,
            "title": f"Shot {index + 1}",
            "duration_seconds": shot_duration,
            "camera_position": "varied cinematic placement",
            "camera_movement": "controlled movement with clear start and end",
            "subject_action": source_text,
            "start_state": "clear readable start pose",
            "end_state": "distinct ending pose or crop",
            "shot_prompt": shot_prompt,
            "negative_prompt": negative,
            "continuity_notes": "No identity, wardrobe, lighting, or environment drift.",
        })

    prompt = master if shot_count == 1 else "\n\n".join([master] + [shot["shot_prompt"] for shot in storyboard])
    return {
        "success": True,
        "output": {
            "prompt": prompt,
            "version": "1.0.0-local",
            "mode": mode,
            "aspect_ratio": aspect,
            "duration_summary": {
                "single_shot_seconds": single_seconds,
                "total_seconds": total_seconds,
                "shot_count": shot_count,
                "frame_rate": fps,
                "resolution_target": resolution,
            },
            "reference_inventory": reference_inventory,
            "master_prompt": master,
            "negative_prompt": negative,
            "single_video_prompt": master if shot_count == 1 else "",
            "start_frame_prompt": f"Start frame: {intent}. Preserve references exactly, no motion blur.",
            "stop_frame_prompt": f"Stop frame: {intent}. Make pose/crop/action endpoint distinct from start.",
            "start_stop_transition_prompt": "Animate from start to stop with a clear pose, crop, gaze, or camera-angle change.",
            "multi_prompt_batch": [],
            "storyboard": storyboard if shot_count > 1 else [],
            "timing_plan": [],
            "continuity_checklist": ["identity", "wardrobe", "hair", "makeup", "environment", "lighting", "color grade"],
        },
        "warnings": [],
    }


def run(envelope: dict[str, Any]) -> dict[str, Any]:
    params = envelope.get("params") if isinstance(envelope.get("params"), dict) else envelope
    return build_video(params)


def main() -> None:
    envelope = json.loads(sys.stdin.read().strip() or "{}")
    print(json.dumps(run(envelope), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
