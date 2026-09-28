# Plan Self-Review — Round 1

## Scorecard

| Category | Result | Notes |
|---|---|---|
| Structural integrity | PASS | Eight sections describe roles, inputs, ordered waves, evidence, stop conditions and the Spec 245 handoff. |
| Completeness vs spec/interview/research | PASS after fixes | Preserves G2 fresh-PostgreSQL semantics, no Redis-only rollback, PG-only JTI, safe maintenance and separate future DO scope. Official DO per-object/private-storage and restart behavior are represented. |
| Implementability | PASS after fixes | Names current source/importer/test surfaces, required artifacts, owners, gated operations and no-schema-change assumption. Unknown Production facts remain explicit gates. |
| Internal consistency | PASS | Recovery uses current PG-backed code; future DO promotion is a later wave; Spec 245 remains the system plan. No language implies the present service mask may be removed based on local work. |
| Edge cases and failure modes | PASS after fixes | Covers partial import, late writer, unknown target, active device/pairing records, keyring mismatch, failed health, external origins and non-G2 Redis consumers. |

## Findings and changes made

1. The first draft could be read as allowing active device/pairing rows to be imported even though the discovered guarded scripts only cover JTI and login counters. Corrected the plan to retain and drain those rows through normal lifecycle; a new, separately reviewed migration is required if they do not drain.
2. The service reopen step named unit order but did not explicitly fence public/origin traffic until both health checks pass. Added this as a prerequisite to starting the watchdog/reopening traffic.
3. Kept the unresolved stable-scan quiet interval as an owner/evidence choice informed by measured writer/scheduler behavior. The plan must not invent a duration from stale snapshots.

## Limits

- Review covers the written plan and current checked-in source evidence only.
- The latest documented Production state is historical and not a maintenance-fenced scan for the current date.
- This review does not authorize data changes, service operations, deployment, or Production readiness.
