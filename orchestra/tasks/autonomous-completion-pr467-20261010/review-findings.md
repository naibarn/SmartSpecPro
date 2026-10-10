# Review Findings

## Round 1 — read-only reviewer

- `MUST_FIX` (P2): aggregate backlog/free capacity could overstate job-specific dispatchability. Fixed by renaming `idleWithBacklog` to `backlogWithFreeWorkerCapacity` and documenting that compatibility remains scheduler authority.
- `VERIFY_ONLY`: review found no route-level assertion for the response field. The focused unit tests verify the decision kernel; admin tRPC path is additive, but route integration remains unproven and is recorded as residual scope.
- `DEFER_OPTIONAL`: current admin UI does not display the new signal. Existing UI already shows queued counts and capacity; the new API field is machine-readable. UI presentation is a separate slice.
- `MUST_FIX`: test-design GREEN evidence was stale. Updated with the focused Vitest result; rerun after the semantic repair is required.

Round 1 status: findings fixed or explicitly scoped; fresh focused test and clean review round pending.

## Round 2 — read-only reviewer

- `PASS`: aggregate-capacity naming/comment removes the per-job placement claim.
- `MUST_FIX` (evidence): reviewer observed test-design GREEN claims ahead of the rerun. Fixed by rerunning the focused file on the updated code (7 passed, 2 DB integration tests skipped) and recording the timestamp/revision relationship in test-design, plan, progress and audit report.
- `DEFER_OPTIONAL`: route integration and UI rendering remain out of this backend-only slice and are recorded as residual scope.

Round 2 findings resolved; one clean review round remains before opening the implementation PR.

## Round 3 — clean read-only review

- No remaining material issue found. Signal naming/comment and all task evidence consistently state aggregate worker capacity, not job-specific dispatchability. Test evidence is fresh and records 7 passed / 2 DB tests skipped.

Review convergence: one clean round after repairs; stop reason is scoped slice ready for protected PR, while the larger RFC outcome remains partial.
