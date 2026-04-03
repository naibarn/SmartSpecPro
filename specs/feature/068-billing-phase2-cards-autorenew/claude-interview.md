# Claude Interview — Feature 068

## Product assumptions captured

### Why Phase 2 now

Phase 1 already covers manual renewal and Beam QR. The next product step is reducing renewal friction for stable paying subscribers while preserving legal invoice handling and recovery safety.

### What must stay true from Phase 1

- invoice remains the business document of record
- taxes, numbering, snapshots, and document rules stay unchanged
- reconciliation and exactly-once business effects remain central
- admin must still be able to recover and inspect failures

### Main stakeholder concerns inferred

- finance needs auditable consent and masked card visibility
- support needs retry/fallback tools
- users need simple card management and clear auto-renew controls
- engineering needs provider-agnostic structures and bounded failure states

## Open product decisions to leave explicit

- whether auto-renew failure falls back to manual collection immediately or only after final retry
- whether some plan tiers remain permanently manual-invoice only
- what decline categories Beam exposes for retry classification
- whether payment-method management is available to all tenants immediately or cohort-gated first
