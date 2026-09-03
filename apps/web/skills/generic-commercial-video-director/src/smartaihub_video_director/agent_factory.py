from __future__ import annotations
import json
from .guardrails import build_agent_guardrails
from .models import StageOutputEnvelope
from .schema_registry import StageContractRegistry
from .sdk_compat import require_openai_agents_sdk
from .tools import build_read_only_tools

class AgentFactory:
    def __init__(self, contracts:StageContractRegistry): self.contracts=contracts
    def build(self, stage:str, *, model:str|None=None, allow_research_tool:bool=True,
              allow_asset_evidence_tool:bool=True, allow_provider_profile_tool:bool=True,
              allow_cost_estimate_tool:bool=True):
        sdk=require_openai_agents_sdk(); Agent=sdk.Agent
        ins,outs=build_agent_guardrails()
        schema_id=self.contracts.schema_id(stage)
        required_fields=json.dumps(self.contracts.required_fields(stage),ensure_ascii=False,separators=(',',':'))
        stage_policy = ""
        if stage == "observed_start_state":
            stage_policy = (
              "Inspect only the image explicitly labelled START_FRAME_IMAGE as the authoritative state at t=0. "
              "Other portraits or reference images are identity evidence, not alternate scene states. "
              "Report only visible character position, pose, gaze, hand occupancy, object state/location, camera, environment and lighting. "
              "In payload.characters, each character must be an object with characterId (string), screenPosition (string), pose (string), gaze (string), and handOccupancy (an object with required 'left' and 'right' keys, each either a string describing what is held/resting or null if empty, e.g. {\"left\": null, \"right\": null}; do not output handOccupancy as a bare string). "
              "In payload.objects, each object must be an object with entityId (string), state (string), and position (string). "
              "The camera object must always include framing, angle and movementAtT0. A still image cannot reveal motion at t=0, so use \"unknown from still image\" and add that limitation to uncertainties instead of omitting the field. "
              "Do not infer storyboard actions, dialogue, prior actions, future actions, or move an object to a story-requested location. "
              "Use uncertainties for anything not clearly visible. "
            )
        elif stage == "prompt_intent":
            stage_policy = (
              "Treat input.observedStartState and prior observed_start_state output as authoritative State #0, above conflicting story prose. "
              "Every action must begin after that observed state: never replay a completed action, reset a pose, relocate an already-held object to be picked up again, "
              "duplicate an object, teleport an object, or invent furniture transformation. Author concrete, dynamic physical actions and expressive non-verbal acting that fulfill the narrative stakes, dramatic urgency, and emotional beat of the scene (e.g. tense evasion, furtive glances, hurried concealment of props, breathless vigilance, or confrontational posture) while maintaining physical plausibility from the observed start frame without resetting completed poses or teleporting objects. "
              "Actions must be a JSON array of strings, each describing a distinct physical action in chronological order. "
              "When input.dialogue is empty, author a silent acting beat: do not write that anyone asks, says, tells, speaks, whispers, or otherwise communicates spoken words; direct authentic physical performance, gaze, and tension that convey the dramatic beat. "
              "When canonical dialogue exists, copy it exactly and do not invent, translate, paraphrase, or reorder speech; describe natural speaking mouth movement and lip-sync for the speaker. "
              "When native audio is enabled, author concrete diegetic sound in payload.audioIntent: specify mustHearFoley as an array of concrete objects with description tying directly to visible props, physical contacts, and environmental physics in the shot (e.g. rain hitting surfaces, footsteps on wet ground, prop handling), atmosphere with description matching the dramatic beat and room tone, and deliveryStyle with close-mic vocal presence and low room reverberation. Never use generic fillers like 'motivated physical contact sounds', never use 'faint' or 'barely audible', and never add background music or score. "
            )
        instructions=(f"You are the bounded specialist for stage {stage}. Return StageOutputEnvelope only. "
          f"Set stage exactly to {stage!r}, schemaId exactly to {schema_id!r}, and make payload conform to that canonical schema. "
          f"The canonical payload required keys are {required_fields}; include every required key even when its value is an empty array or empty string allowed by the input. "
          f"{stage_policy}"
          "For prompt_intent, copy canonical dialogue as an array of the input dialogue objects; never flatten dialogue objects into strings or invent dialogue. "
          "Use only authorized/read-only tools. Never request, invent or emit authority to deduct credits, submit paid generation, publish, delete assets, change tenant scope, expose secrets, or bypass approvals. Preserve evidence levels and identify uncertainty.")
        # StageOutputEnvelope intentionally carries stage-specific payload data
        # as dict[str, Any]. Agents SDK strict JSON schema rejects that open
        # object even though Pydantic validation and the stage contract
        # registry validate the envelope and payload after the run. Keep the
        # SDK's structured output parsing, but opt out of only its strict
        # additionalProperties requirement for this bounded envelope.
        output_type=sdk.AgentOutputSchema(StageOutputEnvelope, strict_json_schema=False)
        return Agent(name=f"SmartAIHub {stage}",instructions=instructions,model=model,output_type=output_type,
                     tools=build_read_only_tools(allow_research_tool=allow_research_tool,
                         allow_asset_evidence_tool=allow_asset_evidence_tool,
                         allow_provider_profile_tool=allow_provider_profile_tool,
                         allow_cost_estimate_tool=allow_cost_estimate_tool),
                     input_guardrails=ins,output_guardrails=outs)
