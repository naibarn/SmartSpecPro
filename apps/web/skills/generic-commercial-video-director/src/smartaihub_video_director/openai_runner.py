from __future__ import annotations
from dataclasses import dataclass
from typing import Any
import hashlib,re
from .context import DirectorRunContext
from .models import StageOutputEnvelope,StageUsage
from .sdk_compat import require_openai_agents_sdk
@dataclass(slots=True)
class AgentRunOutcome:
    output:StageOutputEnvelope; usage:StageUsage; last_agent_name:str|None=None; raw_result:Any=None
class OpenAIAgentsRunner:
    async def run(self, *, agent:Any,input_text:Any,context:DirectorRunContext,session:Any|None=None,max_turns:int=6)->AgentRunOutcome:
        sdk=require_openai_agents_sdk(); Runner=sdk.Runner; RunConfig=sdk.RunConfig
        if context.config.require_explicit_model and not context.config.model: raise RuntimeError("AGENT_MODEL_NOT_CONFIGURED")
        opaque=lambda v,n=20:hashlib.sha256(v.encode()).hexdigest()[:n]
        trace_id=context.trace_id if context.trace_id and re.fullmatch(r"trace_[A-Za-z0-9]{32}",context.trace_id) else None
        kwargs={"model":context.config.model,"workflow_name":context.config.workflow_name,"trace_id":trace_id,
          "group_id":f"saihub_{opaque(context.group_id,24)}" if context.group_id else None,
          "trace_metadata":{"tenant":opaque(context.tenant_id),"project":opaque(context.project_id),"run":opaque(context.run_id),"stage":context.current_stage,"workflow_version":context.workflow_version},
          "tracing_disabled":not context.config.tracing_enabled,"trace_include_sensitive_data":context.config.trace_include_sensitive_data}
        if session is not None and hasattr(sdk,"SessionSettings"): kwargs["session_settings"]=sdk.SessionSettings(limit=context.config.session_history_limit)
        result=await Runner.run(starting_agent=agent,input=input_text,context=context,session=session,max_turns=max_turns,run_config=RunConfig(**kwargs))
        interruptions=list(getattr(result,"interruptions",[]) or [])
        if interruptions: raise RuntimeError("Unexpected approval interruption in read-only Agent stage")
        output=result.final_output
        if not isinstance(output,StageOutputEnvelope): output=StageOutputEnvelope.model_validate(output.model_dump() if hasattr(output,'model_dump') else output)
        u=getattr(getattr(result,"context_wrapper",None),"usage",None)
        usage=StageUsage(requests=int(getattr(u,"requests",0) or 0),input_tokens=int(getattr(u,"input_tokens",0) or 0),output_tokens=int(getattr(u,"output_tokens",0) or 0),total_tokens=int(getattr(u,"total_tokens",0) or 0))
        return AgentRunOutcome(output=output,usage=usage,last_agent_name=getattr(getattr(result,"last_agent",None),"name",None),raw_result=result)
