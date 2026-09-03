from __future__ import annotations
from pathlib import Path
import asyncio, sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
from smartaihub_video_director.config import AgentRuntimeConfig
from smartaihub_video_director.context import DirectorRunContext
from smartaihub_video_director.models import AssetEvidence,CostEstimate,GenerationAuthorization,StageOutputEnvelope,StageUsage
from smartaihub_video_director.schema_registry import StageContractRegistry
from smartaihub_video_director.session import CoreBackedSession
from smartaihub_video_director.execution import canonical_provider_plan_hash,prepare_paid_generation
from smartaihub_video_director.orchestrator import DirectorOrchestrator
from smartaihub_video_director.agent_factory import AgentFactory as SDKAgentFactory
from smartaihub_video_director.errors import UnauthorizedAssetError
from smartaihub_video_director.sdk_compat import supported_sdk_range
import smartaihub_video_director.enhanced_bridge as enhanced_bridge
from smartaihub_video_director.enhanced_bridge import ReadOnlyCore, _intent_policy_conflicts, _package_input, _terminal_prompt
from smartaihub_video_director.tools import build_read_only_tools

class Core:
    def __init__(self):self.outputs={};self.usage=[];self.checkpoint=None;self.approvals={'storyboard':'approved','highCostGeneration':'approved','publish':'approved'}
    async def get_project_snapshot(self,t,p):return {'projectId':p,'budget':{'maxRepairIterationsPerShot':2}}
    async def get_asset_evidence(self,t,p,a):return AssetEvidence(asset_id=a,authorized=not a.startswith('forbidden'))
    async def get_provider_profile(self,p):return {'id':p}
    async def search_verified_research(self,t,p,q,max_results=5):return []
    async def estimate_generation_cost(self,t,p,plan):return CostEstimate(provider_profile_id=plan.get('providerProfileId','x'),estimated_credits=3)
    async def authorize_generation_submission(self,t,p,r,plan,h,c):return GenerationAuthorization(approved=True,approval_id='a',credit_reservation_id='c',idempotency_key='i')
    async def get_approval_status(self,t,p,r,g):return self.approvals.get(g,'pending')
    async def persist_stage_output(self,t,p,r,s,payload,metadata):self.outputs[s]=(payload,metadata)
    async def record_agent_usage(self,t,p,r,s,usage):self.usage.append((s,usage))
    async def get_run_checkpoint(self,t,p,r):return self.checkpoint
    async def persist_run_checkpoint(self,t,p,r,checkpoint):self.checkpoint=checkpoint
class Store:
    def __init__(self):self.d={}
    async def get_items(self,k,limit=None):return self.d.get(k,[])[-limit:] if limit else self.d.get(k,[])
    async def add_items(self,k,items):self.d.setdefault(k,[]).extend(items)
    async def pop_item(self,k):return self.d.get(k,[]).pop() if self.d.get(k) else None
    async def clear(self,k):self.d.pop(k,None)
class AgentFactory:
    def build(self,stage,model=None,**kwargs):return {'stage':stage,'model':model,'tools':kwargs}
class Outcome:
    def __init__(self,output,usage):self.output=output;self.usage=usage;self.last_agent_name='fake'
class Runner:
    def __init__(self,outputs):self.outputs=list(outputs);self.inputs=[]
    async def run(self,**kw):self.inputs.append(kw['input_text']);return Outcome(self.outputs.pop(0),StageUsage(requests=1,input_tokens=10,output_tokens=5,total_tokens=15))

def test_registry():
    r=StageContractRegistry(ROOT); assert 'promotion_target' in r.stages(); assert 'storyboard' in r.stages()
    payload={'targetKind':'narrative_no_promotion','promotionIntent':'none','resolutionSource':['idea_text'],'confidence':1,'sourceOfTruthAssetIds':[],'supportingAssetIds':[],'visualIdentityStatus':'not_applicable','exactVisualIdentityRequired':False,'facts':[],'missingEvidence':[],'branch':'narrative_only','continuationPolicy':'not_applicable','warnings':[]}
    r.validate('promotion_target',payload)
    r.validate_input(_package_input({'shot': {'description': 'A woman turns toward the window.'}, 'dialogue': [], 'targetVideoModel': {'id': 'veo-3'}}))
    invalid={'idea':'x','unexpectedField':True}
    failed=False
    try: r.validate_input(invalid)
    except Exception: failed=True
    assert failed
