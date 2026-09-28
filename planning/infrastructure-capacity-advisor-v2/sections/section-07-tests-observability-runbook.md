# Section 07 — Tests, Observability, and Runbook

## Objective

Make correctness and operational coverage repeatable for future maintainers and
clear during an incident or capacity review.

## Scope and ownership

Add focused Vitest suites under existing server/shared/client test conventions,
Python pytest coverage for system-health interactions, skill contract tests, and
browser evidence hooks. Add structured logs/metrics for collection duration,
source availability, coverage, namespace mismatch, run queue/lock, LLM latency,
reconciliation corrections, scheduler attempts, and retention cleanup. Logs must
contain run ID/status and safe counters, never secrets or private payloads.

Write a runbook covering policy version, source namespaces, daily timezone,
meaning of each status/action class, stale/partial behavior, manual retry,
target-DB migration/rollback, and interpreting Home Server versus Cloud review.

Define alert/cooldown behavior before wiring critical results into the existing
Admin alert service. Until then, in-panel critical state is the reliable path.

## TDD first

Use the test inventory from `claude-plan-tdd.md` as a checklist and add a test
that proves observability fields remain redacted. Verify known baseline full-repo
diagnostics are reported separately from changed-surface proof.

## Acceptance

A maintainer can identify why a metric is missing/stale/mismatched, why a run
failed or was deduplicated, and what evidence supports a recommendation without
opening raw logs or secrets.

## Dependencies

Sections 01–06. Blocks final release proof.

## UI/UX Contract

N/A for test/runbook ownership; browser acceptance is specified in section 06.

### Target User / JTBD

N/A — no browser surface changes.

### Surface Inventory

N/A — no browser surface changes.

### Component Map

N/A — no browser components.

### State Matrix

N/A — no browser states.

### Responsive Matrix

N/A — no layout changes.

### Accessibility Acceptance

N/A — no user-facing markup.

### Copy Contract

N/A — no user-facing copy.

### Browser Evidence Required

N/A — browser proof is owned by section 06 and 08.
