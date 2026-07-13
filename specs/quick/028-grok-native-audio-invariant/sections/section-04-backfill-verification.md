# Section 04 — Backfill, Observability, and Verification

## Ownership

Standalone catalog backfill/report tool, tests, structured warnings, final
cross-section verification, and documentation updates.

## TDD

Test report/apply mode, shared classifier use, config preservation, backup
artifact shape, restore instructions, and no automatic apply.

## Implementation

- Build report-first TypeScript backfill using the exported classifier.
- Apply mode requires explicit flag and writes a timestamped JSON backup first.
- Emit bounded warnings/counters for metadata repair, compliance retry/fallback,
  and stale-artifact blocks without prompt/dialogue content.
- Run all focused suites, typecheck, diff/check, and manual catalog report.

## Acceptance

Backfill is idempotent/reversible; runtime is safe before it runs; all gates
pass from the final worktree and unrelated dirty changes remain untouched.

