# R11 Receipt Authority Test Design

## Threat and invariant

Worker output, Final Verify input, and receipt references are untrusted locators. Completion requires a read-only lookup from canonical worker-job snapshots for successful `workspace.authority.safe_action` jobs, followed by inner receipt run/tenant/repository/project/target/SHA binding checks. A missing/unavailable lookup must keep the run in `FINAL_VERIFY` and emit no `RUN_COMPLETED` event. This canonical job projection is the current persisted bridge to Python authority output; real Runner-issued positive acceptance remains unproven.

## Cases

| Case | Authority lookup | Expected result |
|---|---|---|
| Valid convergence + retirement rows bound to this run | Both job IDs resolve to successful scoped authority snapshots and inner receipts bind to run | Synthetic service contract passes; live acceptance remains blocked pending trusted fixture Runner |
| Shape-valid worker-supplied objects with no persisted rows | Missing | WAIT; state and events unchanged |
| Receipt from another run or tenant | Row resolves with foreign binding | WAIT / binding rejection |
| Wrong repository/project/target | Row does not match server-owned run target | WAIT / binding rejection |
| Stale integrated SHA or conflicting receipt payload | Persisted row differs from expected current source | WAIT / stale or conflict rejection |
| Missing required check / forged integration state | Canonical integration authority denies or cannot verify | WAIT |
| Missing/invalid independent verification or closure | Workspace receipts may resolve, closure remains incomplete | Existing closure failure; no terminal event |
| Authority unavailable / timeout | No trusted result | WAIT; preserve exact run and no mutation |

## Scope notes

- Existing `workspaceLifecycleEvidenceErrorCode()` remains the legacy receipt-shape/binding validator; it is necessary but not sufficient.
- Production reader queries the existing canonical worker-job projection of authority results. It must not trust a PASS field, object supplied by the verifier, or test-only adapter.
- Unit acceptance with an injected in-memory authority is synthetic service-contract evidence only. Genuine positive R11 acceptance requires an owner-marked disposable Git remote/ref, disposable PostgreSQL, a genuine authorized Runner/action, authority-issued/persisted receipts, independent readback, and restart proof.
- No weaker server-managed delivery policy is active in this slice.
