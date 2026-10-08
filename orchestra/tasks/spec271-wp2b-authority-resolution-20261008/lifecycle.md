# Orchestra Lifecycle

- Goal: resolve four owner-controlled authorities for SPEC-271 WP2B and enable a bounded, non-production receipt acceptance run.
- Canonical baseline: `203f72646cadd38c9037ca6830b6d57084828c75`.
- Current stage: `WAITING_OWNER_ASSIGNMENT`.
- Workunits: WU-271-WP2B-A through WU-271-WP2B-D are recorded in `plan.md`; all remain `OWNER_ASSIGNMENT_REQUIRED`.
- Runtime wait: unavailable. No SPEC-271 authority predicate adapter or continuation owner is registered; do not claim automatic reactivation.
- Prohibited: production execution/deployment/migration; fabricated approvals or grants; new queue, registry, ledger, storage adapter or spec; edits to SPEC-224, Runner, tenant/retention infrastructure, Lane 1/2 files, or shared projections without their owners' authority.
- Resume point: owner/delegation assignment for the four workunits.
- Resume predicate: the relevant owner accepts the workunit and supplies an authoritative permission/policy reference plus allowed non-production scope. Before runtime continuation is enabled, a registered adapter must recheck that evidence and wake through existing `worker_jobs`/outbox.
- Completion evidence: named owner and approval references; accepted interface bindings; registered recheck predicate; exact-SHA non-production run, receipt persistence/read-back, separate-process replay and process-restart recovery; canonical SPEC-271 handoff.
- Current outcome: `OWNER_ASSIGNMENT_REQUIRED`; SPEC-271 WP2B remains incomplete and no live receipt verification is claimed.
