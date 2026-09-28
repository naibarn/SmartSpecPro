from __future__ import annotations
from typing import Any

def _dialogue_block(dialogue_lines: list[dict[str, Any]], voice_labels: dict[str, str]) -> list[dict[str, Any]]:
    result = []
    for line in dialogue_lines:
        speaker = line["speakerId"]
        result.append({
            "speakerId": speaker,
            "text": line["text"],
            "voiceLabel": voice_labels.get(speaker),
            "lipSyncRequired": bool(line.get("lipSyncRequired", True))
        })
    return result

def compile_grok_prompt(
    *,
    mode: str,
    duration_seconds: int,
    scene_description: str,
    action_chronology: list[str],
    camera_intent: str,
    continuity_locks: list[str],
    reference_plan: dict[str, Any],
    dialogue_lines: list[dict[str, Any]] | None = None,
    soundscape: str | None = None,
    music: str | None = None,
    constraints: list[str] | None = None,
    derived_reference_guidance: list[str] | None = None,
) -> dict[str, Any]:
    if mode not in {"text_to_video", "image_to_video", "reference_to_video"}:
        raise ValueError(f"Unsupported Grok 1.5 mode: {mode}")
    if not 1 <= int(duration_seconds) <= 15:
        raise ValueError("Grok Imagine Video 1.5 duration must be 1-15 seconds.")

    dialogue_lines = list(dialogue_lines or [])
    constraints = list(constraints or [])
    derived_reference_guidance = list(derived_reference_guidance or [])
    bindings = []

    for ref in reference_plan.get("referenceImages", []):
        preserve = list(ref.get("semanticRoles") or [])
        meaning = "reference image"
        if "identity" in preserve:
            meaning = "character identity reference"
        elif any(x in preserve for x in ["product_geometry", "product_label"]):
            meaning = "product identity/geometry reference"
        elif any(x in preserve for x in ["place_identity", "venue_layout", "place_atmosphere"]):
            meaning = "place/venue identity reference"
        bindings.append({
            "label": ref["label"],
            "meaning": meaning,
            "preserve": preserve
        })

    voice_labels = {}
    for ref in reference_plan.get("referenceAudios", []):
        if ref.get("speakerId"):
            voice_labels[ref["speakerId"]] = ref["label"]
        bindings.append({
            "label": ref["label"],
            "meaning": "speaker voice reference",
            "preserve": ["voice_identity"]
        })

    sections = []

    if mode == "image_to_video":
        sections.append(
            "START FRAME LOCK: Continue directly from the provided starting image as literal frame 0. "
            "Preserve all visible character identities, product geometry, wardrobe, object placement, "
            "environment layout, lighting direction, camera framing and current hand/object state. "
            "Do not replay actions that are already completed in the starting image."
        )
    elif mode == "reference_to_video":
        if bindings:
            binding_lines = []
            for b in bindings:
                binding_lines.append(
                    f"{b['label']} = {b['meaning']}; preserve: {', '.join(b['preserve']) or 'overall identity/style'}."
                )
            sections.append(
                "REFERENCE BINDINGS: " + " ".join(binding_lines) +
                " These references guide the new scene and do not define the literal first frame."
            )

    if derived_reference_guidance:
        sections.append("DERIVED REFERENCE GUIDANCE: " + " ".join(x.strip() for x in derived_reference_guidance))

    if scene_description:
        sections.append("SCENE: " + scene_description.strip())

    if action_chronology:
        sections.append(
            "ACTION CHRONOLOGY: " +
            " Then ".join(f"{i+1}) {x.strip()}" for i, x in enumerate(action_chronology))
        )

    if camera_intent:
        sections.append("CAMERA: " + camera_intent.strip())

    compiled_dialogue = _dialogue_block(dialogue_lines, voice_labels)
    if compiled_dialogue:
        lines = []
        for d in compiled_dialogue:
            voice = f" using the voice from {d['voiceLabel']}" if d.get("voiceLabel") else ""
            lip = " with precise visible lip sync" if d["lipSyncRequired"] else " as off-screen voice-over"
            lines.append(
                f"{d['speakerId']}{voice} says exactly{lip}: “{d['text']}”"
            )
        sections.append("DIALOGUE: " + " ".join(lines))

    audio_parts = []
    if soundscape:
        audio_parts.append("diegetic sound: " + soundscape.strip())
    if music:
        audio_parts.append("music: " + music.strip())
    if audio_parts:
        sections.append("AUDIO: " + "; ".join(audio_parts))

    if continuity_locks:
        sections.append("CONTINUITY LOCKS: " + "; ".join(x.strip() for x in continuity_locks))

    base_constraints = [
        "No duplicate people or objects unless explicitly requested.",
        "Keep product/place identity stable throughout the clip.",
        "Keep hand-object interactions physically plausible.",
        "Do not invent exact small label/UI text; reserve exact typography for post-production when required."
    ]
    all_constraints = base_constraints + constraints
    sections.append("CONSTRAINTS: " + " ".join(all_constraints))

    warnings = list(reference_plan.get("warnings", []))
    if mode == "reference_to_video":
        warnings.append("Reference-to-video guides subject/style consistency but does not lock frame 0.")
    if mode == "image_to_video":
        warnings.append("Avoid passing a conflicting aspect ratio that would stretch the authoritative Start Frame; normalize before generation when necessary.")

    return {
        "mode": mode,
        "durationSeconds": int(duration_seconds),
        "promptText": "\n\n".join(sections),
        "referenceBindings": bindings,
        "dialogueLines": compiled_dialogue,
        "cameraIntent": camera_intent,
        "continuityLocks": continuity_locks,
        "warnings": warnings
    }
