from .context import DirectorRunContext
from .sdk_compat import require_openai_agents_sdk

def build_read_only_tools(*, allow_research_tool: bool = True, allow_asset_evidence_tool: bool = True,
                          allow_provider_profile_tool: bool = True, allow_cost_estimate_tool: bool = True):
    sdk=require_openai_agents_sdk(); function_tool=sdk.function_tool; tools=[]
    RunContextWrapper=sdk.RunContextWrapper
    @function_tool
    async def get_asset_evidence(ctx:RunContextWrapper[DirectorRunContext], asset_id:str)->dict:
        ev=await ctx.context.core.get_asset_evidence(ctx.context.tenant_id,ctx.context.project_id,asset_id); return ev.model_dump(mode='json')
    if allow_asset_evidence_tool: tools.append(get_asset_evidence)
    @function_tool
    async def get_provider_capability_profile(ctx:RunContextWrapper[DirectorRunContext], profile_id:str)->dict:
        return await ctx.context.core.get_provider_profile(profile_id)
    if allow_provider_profile_tool: tools.append(get_provider_capability_profile)
    @function_tool
    async def search_verified_research(ctx:RunContextWrapper[DirectorRunContext], query:str, max_results:int=5)->list[dict]:
        query=query.strip(); max_results=max(1,min(int(max_results),10))
        if not query or len(query)>2000: raise ValueError("research query invalid")
        return await ctx.context.core.search_verified_research(ctx.context.tenant_id,ctx.context.project_id,query,max_results=max_results)
    if allow_research_tool: tools.append(search_verified_research)
    @function_tool(strict_mode=False)
    async def estimate_generation_cost(ctx:RunContextWrapper[DirectorRunContext], provider_plan:dict)->dict:
        cost=await ctx.context.core.estimate_generation_cost(ctx.context.tenant_id,ctx.context.project_id,provider_plan); return cost.model_dump(mode='json')
    if allow_cost_estimate_tool: tools.append(estimate_generation_cost)
    return tools
