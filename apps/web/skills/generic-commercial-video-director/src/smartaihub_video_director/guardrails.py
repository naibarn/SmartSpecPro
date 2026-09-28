from __future__ import annotations
import re
from typing import Any
from .models import StageOutputEnvelope
from .sdk_compat import require_openai_agents_sdk
FORBIDDEN={"deductcredits","submitgeneration","publishnow","deleteasset","apikey","providerapikey","authorization","idempotencykey","submitproviderjob"}
def _norm(s:str)->str:return re.sub(r"[^a-z0-9]","",s.lower())
def contains_forbidden_side_effect_field(value:Any)->bool:
    if isinstance(value,dict):
        return any(_norm(str(k)) in FORBIDDEN or contains_forbidden_side_effect_field(v) for k,v in value.items())
    if isinstance(value,list): return any(contains_forbidden_side_effect_field(x) for x in value)
    return False
def build_agent_guardrails():
    sdk=require_openai_agents_sdk(); GuardrailFunctionOutput=sdk.GuardrailFunctionOutput
    from agents.decorators import input_guardrail, output_guardrail
    @input_guardrail(name="smartaihub_scope_guardrail", run_in_parallel=False)
    async def scope_guardrail(ctx,agent,input):
        try:ctx.context.validate_scope()
        except Exception as exc:return GuardrailFunctionOutput(output_info={"reason":str(exc)},tripwire_triggered=True)
        text=input if isinstance(input,str) else str(input)
        return GuardrailFunctionOutput(output_info={"input_chars":len(text)},tripwire_triggered=len(text)>ctx.context.config.max_input_chars_per_stage)
    @output_guardrail(name="no_agent_side_effect_guardrail")
    async def side_effect_guardrail(ctx,agent,output):
        data=output.model_dump(mode='json') if hasattr(output,'model_dump') else output
        forbidden=contains_forbidden_side_effect_field(data)
        return GuardrailFunctionOutput(output_info={"forbidden":forbidden},tripwire_triggered=forbidden)
    return [scope_guardrail],[side_effect_guardrail]
