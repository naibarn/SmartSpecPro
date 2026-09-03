from __future__ import annotations
import json
import re
from dataclasses import dataclass
from typing import Any,Protocol
from .agent_factory import AgentFactory
from .checkpoint import hydrate_checkpoint,persist_checkpoint
from .context import DirectorRunContext
from .errors import ApprovalRequiredError,BudgetExceededError,StageContractError,StageExecutionError,UnauthorizedAssetError
from .models import StageOutputEnvelope,StageUsage
from .schema_registry import StageContractRegistry
class RunnerPort(Protocol):
    async def run(self, *, agent:Any,input_text:str,context:DirectorRunContext,session:Any|None,max_turns:int): ...
@dataclass(slots=True)
class StageRunResult:
    stage:str; payload:dict[str,Any]; usage:StageUsage; warnings:list[str]; assumptions:list[str]; needs_human_review:bool; confidence:float; attempts:int
APPROVAL_GATES={"storyboard":"storyboard","high_cost_generation":"highCostGeneration","publish":"publish"}
SHOT_SCOPED_STAGES={"observed_start_state","visualization_plan","shot_plan","dialogue_map","continuity_plan","generation_strategy","prompt_intent","qc_report","repair_plan"}

def _normalize_hand_occupancy(val: Any) -> dict[str, str | None]:
    if isinstance(val, dict):
        left = val.get("left")
        right = val.get("right")
        if left is None and right is None:
            for k in ("holding", "item", "description", "hands", "state", "occupied", "object"):
                candidate = val.get(k)
                if isinstance(candidate, str) and candidate.strip():
                    right = candidate.strip()
                    break
        clean_left = str(left).strip() if isinstance(left, str) and left.strip() else None
        clean_right = str(right).strip() if isinstance(right, str) and right.strip() else None
        return {"left": clean_left, "right": clean_right}
    if isinstance(val, str) and val.strip():
        s = val.strip()
        lower = s.lower()
        if re.search(r"\b(?:empty|free|none|nothing|unoccupied)\b", lower) and not re.search(r"\b(?:holds?|holding|carries?|carrying|grips?|gripping|rests?|touch|touches)\b", lower):
            return {"left": None, "right": None}
        m_left = re.search(r"\bleft(?:\s+hand)?\s*(?:holds?|holding|is|:)?\s*([^,;\.]+)", s, re.IGNORECASE)
        m_right = re.search(r"\bright(?:\s+hand)?\s*(?:holds?|holding|is|:)?\s*([^,;\.]+)", s, re.IGNORECASE)
        if m_left or m_right:
            return {
                "left": m_left.group(1).strip() if m_left else None,
                "right": m_right.group(1).strip() if m_right else None,
            }
        if re.search(r"\band\s+(?:the\s+)?other\b", lower):
            parts = re.split(r"\s+and\s+(?:the\s+)?other\s+", s, flags=re.IGNORECASE)
            return {
                "left": parts[0].strip()[:200] if parts[0].strip() else None,
                "right": ("other " + parts[1].strip())[:200] if len(parts) > 1 and parts[1].strip() else None,
            }
        return {"left": s[:200], "right": None}
    return {"left": None, "right": None}

