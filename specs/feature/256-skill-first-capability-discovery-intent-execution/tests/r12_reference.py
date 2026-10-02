"""Pure illustrative contract invariants for Spec 256 R1.2.
No function here may issue grants, settle money, dispatch a job or access a network.
Actual implementation MUST call the existing canonical owners.
"""
from datetime import datetime, timezone
import re

EFFECTS={'READ_ONLY','CREATE_DERIVATIVE','MUTATE_DOMAIN','EXTERNAL_EGRESS','RUN_UNTRUSTED_CODE','RELEASE'}
EXEC_MODES={'PREVIEW','SINGLE_FUNCTION','BOUNDED_ASSISTED'}

def validate_plan_strict(plan, trusted_mode, trusted_requested_step_ids=None, authorized_asset_refs=None):
    """Reject proposal escalation/unused selected executable capabilities and untrusted refs."""
    steps=plan['orderedSteps']; ids=[x['stepId'] for x in steps]
    if len(ids)!=len(set(ids)):raise ValueError('DUPLICATE_STEP')
    if plan['mode']!=trusted_mode:raise ValueError('MODE_ESCALATION_OR_MISMATCH')
    selected=plan['selectedCapabilityRefs']
    if len(selected)!=len(set(selected)):raise ValueError('DUPLICATE_SELECTED_CAPABILITY')
    executable={x['capabilityRef'] for x in steps}
    if trusted_mode in ('DISCOVER','ADVISE') and steps:raise ValueError('READ_MODE_EXECUTION')
    if trusted_mode in EXEC_MODES and set(selected)!=executable:raise ValueError('EXTRA_OR_MISSING_CAPABILITY')
    if trusted_mode=='SINGLE_FUNCTION' and not(len(steps)==1 and len(selected)==1):raise ValueError('NOT_SINGLE_FUNCTION')
    if trusted_requested_step_ids is not None:
        for step in steps:
            if step.get('requestedByUser') and step['stepId'] not in trusted_requested_step_ids:
                raise ValueError('FORGED_REQUESTED_BY_USER')
    graph={x['stepId']:x for x in steps}; seen=set(); active=set()
    def visit(k):
        if k in active:raise ValueError('CYCLE')
        if k in seen:return
        active.add(k)
        for dep in graph[k].get('dependsOnStepIds',[]):
            if dep not in graph:raise ValueError('UNKNOWN_DEPENDENCY')
            if graph[dep].get('optional') and not graph[k].get('optional'):
                raise ValueError('OPTIONAL_DEPENDENCY_NOT_ADMITTED')
            visit(dep)
        active.remove(k);seen.add(k)
    for i in ids:visit(i)
    if authorized_asset_refs is not None:
        allowed=set(authorized_asset_refs)
        for x in plan['scope']['targetAssetRefs']:
            if x not in allowed: raise ValueError('TARGET_NOT_AUTHORIZED')
        def inspect(v,k=''):
            if isinstance(v,dict):
                for key,part in v.items():inspect(part,key)
            elif isinstance(v,list):
                for part in v:inspect(part,k)
            elif isinstance(v,str) and ('ref' in k.lower() or 'url' in k.lower() or 'path' in k.lower()):
                if v not in allowed: raise ValueError('UNTRUSTED_INPUT_BINDING')
        for step in steps: inspect(step['inputBindings'])
    return True

def enforce_effect_budget(budget, *, capability_ref, actual_effects, source_ref, output_kind, external_destination=None, spend_minor=0):
    """Illustrative subset check; real owner revalidates revision, consent and quote."""
    if capability_ref not in budget['capabilityRefs']:raise ValueError('CAPABILITY_OUT_OF_SCOPE')
    if source_ref not in budget['allowedInputRefs']:raise ValueError('INPUT_OUT_OF_SCOPE')
    if output_kind not in budget['allowedOutputKinds']:raise ValueError('OUTPUT_OUT_OF_SCOPE')
    if not set(actual_effects).issubset(set(budget['allowedEffectClasses'])):raise ValueError('EFFECT_EXCEEDS_BUDGET')
    if set(actual_effects)&set(budget.get('explicitProhibitions',[])):raise ValueError('EXPLICIT_PROHIBITION')
    if external_destination:
        if external_destination not in budget['approvedExternalDestinations']:raise ValueError('EGRESS_NOT_CONSENTED')
        if 'EXTERNAL_EGRESS' not in budget['allowedEffectClasses']:raise ValueError('EGRESS_NOT_ALLOWED')
    if spend_minor>budget.get('maxSpendMinor',0):raise ValueError('SPEND_EXCEEDS_BUDGET')
    return True

def _dt(v):return datetime.fromisoformat(v.replace('Z','+00:00'))

