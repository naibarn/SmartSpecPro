from pathlib import Path
import json, runpy
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT=Path(__file__).resolve().parents[1]
def load(rel): return json.loads((ROOT/rel).read_text(encoding='utf-8'))

stage_paths=list((ROOT/'schemas/stages').glob('*.json'))
provider_schema_paths=list((ROOT/'schemas/providers').glob('**/*.json'))
schema_paths=[ROOT/'schemas/input.schema.json',ROOT/'schemas/output.schema.json',ROOT/'schemas/model-capability.schema.json']+stage_paths+provider_schema_paths
for p in schema_paths:
    Draft202012Validator.check_schema(json.loads(p.read_text(encoding='utf-8')))

registry=Registry()
for p in stage_paths+provider_schema_paths:
    s=json.loads(p.read_text(encoding='utf-8'))
    registry=registry.with_resource(s['$id'],Resource.from_contents(s))

# Input fixtures
iv=Draft202012Validator(load('schemas/input.schema.json'))
input_count=0
for p in (ROOT/'tests/fixtures').glob('*.json'):
    if p.name=='sample-output.json': continue
    errs=list(iv.iter_errors(json.loads(p.read_text(encoding='utf-8'))))
    if errs: raise SystemExit(f'Input fixture {p.name} invalid: {errs[0].message}')
    input_count+=1

# Provider profiles
cv=Draft202012Validator(load('schemas/model-capability.schema.json'))
profile_count=0
for p in (ROOT/'config/providers').glob('*.json'):
    prof=json.loads(p.read_text(encoding='utf-8'))
    errs=list(cv.iter_errors(prof))
    if errs: raise SystemExit(f'Capability profile {p.name} invalid: {errs[0].message}')
    profile_count+=1
    ext=prof['temporalPlanning']['extension']
    if ext.get('deterministicDurationRequest'):
        if ext.get('durationControl') not in ('exact','bounded'):
            raise SystemExit(f'{p.name}: deterministicDurationRequest requires exact/bounded durationControl')
        if not ext.get('allowedAdditionalSeconds') and (ext.get('minAdditionalSeconds') is None or ext.get('maxAdditionalSeconds') is None):
            raise SystemExit(f'{p.name}: deterministic extension missing numerical bounds')

# Existing stage fixtures
pmv=Draft202012Validator(load('schemas/stages/product-mechanism.schema.json'),registry=registry)
vzv=Draft202012Validator(load('schemas/stages/visualization-plan.schema.json'),registry=registry)
stage_count=0
for p in (ROOT/'tests/stage-fixtures').glob('*.json'):
    v=vzv if 'visualization' in p.name else pmv
    errs=list(v.iter_errors(json.loads(p.read_text(encoding='utf-8'))))
    if errs: raise SystemExit(f'Stage fixture {p.name} invalid: {errs[0].message}')
    stage_count+=1


# Promotion-target / place stage fixtures
ptv=Draft202012Validator(load('schemas/stages/promotion-target.schema.json'),registry=registry)
plv=Draft202012Validator(load('schemas/stages/place-experience.schema.json'),registry=registry)
promotion_count=0
for p in (ROOT/'tests/promotion-stage-fixtures').glob('*.json'):
    if p.name.startswith('place-experience'):
        v=plv
    else:
        v=ptv
    errs=list(v.iter_errors(json.loads(p.read_text(encoding='utf-8'))))
    if errs: raise SystemExit(f'Promotion fixture {p.name} invalid: {errs[0].message}')
    promotion_count+=1

# H3 provider-specific fixtures
validators={
    'reference-plan.json':Draft202012Validator(load('schemas/providers/minimax-h3/reference-plan.schema.json'),registry=registry),
    'prompt.json':Draft202012Validator(load('schemas/providers/minimax-h3/prompt.schema.json'),registry=registry),
    'execution-plan.json':Draft202012Validator(load('schemas/providers/minimax-h3/execution-plan.schema.json'),registry=registry),
    'continuation-chain.json':Draft202012Validator(load('schemas/providers/minimax-h3/continuation-chain.schema.json'),registry=registry),
}
h3_count=0
for p in (ROOT/'tests/h3-stage-fixtures').glob('*.json'):
    errs=list(validators[p.name].iter_errors(json.loads(p.read_text(encoding='utf-8'))))
    if errs: raise SystemExit(f'H3 fixture {p.name} invalid: {errs[0].message}')
    h3_count+=1


