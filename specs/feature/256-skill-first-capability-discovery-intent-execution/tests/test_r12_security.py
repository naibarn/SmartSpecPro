"""R1.2 reference static tests; not live product or multi-tenant runtime evidence."""
from __future__ import annotations
import copy,json,re,unittest
from pathlib import Path
from datetime import datetime, timezone
from jsonschema import Draft202012Validator, FormatChecker, ValidationError
from r12_reference import (validate_plan_strict,enforce_effect_budget,validate_admission,
                           validate_checkpoint,attenuate,film_media_compatible,public_projection)
R=Path(__file__).resolve().parents[1]
load=lambda p:json.loads(p.read_text(encoding='utf-8'))
def schema(n):return Draft202012Validator(load(R/'contracts'/f'{n}.schema.json'),format_checker=FormatChecker())
def fixture(n):return load(R/'fixtures'/f'{n}.example.json')
class R12SecurityReferenceTests(unittest.TestCase):
    def test_35_six_new_schemas_have_positive_fixtures(self):
        for n in ('effect-budget','admission-checklist','step-review-checkpoint','delegation-scope','capability-public-result','film-media-pass'):
            with self.subTest(n=n):schema(n).validate(fixture(n))
    def test_36_public_projection_rejects_internal_root_fields(self):
        x=fixture('capability-public-result');x['ownerPolicyRef']='leak';self.assertRaises(ValidationError,schema('capability-public-result').validate,x)
    def test_37_public_projection_rejects_nested_internal_card_fields(self):
        x=fixture('capability-public-result');x['cards'][0]['relevantSkillReleaseRefs']=['private'];self.assertRaises(ValidationError,schema('capability-public-result').validate,x)
    def test_38_public_projection_rejects_nested_offer_ref(self):
        x=fixture('capability-public-result');x['cards'][0]['backendOfferRef']='private';self.assertRaises(ValidationError,schema('capability-public-result').validate,x)
    def test_39_public_projection_allowlist_only(self):
        x=public_projection(fixture('capability-card'),display_id='public:depth')
        schema('capability-public-result').validate(x)
        self.assertNotIn('ownerPolicyRef',str(x));self.assertNotIn('relevantSkillReleaseRefs',str(x))
    def test_40_public_projection_blocks_unreviewed_hidden_uri(self):
        x=fixture('capability-card');x['plainLanguageSummary']['en']='secret skill://hidden/tenant';self.assertRaisesRegex(ValueError,'UNREVIEWED_FREE_TEXT',public_projection,x,display_id='x')
    def test_41_effect_budget_blocks_hidden_paid_prerequisite(self):
        b=fixture('effect-budget');self.assertRaisesRegex(ValueError,'EFFECT_EXCEEDS',enforce_effect_budget,b,capability_ref=b['capabilityRefs'][0],actual_effects=['CREATE_DERIVATIVE','RUN_UNTRUSTED_CODE'],source_ref=b['allowedInputRefs'][0],output_kind=b['allowedOutputKinds'][0])
    def test_42_effect_budget_blocks_external_egress(self):
        b=fixture('effect-budget');self.assertRaisesRegex(ValueError,'EGRESS',enforce_effect_budget,b,capability_ref=b['capabilityRefs'][0],actual_effects=['CREATE_DERIVATIVE'],source_ref=b['allowedInputRefs'][0],output_kind=b['allowedOutputKinds'][0],external_destination='https://unapproved.invalid')
    def test_43_effect_budget_blocks_overspend(self):
        b=fixture('effect-budget');self.assertRaisesRegex(ValueError,'SPEND',enforce_effect_budget,b,capability_ref=b['capabilityRefs'][0],actual_effects=['CREATE_DERIVATIVE'],source_ref=b['allowedInputRefs'][0],output_kind=b['allowedOutputKinds'][0],spend_minor=1)
    def test_44_positive_single_function_plan(self):
        p=fixture('intent-candidate.single-depth');self.assertTrue(validate_plan_strict(p,'SINGLE_FUNCTION',{'depth'},{'example:authorized-source-at-runtime'}))
    def test_45_extra_selected_capability_in_bounded_plan_rejected(self):
        p=fixture('intent-candidate.single-depth');p['mode']='BOUNDED_ASSISTED';p['selectedCapabilityRefs'].append('example:unrequested-video-generation')
        self.assertRaisesRegex(ValueError,'EXTRA_OR_MISSING',validate_plan_strict,p,'BOUNDED_ASSISTED')
    def test_46_read_to_execute_escalation_rejected(self):
        p=fixture('intent-candidate.single-depth');self.assertRaisesRegex(ValueError,'MODE_ESCALATION',validate_plan_strict,p,'ADVISE')
    def test_47_fake_requested_by_user_flag_rejected(self):
        p=fixture('intent-candidate.single-depth');self.assertRaisesRegex(ValueError,'FORGED',validate_plan_strict,p,'SINGLE_FUNCTION',set())
    def test_48_untrusted_source_url_binding_rejected(self):
        p=fixture('intent-candidate.single-depth');p['orderedSteps'][0]['inputBindings']['assetRef']='https://localhost/admin'
        self.assertRaisesRegex(ValueError,'UNTRUSTED_INPUT',validate_plan_strict,p,'SINGLE_FUNCTION',{'depth'},{'example:authorized-source-at-runtime'})
    def test_49_ready_admission_requires_canonical_binding(self):
        x=fixture('admission-checklist');x['disposition']='READY_TO_OWNER_RECHECK'
        self.assertRaisesRegex(ValueError,'MISSING_CANONICAL',validate_admission,x,current_source_digest=x['sourceDigest'],policy_epoch=x['policyEpochRef'],current_offer_rev=x['offerRevision'],now=datetime(2026,9,28,0,1,tzinfo=timezone.utc))
    def test_50_admission_source_digest_change_rejected(self):
        x=fixture('admission-checklist');x['disposition']='READY_TO_OWNER_RECHECK';x['canonicalActionBindingRef']='example:issued-real-only-at-runtime'
        self.assertRaisesRegex(ValueError,'SOURCE_CHANGED',validate_admission,x,current_source_digest='sha256:'+'b'*64,policy_epoch=x['policyEpochRef'],current_offer_rev=x['offerRevision'],now=datetime(2026,9,28,0,1,tzinfo=timezone.utc))
    def test_51_review_badge_without_owner_receipt_not_an_approval(self):
        x=fixture('step-review-checkpoint');x['disposition']='APPROVED_BY_OWNER'
        self.assertRaisesRegex(ValueError,'CANONICAL_APPROVAL',validate_checkpoint,x,mask_digest=x['reviewedArtifactDigest'],current_policy_epoch=x['policyEpochRef'],expected_scope=x['reviewerScopeFingerprint'],reviewed_source_digest=x['sourceDigest'])
    def test_52_approved_mask_A_does_not_authorize_mask_B(self):
        x=fixture('step-review-checkpoint');x['disposition']='APPROVED_BY_OWNER';x['canonicalApprovalReceiptRef']='example:canonical-only-runtime'
        self.assertRaisesRegex(ValueError,'STALE_REVIEW_ARTIFACT',validate_checkpoint,x,mask_digest='sha256:'+'b'*64,current_policy_epoch=x['policyEpochRef'],expected_scope=x['reviewerScopeFingerprint'],reviewed_source_digest=x['sourceDigest'])
    def test_53_other_session_review_scope_rejected(self):
        x=fixture('step-review-checkpoint');x['disposition']='APPROVED_BY_OWNER';x['canonicalApprovalReceiptRef']='example:canonical-only-runtime'
        self.assertRaisesRegex(ValueError,'STALE_REVIEW_SCOPE',validate_checkpoint,x,mask_digest=x['reviewedArtifactDigest'],current_policy_epoch=x['policyEpochRef'],expected_scope='different',reviewed_source_digest=x['sourceDigest'])
    def test_54_agent_child_cannot_widen_parent_scope(self):
        p=fixture('delegation-scope');p['subdelegationPermitted']=True;p['remainingDepth']=1
        c=copy.deepcopy(p);c['actorAudienceRef']='example:child';c['parentScopeRef']=p['delegationBindingRef'];c['remainingDepth']=0;c['allowedCapabilityRefs'].append('example:publish')
        self.assertRaisesRegex(ValueError,'SCOPE_WIDENED',attenuate,p,c,expected_audience='example:child')
    def test_55_agent_a_binding_not_for_agent_b(self):
        p=fixture('delegation-scope');p['subdelegationPermitted']=True;p['remainingDepth']=1
        c=copy.deepcopy(p);c['parentScopeRef']=p['delegationBindingRef'];c['remainingDepth']=0
        self.assertRaisesRegex(ValueError,'AUDIENCE_MISMATCH',attenuate,p,c,expected_audience='example:other-agent')
    def test_56_parent_without_subdelegation_denies(self):
        p=fixture('delegation-scope');c=copy.deepcopy(p);c['parentScopeRef']=p['delegationBindingRef']
        self.assertRaisesRegex(ValueError,'REDELEGATION_FORBIDDEN',attenuate,p,c,expected_audience=p['actorAudienceRef'])
    def test_57_relative_depth_not_metric(self):
        x=fixture('film-media-pass');self.assertRaisesRegex(ValueError,'RELATIVE_NOT_METRIC',film_media_compatible,x,require_metric=True)
    def test_58_pts_mismatch_rejected(self):
        x=fixture('film-media-pass');self.assertRaisesRegex(ValueError,'PTS_MISMATCH',film_media_compatible,x,expected_pts_digest='sha256:'+'f'*64)
    def test_59_alpha_convention_mismatch_rejected(self):
        x=fixture('film-media-pass');x['passKind']='ALPHA';x['alpha']={'representation':'STRAIGHT','premultiplied':False,'channelRange':'FULL'}
        self.assertRaisesRegex(ValueError,'ALPHA_CONVENTION_MISMATCH',film_media_compatible,x,expected_alpha='PREMULTIPLIED')
    def test_60_hdr_fake_camera_raw_rejected_by_schema(self):
        x=fixture('film-media-pass');x['passKind']='HDR_DERIVATIVE';x['depth']=None;x.pop('depth');x['provenanceClass']='CAMERA_SOURCE_DERIVATIVE'
        self.assertRaises(ValidationError,schema('film-media-pass').validate,x)
    def test_61_alpha_flag_must_agree_with_alpha_representation(self):
        x=fixture('film-media-pass');x['passKind']='ALPHA';x.pop('depth');x['alpha']={'representation':'STRAIGHT','premultiplied':True,'channelRange':'FULL'}
        self.assertRaises(ValidationError,schema('film-media-pass').validate,x)
    def test_67_schema_ready_admission_requires_action_binding(self):
        x=fixture('admission-checklist');x['disposition']='READY_TO_OWNER_RECHECK'
        self.assertRaises(ValidationError,schema('admission-checklist').validate,x)
    def test_68_schema_approved_checkpoint_requires_receipt(self):
        x=fixture('step-review-checkpoint');x['disposition']='APPROVED_BY_OWNER'
        self.assertRaises(ValidationError,schema('step-review-checkpoint').validate,x)
    def test_62_skill_frontmatter_follows_agent_skills_name_rules(self):
        text=(R/'skills/film-hybrid-scene-replacement/SKILL.md').read_text()
        import yaml
        fm=yaml.safe_load(text.split('---\n',2)[1]);self.assertRegex(fm['name'],r'^[a-z0-9]+(?:-[a-z0-9]+)*$');self.assertLessEqual(len(fm['name']),64);self.assertLessEqual(len(fm['description']),1024)
    def test_63_adversarial_goldset_extended(self):
        cases=load(R/'evaluation/intent-goldset-th-en.json')['cases'];self.assertEqual(len(cases),30)
        extra=[x for x in cases if int(x['id'].split('-')[1])>=11];self.assertEqual(len(extra),10)
        self.assertEqual(sum(x['locale']=='th' for x in extra),5);self.assertEqual(sum(x['locale']=='en' for x in extra),5)
        for x in extra:
            if x['expectedMode'] in ('DISCOVER','ADVISE'):self.assertEqual(x['maximumEffects'],[])
    def test_64_all_twelve_audit_passes_have_changes(self):
        text=(R/'AUDIT-12-ADDITIONAL-PASSES-R1.2.md').read_text();ids=re.findall(r'^\| P(\d{2}) \|',text,re.M);self.assertEqual(ids,[f'{i:02d}' for i in range(1,13)])
    def test_65_all_112_acceptance_case_ids_unique_and_contiguous(self):
        text=(R/'specs/feature/256-skill-first-capability-discovery-intent-execution/spec.md').read_text();ids=list(map(int,re.findall(r'^\| C256-(\d+) \|',text,re.M)));self.assertEqual(sorted(ids),list(range(1,113)))
    def test_66_new_flags_off_and_old_source_preserved(self):
        text=(R/'specs/feature/256-skill-first-capability-discovery-intent-execution/spec.md').read_text()
        for x in ('capability_experience.public_projection_v2.enabled: false','capability_experience.delegation_envelope_v1.enabled: false','capability_experience.step_review_v1.enabled: false','Spec 224','## 0. Executive decision','## 36. R1.2'):
            self.assertIn(x,text)
if __name__=='__main__':unittest.main()
