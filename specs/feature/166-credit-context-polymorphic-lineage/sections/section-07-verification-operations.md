# Section 07 — Verification, Observability, and Operational Closure

## Goal

Run the complete proof loop, close cross-section gaps, and document exactly what
is locally proven versus what still requires authenticated staging/production.

## Dependencies and owned files

Depends on sections 01–06. Own only Feature 166 test/evidence/runbook updates;
do not modify unrelated dirty worktree paths.

## Required verification

Run focused tests for schema/migration contracts, resolver/linking, central
billing/reservations/Skill, backfill/audit/caller guard, report/router, and
Credits UI. Run full `npm --workspace apps/web test` where resources permit;
separate pre-existing/baseline failures from Feature 166 failures. Run focused
and, if feasible, workspace TypeScript checks. Do not claim DB migration,
production backfill, browser, provider replay, or deployment evidence unless
actually executed.

Run caller inventory and lineage audit in read-only/dry-run mode, retain JSON
evidence, and compare direct-ledger charged/refund/net/count totals against the
report service fixture. Validate migration journal ordering, UUID/default/FK
parity, index/report gate, flags default-off, tenant isolation, watermark and
export range behavior. Capture query plans with representative 10x fixture if
DB integration is available.

Verify all locked metrics are bounded/redacted: create/reuse/link,
unattributed/ambiguous/reconciliation, orphan/cross-tenant/idempotency/state,
audit failure, backfill deferred, export, missing tenant, integrity exception,
and report latency. Ensure operational audit uses existing logger and no raw
prompts/tokens/provider payloads.

Run an adversarial cross-section review: section 01 exported names match later
imports; section 02 owns all link writes; section 03 does not introduce a second
ledger; section 04 does not guess; section 05 uses one accounting predicate;
section 06 consumes only safe response objects; section 07 reports evidence.
Fix all concrete blockers and rerun affected tests, up to three debug attempts
per failure with logs after two failed fixes.

## TDD/acceptance checklist

- Every spec requirement has implementation/test/evidence or an explicit
  external-proof status.
- No TODO placeholder, unclassified production caller, duplicate primary,
  cross-tenant link, unauthorized label, or raw-ID normal label remains.
- Focused test command, typecheck, audit JSON, migration checks, and browser
  evidence commands are recorded in the final handoff.
- Runbook clearly states no local production migration/backfill.

## Implemented locally

Focused tests (5 files, 22 tests) and caller audit were rerun after final fixes.
The final AST guard reports 212 entries: 122 context-aware, 80 explicit
legacy-unattributed, 10 scoped central-writer entries, zero ledger bypasses,
and zero unclassified callers. The normal
workspace typecheck was attempted; it is blocked by unrelated baseline
TypeScript errors and default-heap OOM, while Feature 166 test files pass.
The full workspace suite completed with broad pre-existing mock/environment
failures (19,039 passed, 2,506 failed, 101 skipped); the final evidence log
records this boundary explicitly.
