"""Bounded JSON-lines entrypoint used by Vertical Drama Enhanced prompts.

The Node controller owns admission, model selection, credits, persistence and
provider submission. This module only performs structured prompt intent
authoring in the isolated Agents SDK runtime and emits a terminal prompt
bundle. It deliberately has no network/provider side-effect tools.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

from .agent_factory import AgentFactory
from .config import AgentRuntimeConfig
from .context import DirectorRunContext
from .errors import StageExecutionError
from .models import AssetEvidence, CostEstimate, GenerationAuthorization
from .openai_runner import OpenAIAgentsRunner
from .schema_registry import StageContractRegistry
from .orchestrator import DirectorOrchestrator, StageRunResult
from .sdk_compat import installed_sdk_version, require_openai_agents_sdk

ADAPTER_VERSION = "1.0.0"


class ReadOnlyCore:
    def __init__(self, payload: dict[str, Any]):
        self.payload = payload
        self.authorized_asset_ids = self._asset_ids(payload)
        self.authorized_provider_profile_id = str(
            (payload.get("targetVideoModel") or {}).get("providerProfileId") or ""
        )

    @staticmethod
    def _asset_ids(payload: dict[str, Any]) -> set[str]:
        bundle = payload.get("mediaBundle") or {}
        values: set[str] = set()
        for key in ("startFrame", "stopFrame"):
            item = bundle.get(key)
            if isinstance(item, dict) and item.get("assetId") is not None:
                values.add(str(item["assetId"]))
        for item in bundle.get("references") or []:
            if isinstance(item, dict) and item.get("assetId") is not None:
                values.add(str(item["assetId"]))
        return values

    async def get_project_snapshot(self, tenant_id: str, project_id: str) -> dict[str, Any]:
        return {"projectId": project_id, "enhanced": True}

    async def get_asset_evidence(self, tenant_id: str, project_id: str, asset_id: str) -> AssetEvidence:
        return AssetEvidence(asset_id=asset_id, authorized=asset_id in self.authorized_asset_ids)

    async def get_provider_profile(self, profile_id: str) -> dict[str, Any]:
        return {
            "id": profile_id,
            "readOnly": True,
            "authorized": profile_id == self.authorized_provider_profile_id,
        }

    async def search_verified_research(self, tenant_id: str, project_id: str, query: str, max_results: int = 5) -> list[dict[str, Any]]:
        return []

    async def estimate_generation_cost(self, tenant_id: str, project_id: str, provider_plan: dict[str, Any]) -> CostEstimate:
        return CostEstimate(provider_profile_id=str(provider_plan.get("providerProfileId", "")), estimated_credits=0)

    async def authorize_generation_submission(self, tenant_id: str, project_id: str, run_id: str, provider_plan: dict[str, Any], provider_plan_sha256: str, cost: CostEstimate) -> GenerationAuthorization:
        return GenerationAuthorization(approved=False)

    async def get_approval_status(self, tenant_id: str, project_id: str, run_id: str, gate: str) -> str:
        return "not_required"

    async def persist_stage_output(self, *args: Any, **kwargs: Any) -> None:
        return None

    async def record_agent_usage(self, *args: Any, **kwargs: Any) -> None:
        return None

    async def get_run_checkpoint(self, *args: Any, **kwargs: Any) -> None:
        return None

    async def persist_run_checkpoint(self, *args: Any, **kwargs: Any) -> None:
        return None


def _extract_dialogue_list(payload: dict[str, Any], intent: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    items = None
    if "dialogue" in payload:
        raw = payload.get("dialogue")
        if isinstance(raw, dict) and isinstance(raw.get("lines"), list):
            items = raw["lines"]
        elif isinstance(raw, list):
            items = raw
    elif isinstance(payload.get("shot"), dict) and "dialogue" in payload["shot"]:
        raw = payload["shot"].get("dialogue")
        if isinstance(raw, list):
            items = raw
    elif intent and isinstance(intent.get("dialogue"), list):
        items = intent["dialogue"]

    if not items:
        return []

    normalized: list[dict[str, Any]] = []
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        text = item.get("text") or item.get("lineTh") or item.get("dialogue_line") or item.get("line")
        if not text or not str(text).strip():
            continue
        speaker = item.get("speakerHint") or item.get("speaker") or item.get("speakerId") or item.get("characterKey") or f"Character {idx + 1}"
        speaker_id = item.get("speakerId") or item.get("characterKey") or f"char-{idx + 1}"
        normalized.append({
            "lineId": str(item.get("lineId") or f"shot-line-{idx + 1}"),
            "speakerId": str(speaker_id),
            "speakerHint": str(speaker),
            "speaker": str(speaker),
            "position": str(item["position"]).strip() if item.get("position") else None,
            "text": str(text).strip(),
            "lineTh": str(text).strip(),
            "emotion": str(item["emotion"]).strip() if item.get("emotion") else (str(item["tone"]).strip() if item.get("tone") else None),
            "durationSeconds": item.get("durationSeconds"),
        })
    return normalized


def _package_input(payload: dict[str, Any]) -> dict[str, Any]:
    """Build the strict v11 package envelope without trusting caller policy."""
    shot = payload.get("shot") or {}
    bundle = payload.get("mediaBundle") or {}
    dialogue_lines = []
    for index, line in enumerate(_extract_dialogue_list(payload)):
        text = line.get("text") or line.get("lineTh")
        if not isinstance(text, str) or not text.strip():
            continue
        speaker = line.get("speakerHint") or line.get("speaker") or line.get("speakerId") or line.get("characterKey")
        speaker_id = line.get("speakerId") or line.get("characterKey")
        dialogue_lines.append({
            "lineId": str(line.get("lineId") or f"shot-line-{index + 1}"),
            "speakerId": str(speaker_id) if speaker_id else None,
            "speakerHint": str(speaker) if speaker else None,
            "text": text.strip(),
            "exactText": True,
            "mustBeOnScreen": True,
            "lipSyncRequired": True,
        })
    assets = []
    start = bundle.get("startFrame")
    if isinstance(start, dict):
        assets.append({"assetId": str(start.get("assetId")), "role": "start_frame", "order": 0, "sourceOfTruth": True, "mediaType": "image", "referencePurposes": ["first_frame"]})
    stop = bundle.get("stopFrame")
    if isinstance(stop, dict):
        assets.append({"assetId": str(stop.get("assetId")), "role": "end_frame", "order": 1, "sourceOfTruth": True, "mediaType": "image", "referencePurposes": ["last_frame"]})
    role_map = {"character": "character_reference", "location": "environment_reference", "prop": "other", "style": "style_reference", "continuity": "motion_reference", "action": "motion_reference", "barrier_reference": "camera_reference", "soundscape": "sound_reference", "reference": "other"}
    purpose_map = {"character": "identity", "location": "environment", "prop": "visible_feature", "style": "style", "continuity": "temporal_structure", "action": "motion", "barrier_reference": "camera_motion", "soundscape": "sound_effect", "reference": "storyboard"}
    for index, reference in enumerate(bundle.get("references") or [], start=len(assets)):
        if not isinstance(reference, dict):
            continue
        media_type = reference.get("mediaType")
        if media_type not in {"image", "video", "audio"}:
            continue
        role = reference.get("role") if reference.get("role") in role_map else "reference"
        assets.append({"assetId": str(reference.get("assetId")), "role": role_map[role], "order": index, "sourceOfTruth": True, "mediaType": media_type, "referencePurposes": [purpose_map[role]]})
    idea = str(shot.get("description") or "Vertical Drama cinematic shot")[:12000]
    return {
        "schemaVersion": "11.0.0",
        "idea": idea,
        "locale": "th-TH",
        "contentMode": "dialogue_scene" if dialogue_lines else "cinematic",
        "dialogue": {"mode": "user_supplied" if dialogue_lines else "none", "allowAgentToDraft": False, "lines": dialogue_lines},
        "assets": assets,
        "startFramePolicy": {"authoritativeState": True, "allowNormalize": False, "allowRegenerate": False},
        "modelRouting": {"mode": "locked", "preferredModels": [str((payload.get("targetVideoModel") or {}).get("id") or "")], "fallbackModels": [], "allowCrossProviderFallback": False, "optimizeFor": "quality"},
        "researchMode": "on" if payload.get("researchMode") in {"on", "bounded"} else "off",
        "generationMode": "plan_only",
        "approvalPolicy": {"requireStoryboardApproval": True, "requireHighCostGenerationApproval": True, "requirePublishApproval": True},
        "budget": {"candidateCountPerShot": 1, "maxRepairIterationsPerShot": 0},
        "agentExecutionProfile": "production",
    }


def _uses_unified_image_transport(target: dict[str, Any]) -> bool:
    capability = target.get("capabilitySnapshot")
    if not isinstance(capability, dict) or not isinstance(capability.get("modes"), list):
        return False
    return any(
        isinstance(mode, dict)
        and isinstance(mode.get("nativeFieldMap"), dict)
        and mode["nativeFieldMap"].get("startFrame") == "image_urls"
        for mode in capability["modes"]
    )


def _observed_start_state_text(observed: dict[str, Any] | None) -> str:
    if not isinstance(observed, dict):
        return "Use the approved Start Frame itself as authoritative State #0."
    facts: list[str] = []
    for character in (observed.get("characters") or [])[:12]:
        if not isinstance(character, dict):
            continue
        hands = character.get("handOccupancy")
        hand_text = ""
        if isinstance(hands, dict):
            occupied = [
                f"{side} hand: {value}"
                for side, value in (("left", hands.get("left")), ("right", hands.get("right")))
                if isinstance(value, str) and value.strip()
            ]
            hand_text = f", {', '.join(occupied)}" if occupied else ""
        elif isinstance(hands, str) and hands.strip():
            hand_text = f", hands: {hands.strip()}"
        facts.append(
            f"character {character.get('characterId', 'unknown')}: "
            f"{character.get('screenPosition', 'position uncertain')}, "
            f"pose {character.get('pose', 'uncertain')}, "
            f"gaze {character.get('gaze', 'uncertain')}{hand_text}"
        )
    for item in (observed.get("objects") or [])[:16]:
        if not isinstance(item, dict):
            continue
        facts.append(
            f"object {item.get('entityId', 'unknown')}: "
            f"state {item.get('state', 'uncertain')}, "
            f"position {item.get('position', 'uncertain')}"
        )
    camera = observed.get("camera")
    if isinstance(camera, dict):
        facts.append(
            "camera: "
            f"{camera.get('framing', 'framing uncertain')}, "
            f"{camera.get('angle', 'angle uncertain')}, "
            f"motion at t=0 {camera.get('movementAtT0', 'uncertain')}"
        )
    environment = observed.get("environment")
    if isinstance(environment, str) and environment.strip():
        facts.append(f"environment: {environment.strip()}")
    lighting = observed.get("lighting")
    if isinstance(lighting, str) and lighting.strip():
        facts.append(f"lighting: {lighting.strip()}")
    uncertainties = [
        str(value).strip()
        for value in (observed.get("uncertainties") or [])[:8]
        if str(value).strip()
    ]
    if uncertainties:
        facts.append("uncertain, do not invent: " + "; ".join(uncertainties))
    text = "; ".join(facts)
    return text[:6_000] if text else "Use the approved Start Frame itself as authoritative State #0."


_SPEECH_INTENT = re.compile(
    r"\b(?:asks?|says?|tells?|speaks?|whispers?|replies?|converses?)\b|(?:ถาม|พูด|บอก|กล่าว|เอ่ย|กระซิบ|สนทนา)",
    re.IGNORECASE,
)


def _has_positive_speech_intent(text: str) -> bool:
    for match in _SPEECH_INTENT.finditer(text):
        prefix = text[max(0, match.start() - 28):match.start()].casefold()
        if re.search(r"(?:\bno(?:\s+one)?|\bwithout|\bdoes\s+not|\bdo\s+not|ไม่)\s*$", prefix):
            continue
        return True
    return False
_PICKUP_INTENT = re.compile(
    r"\b(?:pick(?:s|ed)?\s+up|retrieve[sd]?|take[sd]?\s+from|reach(?:es|ed)?\s+(?:to|toward)\s+(?:the\s+)?(?:shelf|table))\b|(?:หยิบ|เอา).{0,24}(?:จาก|ชั้น|โต๊ะ)",
    re.IGNORECASE,
)
_HELD_STATE = re.compile(
    r"\b(?:held|holding|gripped|carried|in\s+(?:the\s+)?(?:left|right|both)?\s*hands?)\b|(?:ถือ|อยู่ในมือ|กำไว้|กอดไว้)",
    re.IGNORECASE,
)


def _intent_policy_conflicts(
    payload: dict[str, Any],
    intent: dict[str, Any],
    observed: dict[str, Any],
) -> list[str]:
    scene = str(intent.get("scene") or "")
    actions = [str(action) for action in intent.get("actions") or []]
    authored_text = "\n".join([scene, *actions])
    conflicts: list[str] = []
    if not _extract_dialogue_list(payload) and _has_positive_speech_intent(authored_text):
        conflicts.append(
            "Canonical dialogue is empty, but the candidate implies spoken dialogue. Rewrite as silent acting, gesture and eye contact only."
        )
    normalized_actions = authored_text.casefold().replace("_", " ")
    if _PICKUP_INTENT.search(authored_text):
        for item in observed.get("objects") or []:
            if not isinstance(item, dict):
                continue
            observed_state = f"{item.get('state', '')} {item.get('position', '')}"
            if not _HELD_STATE.search(observed_state):
                continue
            entity = str(item.get("entityId") or "").casefold().replace("_", " ")
            tokens = [token for token in re.findall(r"[\w\u0E00-\u0E7F]+", entity) if len(token) >= 3]
            if tokens and any(token in normalized_actions for token in tokens):
                conflicts.append(
                    f"Observed object {item.get('entityId')} is already held at State #0; do not pick it up again or source it from another location."
                )
    return conflicts


def _observed_start_state_bullets(observed: dict[str, Any] | None) -> list[str]:
    if not isinstance(observed, dict):
        return ["Preserve the approved START_FRAME_IMAGE as authoritative State #0."]
    bullets: list[str] = []
    for character in (observed.get("characters") or [])[:6]:
        if not isinstance(character, dict):
            continue
        hands = character.get("handOccupancy")
        hand_text = ""
        if isinstance(hands, dict):
            occupied = [
                f"{side} hand: {value}"
                for side, value in (("left", hands.get("left")), ("right", hands.get("right")))
                if isinstance(value, str) and value.strip()
            ]
            hand_text = f"; {', '.join(occupied)}" if occupied else ""
        elif isinstance(hands, str) and hands.strip():
            hand_text = f"; hands: {hands.strip()}"
        cid = character.get("characterId", "primary character")
        bullets.append(
            f"Character ({cid}): {character.get('screenPosition', 'in frame')}, "
            f"pose: {character.get('pose', 'as in frame')}, "
            f"gaze: {character.get('gaze', 'directed as in frame')}{hand_text}."
        )
    for item in (observed.get("objects") or [])[:5]:
        if not isinstance(item, dict):
            continue
        bullets.append(
            f"Object ({item.get('entityId', 'prop')}): state {item.get('state', 'static')}, "
            f"position {item.get('position', 'in scene')}."
        )
    env = observed.get("environment")
    if isinstance(env, dict):
        desc = env.get("description")
        light = env.get("lighting")
        if desc or light:
            parts = [p for p in (desc, f"lighting: {light}" if light else None) if p]
            bullets.append(f"Environment: {'; '.join(parts)}.")
    elif isinstance(env, str) and env.strip():
        bullets.append(f"Environment: {env.strip()}.")
    if not bullets:
        bullets.append("Preserve the exact character pose, wardrobe, objects, and environment from frame 0.")
    return bullets


def _normalize_position_bucket(pos_str: str | None) -> str | None:
    if not pos_str or not isinstance(pos_str, str):
        return None
    p = pos_str.lower().strip()
    if "viewer-left" in p:
        return "viewer-left"
    if "viewer-right" in p:
        return "viewer-right"
    if "viewer-center-left" in p:
        return "viewer-center-left"
    if "viewer-center-right" in p:
        return "viewer-center-right"
    if "viewer-center" in p:
        return "viewer-center"
    if "left" in p and "right" not in p:
        return "viewer-left"
    if "right" in p and "left" not in p:
        return "viewer-right"
    if "center" in p:
        return "viewer-center"
    return None


def _resolve_character_positions(
    payload: dict[str, Any],
    observed_start_state: dict[str, Any] | None,
) -> dict[str, str]:
    """Map character keys/names/IDs to their viewer positions ('viewer-left', 'viewer-right', etc.)."""
    pos_map: dict[str, str] = {}

    shot = payload.get("shot") or {}
    continuity = payload.get("continuity") or {}
    cast_positions = (
        shot.get("verifiedCastPositions")
        or continuity.get("verifiedCastPositions")
        or []
    )
    for entry in cast_positions:
        if isinstance(entry, dict):
            pos = _normalize_position_bucket(entry.get("position"))
            if pos:
                for k in [entry.get("characterKey"), entry.get("name")]:
                    if k:
                        pos_map[str(k).strip().lower()] = pos
                        pos_map[str(k).strip()] = pos

    if observed_start_state and isinstance(observed_start_state, dict):
        chars = observed_start_state.get("characters") or []
        for ch in chars:
            if isinstance(ch, dict):
                cid = ch.get("characterId")
                pos = _normalize_position_bucket(ch.get("screenPosition"))
                if cid and pos:
                    cid_str = str(cid).strip()
                    if cid_str.lower() not in pos_map:
                        pos_map[cid_str.lower()] = pos
                        pos_map[cid_str] = pos

    return pos_map


def _clean_physical_action(action_text: str, speaker_name: str) -> str:
    """Strip embedded quotes or redundant speaking clauses so only physical action remains."""
    if not action_text:
        return ""
    cleaned = re.sub(r'["“][^"”]*["”]', '', action_text)
    cleaned = re.sub(
        r'\s*(?:and\s+)?(?:speaks|says|delivers|answers|shouts|whispers)\s+(?:with|in)\s+[^:;,.!?]*[:;,.]?',
        '',
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r'\s*delivers line:?.*', '', cleaned, flags=re.IGNORECASE)
    if speaker_name:
        cleaned = re.sub(rf'^{re.escape(speaker_name)}\s+', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s{2,}', ' ', cleaned).strip(" ,.;:")
    return cleaned


def _build_motion_timeline(
    duration: float,
    actions: list[str],
    dialogue: list[dict[str, Any]],
    character_positions: dict[str, str] | None = None,
    all_characters: list[dict[str, str]] | None = None,
) -> list[str]:
    blocks: list[str] = []
    tense_keywords = (
        "หนี", "หลบ", "ไล่", "ซ่อน", "กลัว", "แอบ", "ระแวง", "ตื่น",
        "tense", "panic", "pursuit", "pursuer", "chase", "hide", "evade",
        "threat", "danger", "flee", "wary", "crouch", "hurried", "trembling", "stealth"
    )
    is_tense = any(any(k in str(act).lower() for k in tense_keywords) for act in actions)

    if is_tense:
        blocks.append(
            "0.0–1.5 seconds:\n"
            "Hold the exact frame-0 pose and camera framing with alert physical tension. "
            "The character maintains vigilant focus against immediate danger as motion begins."
        )
    else:
        blocks.append(
            "0.0–1.5 seconds:\n"
            "Hold the exact frame-0 pose, gaze and camera framing naturally. "
            "Settle into the beat before main action begins."
        )
    mid_start = 1.5
    mid_end = max(mid_start + 1.5, duration - 2.0)
    events: list[tuple[str, str]] = []

    pos_map = character_positions or {}
    chars_list = all_characters or []

    if dialogue:
        for idx, line in enumerate(dialogue):
            speaker = line.get("speaker") or line.get("speakerHint") or f"Character {idx + 1}"
            speaker_id = line.get("speakerId") or line.get("characterKey") or ""
            pos = line.get("position")
            if not pos:
                pos = (
                    pos_map.get(speaker_id.lower())
                    or pos_map.get(speaker.lower())
                    or pos_map.get(speaker_id)
                    or pos_map.get(speaker)
                )

            speaker_anchor = f"{speaker} on {pos}" if pos else speaker
            txt = line.get("text") or line.get("lineTh") or ""

            emotion = line.get("emotion")
            if emotion:
                voice_cue = f"a {emotion} voice"
            else:
                voice_cue = "a clear, natural voice"

            raw_act = actions[idx] if idx < len(actions) else ""
            clean_act = _clean_physical_action(raw_act, speaker)
            if clean_act:
                acting_clause = f" as they {clean_act};" if not clean_act.startswith("as ") else f" {clean_act};"
            else:
                acting_clause = ";"

            listeners: list[str] = []
            for other in chars_list:
                other_name = other.get("name") or other.get("id") or ""
                other_id = other.get("id") or ""
                if (
                    other_name.lower() != speaker.lower()
                    and other_id.lower() != speaker_id.lower()
                    and other_name.lower() != speaker_id.lower()
                ):
                    l_pos = other.get("position") or pos_map.get(other_id.lower()) or pos_map.get(other_name.lower())
                    l_anchor = f"{other_name} on {l_pos}" if l_pos else other_name
                    listeners.append(f"{l_anchor} listens, mouth closed with no mouth movement.")

            listeners_str = (" " + " ".join(listeners)) if listeners else ""

            event_desc = (
                f"{speaker_anchor}{acting_clause} {speaker} says with {voice_cue}, "
                f"precise realistic lip sync: \"{txt}\".{listeners_str}"
            )
            events.append((event_desc, "speech"))

        for act in actions[len(dialogue):]:
            clean_remaining = _clean_physical_action(act, "")
            if clean_remaining:
                events.append((clean_remaining, "action"))
    else:
        for act in actions:
            events.append((act, "action"))

    if not events:
        events = [("Perform the approved storyboard action with physically plausible motion.", "action")]

    slice_count = len(events)
    slice_dur = (mid_end - mid_start) / max(1, slice_count)
    for i, (event_desc, etype) in enumerate(events):
        t0 = mid_start + i * slice_dur
        t1 = mid_start + (i + 1) * slice_dur
        blocks.append(f"{t0:.1f}–{t1:.1f} seconds:\n{event_desc}")

    if is_tense:
        blocks.append(
            f"{mid_end:.1f}–{duration:.1f} seconds:\n"
            "Hold the resolved pose. The character remains alert with lingering dramatic tension as camera movement settles."
        )
    else:
        blocks.append(
            f"{mid_end:.1f}–{duration:.1f} seconds:\n"
            "Hold the resolved pose. The character's expression settles as camera movement gently eases to a stop."
        )
    return blocks


def _clean_acoustic_descriptor(text: str) -> str:
    """Strip diminishing modifiers like 'faint', 'barely audible' so audio isn't rendered at -30dB."""
    cleaned = re.sub(r'\b(faint|barely audible|subdued|quietly|distant)\s+', '', text, flags=re.IGNORECASE)
    return re.sub(r'\s{2,}', ' ', cleaned).strip(" ,.;:")


