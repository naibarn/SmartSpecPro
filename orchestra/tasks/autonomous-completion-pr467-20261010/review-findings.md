# Review Findings

## Round 1 — read-only reviewer

- `MUST_FIX` (P2): aggregate backlog/free capacity could overstate job-specific dispatchability. Fixed by renaming `idleWithBacklog` to `backlogWithFreeWorkerCapacity` and documenting that compatibility remains scheduler authority.
- `VERIFY_ONLY` (resolved): added an assertion in `workerJobs.test.ts` that the admin tRPC summary returns the new field; the focused service + router run passed at source commit `8d8e67452d3539d3c2bb1701190894b7b0b226a9` (15 passed, 2 DB integration tests skipped).
- `DEFER_OPTIONAL`: current admin UI does not display the new signal. Existing UI already shows queued counts and capacity; the new API field is machine-readable. UI presentation is a separate slice.
- `MUST_FIX`: test-design GREEN evidence was stale. Updated with the focused Vitest result; rerun after the semantic repair is required.

Round 1 status: findings fixed or explicitly scoped; later focused test and review rounds closed the verification follow-up.

## Round 2 — read-only reviewer

- `PASS`: aggregate-capacity naming/comment removes the per-job placement claim.
- `MUST_FIX` (evidence): reviewer observed test-design GREEN claims ahead of the rerun. Fixed by rerunning the focused service and route tests on the updated code (15 passed, 2 DB integration tests skipped) and recording the revision in test-design, plan, progress and audit report.
- `DEFER_OPTIONAL`: UI rendering remains out of this backend/API slice and is recorded as residual scope. Route response coverage is verified by a mocked handler pass-through assertion, not DB-backed derivation or browser rendering.

Round 2 findings resolved; one clean review round remains before opening the implementation PR.

## Round 3 — clean read-only review

- No remaining material issue found. Signal naming/comment and all task evidence consistently state aggregate worker capacity, not job-specific dispatchability. Test evidence is fresh and records 7 passed / 2 DB tests skipped.

Review convergence is clean for the aggregate logic and route contract. The reviewer confirmed the route assertion covers field forwarding and service scope; DB derivation, middleware behavior, and UI rendering remain outside this pass. Latest focused run: 15 passed, 2 DB integration tests skipped at `8d8e67452d3539d3c2bb1701190894b7b0b226a9`.
