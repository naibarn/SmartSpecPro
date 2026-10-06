# Global Views and Migration

## Goal
Generate per-Spec human status and repository-wide index, reconciliation report, continuation queue, and ambiguity views from manifests/ledgers, then migrate every valid canonical Spec without changing its normative requirements.

## Scope
Create atomic/idempotent generation, stale checks, filters, global invariants, migration execution and counters. `STATUS.md` is generated only. No feature implementation or Spec document rewrite.

## User-Facing Behavior
Users can query COMPLETE, current/active/incomplete, validation-only, continue, do-not-continue, supersession, retirement/history, low confidence, authority conflict, stale evidence, and true blockers.

## Technical Constraints
Index record set equals discovered canonical record set exactly once. Invalid candidates are retained in reconciliation report. Generated artifacts have deterministic ordering and provenance.

## Dependencies
Splits 01, 02, and 03. Migration must preserve explicit manual decisions and use dry-run by default.

## Outputs
`specs/_status/spec-index.json`, `SPEC-STATUS.md`, `reconciliation-report.json`, `continuation-queue.json`, per-Spec handoff artifacts, stale/index/status/validate commands, migration report.

## Edge Cases
Spec changes after reconcile; status markdown edited by hand; repeated migration; duplicate canonical IDs; partial supersession; no valid requirement extraction.

## Error Handling
Atomic writes prevent truncated records. Generated drift is detected/regenerated. Any discovery/index mismatch fails the invariant gate and prints missing/extra record keys.

## Testing Expectations
Full filesystem fixture migration, deterministic byte comparison across reruns, index equality, generated view drift, stale invalidation, duplicate/invalid retention, dry-run no-write, and counters.