def _extract_audio_direction_summary(payload: dict[str, Any], intent: dict[str, Any]) -> str | None:
    shot = payload.get("shot") or {}
    continuity = payload.get("continuity") or {}
    audio_intent = intent.get("audioIntent")

    existing_dir = (
        shot.get("audioDirection")
        or continuity.get("audioDirection")
        or (audio_intent if isinstance(audio_intent, str) and audio_intent.strip() else None)
    )
    if existing_dir and isinstance(existing_dir, str) and existing_dir.strip():
        return existing_dir.strip()

    if isinstance(audio_intent, dict):
        foley = audio_intent.get("mustHearFoley") or audio_intent.get("foley") or []
        foley_cues: list[str] = []
        for f in foley:
            if isinstance(f, dict) and f.get("description"):
                desc = _clean_acoustic_descriptor(str(f["description"]))
                if desc:
                    foley_cues.append(desc)
            elif isinstance(f, str) and f.strip():
                desc = _clean_acoustic_descriptor(f.strip())
                if desc:
                    foley_cues.append(desc)

        atm = audio_intent.get("atmosphere") or audio_intent.get("ambience")
        atm_desc: str | None = None
        if isinstance(atm, dict) and atm.get("description"):
            atm_desc = str(atm["description"]).strip()
        elif isinstance(atm, str) and atm.strip():
            atm_desc = atm.strip()

        parts = []
        if foley_cues:
            parts.append(f"{', '.join(foley_cues)} are audible")
        if atm_desc:
            parts.append(f"with {atm_desc}")
        if parts:
            return f"{', '.join(parts)}; no music."

    return None


