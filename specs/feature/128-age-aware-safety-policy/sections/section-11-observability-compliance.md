# section-11-observability-compliance

## Goal

Add operational visibility, compliance support, review workflows, privacy controls, and runbooks for the age-aware safety system.

## Depends On

- `section-02-data-profile-service`
- `section-04-admin-policy-audit-flags`

## Files In Scope

- Audit event helpers and dashboards/queries if present.
- Metrics/logging integration.
- Manual review queue services/routes if present or a minimal new queue.
- Consent and retention record services needed before age-tiered minor access.
- Privacy export/delete handling related to DOB/country and policy audit.
- Runbook documentation under specs or docs.

## Test First

Add tests for:

- Safety block/allow/review events are recorded with reason code, surface, actor kind, policy version, and redacted content references.
- DOB is excluded from normal logs and analytics.
- DOB and profile-sensitive fields are excluded from error telemetry, session replay, feature flag payloads, provider payloads, and general admin/reporting list views.
- Review queue items can be created, resolved, and audited without exposing unnecessary profile data.
- Privacy export includes required safety profile data in a controlled format.
- Account deletion/anonymization handles safety profile and audit records according to retention rules.
- Guardian/minor consent records are required and verified before age-tiered child/teen access where presets require consent.
- Retention action records are created for under-minimum restriction, export requests, delete requests, deletion, and tombstone outcomes.
- Metrics counters increment for profile-required, policy-blocked, PIN-unlock, review-required, and emergency-mode decisions.

## Implementation Requirements

- Define an audit schema that separates high-cardinality/sensitive data from safe aggregate metrics.
- Treat country/locale/IP/timezone/billing mismatches as redacted risk signals only; do not log full raw evidence in normal audit metadata.
- Add alert recommendations for sudden spikes in blocked media prompts, unknown-profile access, failed PIN unlocks, and policy evaluation errors.
- Provide support-facing reason codes that map to admin-configured policy without disclosing full rules to end users.
- Add runbooks for emergency child-safe mode, policy rollback, false-positive review, data subject request handling, and provider outage fallback.
- Retention must be configurable enough for legal review; do not hard-code irreversible deletion windows without product approval.
- Consent/retention records must store safe metadata only; never store raw guardian documents, raw DOB copies, PIN values, token ids, or full prompt text.

## Integration Notes

- Use the audit helpers from section 04 consistently.
- Generated asset review states from section 08 should feed manual review.
- External actor events from section 09 should identify actor kind and tenant/domain.

## Verification

- `cd apps/web && pnpm test -- ageSafetyAudit`
- `cd apps/web && pnpm test -- privacy`
- `cd apps/web && pnpm check`

## Handoff

Operations should be able to answer: what was blocked, why it was blocked, which policy version applied, and how to safely override or review it.
