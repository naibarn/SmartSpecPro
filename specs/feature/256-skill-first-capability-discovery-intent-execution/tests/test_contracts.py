"""Static proposal/fixture checks only. Does not certify runtime authority or MCP."""
from __future__ import annotations
import copy, json, re, sys, unittest
from pathlib import Path
import yaml
from jsonschema import Draft202012Validator, FormatChecker, ValidationError
from referencing import Registry, Resource

ROOT=Path(__file__).resolve().parents[1]
SCHEMAS={p.name:p for p in (ROOT/'contracts').glob('*.schema.json')}
FIXTURE_FOR_SCHEMA={
 'capability-card.schema.json':'capability-card.example.json',
 'intent-candidate.schema.json':'intent-candidate.single-depth.example.json',
 'capability-offer.schema.json':'capability-offer.local-depth.example.json',
 'capability-search-request.schema.json':'capability-search-request.example.json',
 'capability-search-result.schema.json':'capability-search-result.example.json',
 'intent-mode-decision.schema.json':'intent-mode-decision.example.json',
 'selection-receipt.schema.json':'selection-receipt.example.json',
 'capability-public-result.schema.json':'capability-public-result.example.json',
 'effect-budget.schema.json':'effect-budget.example.json',
 'admission-checklist.schema.json':'admission-checklist.example.json',
 'step-review-checkpoint.schema.json':'step-review-checkpoint.example.json',
 'delegation-scope.schema.json':'delegation-scope.example.json',
 'film-media-pass.schema.json':'film-media-pass.example.json'
}
def load(path): return json.loads(path.read_text(encoding='utf-8'))
SCHEMATA={name:load(path) for name,path in SCHEMAS.items()}
REGISTRY=Registry().with_resources([(s['$id'],Resource.from_contents(s)) for s in SCHEMATA.values()])
def validator(name): return Draft202012Validator(SCHEMATA[name],registry=REGISTRY,format_checker=FormatChecker())
def fixture(name): return load(ROOT/'fixtures'/FIXTURE_FOR_SCHEMA[name])

def validate_semantics(obj):
    """Illustrative trusted semantic validator fixture, NOT a live gateway."""
    steps=obj['orderedSteps']; refs=obj['selectedCapabilityRefs']; ids=[s['stepId'] for s in steps]
    if len(ids)!=len(set(ids)): raise ValueError('DUPLICATE_STEP')
    if len(refs)!=len(set(refs)): raise ValueError('DUPLICATE_CAPABILITY')
    if set(s['capabilityRef'] for s in steps) - set(refs): raise ValueError('STEP_CAPABILITY_UNSELECTED')
    if obj['mode']=='SINGLE_FUNCTION' and not(len(steps)==len(refs)==1 and steps[0]['capabilityRef']==refs[0]):
        raise ValueError('SINGLE_FUNCTION_REF_MISMATCH')
    if obj['mode'] in ('DISCOVER','ADVISE') and steps: raise ValueError('READ_MODE_HAS_EXECUTION')
    by={s['stepId']:s for s in steps}; state={}
    def walk(key):
        if state.get(key)==1: raise ValueError('CYCLE')
        if state.get(key)==2: return
        state[key]=1
        for dep in by[key].get('dependsOnStepIds',[]):
            if dep not in by: raise ValueError('UNKNOWN_DEPENDENCY')
            if by[dep].get('optional',False) and not by[key].get('optional',False):
                raise ValueError('OPTIONAL_PREREQUISITE_UNADMITTED')
            walk(dep)
        state[key]=2
    for key in ids: walk(key)
    return True

def expose_catalog_to_external(result):
    out=copy.deepcopy(result)
    out['retrievalEvidenceRefs']=[]  # raw refs never leave server
    return out