def _build_native_audio_section(
    payload: dict[str, Any],
    intent: dict[str, Any],
    target_id: str,
    dialogue: list[dict[str, Any]],
) -> list[str]:
    shot = payload.get("shot") or {}
    continuity = payload.get("continuity") or {}
    audio_intent = intent.get("audioIntent")

    existing_dir = (
        shot.get("audioDirection")
        or continuity.get("audioDirection")
        or (audio_intent if isinstance(audio_intent, str) and audio_intent.strip() else None)
    )

    foley_cues: list[str] = []
    atm_desc: str | None = None
    if isinstance(audio_intent, dict):
        foley = audio_intent.get("mustHearFoley") or audio_intent.get("foley") or []
        for f in foley:
            if isinstance(f, dict) and f.get("description"):
                desc = _clean_acoustic_descriptor(str(f["description"]))
                if desc:
                    foley_cues.append(desc)
            elif isinstance(f, str) and f.strip():
                desc = _clean_acoustic_descriptor(f.strip())
                if desc:
                    foley_cues.append(desc)

        atm = audio_intent.get("atmosphere") or audio_intent.get("ambience")
        if isinstance(atm, dict) and atm.get("description"):
            atm_desc = str(atm["description"]).strip()
        elif isinstance(atm, str) and atm.strip():
            atm_desc = atm.strip()

    if not foley_cues:
        raw_sfx = shot.get("soundEffects") or shot.get("audioNotes")
        if isinstance(raw_sfx, list):
            foley_cues = [_clean_acoustic_descriptor(str(x)) for x in raw_sfx if str(x).strip()]
        elif isinstance(raw_sfx, str) and raw_sfx.strip():
            foley_cues = [_clean_acoustic_descriptor(raw_sfx.strip())]

    audio_subsections: list[str] = ["NATIVE AUDIO / SOUND DESIGN"]

    # Summary Audio Direction line (concise, high impact, like Legacy)
    if existing_dir and isinstance(existing_dir, str) and existing_dir.strip():
        audio_subsections.append(f"AUDIO DIRECTION: {existing_dir.strip()}")
    elif isinstance(audio_intent, dict):
        audio_lines = []
        if dialogue:
            audio_lines.append("Clear synchronous spoken Thai dialogue.")
        if foley_cues:
            audio_lines.append("Motivated foley: " + ", ".join(foley_cues) + ".")
        if atm_desc:
            audio_lines.append(f"Room tone: {atm_desc}.")
        if audio_lines:
            audio_subsections.append("AUDIO DIRECTION: " + " ".join(audio_lines))
    elif foley_cues or atm_desc:
        foley_part = f"{', '.join(foley_cues)} are clearly audible in the foreground" if foley_cues else "Motivated physical prop and surface interactions"
        atm_part = f" with {atm_desc}" if atm_desc else " with grounded environmental room tone"
        audio_subsections.append(f"AUDIO DIRECTION: {foley_part}{atm_part}; intimate close-mic vocal presence, no music.")
    elif dialogue:
        audio_subsections.append("AUDIO DIRECTION: Clear synchronous spoken Thai dialogue with crisp tactile prop interactions and grounded environmental room tone; no music.")
    else:
        audio_subsections.append("AUDIO DIRECTION: Crisp tactile physical foley and grounded environmental room tone; no music, no spoken dialogue.")

    # High Proximity Voice Direction (Fixes "เสียงเหมือนอยู่ไกลไม่ได้อารมณ์")
    if dialogue:
        audio_subsections.append(
            "Speech & Vocal Presence (High Proximity):\n"
            "Direct close-mic vocal presence with clear syllable projection and low room reverberation."
        )

    # Concrete Foley (Primary Tier)
    if foley_cues:
        audio_subsections.append(
            f"Foley & Contact Sounds (Tactile & Audible):\n"
            f"{', '.join(foley_cues)} are crisp, tactile, and clearly audible in the foreground."
        )

    # Atmosphere / Room Tone (Secondary Tier)
    if atm_desc:
        audio_subsections.append(f"Atmosphere & Room Tone:\n{atm_desc}.")

    # Model-specific audio blocks
    if "omni" in target_id.lower() and dialogue:
        omni_events = []
        cur_sec = 0
        for idx, line in enumerate(dialogue):
            text = line.get("text") or line.get("lineTh") or ""
            speaker = line.get("speaker") or line.get("speakerHint") or line.get("speakerId") or f"Character {idx+1}"
            omni_events.append(f"[{cur_sec}-{cur_sec+2}s] {speaker}: \"{text}\"")
            cur_sec += 2
        for f in foley_cues:
            omni_events.append(f"[{cur_sec}s] SFX: {f}")
            cur_sec += 1
        audio_subsections.append("TIMECODED AUDIO EVENTS (OMNI):\n" + "\n".join(omni_events))
    elif "seedance" in target_id.lower():
        audio_subsections.append("PHYSICAL ACOUSTIC PAIRING (SEEDANCE): Match all physical impact sounds with visible contact surfaces.")
    elif "h3" in target_id.lower() or "hailuo" in target_id.lower():
        audio_subsections.append("ACOUSTIC BREVITY (H3): Keep ambient room tone minimal and speech clean.")

    # Strict negative audio constraint
    audio_subsections.append("Negative Audio: Strictly no background music, no score, no crowd chatter, no off-screen voices.")

    return audio_subsections