def test_config():
    c=AgentRuntimeConfig.from_skill_input({'agentRuntime':{'model':'gpt-test','maxTurnsPerStage':4}});assert c.model=='gpt-test' and c.max_turns_per_stage==4 and c.expose_generation_submission_as_agent_tool is False
def test_tool_allow_list():
    tools=build_read_only_tools(allow_research_tool=False,allow_cost_estimate_tool=False)
    assert [tool.name for tool in tools]==['get_asset_evidence','get_provider_capability_profile']
    assert _package_input({'researchMode':'bounded','targetVideoModel':{'id':'veo-3'}})['researchMode']=='on'
def test_agent_tool_context_is_not_exposed_in_function_schema():
    tool=build_read_only_tools(allow_research_tool=False,allow_cost_estimate_tool=False)[0]
    assert tool.params_json_schema['required']==['asset_id']
    assert list(tool.params_json_schema['properties'])==['asset_id']
def test_agent_factory_uses_sdk_compatible_envelope_schema():
    agent=SDKAgentFactory(StageContractRegistry(ROOT)).build('prompt_intent',model='openai/gpt-5.6-luna')
    assert agent.output_type.is_strict_json_schema() is False
    assert agent.output_type.json_schema()['properties']['payload']['additionalProperties'] is True
    for field in StageContractRegistry(ROOT).required_fields('prompt_intent'):
        assert f'"{field}"' in agent.instructions
    assert 'authoritative State #0' in agent.instructions
    assert 'silent acting beat' in agent.instructions
    observer=SDKAgentFactory(StageContractRegistry(ROOT)).build('observed_start_state',model='openai/gpt-5.6-luna')
    assert 'START_FRAME_IMAGE' in observer.instructions
    assert 'Do not infer storyboard actions' in observer.instructions
def test_bridge_preserves_canonical_dialogue_and_terminal_audio():
    payload={'dialogue':[],'shot':{'description':'A door opens'},'targetVideoModel':{'id':'veo-3'}}
    prompt=_terminal_prompt(payload,{'scene':'A door opens','actions':['Open it'],'camera':'wide','dialogue':[{'text':'invented'}],'audioIntent':'quiet room tone','endBridge':'hold on the open doorway'})
    assert 'DIALOGUE:' not in prompt
    assert 'DIALOGUE POLICY: No spoken dialogue.' in prompt
    assert 'AUDIO DIRECTION: quiet room tone' in prompt
    assert 'END STATE: hold on the open doorway' in prompt
    core=ReadOnlyCore({'mediaBundle':{'startFrame':{'assetId':7},'references':[]},'targetVideoModel':{'providerProfileId':'profile-1'}})
    assert core.authorized_asset_ids=={'7'}

def test_bridge_uses_reference_semantics_for_unified_image_transport():
    payload={
        'shot': {'description': 'A boy opens a keepsake box'},
        'targetVideoModel': {'id': 'grok-imagine-video-1-5-preview', 'capabilitySnapshot': {
            'modes': [{'nativeFieldMap': {'startFrame': 'image_urls'}}]
        }}
    }
    prompt=_terminal_prompt(payload, {'scene':'A boy opens a keepsake box'})
    assert prompt.startswith('REFERENCE FRAME SET:')
    assert 'hard literal frame-0 guarantee' in prompt