# Grok Imagine Video 1.5 provider-specific fixtures
grok_validators={
    'reference-plan.json':Draft202012Validator(load('schemas/providers/grok-imagine-video-1.5/reference-plan.schema.json'),registry=registry),
    'prompt.json':Draft202012Validator(load('schemas/providers/grok-imagine-video-1.5/prompt.schema.json'),registry=registry),
    'execution-plan.json':Draft202012Validator(load('schemas/providers/grok-imagine-video-1.5/execution-plan.schema.json'),registry=registry),
}
grok_count=0
for p in (ROOT/'tests/grok-stage-fixtures').glob('*.json'):
    errs=list(grok_validators[p.name].iter_errors(json.loads(p.read_text(encoding='utf-8'))))
    if errs: raise SystemExit(f'Grok fixture {p.name} invalid: {errs[0].message}')
    grok_count+=1


# Wan 3.0 provider-specific fixtures
wan_validators={
    'reference-plan.json':Draft202012Validator(load('schemas/providers/wan3.0/reference-plan.schema.json'),registry=registry),
    'prompt.json':Draft202012Validator(load('schemas/providers/wan3.0/prompt.schema.json'),registry=registry),
    'execution-plan.json':Draft202012Validator(load('schemas/providers/wan3.0/execution-plan.schema.json'),registry=registry),
}
wan_count=0
for p in (ROOT/'tests/wan-stage-fixtures').glob('*.json'):
    errs=list(wan_validators[p.name].iter_errors(json.loads(p.read_text(encoding='utf-8'))))
    if errs: raise SystemExit(f'Wan fixture {p.name} invalid: {errs[0].message}')
    wan_count+=1

# FLUX 3 provider-specific fixtures
flux_validators={
    'keyframe-plan.json':Draft202012Validator(load('schemas/providers/flux-3-video/keyframe-plan.schema.json'),registry=registry),
    'prompt.json':Draft202012Validator(load('schemas/providers/flux-3-video/prompt.schema.json'),registry=registry),
    'execution-plan.json':Draft202012Validator(load('schemas/providers/flux-3-video/execution-plan.schema.json'),registry=registry),
}
flux_count=0
for p in (ROOT/'tests/flux-stage-fixtures').glob('*.json'):
    errs=list(flux_validators[p.name].iter_errors(json.loads(p.read_text(encoding='utf-8'))))
    if errs: raise SystemExit(f'FLUX fixture {p.name} invalid: {errs[0].message}')
    flux_count+=1

# Seedance 2.x provider-specific fixtures
seedance_validators={
    'reference-plan.json':Draft202012Validator(load('schemas/providers/seedance-2.x/reference-plan.schema.json'),registry=registry),
    'prompt.json':Draft202012Validator(load('schemas/providers/seedance-2.x/prompt.schema.json'),registry=registry),
    'execution-plan.json':Draft202012Validator(load('schemas/providers/seedance-2.x/execution-plan.schema.json'),registry=registry),
}
seedance_count=0
for p in (ROOT/'tests/seedance-stage-fixtures').glob('*.json'):
    errs=list(seedance_validators[p.name].iter_errors(json.loads(p.read_text(encoding='utf-8'))))
    if errs: raise SystemExit(f'Seedance fixture {p.name} invalid: {errs[0].message}')
    seedance_count+=1