def _terminal_prompt(
    payload: dict[str, Any],
    intent: dict[str, Any],
    observed_start_state: dict[str, Any] | None = None,
) -> str:
    shot = payload.get("shot") or {}
    target = payload.get("targetVideoModel") or {}
    target_id = str(target.get("id") or "server-selected-model").strip()
    duration_val = shot.get("durationSeconds")
    try:
        duration_sec = float(duration_val) if duration_val else 10.0
    except (ValueError, TypeError):
        duration_sec = 10.0
    if duration_sec < 3.0:
        duration_sec = 8.0

    unified_image_transport = _uses_unified_image_transport(target)
    start_frame_instruction = (
        "REFERENCE FRAME SET: The approved START_FRAME_IMAGE is serialized as "
        "the first item in the provider reference-image array. Preserve its "
        "identity, wardrobe, geometry, lighting, layout and object state as "
        "the strongest visual continuity anchor, but do not claim a hard "
        "literal frame-0 guarantee when additional references are present."
        if unified_image_transport
        else "START FRAME LOCK: Continue directly from the approved START_FRAME_IMAGE as frame 0; match the image exactly before any motion, and preserve identity, wardrobe, geometry, lighting, layout and object state."
    )

    dialogue = _extract_dialogue_list(payload, intent)
    actions = [str(a).strip() for a in (intent.get("actions") or []) if str(a).strip()]
    if not actions:
        actions = ["Perform the approved storyboard action with physically plausible motion."]

    character_positions = _resolve_character_positions(payload, observed_start_state)
    continuity = payload.get("continuity") or {}

    all_characters: list[dict[str, str]] = []
    seen_char_keys = set()

    for entry in (
        (shot.get("verifiedCastPositions") or continuity.get("verifiedCastPositions") or [])
    ):
        if isinstance(entry, dict):
            c_name = entry.get("name") or entry.get("characterKey")
            c_id = entry.get("characterKey") or c_name
            c_pos = _normalize_position_bucket(entry.get("position"))
            if c_name and str(c_name).lower() not in seen_char_keys:
                seen_char_keys.add(str(c_name).lower())
                all_characters.append({"id": str(c_id), "name": str(c_name), "position": c_pos or ""})

    for ch in (observed_start_state.get("characters") if observed_start_state else []) or []:
        if isinstance(ch, dict):
            cid = str(ch.get("characterId") or "").strip()
            cpos = _normalize_position_bucket(ch.get("screenPosition"))
            cname = cid
            for line in dialogue:
                if (
                    line.get("speakerId") == cid
                    or line.get("characterKey") == cid
                    or line.get("speakerHint") == cid
                ):
                    cname = line.get("speaker") or cid
                    break
            if cid and cid.lower() not in seen_char_keys and cname.lower() not in seen_char_keys:
                seen_char_keys.add(cid.lower())
                seen_char_keys.add(cname.lower())
                all_characters.append({"id": cid, "name": cname, "position": cpos or ""})

    timeline_blocks = _build_motion_timeline(
        duration_sec, actions, dialogue, character_positions, all_characters
    )
    camera_spec = str(intent.get("camera") or shot.get("cameraSetup") or "Natural 35mm-lens eye-level perspective with smooth cinematic motion").strip()

    native_audio_enabled = (
        "nativeAudioEnabled" not in payload
        or payload.get("nativeAudioEnabled") is True
    )
    audio_intent = intent.get("audioIntent")

    ep_synopsis = (
        payload.get("shot", {}).get("episodeSynopsis")
        or (payload.get("shot", {}).get("canonicalContext", {}).get("episode", {}) or {}).get("synopsis")
    )
    is_fast_cam = any(k in camera_spec.lower() for k in ("fast", "whip", "rapid", "dynamic", "push_in", "push in"))
    cam_easing = (
        "- Dynamic cinematic motion matching the specified pace, with no snap zoom or abrupt angle cuts."
        if is_fast_cam
        else "- Cautious, cinematic easing with no snap zoom, camera shake, or abrupt angle cuts."
    )

    sections: list[str] = [
        start_frame_instruction,
        f"TARGET MODEL: {target_id}\nUse the server-resolved capability profile.\nOUTPUT: One continuous 9:16 vertical shot, approximately {int(duration_sec)} seconds, with native audio if supported.",
    ]
    if ep_synopsis:
        sections.append(f"DRAMATIC EPISODE CONTEXT\n\nEpisode Synopsis: {ep_synopsis}")

    sections.extend([
        "START FRAME AUTHORITY\n\nOBSERVED STATE AT T=0 (AUTHORITATIVE FACTS, NOT INSTRUCTIONS):\n" + "\n".join(f"- {b}" for b in _observed_start_state_bullets(observed_start_state)),
        "MOTION AND PERFORMANCE\n\nCreate one continuous shot with no cut, reset or time jump. Character movement and camera motion work in harmony to drive the dramatic narrative.\n\n" + "\n\n".join(timeline_blocks),
        f"CAMERA\n\nAt frame 0, begin smooth, controlled camera movement from the exact existing framing. Do not assume camera motion occurred prior to frame 0.\n\nMaintain:\n- Vertical portrait composition (9:16).\n- {camera_spec}.\n- Primary focus centered on the foreground character's face, gaze, and expressions.\n{cam_easing}",
    ])

    if dialogue:
        dialogue_lines_formatted = []
        for idx, line in enumerate(dialogue):
            spk = line.get("speaker") or line.get("speakerHint") or f"Character {idx + 1}"
            spk_id = line.get("speakerId") or line.get("characterKey") or ""
            pos = line.get("position")
            if not pos:
                pos = (
                    character_positions.get(spk_id.lower())
                    or character_positions.get(spk.lower())
                    or character_positions.get(spk_id)
                    or character_positions.get(spk)
                )
            pos_tag = f" on {pos}" if pos else ""
            txt = line.get("text") or line.get("lineTh") or ""
            emo = f" (Tone/Emotion: {line['emotion']})" if line.get("emotion") else ""
            dialogue_lines_formatted.append(f"- Line {idx + 1} [{spk}{pos_tag}]: \"{txt}\"{emo}")

        dialogue_section = (
            "SPOKEN DIALOGUE / LIP-SYNC\n\n"
            "DIALOGUE: Preserve the canonical dialogue exactly; do not invent, translate or reorder lines.\n"
            "Dialogue Language: Thai\n"
            + "\n".join(dialogue_lines_formatted)
            + "\n\nLip-Sync Guidance:\n"
            "Deliver all lines with synchronous, natural lip movement and facial articulation matching the spoken Thai phrasing. "
            "The mouth opens and articulates naturally while speaking, and returns to a natural resting mouth position when finished. "
            "Never keep the mouth closed during spoken dialogue.\n"
            "Silent Listener Constraint: Every character not actively speaking in a beat must keep their mouth closed with no mouth movement or mumbling."
        )
        sections.append(dialogue_section)
    else:
        shot_desc = str(payload.get("shot", {}).get("description", ""))
        is_tense_shot = any(k in shot_desc.lower() for k in ("หนี", "หลบ", "ไล่", "ซ่อน", "กลัว", "tense", "pursuit", "chase", "hide"))
        acting_guidance = (
            "Convey urgent dramatic tension and vigilance through sharp eye contact, guarded physical evasion, and authentic emotional stakes."
            if is_tense_shot
            else "Convey the beat entirely through motivated non-verbal performance, facial expression, eye contact, and authentic dramatic presence."
        )
        sections.append(
            "DIALOGUE POLICY: No spoken dialogue.\n"
            f"{acting_guidance}"
        )

    if not native_audio_enabled:
        if dialogue:
            sections.append(
                "AUDIO POLICY: Spoken dialogue only.\n"
                "Do not generate any background sound effects, foley, footsteps, or room tone. "
                "Keep the acoustic background completely clean and silent behind the dialogue."
            )
        else:
            sections.append(
                "AUDIO POLICY: Complete silence. Silent visual acting only. "
                "Do not generate any spoken voice, sound effects, or background audio."
            )
    else:
        audio_subsections = _build_native_audio_section(payload, intent, target_id, dialogue)
        sections.append("\n\n".join(audio_subsections))

    end_bridge = intent.get("endBridge")
    if isinstance(end_bridge, str) and end_bridge.strip():
        sections.append("END STATE: " + end_bridge.strip())

    locks = intent.get("continuityLocks") or []
    locks_text = f" Continuity locks: {'; '.join(str(lock) for lock in locks)}." if locks else ""
    sections.append(
        "CONTINUITY AND NEGATIVE CONSTRAINTS\n\n"
        f"Preserve exact character identity, wardrobe, hair, wetness, lighting, environment, object geometry and positions.{locks_text}\n"
        "Keep stationary props stable; do not duplicate, morph, or teleport objects.\n"
        "No duplicate people, duplicate hands, or new unapproved background characters.\n"
        "No unexplained cuts, scene resets, or time jumps.\n"
        "Use only the server-authorized Feature 170 media bundle."
    )

    terminal_text = "\n\n".join(sections)
    if len(terminal_text) >= 4096:
        terminal_text = terminal_text.replace(
            "At frame 0, begin smooth, controlled camera movement from the exact existing framing. Do not assume camera motion occurred prior to frame 0.",
            "At frame 0, begin smooth camera movement from the existing framing."
        )
        terminal_text = terminal_text.replace(
            "Create one continuous shot with no cut, reset or time jump. Character movement and camera motion work in harmony to drive the dramatic narrative.",
            "Create one continuous shot with no cut or reset. Movement and camera work in harmony to drive the dramatic beat."
        )
    return terminal_text