def test_bridge_builds_stage_input_before_reading_agent_result():
    captured={'calls':[]}
    class Usage:
        input_tokens=7; output_tokens=3
    class Outcome:
        warnings=[]; assumptions=[]; usage=Usage()
        def __init__(self,payload): self.payload=payload
    class FakeOrchestrator:
        def __init__(self, **kwargs): pass
        async def run_stage(self, stage, *args, **kwargs):
            captured['tracing_enabled']=kwargs['context'].config.tracing_enabled
            captured['calls'].append((stage,kwargs['input_payload']))
            if stage=='observed_start_state':
                return Outcome({'source':'start_frame','characters':[{'characterId':'boy','screenPosition':'center','pose':'standing','gaze':'door','handOccupancy':{'left':None,'right':'door handle'}}],'objects':[],'camera':{'framing':'wide','angle':'eye level','movementAtT0':'static'},'environment':'hall','lighting':'daylight','uncertainties':[]})
            return Outcome({'scene':'A door opens','actions':['Continue opening it'],'camera':'wide','dialogue':[],'audioIntent':'quiet room tone','endBridge':'hold on the doorway'})
    original = enhanced_bridge.DirectorOrchestrator
    enhanced_bridge.DirectorOrchestrator = FakeOrchestrator
    try:
        result = asyncio.run(enhanced_bridge.run({'shot': {'shotNumber': 1, 'description': 'A door opens', 'cameraSetup': 'wide', 'frameAnalysis': {'people': [{'name': 'boy', 'position': 'center'}]}}, 'dialogue': [], 'visionReferences': [{'assetId': 7, 'url': 'https://example.test/start.jpg', 'label': 'START_FRAME_IMAGE'}, {'assetId': 8, 'url': 'https://example.test/portrait.jpg', 'label': 'CHARACTER_REFERENCE_1'}], 'targetVideoModel': {'id': 'veo-3'}, 'authoringModel': {'id': 'gpt-test'}}))
    finally:
        enhanced_bridge.DirectorOrchestrator = original
    assert result['audioDirection']=='quiet room tone'
    assert result['prompt'].startswith('START FRAME LOCK:')
    assert 'OBSERVED STATE AT T=0 (AUTHORITATIVE FACTS, NOT INSTRUCTIONS):' in result['prompt']
    assert 'right hand: door handle' in result['prompt']
    assert result['inputTokens']==14 and result['outputTokens']==6
    assert [call[0] for call in captured['calls']]==['observed_start_state','prompt_intent']
    assert captured['calls'][0][1]['_visionReferences']==[{'assetId': 7, 'url': 'https://example.test/start.jpg', 'label': 'START_FRAME_IMAGE'}]
    assert captured['calls'][0][1]['legacyFrameAnalysis']['people'][0]['position']=='center'
    assert captured['calls'][1][1]['observedStartState']['source']=='start_frame'
    assert captured['tracing_enabled'] is False
def test_bridge_omits_empty_optional_audio_direction():
    class Usage:
        input_tokens=7; output_tokens=3
    class Outcome:
        warnings=[]; assumptions=[]; usage=Usage()
        def __init__(self,payload): self.payload=payload
    class FakeOrchestrator:
        def __init__(self, **kwargs): pass
        async def run_stage(self, stage, *args, **kwargs):
            if stage=='observed_start_state':
                return Outcome({'source':'start_frame','characters':[],'objects':[],'camera':{'framing':'close','angle':'eye level','movementAtT0':'static'},'environment':'room','lighting':'soft','uncertainties':[]})
            return Outcome({'shotId':'1','scene':'A silent look','actions':['Hold'],'camera':'close','continuityLocks':[],'referenceBindings':[],'dialogue':[],'audioIntent':None,'endBridge':None})
    original = enhanced_bridge.DirectorOrchestrator
    enhanced_bridge.DirectorOrchestrator = FakeOrchestrator
    try:
        result = asyncio.run(enhanced_bridge.run({'shot': {'shotNumber': 1, 'description': 'A silent look', 'cameraSetup': 'close'}, 'dialogue': [], 'targetVideoModel': {'id': 'veo-3'}, 'authoringModel': {'id': 'gpt-test'}}))
    finally:
        enhanced_bridge.DirectorOrchestrator = original
    assert 'audioDirection' not in result