class StaticContractTests(unittest.TestCase):
    def test_01_schema_inventory(self): self.assertEqual(len(SCHEMATA),13)
    def test_02_fixtures_inventory(self): self.assertEqual(len(list((ROOT/'fixtures').glob('*.example.json'))),13)
    def test_03_all_draft2020_schemas_valid(self):
        for n,s in SCHEMATA.items():
            with self.subTest(n=n): Draft202012Validator.check_schema(s)
    def test_04_all_sample_fixtures_valid(self):
        for n in FIXTURE_FOR_SCHEMA:
            with self.subTest(n=n): validator(n).validate(fixture(n))
    def test_05_invalid_catalog_version_rejected(self):
        x=fixture('capability-card.schema.json');x['schemaVersion']='evil';self.assertRaises(ValidationError,validator('capability-card.schema.json').validate,x)
    def test_06_missing_localized_label_rejected(self):
        x=fixture('capability-card.schema.json');x['title'].pop('th');self.assertRaises(ValidationError,validator('capability-card.schema.json').validate,x)
    def test_07_unknown_elevated_risk_rejected(self):
        x=fixture('capability-card.schema.json');x['riskClass']='ADMIN_OVERRIDE';self.assertRaises(ValidationError,validator('capability-card.schema.json').validate,x)
    def test_08_undeclared_raw_secrets_rejected(self):
        x=fixture('capability-card.schema.json');x['secrets']={'api_key':'leak'};self.assertRaises(ValidationError,validator('capability-card.schema.json').validate,x)
    def test_09_bad_offer_availability_rejected(self):
        x=fixture('capability-offer.schema.json');x['availability']='PROVIDER_SAYS_READY';self.assertRaises(ValidationError,validator('capability-offer.schema.json').validate,x)
    def test_10_invalid_fps_string_rejected(self):
        x=fixture('capability-offer.schema.json');x['outputLimits']={'supportedFps':['25']};self.assertRaises(ValidationError,validator('capability-offer.schema.json').validate,x)
    def test_11_pretend_cancellable_rejected(self):
        x=fixture('capability-offer.schema.json');x['cancellationMode']='ALWAYS_REFUNDED';self.assertRaises(ValidationError,validator('capability-offer.schema.json').validate,x)
    def test_12_request_cannot_set_actor_or_tenant(self):
        x=fixture('capability-search-request.schema.json');x['tenantId']='attacker';self.assertRaises(ValidationError,validator('capability-search-request.schema.json').validate,x)
    def test_13_excess_page_size_rejected(self):
        x=fixture('capability-search-request.schema.json');x['maxResults']=999999;self.assertRaises(ValidationError,validator('capability-search-request.schema.json').validate,x)
    def test_14_invalid_datetime_rejected(self):
        x=fixture('intent-mode-decision.schema.json');x['expiresAt']='tomorrowish';self.assertRaises(ValidationError,validator('intent-mode-decision.schema.json').validate,x)
    def test_15_skill_receipt_digest_format_rejected(self):
        x=fixture('selection-receipt.schema.json');x['selectedSkills']=[{'originRef':'x','releaseRef':'y','contentDigest':'trust-me'}];self.assertRaises(ValidationError,validator('selection-receipt.schema.json').validate,x)
    def test_16_single_function_schema_rejects_two_steps(self):
        x=fixture('intent-candidate.schema.json');x['orderedSteps'].append(copy.deepcopy(x['orderedSteps'][0]));self.assertRaises(ValidationError,validator('intent-candidate.schema.json').validate,x)
    def test_17_discover_schema_rejects_exec_steps(self):
        x=fixture('intent-candidate.schema.json');x['mode']='DISCOVER';self.assertRaises(ValidationError,validator('intent-candidate.schema.json').validate,x)
    def test_18_semantic_consistent_single_function(self):
        self.assertTrue(validate_semantics(fixture('intent-candidate.schema.json')))
    def test_19_mismatched_step_ref_semantically_rejected(self):
        x=fixture('intent-candidate.schema.json');x['orderedSteps'][0]['capabilityRef']='example:another';validator('intent-candidate.schema.json').validate(x);self.assertRaisesRegex(ValueError,'MISMATCH|UNSELECTED',validate_semantics,x)
    def test_20_duplicate_step_ids_rejected(self):
        x=fixture('intent-candidate.schema.json');x['mode']='BOUNDED_ASSISTED';x['orderedSteps'].append(copy.deepcopy(x['orderedSteps'][0]));self.assertRaisesRegex(ValueError,'DUPLICATE_STEP',validate_semantics,x)
    def test_21_missing_dependency_rejected(self):
        x=fixture('intent-candidate.schema.json');x['orderedSteps'][0]['dependsOnStepIds']=['missing'];self.assertRaisesRegex(ValueError,'UNKNOWN_DEPENDENCY',validate_semantics,x)
    def test_22_cycle_rejected(self):
        x=fixture('intent-candidate.schema.json');x['mode']='BOUNDED_ASSISTED';one=x['orderedSteps'][0];one['dependsOnStepIds']=['other'];two=copy.deepcopy(one);two['stepId']='other';two['dependsOnStepIds']=['depth'];x['orderedSteps'].append(two);self.assertRaisesRegex(ValueError,'CYCLE',validate_semantics,x)
    def test_23_optional_prereq_to_required_rejected(self):
        x=fixture('intent-candidate.schema.json');x['mode']='BOUNDED_ASSISTED';one=x['orderedSteps'][0];two=copy.deepcopy(one);one['optional']=True;one['dependsOnStepIds']=[];two['stepId']='other';two['optional']=False;two['dependsOnStepIds']=['depth'];x['orderedSteps'].append(two);self.assertRaisesRegex(ValueError,'OPTIONAL_PREREQUISITE',validate_semantics,x)
    def test_24_external_catalog_hides_raw_retrieval_refs(self):
        x=fixture('capability-search-result.schema.json');x['retrievalEvidenceRefs']=['secret-internal-index-pointer'];out=expose_catalog_to_external(x);self.assertEqual(out['retrievalEvidenceRefs'],[])
    def test_25_schema_refs_closed_and_resolvable(self):
        x=fixture('capability-search-result.schema.json');validator('capability-search-result.schema.json').validate(x)
    def test_26_skill_frontmatter(self):
        s=(ROOT/'skills/film-hybrid-scene-replacement/SKILL.md').read_text(encoding='utf-8')
        self.assertTrue(s.startswith('---\n')); fm=s.split('---\n',2)[1]; y=yaml.safe_load(fm)
        self.assertEqual(y['name'],'film-hybrid-scene-replacement');self.assertGreater(len(y['description']),50)
        self.assertIn('SINGLE_FUNCTION',s);self.assertIn('paid',s.lower());self.assertIn('R1.1',s)
    def test_27_numbering_and_flags(self):
        s=(ROOT/'specs/feature/256-skill-first-capability-discovery-intent-execution/spec.md').read_text()
        self.assertIn('PROVISIONAL_PENDING_CANONICAL',s);self.assertIn('Spec 224',s)
        for flag in ('capability_experience.skill_first_resolver.enabled: false','capability_experience.agent_catalog_export.enabled: false'):
            self.assertIn(flag,s)
    def test_28_count_all_acceptance_cases(self):
        s=(ROOT/'specs/feature/256-skill-first-capability-discovery-intent-execution/spec.md').read_text()
        ids=[int(x) for x in re.findall(r'^\| C256-(\d+) \|',s,re.M)]
        self.assertEqual(sorted(ids),list(range(1,113)))
    def test_29_at_least_14_documented_distinct_audit_passes(self):
        a=(ROOT/'AUDIT-14-PASSES-R1.1.md').read_text()
        ids=[int(x) for x in re.findall(r'^\| (\d{2}) \|',a,re.M)]
        self.assertEqual(ids,list(range(1,15)))
        extra=(ROOT/'AUDIT-12-ADDITIONAL-PASSES-R1.2.md').read_text()
        passes=[int(x) for x in re.findall(r'^\| P(\d{2}) \|',extra,re.M)]
        self.assertEqual(passes,list(range(1,13)))
    def test_30_film_p0_is_not_forced_paid_generation(self):
        s=(ROOT/'specs/feature/256-skill-first-capability-discovery-intent-execution/spec.md').read_text()
        for id in ('`film.scene.replace`','`film.video.edit`'):
            line=next(line for line in s.splitlines() if line.startswith('| '+id+' |'))
            self.assertIn('P1 (P0 optional if certified offer exists)',line)
    def test_31_source_spec_has_no_live_grant_claim(self):
        s=(ROOT/'specs/feature/256-skill-first-capability-discovery-intent-execution/spec.md').read_text()
        self.assertIn('not runtime certification',s.lower());self.assertIn('No DDL',s)
    def test_32_untrusted_candidate_cannot_claim_server_mode_decision(self):
        x=fixture('intent-candidate.schema.json');x['modeDecisionRef']='fake-server-decision';self.assertRaises(ValidationError,validator('intent-candidate.schema.json').validate,x)
    def test_33_bilingual_intent_goldset_inventory(self):
        d=load(ROOT/'evaluation/intent-goldset-th-en.json');cases=d['cases'];self.assertEqual(len(cases),30);self.assertEqual(sum(x['locale']=='th' for x in cases),15);self.assertEqual(sum(x['locale']=='en' for x in cases),15);self.assertEqual(len({x['id'] for x in cases}),30)
        for x in cases:
            if x['expectedMode'] in ('DISCOVER','ADVISE'): self.assertEqual(x['maximumEffects'],[])
    def test_34_public_evidence_is_internal_only(self):
        s=(ROOT/'specs/feature/256-skill-first-capability-discovery-intent-execution/spec.md').read_text()
        self.assertIn('public/agent projection emits []',s)

if __name__=='__main__': unittest.main()