class DirectorOrchestrator:
    def __init__(self, *, package_root:str,runner:RunnerPort,session:Any|None=None,agent_factory:Any|None=None):
        self.contracts=StageContractRegistry(package_root);self.agent_factory=agent_factory or AgentFactory(self.contracts);self.runner=runner;self.session=session
    @property
    def session_id(self):return getattr(self.session,'session_id',None) if self.session is not None else None
    async def require_approval(self,context:DirectorRunContext,gate:str):
        key=APPROVAL_GATES.get(gate,gate);status=await context.core.get_approval_status(context.tenant_id,context.project_id,context.run_id,key)
        if status not in {"approved","approved_with_changes","not_required"}:raise ApprovalRequiredError(f"Approval gate {key!r} is {status!r}")
    def _relevant_stage_outputs(self,stage:str,context:DirectorRunContext,instance_id:str|None):
        out={}
        for key,val in context.stage_outputs.items():
            if ':' not in key or stage=='storyboard' or (instance_id and key.endswith(':'+instance_id)):out[key]=val
            elif instance_id and stage in SHOT_SCOPED_STAGES and key.startswith('continuity_plan:'):out[key]=val
        return out
    def _stage_input(self,stage,context,input_payload,instance_id=None,repair_error=None):
        vision_references = input_payload.get("_visionReferences", []) if isinstance(input_payload, dict) else []
        input_payload = {k: v for k, v in input_payload.items() if k != "_visionReferences"} if isinstance(input_payload, dict) else input_payload
        material={"stage":stage,"stageInstanceId":instance_id,"workflowVersion":context.workflow_version,"projectSnapshot":context.project_snapshot,"input":input_payload,"priorStageOutputs":self._relevant_stage_outputs(stage,context,instance_id)}
        if repair_error:material['contractRepairInstruction']='Previous payload failed canonical JSON Schema; correct payload only. '+repair_error
        text=json.dumps(material,ensure_ascii=False,separators=(',',':'),default=str)
        if len(text)>context.config.max_input_chars_per_stage:raise StageExecutionError("Agent stage input exceeds maxInputCharsPerStage")
        if not vision_references:
            return text
        content=[{"type":"input_text","text":text}]
        for reference in vision_references[:12]:
            if not isinstance(reference, dict):
                continue
            url=reference.get("url")
            if isinstance(url, str) and url.startswith(("https://", "http://")):
                content.append({"type":"input_image","image_url":url,"detail":"high"})
        return [{"role":"user","content":content}]
    def _extract_asset_refs(self,value):
        refs=set()
        if isinstance(value,dict):
            for k,v in value.items():
                kl=k.lower()
                if kl.endswith('assetid') and isinstance(v,str) and v:refs.add(v)
                elif kl.endswith('assetids') and isinstance(v,list):refs.update(x for x in v if isinstance(x,str) and x)
                refs.update(self._extract_asset_refs(v))
        elif isinstance(value,list):
            for x in value:refs.update(self._extract_asset_refs(x))
        return refs
    def _bind_controller_owned_fields(self,stage,input_payload,payload,instance_id=None):
        if stage not in SHOT_SCOPED_STAGES or not isinstance(input_payload,dict):return payload
        input_shot_id=input_payload.get('shotId')
        if instance_id is not None and input_shot_id not in (None,'') and str(input_shot_id)!=str(instance_id):
            raise StageContractError("Controller shotId conflicts with stage instance")
        expected=instance_id if instance_id is not None else input_shot_id
        bound=dict(payload)
        if expected not in (None,''):
            expected=str(expected);actual=payload.get('shotId')
            if actual not in (None,'') and str(actual)!=expected:
                raise StageContractError(f"Output shotId {actual!r} does not match controller shotId {expected!r}")
            bound['shotId']=expected
        if stage=='prompt_intent':
            # Dialogue originates from the persisted shot and is immutable input,
            # not model-authored output. Binding it here also prevents providers
            # from flattening canonical dialogue objects into bare strings.
            canonical_dialogue = input_payload.get('dialogue')
            if isinstance(canonical_dialogue, dict) and isinstance(canonical_dialogue.get('lines'), list):
                bound['dialogue'] = [d for d in canonical_dialogue['lines'] if isinstance(d, dict)]
            elif isinstance(canonical_dialogue, list):
                bound['dialogue'] = [d for d in canonical_dialogue if isinstance(d, dict)]
            else:
                bound['dialogue'] = []
            actions = bound.get('actions')
            if isinstance(actions, str) and actions.strip():
                bound['actions'] = [actions.strip()]
            elif isinstance(actions, list):
                clean_actions = [str(a).strip() for a in actions if str(a).strip()]
                bound['actions'] = clean_actions or ["Perform the approved storyboard action with physically plausible motion."]
            else:
                bound['actions'] = ["Perform the approved storyboard action with physically plausible motion."]
            if not isinstance(bound.get('scene'), str) or not bound['scene'].strip():
                bound['scene'] = str(input_payload.get('scene') or 'Scene in progress.').strip()
            else:
                bound['scene'] = bound['scene'].strip()
            if not isinstance(bound.get('camera'), str) or not bound['camera'].strip():
                bound['camera'] = str(input_payload.get('camera') or 'Preserve approved storyboard camera framing and motion.').strip()
            else:
                bound['camera'] = bound['camera'].strip()
            if not isinstance(bound.get('continuityLocks'), list):
                bound['continuityLocks'] = []
            else:
                bound['continuityLocks'] = [str(l).strip() for l in bound['continuityLocks'] if str(l).strip()]
            if not isinstance(bound.get('referenceBindings'), list):
                bound['referenceBindings'] = []
            else:
                bound['referenceBindings'] = [b for b in bound['referenceBindings'] if isinstance(b, dict)]
            audio_intent = bound.get('audioIntent')
            if not (isinstance(audio_intent, (dict, str)) or audio_intent is None):
                bound['audioIntent'] = None
            end_bridge = bound.get('endBridge')
            if not (isinstance(end_bridge, str) or end_bridge is None):
                bound['endBridge'] = None
            elif isinstance(end_bridge, str):
                bound['endBridge'] = end_bridge.strip() or None
            allowed_prompt_keys = {
                'shotId', 'scene', 'actions', 'camera', 'continuityLocks',
                'referenceBindings', 'dialogue', 'audioIntent', 'endBridge'
            }
            bound = {k: v for k, v in bound.items() if k in allowed_prompt_keys}
        elif stage=='observed_start_state' and input_payload.get('source') in {'start_frame','designed'}:
            # The controller knows whether this stage observes an approved
            # frame or designs a state. Do not let model prose change that
            # provenance classification.
            bound['source']=input_payload['source']
            raw_characters = bound.get('characters')
            if isinstance(raw_characters, list):
                clean_characters = []
                for idx, item in enumerate(raw_characters):
                    if not isinstance(item, dict):
                        continue
                    clean_hands = _normalize_hand_occupancy(item.get('handOccupancy'))
                    char_id = item.get('characterId')
                    if not isinstance(char_id, str) or not char_id.strip():
                        input_chars = input_payload.get('characterIds') or []
                        if idx < len(input_chars) and isinstance(input_chars[idx], str) and input_chars[idx].strip():
                            char_id = input_chars[idx].strip()
                        else:
                            char_id = f"character_{idx + 1}"
                    clean_characters.append({
                        'characterId': str(char_id).strip(),
                        'screenPosition': str(item.get('screenPosition') or 'center').strip(),
                        'pose': str(item.get('pose') or 'visible').strip(),
                        'gaze': str(item.get('gaze') or 'toward scene').strip(),
                        'handOccupancy': clean_hands,
                    })
                bound['characters'] = clean_characters
            else:
                bound['characters'] = []

            raw_objects = bound.get('objects')
            if isinstance(raw_objects, list):
                clean_objects = []
                for idx, item in enumerate(raw_objects):
                    if not isinstance(item, dict):
                        continue
                    entity_id = item.get('entityId') or item.get('id') or item.get('name') or f"object_{idx + 1}"
                    clean_objects.append({
                        'entityId': str(entity_id).strip(),
                        'state': str(item.get('state') or 'visible').strip(),
                        'position': str(item.get('position') or 'in scene').strip(),
                    })
                bound['objects'] = clean_objects
            else:
                bound['objects'] = []

            camera = bound.get('camera')
            if not isinstance(camera, dict):
                camera = {}
            framing = camera.get('framing')
            if not isinstance(framing, str) or not framing.strip():
                framing = str(input_payload.get('camera') or 'medium shot').strip()
            angle = camera.get('angle')
            if not isinstance(angle, str) or not angle.strip():
                angle = 'eye level'
            movement = camera.get('movementAtT0')
            if not isinstance(movement, str) or not movement.strip():
                movement = 'unknown from still image'
                uncertainties = bound.get('uncertainties')
                if isinstance(uncertainties, list) and not any(
                    isinstance(item, str) and 'movementAtT0' in item
                    for item in uncertainties
                ):
                    bound['uncertainties'] = [
                        *uncertainties,
                        'Camera movement at t=0 is not observable from a still image.',
                    ]
            bound['camera'] = {
                'framing': str(framing).strip(),
                'angle': str(angle).strip(),
                'movementAtT0': str(movement).strip(),
            }

            if not isinstance(bound.get('environment'), str) or not bound['environment'].strip():
                bound['environment'] = 'interior scene'
            else:
                bound['environment'] = bound['environment'].strip()

            if not isinstance(bound.get('lighting'), str) or not bound['lighting'].strip():
                bound['lighting'] = 'natural ambient lighting'
            else:
                bound['lighting'] = bound['lighting'].strip()

            if not isinstance(bound.get('uncertainties'), list):
                bound['uncertainties'] = []
            else:
                bound['uncertainties'] = [str(u).strip() for u in bound['uncertainties'] if str(u).strip()]

            allowed_keys = {'source', 'characters', 'objects', 'camera', 'environment', 'lighting', 'uncertainties'}
            bound = {k: v for k, v in bound.items() if k in allowed_keys}
        return bound
    async def _authorize_output_assets(self,context,envelope):
        refs=set(envelope.evidence_asset_ids)|self._extract_asset_refs(envelope.payload)
        if len(refs)>200:raise StageContractError("Too many asset references")
        for aid in refs:
            ev=await context.core.get_asset_evidence(context.tenant_id,context.project_id,aid)
            if not ev.authorized:raise UnauthorizedAssetError(f"Unauthorized asset {aid}")
    async def _ensure_loaded(self,context):
        await hydrate_checkpoint(context)
        if not context.project_snapshot:
            snap=await context.core.get_project_snapshot(context.tenant_id,context.project_id)
            sid=snap.get('projectId') or snap.get('project_id')
            if sid and str(sid)!=context.project_id:raise StageExecutionError("Project snapshot scope mismatch")
            context.project_snapshot=snap
    async def run_stage(self,stage,*,context,input_payload,instance_id=None):
        context.validate_scope();await self._ensure_loaded(context)
        if context.config.use_sessions and self.session is None:raise StageExecutionError("useSessions=true requires Session")
        key=f"{stage}:{instance_id}" if instance_id else stage;context.current_stage=key;agent=self.agent_factory.build(
            stage, model=context.config.model,
            allow_research_tool=context.config.allow_research_tool,
            allow_asset_evidence_tool=context.config.allow_asset_evidence_tool,
            allow_provider_profile_tool=context.config.allow_provider_profile_tool,
            allow_cost_estimate_tool=context.config.allow_cost_estimate_tool,
        )
        aggregate=StageUsage();last_error=None;max_attempts=1+context.config.max_contract_repair_attempts
        for attempt in range(1,max_attempts+1):
            run=await self.runner.run(agent=agent,input_text=self._stage_input(stage,context,input_payload,instance_id,last_error and str(last_error)),context=context,session=self.session if context.config.use_sessions else None,max_turns=context.config.max_turns_per_stage)
            aggregate=aggregate.plus(run.usage);context.agent_total_tokens_used+=run.usage.total_tokens
            if context.config.max_total_tokens_per_stage is not None and aggregate.total_tokens>context.config.max_total_tokens_per_stage:raise BudgetExceededError("AGENT_TOKEN_BUDGET_EXCEEDED")
            if context.config.max_total_tokens_per_run is not None and context.agent_total_tokens_used>context.config.max_total_tokens_per_run:raise BudgetExceededError("AGENT_TOKEN_BUDGET_EXCEEDED")
            env=run.output
            try:
                if env.stage!=stage:raise StageContractError("Stage envelope mismatch")
                if env.schema_id!=self.contracts.schema_id(stage):raise StageContractError("Schema ID mismatch")
                env=env.model_copy(update={'payload':self._bind_controller_owned_fields(stage,input_payload,env.payload,instance_id)})
                self.contracts.validate(stage,env.payload);await self._authorize_output_assets(context,env)
            except (StageContractError,UnauthorizedAssetError) as exc:
                last_error=exc;await context.core.record_agent_usage(context.tenant_id,context.project_id,context.run_id,key,{**run.usage.model_dump(mode='json'),'attempt':attempt,'status':'contract_repair','error':str(exc)[:2000]});continue
            await context.core.record_agent_usage(context.tenant_id,context.project_id,context.run_id,key,{**run.usage.model_dump(mode='json'),'attempt':attempt,'status':'accepted'})
            await context.core.persist_stage_output(context.tenant_id,context.project_id,context.run_id,key,env.payload,{"workflowVersion":context.workflow_version,"schemaId":env.schema_id,"attempt":attempt,"evidenceAssetIds":env.evidence_asset_ids,"usage":aggregate.model_dump(mode='json')})
            context.stage_outputs[key]=env.payload;await persist_checkpoint(context,session_id=self.session_id)
            return StageRunResult(stage,env.payload,aggregate,env.warnings,env.assumptions,env.needs_human_review,env.confidence,attempt)
        raise StageExecutionError(f"Stage {stage} failed after {max_attempts} attempts: {last_error}")