def test_bridge_repairs_silent_dialogue_and_held_object_reset_once():
    observed={'source':'start_frame','characters':[],'objects':[{'entityId':'rainbow spinning tower','state':'held','position':'in Phum right hand'}],'camera':{'framing':'medium','angle':'child eye level','movementAtT0':'static'},'environment':'living room','lighting':'morning','uncertainties':[]}
    bad={'shotId':'2','scene':'Uncle Chan asks Pimchanok to wait','actions':['Uncle Chan reaches to the shelf and picks up the rainbow spinning tower'],'camera':'medium','continuityLocks':[],'referenceBindings':[],'dialogue':[],'audioIntent':None,'endBridge':None}
    good={'shotId':'2','scene':'A quiet supportive exchange','actions':['Uncle Chan gestures toward the toy already held by Phum while Pimchanok stays crouched'],'camera':'medium','continuityLocks':['Keep the tower in Phum hand'],'referenceBindings':[],'dialogue':[],'audioIntent':'quiet room tone','endBridge':None}
    assert len(_intent_policy_conflicts({'dialogue':[]},bad,observed))==2
    assert _intent_policy_conflicts({'dialogue':[]},{**good,'scene':'No one speaks during the quiet exchange'},observed)==[]
    calls=[]
    class Outcome:
        warnings=[]; assumptions=[]; usage=StageUsage(requests=1,input_tokens=7,output_tokens=3,total_tokens=10)
        def __init__(self,payload): self.payload=payload
    class FakeOrchestrator:
        def __init__(self, **kwargs): pass
        async def run_stage(self,stage,*args,**kwargs):
            calls.append((stage,kwargs['input_payload']))
            if stage=='observed_start_state': return Outcome(observed)
            return Outcome(bad if len([call for call in calls if call[0]=='prompt_intent'])==1 else good)
    original=enhanced_bridge.DirectorOrchestrator
    enhanced_bridge.DirectorOrchestrator=FakeOrchestrator
    try:
        result=asyncio.run(enhanced_bridge.run({'shot':{'shotNumber':2,'description':'Support Phum','cameraSetup':'medium'},'dialogue':[],'visionReferences':[{'assetId':7,'url':'https://example.test/start.jpg','label':'START_FRAME_IMAGE'}],'targetVideoModel':{'id':'veo-3'},'authoringModel':{'id':'gpt-test'}}))
    finally:
        enhanced_bridge.DirectorOrchestrator=original
    assert [call[0] for call in calls]==['observed_start_state','prompt_intent','prompt_intent']
    assert calls[2][1]['policyRepairFindings']
    assert result['inputTokens']==21 and result['outputTokens']==9
    assert 'asks Pimchanok' not in result['prompt']
    assert 'picks up the rainbow' not in result['prompt']
def test_session_key():
    s=CoreBackedSession('raw-session',Store());assert 'raw-session' not in s._key(None) and s._key(None).startswith('saihub-agent-session:')
def test_hash():
    a=canonical_provider_plan_hash({'b':2,'a':1});b=canonical_provider_plan_hash({'a':1,'b':2});assert a==b and len(a)==64