# LTX 2.5 provider-specific fixtures
ltx_validators={
    'input-plan.json':Draft202012Validator(load('schemas/providers/ltx-2.5/input-plan.schema.json'),registry=registry),
    'prompt.json':Draft202012Validator(load('schemas/providers/ltx-2.5/prompt.schema.json'),registry=registry),
    'execution-plan.json':Draft202012Validator(load('schemas/providers/ltx-2.5/execution-plan.schema.json'),registry=registry),
}
ltx_count=0
for p in (ROOT/'tests/ltx-stage-fixtures').glob('*.json'):
    errs=list(ltx_validators[p.name].iter_errors(json.loads(p.read_text(encoding='utf-8'))))
    if errs: raise SystemExit(f'LTX fixture {p.name} invalid: {errs[0].message}')
    ltx_count+=1

# Taxonomy semantic consistency
tax=load('config/product-function-taxonomy.json')
primitives=set(tax['behaviorPrimitives'])
used={x for fc in tax['functionClasses'] for x in fc.get('commonInteractions',[])}
missing=sorted(used-primitives)
if missing: raise SystemExit(f'Taxonomy interactions missing from behaviorPrimitives: {missing}')
pm_allowed=set(load('schemas/stages/product-mechanism.schema.json')['properties']['recommendedVisualizationModes']['items']['enum'])
used_visuals={x for fc in tax['functionClasses'] for x in fc.get('visualizationModes',[])}
missing_visuals=sorted(used_visuals-pm_allowed)
if missing_visuals: raise SystemExit(f'Taxonomy visualization modes missing from product-mechanism schema: {missing_visuals}')

# Generic sequence/prompt examples
sqv=Draft202012Validator(load('schemas/stages/sequence-plan.schema.json'),registry=registry)
pcv=Draft202012Validator(load('schemas/stages/prompt-chain.schema.json'),registry=registry)
for rel,v in [('examples/omni-40s-sequence-plan.json',sqv),('examples/omni-40s-tie-in-prompt-chain.json',pcv),('examples/omni-15s-continuous-shot-chain.json',pcv)]:
    errs=list(v.iter_errors(load(rel)))
    if errs: raise SystemExit(f'Example {rel} invalid: {errs[0].message}')

# Sample output
ov=Draft202012Validator(load('schemas/output.schema.json'),registry=registry)
errs=list(ov.iter_errors(load('tests/fixtures/sample-output.json')))
if errs: raise SystemExit(f'Sample output invalid: {errs[0].message}')

# Generic Omni temporal solver
mod=runpy.run_path(str(ROOT/'adapters/temporal_planner.py'))
plan=mod['plan_extension_chain'](base_seconds=8,target_total_seconds=40,min_additional_seconds=3,max_additional_seconds=10,max_cumulative_seconds=40,step_seconds=1)
assert plan.exact and abs(plan.total_seconds-40)<1e-9 and len(plan.extension_seconds)==4
plan15=mod['plan_extension_chain'](base_seconds=8,target_total_seconds=15,min_additional_seconds=3,max_additional_seconds=10,max_cumulative_seconds=40,step_seconds=1)
assert plan15.exact and abs(plan15.total_seconds-15)<1e-9

# H3 continuation solver
h3=mod['plan_reference_continuation_chain'](target_total_seconds=40,preferred_segment_seconds=15,tail_seconds=4)
assert h3.exact and abs(h3.total_seconds-40)<1e-9
assert [x.duration_seconds for x in h3.segments]==[15,15,10]

# Generic bounded continuation solver (Seedance 2.5: base + two extension turns)
seed_chain=mod['plan_bounded_reference_continuation_chain'](
    target_total_seconds=90,min_segment_seconds=4,max_segment_seconds=30,
    preferred_segment_seconds=30,tail_seconds=4,tail_min_seconds=2,tail_max_seconds=30,
    max_total_segments=3,step_seconds=1
)
assert seed_chain.exact and len(seed_chain.segments)==3 and abs(seed_chain.total_seconds-90)<1e-9

print(f'PASS: v11 schemas, {input_count} input fixtures, {profile_count} provider profiles, {stage_count} generic stage fixtures, {promotion_count} promotion/place fixtures, {h3_count} H3 fixtures, {grok_count} Grok fixtures, {wan_count} Wan fixtures, {flux_count} FLUX fixtures, {seedance_count} Seedance fixtures, {ltx_count} LTX fixtures, sample output, Omni/H3/provider temporal solvers')
