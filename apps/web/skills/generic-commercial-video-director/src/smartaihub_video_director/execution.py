from __future__ import annotations
import hashlib,json
from .context import DirectorRunContext
from .models import ExecutionPreflightResult

def canonical_provider_plan_hash(plan:dict)->str:
    blob=json.dumps(plan,ensure_ascii=False,sort_keys=True,separators=(",",":"),default=str).encode('utf-8')
    return hashlib.sha256(blob).hexdigest()
async def prepare_paid_generation(context:DirectorRunContext, *, provider_plan:dict, adapter_id:str)->ExecutionPreflightResult:
    plan_hash=canonical_provider_plan_hash(provider_plan)
    cost=await context.core.estimate_generation_cost(context.tenant_id,context.project_id,provider_plan)
    auth=await context.core.authorize_generation_submission(context.tenant_id,context.project_id,context.run_id,provider_plan,plan_hash,cost)
    return ExecutionPreflightResult(provider_profile_id=str(provider_plan.get('providerProfileId') or provider_plan.get('provider_profile_id') or ''),adapter_id=adapter_id,provider_plan_sha256=plan_hash,cost_estimate=cost,authorization=auth,ready_to_submit=bool(auth.approved and auth.idempotency_key and auth.credit_reservation_id))