async def async_tests():
    core=Core();ctx=DirectorRunContext('t','p','r','actor','11.0.0',core,AgentRuntimeConfig(model='gpt-test'))
    schema=StageContractRegistry(ROOT);sid=schema.schema_id('promotion_target')
    payload={'targetKind':'narrative_no_promotion','promotionIntent':'none','resolutionSource':['idea_text'],'confidence':1,'sourceOfTruthAssetIds':[],'supportingAssetIds':[],'visualIdentityStatus':'not_applicable','exactVisualIdentityRequired':False,'facts':[],'missingEvidence':[],'branch':'narrative_only','continuationPolicy':'not_applicable','warnings':[]}
    env=StageOutputEnvelope(stage='promotion_target',schemaId=sid,payload=payload)
    runner=Runner([env]);orch=DirectorOrchestrator(package_root=str(ROOT),runner=runner,agent_factory=AgentFactory())
    result=await orch.run_stage('promotion_target',context=ctx,input_payload={'idea':'x'});assert result.payload['branch']=='narrative_only';assert core.checkpoint and core.outputs
    # Cross-shot continuity is visible to later shot-scoped stages.
    ctx.stage_outputs['continuity_plan:S01']={'shotId':'S01','locks':[],'endState':{},'carryForward':{}}
    assert 'continuity_plan:S01' in orch._relevant_stage_outputs('shot_plan',ctx,'S02')
    # Provider plan hash/authorization preflight is controller-owned.
    pre=await prepare_paid_generation(ctx,provider_plan={'providerProfileId':'wan3.0-video','duration':10},adapter_id='wan3');assert pre.ready_to_submit and len(pre.provider_plan_sha256)==64
    # Unauthorized asset references fail output acceptance.
    bad_payload=dict(payload);bad_payload['supportingAssetIds']=['forbidden-asset']
    bad=StageOutputEnvelope(stage='promotion_target',schemaId=sid,payload=bad_payload,evidenceAssetIds=['forbidden-asset'])
    bad_runner=Runner([bad]);bad_orch=DirectorOrchestrator(package_root=str(ROOT),runner=bad_runner,agent_factory=AgentFactory())
    badctx=DirectorRunContext('t','p','r2','actor','11.0.0',core,AgentRuntimeConfig(model='gpt-test',max_contract_repair_attempts=0))
    failed=False
    try:await bad_orch.run_stage('promotion_target',context=badctx,input_payload={'idea':'x'})
    except Exception:failed=True
    assert failed
    # Shot identity is controller-owned. A valid payload that omits only the
    # deterministic shotId is repaired locally without paying for another turn.
    prompt_sid=schema.schema_id('prompt_intent')
    prompt_payload={'scene':'A door opens','actions':['Open it'],'camera':'wide','continuityLocks':[],'referenceBindings':[],'dialogue':['model-flattened dialogue']}
    prompt_env=StageOutputEnvelope(stage='prompt_intent',schemaId=prompt_sid,payload=prompt_payload)
    prompt_runner=Runner([prompt_env]);prompt_orch=DirectorOrchestrator(package_root=str(ROOT),runner=prompt_runner,agent_factory=AgentFactory())
    prompt_ctx=DirectorRunContext('t','p','r3','actor','11.0.0',Core(),AgentRuntimeConfig(model='gpt-test',max_contract_repair_attempts=0))
    canonical_dialogue=[{'lineId':'line-1','speakerId':'mother','text':'We must go now.'}]
    prompt_result=await prompt_orch.run_stage('prompt_intent',context=prompt_ctx,input_payload={'shotId':'S01','scene':'A door opens','dialogue':canonical_dialogue})
    assert prompt_result.payload['shotId']=='S01' and prompt_result.payload['dialogue']==canonical_dialogue and prompt_result.attempts==1
    # Observed-state provenance is controller-owned while the canonical
    # observed-state schema deliberately has no shotId field.
    observed_sid=schema.schema_id('observed_start_state')
    observed_payload={'source':'designed','characters':[],'objects':[],'camera':{'framing':'wide','angle':'eye level'},'environment':'room','lighting':'daylight','uncertainties':[]}
    observed_env=StageOutputEnvelope(stage='observed_start_state',schemaId=observed_sid,payload=observed_payload)
    observed_runner=Runner([observed_env]);observed_orch=DirectorOrchestrator(package_root=str(ROOT),runner=observed_runner,agent_factory=AgentFactory())
    observed_ctx=DirectorRunContext('t','p','r-observed','actor','11.0.0',Core(),AgentRuntimeConfig(model='gpt-test',max_contract_repair_attempts=0))
    observed_result=await observed_orch.run_stage('observed_start_state',context=observed_ctx,input_payload={'source':'start_frame'})
    assert observed_result.payload['source']=='start_frame' and 'shotId' not in observed_result.payload
    assert observed_result.payload['camera']['movementAtT0']=='unknown from still image'
    assert any('Camera movement at t=0' in item for item in observed_result.payload['uncertainties'])
    # A model must not be allowed to rebind output to a different shot.
    conflicting=StageOutputEnvelope(stage='prompt_intent',schemaId=prompt_sid,payload={**prompt_payload,'shotId':'S99'})
    conflict_runner=Runner([conflicting]);conflict_orch=DirectorOrchestrator(package_root=str(ROOT),runner=conflict_runner,agent_factory=AgentFactory())
    conflict_ctx=DirectorRunContext('t','p','r4','actor','11.0.0',Core(),AgentRuntimeConfig(model='gpt-test',max_contract_repair_attempts=0))
    conflict_failed=False
    try:await conflict_orch.run_stage('prompt_intent',context=conflict_ctx,input_payload={'shotId':'S01','scene':'A door opens'})
    except Exception as exc:conflict_failed='shotId' in str(exc)
    assert conflict_failed

def main():
    test_registry();test_config();test_tool_allow_list();test_agent_tool_context_is_not_exposed_in_function_schema();test_agent_factory_uses_sdk_compatible_envelope_schema();test_bridge_preserves_canonical_dialogue_and_terminal_audio();test_bridge_uses_reference_semantics_for_unified_image_transport();test_bridge_builds_stage_input_before_reading_agent_result();test_bridge_omits_empty_optional_audio_direction();test_bridge_repairs_silent_dialogue_and_held_object_reset_once();test_session_key();test_hash();asyncio.run(async_tests());assert supported_sdk_range()=='>=0.22.0,<0.23';print('PASS: 20 v11 Agent runtime regression checks')
if __name__=='__main__':main()