async def run(payload: dict[str, Any]) -> dict[str, Any]:
    root = Path(__file__).resolve().parents[2]
    contracts = StageContractRegistry(root)
    contracts.validate_input(_package_input(payload))
    authoring_model = str((payload.get("authoringModel") or {}).get("id") or "").strip()
    config = AgentRuntimeConfig(
        model=authoring_model,
        allow_research_tool=str(payload.get("researchMode") or "off") == "bounded",
        allow_cost_estimate_tool=False,
        # The selected authoring provider key is not necessarily an OpenAI
        # platform tracing key (for example OpenRouter). Keep this isolated
        # bridge local and avoid non-fatal trace export 401s.
        tracing_enabled=False,
        trace_include_sensitive_data=False,
        use_sessions=False,
    )
    if not config.model:
        raise RuntimeError("AGENT_MODEL_NOT_CONFIGURED")
    core = ReadOnlyCore(payload)
    context = DirectorRunContext(
        tenant_id="bridge-tenant",
        project_id="vertical-drama-shot",
        run_id=hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()[:32],
        actor_id="controller",
        workflow_version="11.0.0",
        core=core,
        config=config,
    )
    runner = OpenAIAgentsRunner()
    orchestrator = DirectorOrchestrator(
        package_root=str(root),
        runner=runner,
        agent_factory=AgentFactory(contracts),
    )
    shared_stage_input = {
        "shotId": str((payload.get("shot") or {}).get("shotNumber", "shot")),
        "scene": (payload.get("shot") or {}).get("description", ""),
        "camera": (payload.get("shot") or {}).get("cameraSetup", ""),
        "durationSeconds": (payload.get("shot") or {}).get("durationSeconds"),
        "characterIds": (payload.get("shot") or {}).get("characterIds") or [],
        "locationId": (payload.get("shot") or {}).get("locationId"),
        "continuityNotes": (payload.get("shot") or {}).get("continuityNotes") or [],
        "canonicalContext": (payload.get("shot") or {}).get("canonicalContext") or {},
        "dialogue": _extract_dialogue_list(payload),
        "mediaBundle": payload.get("mediaBundle") or {},
        "_visionReferences": payload.get("visionReferences") or [],
        "targetVideoModel": payload.get("targetVideoModel") or {},
        "targetCapabilitySnapshot": (payload.get("targetVideoModel") or {}).get("capabilitySnapshot") or {},
        "continuity": payload.get("continuity") or {},
    }
    start_frame_references = [
        reference
        for reference in payload.get("visionReferences") or []
        if isinstance(reference, dict) and reference.get("label") == "START_FRAME_IMAGE"
    ][:1]
    observed_result = await orchestrator.run_stage(
        "observed_start_state",
        context=context,
        input_payload={
            "source": "start_frame",
            "characterIds": shared_stage_input["characterIds"],
            "legacyFrameAnalysis": (payload.get("shot") or {}).get("frameAnalysis") or {},
            "_visionReferences": start_frame_references,
            "instructions": (
                "Observe the approved START_FRAME_IMAGE as State #0. The image overrides conflicting story text or legacy analysis. "
                "Record exact pose, screen position, gaze, hand occupancy and object ownership/location; mark uncertainty instead of guessing."
            ),
        },
    )
    stage_input = {
        **shared_stage_input,
        "observedStartState": observed_result.payload,
        "_visionReferences": payload.get("visionReferences") or [],
        "instructions": (
            "Return concise provider-neutral intent that continues after observed State #0. "
            "The observed state overrides conflicting storyboard prose. Do not replay completed actions, reset poses, or relocate/duplicate an existing object. "
            "Preserve canonical dialogue exactly; when dialogue is empty, use silent acting only. Do not choose a model or provider."
        ),
    }
    result = await orchestrator.run_stage(
        "prompt_intent",
        context=context,
        input_payload=stage_input,
        instance_id=stage_input["shotId"],
    )
    prompt_usage = result.usage
    prompt_warnings = list(result.warnings)
    prompt_assumptions = list(result.assumptions)
    policy_conflicts = _intent_policy_conflicts(payload, result.payload, observed_result.payload)
    if policy_conflicts:
        repaired_stage_input = {
            **stage_input,
            "policyRepairFindings": policy_conflicts,
            "instructions": (
                stage_input["instructions"]
                + " The previous candidate failed mandatory State #0/dialogue policy. Rewrite the entire intent and resolve every policyRepairFinding."
            ),
        }
        repair_result = await orchestrator.run_stage(
            "prompt_intent",
            context=context,
            input_payload=repaired_stage_input,
            instance_id=stage_input["shotId"],
        )
        remaining_conflicts = _intent_policy_conflicts(
            payload, repair_result.payload, observed_result.payload
        )
        if remaining_conflicts:
            repaired_payload = dict(repair_result.payload)
            if not _extract_dialogue_list(payload):
                cleaned_actions = []
                for act in repaired_payload.get("actions") or []:
                    cleaned_actions.append(_SPEECH_INTENT.sub("gestures silently to indicate", str(act)))
                repaired_payload["actions"] = cleaned_actions
            prompt_warnings.extend([f"Policy conflict note: {c}" for c in remaining_conflicts])
            repair_result = StageRunResult(
                stage=repair_result.stage,
                payload=repaired_payload,
                usage=repair_result.usage,
                warnings=[*repair_result.warnings, *[f"Policy conflict note: {c}" for c in remaining_conflicts]],
                assumptions=repair_result.assumptions,
                needs_human_review=True,
                confidence=repair_result.confidence,
                attempts=repair_result.attempts,
            )
        prompt_usage = prompt_usage.plus(repair_result.usage)
        prompt_warnings.extend(repair_result.warnings)
        prompt_assumptions.extend(repair_result.assumptions)
        result = repair_result
    prompt = _terminal_prompt(payload, result.payload, observed_result.payload)
    negative_prompt_parts = [
        "Do not change identity, wardrobe, approved object geometry, "
        + ("reference-image continuity" if _uses_unified_image_transport(payload.get("targetVideoModel") or {}) else "frame-0 composition")
        + ", or canonical dialogue; no duplicate subjects, no reset, no invented text."
    ]
    if not (payload.get("nativeAudioEnabled") is True):
        negative_prompt_parts.append("Do not generate background music, ambient sound effects, foley, footsteps, or room tone.")
    bridge_result = {
        "prompt": prompt,
        "negativeMotionPrompt": " ".join(negative_prompt_parts),
        "dialogue": payload.get("dialogue") or [],
        "warnings": list(dict.fromkeys([*observed_result.warnings, *prompt_warnings])),
        "assumptions": list(dict.fromkeys([*observed_result.assumptions, *prompt_assumptions])),
        "researchProvenance": [],
        "inputTokens": observed_result.usage.input_tokens + prompt_usage.input_tokens,
        "outputTokens": observed_result.usage.output_tokens + prompt_usage.output_tokens,
        "terminalPromptHash": hashlib.sha256(prompt.encode("utf-8")).hexdigest(),
        "skillVersion": "11.0.0",
        "adapterVersion": ADAPTER_VERSION,
        "sdkVersion": installed_sdk_version(),
    }
    native_audio_enabled = (
        "nativeAudioEnabled" not in payload
        or payload.get("nativeAudioEnabled") is True
    )
    if native_audio_enabled:
        audio_dir = _extract_audio_direction_summary(payload, result.payload)
        if audio_dir:
            bridge_result["audioDirection"] = audio_dir
    return bridge_result


def main() -> None:
    if "--health" in sys.argv[1:]:
        require_openai_agents_sdk()
        print(json.dumps({
            "ok": True,
            "sdkVersion": installed_sdk_version(),
            "adapterVersion": ADAPTER_VERSION,
            "skillVersion": "11.0.0",
        }, separators=(",", ":")))
        return
    raw = sys.stdin.read()
    payload = json.loads(raw)
    result = asyncio.run(run(payload))
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # stderr only; stdout remains machine-readable.
        print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
        raise
