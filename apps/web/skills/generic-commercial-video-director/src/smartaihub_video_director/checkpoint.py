from __future__ import annotations
from .context import DirectorRunContext
from .errors import StageExecutionError
from .models import RunCheckpoint

def build_checkpoint(context:DirectorRunContext, *, session_id:str|None=None)->RunCheckpoint:
    return RunCheckpoint(project_id=context.project_id,run_id=context.run_id,workflow_version=context.workflow_version,current_stage=context.current_stage or "initialized",stage_outputs=context.stage_outputs,repair_count_by_shot=context.repair_count_by_shot,budget_state={"agentTotalTokensUsed":context.agent_total_tokens_used},trace_id=context.trace_id,session_id=session_id)
async def hydrate_checkpoint(context:DirectorRunContext)->None:
    if context.checkpoint_hydrated:return
    raw=await context.core.get_run_checkpoint(context.tenant_id,context.project_id,context.run_id)
    if raw:
        cp=RunCheckpoint.model_validate(raw)
        if cp.project_id!=context.project_id or cp.run_id!=context.run_id: raise StageExecutionError("Checkpoint scope mismatch")
        if cp.workflow_version!=context.workflow_version: raise StageExecutionError("CHECKPOINT_VERSION_MISMATCH")
        context.current_stage=cp.current_stage; context.stage_outputs=dict(cp.stage_outputs); context.repair_count_by_shot=dict(cp.repair_count_by_shot); context.agent_total_tokens_used=int(cp.budget_state.get("agentTotalTokensUsed",0) or 0); context.trace_id=context.trace_id or cp.trace_id
    context.checkpoint_hydrated=True
async def persist_checkpoint(context:DirectorRunContext, *, session_id:str|None=None)->None:
    cp=build_checkpoint(context,session_id=session_id)
    await context.core.persist_run_checkpoint(context.tenant_id,context.project_id,context.run_id,cp.model_dump(mode='json'))