def validate_admission(check, *, current_source_digest, policy_epoch, current_offer_rev, now=None):
    now=now or datetime.now(timezone.utc)
    if check['disposition']!='READY_TO_OWNER_RECHECK':raise ValueError('NOT_OWNER_ADMITTED')
    if check['sourceDigest']!=current_source_digest:raise ValueError('SOURCE_CHANGED')
    if check['policyEpochRef']!=policy_epoch:raise ValueError('POLICY_CHANGED')
    if check['offerRevision']!=current_offer_rev:raise ValueError('OFFER_CHANGED')
    if _dt(check['expiresAt'])<=now:raise ValueError('EXPIRED')
    if not check.get('canonicalActionBindingRef'):raise ValueError('MISSING_CANONICAL_OWNER_BINDING')
    return True

def validate_checkpoint(c, *, mask_digest, current_policy_epoch, expected_scope, reviewed_source_digest):
    if c['disposition']!='APPROVED_BY_OWNER' or not c.get('canonicalApprovalReceiptRef'):
        raise ValueError('CANONICAL_APPROVAL_REQUIRED')
    if c['reviewedArtifactDigest']!=mask_digest or c['sourceDigest']!=reviewed_source_digest:
        raise ValueError('STALE_REVIEW_ARTIFACT')
    if c['policyEpochRef']!=current_policy_epoch or c['reviewerScopeFingerprint']!=expected_scope:
        raise ValueError('STALE_REVIEW_SCOPE')
    return True

def attenuate(parent,child,*,expected_audience):
    if child['actorAudienceRef']!=expected_audience:raise ValueError('DELEGATED_AUDIENCE_MISMATCH')
    if child['parentScopeRef']!=parent['delegationBindingRef']:raise ValueError('INVALID_PARENT')
    for field in ('allowedCapabilityRefs','allowedAssetRefs','allowedEffectClasses','approvedDestinationRefs','approvedRegionRefs'):
        if not set(child[field]).issubset(set(parent[field])):raise ValueError('SCOPE_WIDENED_'+field)
    if child['maxSpendMinor']>parent['maxSpendMinor']:raise ValueError('SPEND_WIDENED')
    if _dt(child['expiresAt'])>_dt(parent['expiresAt']):raise ValueError('TTL_WIDENED')
    if parent['policyEpochRef']!=child['policyEpochRef']:raise ValueError('POLICY_EPOCH_MISMATCH')
    if not parent['subdelegationPermitted']:raise ValueError('REDELEGATION_FORBIDDEN')
    if child['remainingDepth']>=parent['remainingDepth']:raise ValueError('DEPTH_NOT_ATTENUATED')
    return True

def film_media_compatible(media_pass,*,require_metric=False,expected_pts_digest=None,expected_alpha=None):
    if expected_pts_digest and media_pass['clock']['ptsDigest']!=expected_pts_digest:raise ValueError('PTS_MISMATCH')
    if require_metric and media_pass['passKind']=='DEPTH' and media_pass['depth']['scaleClass']!='METRIC_CALIBRATED':
        raise ValueError('RELATIVE_NOT_METRIC')
    if expected_alpha and media_pass['passKind']=='ALPHA' and media_pass['alpha']['representation']!=expected_alpha:
        raise ValueError('ALPHA_CONVENTION_MISMATCH')
    if media_pass['passKind']=='HDR_DERIVATIVE' and media_pass['provenanceClass']!='SYNTHETIC_INFERENCE':
        raise ValueError('FALSE_RAW_PROVENANCE')
    return True

def public_projection(internal,*,display_id,entitled_skill_labels=(),availability='UNKNOWN',reason_codes=()):
    """Construct from allowlisted reviewed first-party fields only; not arbitrary remote text."""
    clean=lambda d: {'en':d['en'][:600],'th':d['th'][:600]}
    if any(re.search(r'(skill://|ownerPolicyRef|API[_ -]?KEY)',str(x),re.I) for x in list(internal['title'].values())+list(internal['plainLanguageSummary'].values())):
        raise ValueError('UNREVIEWED_FREE_TEXT')
    return {'schemaVersion':'sah.capability.public-result.v1','catalogGeneration':'example:projection-only','resultType':'COMPLETE','cards':[{
        'displayCapabilityId':display_id,'ownerProductLabel':internal['ownerProductRef'][:120],
        'title':clean(internal['title']),'summary':clean(internal['plainLanguageSummary']),
        'inputKinds':internal['requiredInputKinds'],'outputKinds':internal['outputKinds'],
        'effectClasses':internal['effectClasses'],'availability':availability,'reasonCodes':list(reason_codes),
        'skillDisplayLabels':list(entitled_skill_labels),'allowedActions':['DESCRIBE']
    }]}
