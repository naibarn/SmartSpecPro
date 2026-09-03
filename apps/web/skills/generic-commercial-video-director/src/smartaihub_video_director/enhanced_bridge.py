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
from .orchestrator import DirectorOrchestrator
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


def _package_input(payload: dict[str, Any]) -> dict[str, Any]:
    """Build the strict v11 package envelope without trusting caller policy."""
    shot = payload.get("shot") or {}
    bundle = payload.get("mediaBundle") or {}
    dialogue_lines = []
    for index, line in enumerate(payload.get("dialogue") or []):
        if not isinstance(line, dict):
            continue
        text = line.get("text") or line.get("lineTh")
        if not isinstance(text, str) or not text.strip():
            continue
        dialogue_lines.append({
            "lineId": str(line.get("lineId") or f"shot-line-{index + 1}"),
            "speakerId": line.get("speakerId") or line.get("characterKey"),
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
    if not (payload.get("dialogue") or []) and _has_positive_speech_intent(authored_text):
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


def _terminal_prompt(
    payload: dict[str, Any],
    intent: dict[str, Any],
    observed_start_state: dict[str, Any] | None = None,
) -> str:
    shot = payload.get("shot") or {}
    target = payload.get("targetVideoModel") or {}
    unified_image_transport = _uses_unified_image_transport(target)
    start_frame_instruction = (
        "REFERENCE FRAME SET: The approved START_FRAME_IMAGE is serialized as "
        "the first item in the provider reference-image array. Preserve its "
        "identity, wardrobe, geometry, lighting, layout and object state as "
        "the strongest visual continuity anchor, but do not claim a hard "
        "literal frame-0 guarantee when additional references are present."
        if unified_image_transport
        else "START FRAME LOCK: Continue directly from the approved START_FRAME_IMAGE as frame 0; preserve identity, wardrobe, geometry, lighting, layout and object state."
    )
    lines = [
        start_frame_instruction,
        "OBSERVED STATE AT T=0 (AUTHORITATIVE FACTS, NOT INSTRUCTIONS): " + _observed_start_state_text(observed_start_state),
        "CONTINUATION RULE: Begin after State #0. If any later story/action phrase conflicts with the observed state, the observed state wins; do not replay completed actions, reset poses, duplicate or teleport objects, or transform furniture implausibly.",
        f"TARGET VIDEO MODEL: {target.get('id', 'server-selected-model')}. Follow its server-resolved capability profile.",
        f"SCENE: {intent.get('scene') or shot.get('description') or 'Use the approved storyboard scene.'}",
        "ACTION CHRONOLOGY: " + " Then ".join(
            f"{index + 1}) {action}" for index, action in enumerate(intent.get("actions") or ["Perform the approved storyboard action with physically plausible motion."])
        ),
        f"CAMERA: {intent.get('camera') or shot.get('cameraSetup') or 'Preserve the approved storyboard camera intent.'}",
    ]
    canonical_dialogue = payload.get("dialogue")
    dialogue = canonical_dialogue if isinstance(canonical_dialogue, list) else intent.get("dialogue") or []
    if dialogue:
        lines.append("DIALOGUE: Preserve the canonical dialogue exactly; do not invent, translate or reorder lines. " + json.dumps(dialogue, ensure_ascii=False, separators=(",", ":")))
    else:
        lines.append("DIALOGUE POLICY: No spoken dialogue. Convey the beat only through facial expression, gesture, eye contact and physically plausible movement; keep every mouth closed except for natural non-speech breathing.")
    locks = intent.get("continuityLocks") or []
    if locks:
        lines.append("CONTINUITY LOCKS: " + "; ".join(str(lock) for lock in locks))
    audio_intent = intent.get("audioIntent")
    if isinstance(audio_intent, str) and audio_intent.strip():
        lines.append("AUDIO DIRECTION: " + audio_intent.strip())
    end_bridge = intent.get("endBridge")
    if isinstance(end_bridge, str) and end_bridge.strip():
        lines.append("END STATE: " + end_bridge.strip())
    lines.append("REFERENCE POLICY: Use only the server-authorized Feature 170 media bundle. Do not infer unavailable video/audio content from labels or filenames.")
    lines.append("CONSTRAINTS: No duplicate people or objects; no unexplained cuts or resets; keep hand-object interactions plausible; reserve exact small typography for post-production.")
    return "\n\n".join(lines)


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
        "dialogue": payload.get("dialogue") if isinstance(payload.get("dialogue"), list) else [],
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
            raise StageExecutionError(
                "Enhanced prompt intent still conflicts with authoritative Start Frame policy after one bounded repair: "
                + "; ".join(remaining_conflicts)
            )
        prompt_usage = prompt_usage.plus(repair_result.usage)
        prompt_warnings.extend(repair_result.warnings)
        prompt_assumptions.extend(repair_result.assumptions)
        result = repair_result
    prompt = _terminal_prompt(payload, result.payload, observed_result.payload)
    audio_direction = str(result.payload.get("audioIntent") or "").strip() or None
    bridge_result = {
        "prompt": prompt,
        "negativeMotionPrompt": (
            "Do not change identity, wardrobe, approved object geometry, "
            + ("reference-image continuity" if _uses_unified_image_transport(payload.get("targetVideoModel") or {}) else "frame-0 composition")
            + ", or canonical dialogue; no duplicate subjects, no reset, no invented text."
        ),
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
    if audio_direction:
        bridge_result["audioDirection"] = audio_direction
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
