from __future__ import annotations
import json
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
            canonical_dialogue=input_payload.get('dialogue')
            bound['dialogue']=canonical_dialogue if isinstance(canonical_dialogue,list) else []
        elif stage=='observed_start_state' and input_payload.get('source') in {'start_frame','designed'}:
            # The controller knows whether this stage observes an approved
            # frame or designs a state. Do not let model prose change that
            # provenance classification.
            bound['source']=input_payload['source']
            # A still image cannot establish camera motion. Complete this one
            # deterministic, unobservable field locally so a provider that
            # omits it cannot make the whole Enhanced flow fail contract
            # validation and spend its bounded repair attempt.
            camera=payload.get('camera')
            if isinstance(camera,dict):
                movement=camera.get('movementAtT0')
                if not isinstance(movement,str) or not movement.strip():
                    bound['camera']={**camera,'movementAtT0':'unknown from still image'}
                    uncertainties=bound.get('uncertainties')
                    if isinstance(uncertainties,list) and not any(
                        isinstance(item,str) and 'movementAtT0' in item
                        for item in uncertainties
                    ):
                        bound['uncertainties']=[
                            *uncertainties,
                            'Camera movement at t=0 is not observable from a still image.',
                        ]
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
