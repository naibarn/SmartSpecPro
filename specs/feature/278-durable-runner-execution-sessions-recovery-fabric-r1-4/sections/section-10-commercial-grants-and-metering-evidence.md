# Section 10 — Commercial Grants and Metering Evidence (R1.4)

## Goal and boundaries

Implement optional commercial authorization/evidence on durable sessions without moving commercial decisions or balances from Spec 280 and the canonical ledger.

## Requirements

- Bind an immutable optional commercial snapshot to tenant, canonical job, capability/release digest, actor/beneficiary, invocation ancestry, policy revision and grant ID. Non-commercial jobs omit the binding and preserve existing behavior.
- Issue bounded signed Execution Grants for declared effect classes and maximum disconnected duration/usage. Expiry, revocation or budget exhaustion blocks new metered effects without falsely marking the job terminal.
- Pin paid capability release digest and ensure recovery cannot silently upgrade or change release, tenant attribution, source channel or nested invocation ancestry.
- Runner emits usage/failure evidence only. Receipts have stable ID/sequence, are durable, at-least-once, deduped server-side and protected from ordinary output spool pressure. Runner cannot mutate balance or settle.
- Record failure-origin evidence separately from billing decision. Enforce protected hosted Skill IP boundary: source is not checkpointed; secrets/provider credentials are redacted.
- Define retention/GC rules; preserve unsettled critical evidence and active invocation lineage.
- Reconcile revocation/budget exhaustion through canonical job authority; never rely on deleting local secret bytes as revocation.

## Likely owned files

- Existing Spec 280 commercial authorization/metering integration services and contracts after targeted discovery; new `runnerCommercialGrantService.ts` only if no authoritative owner API exists.
- Rust grant snapshot/evidence receipt modules integrated with Sections 03–04 outbox.
- Additive schema/migration only if no existing Spec 280 evidence owner table can safely represent this; one migration writer and cross-spec boundary review required.

## Acceptance and tests

Cover R1.4 acceptance 1–15. Test disconnected envelope, expiry, revocation, evidence dedupe, release pin, nested lineage, tenant identity, no Runner ledger mutation, critical receipt retention, secrets/IP boundary and non-commercial compatibility.

## Dependencies

Requires Sections 01, 03 and 04. Spec 280/ledger own economic decisions and balances. External billing settlement proof remains gated.

## Implementation record

- No commercial grant or metering implementation was added. Section 03 signature primitives and Section 04 critical receipt storage are not commercial authorization/evidence integration.
- Status: **BLOCKED** pending an authoritative Spec 280 grant/revocation/evidence API and a cross-spec ownership review. No Runner balance mutation or economic claim exists.
