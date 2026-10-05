# Section 11 — Certification Integration and Rollout

## Goal and boundaries

Integrate section contracts and establish evidence for Spec 278 §67A tiers. Local code completion does not equal production beta certification.

## Requirements

- Produce traceability from each AC-01..AC-40 and R1.4 AC to implementation, automated test, and any external evidence gate.
- Run cross-section compatibility/fault matrix for Worker restart, host restart, control disconnect, authority expiry, cancel/approval, command ack loss, session inventory scale, update/rollback, resource contention, checkpoint restore, Cloudflare replacement, output pressure and commercial evidence retry.
- Verify database migration journal/order/snapshots and additive/rollback compatibility. Do not run migrations against production here.
- Default experimental flags to off. Define independent tier gates: internal soak, limited single-tenant local beta, shared/multi-tenant, checkpoint/reconstruction, Cloudflare. Do not advance a tier on source tests alone.
- Record environment, runner/host/driver versions, evidence IDs, timestamps, failure signals and resource sample for certification. Keep secrets redacted.
- Publish operations guidance for stalled recovery, incompatible protocol, corrupt registry, grant expiry, outbox retry and safe cleanup. Active/unreconciled sessions cannot be garbage-collected.

## Likely owned files

- `specs/feature/278.../spec.md` traceability and implementation status appendices, Runner README/operations docs, scoped fault/integration tests, CI workflow updates only where OS coverage is missing and change scope is safe.
- `sections/index.md` and implementation records updated with actual evidence and blocked external certification items.

## Acceptance and tests

Cover all local AC plus Tier A–E boundaries. Run the focused integrated test set, migration check and any required focused browser test. Explicitly classify resource exhaustion as resource-blocked and baseline failures separately.

## Dependencies

Requires Sections 01–10. Any unimplemented external provider, platform or production requirement remains a named blocker; no false complete status.

## Implementation record

- Added requirement/status and evidence ledger at `implementation/traceability.md`; local focused suites and external gates are listed separately.
- Status: **BLOCKED** for certification. No DB migration was applied, no live host restart/re-attach, browser, Cloudflare/provider, shared-host enforcement, or commercial settlement evidence was collected. Experimental projection remains off by default.
