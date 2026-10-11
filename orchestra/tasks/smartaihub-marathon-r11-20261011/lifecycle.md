# R11 Lifecycle

| Stage | Status | Evidence / next action |
|---|---|---|
| DISCOVERY | COMPLETE | Canonical source `d3d6e9d9`; R10 PRs merged; current primary checkout preserved dirty. |
| PLANNING | COMPLETE | Scope/risk and policy approval boundary in `plan.md`. |
| IMPLEMENT | COMPLETE, PARTIAL OUTCOME | Resolve existing successful `workspace.authority.safe_action` job outputs from canonical worker-job persistence and require them in both completion paths. |
| TEST | PASS, SYNTHETIC | Six focused Vitest files / 40 tests passed, including fabricated worker-object denial and Runner snapshot-envelope mismatch. Python bounded resolver regression remains 53/53 from canonical source. |
| REVIEW | PASS WITH OPEN POLICY GATE | Reader validates scoped job type/status, tenant/actor/project/repository/action, Runner snapshot envelope, inner receipt identity, run binding, target and integrated SHA. Delivery-mode change remains inactive pending owner/security approval. |
| VERIFY | PASS FOR BOUNDED AUTHORITY SLICE | `py_compile` and 57 workspace-authority tests passed; post-integration 57-test rerun passed at main SHA `5bc461753c6fbf968b9874257892631ad8c4b089`. PR #694 `git_lifecycle` and `progressive_integration_gate` passed. |
| FINAL_VERIFY | BLOCKED, EXTERNAL AUTHORITY | Shared test DB read-only inventory has no trusted fresh Runner and no DevelopmentRun table. No genuine authority-issued lifecycle evidence or post-restart terminal readback can be produced safely. Keep `RUN_COMPLETED` fail-closed without real authority evidence. |
| CANONICAL WORKSPACE CONVERGENCE | BLOCKED, RESOURCE/TIMEOUT | After PR #694 integrated the 15-second deadline repair, one bounded convergence attempt returned `CONVERGENCE_TIMEOUT` and `workspace_state=UNKNOWN` before recovery capture. No receipt or archive was created; primary contents were unchanged. Do not retry without changed filesystem/authority conditions. |

## Open gaps

- `R11-RECEIPT-READER`: the reader now resolves successful action output from canonical worker-job persistence. Remaining proof: real registered Runner action and durable post-restart readback. Owner: Spec 224/workspace-authority maintainers; next: provide an owner-authorized disposable Runner registration/snapshot on a fixture target.
- `R11-DELIVERY-POLICY`: server-managed canonical delivery requires SPEC-224 owner and security approval plus trusted target-policy authority. Proposal and executable acceptance matrix: `policy-proposal.md`. Default remains existing convergence contract.
- `R11-LIVE-RUNNER`: bounded read-only inventory of local `smartspec_test` found 0 trusted, non-revoked Runner nodes with fresh snapshots. Source trust, job-specific budget, evidence storage, and independent verifier authority remain unproven; protected dispatch stays DENY. Next: owner provisions/identifies an authorized disposable Runner and validates those exact capability bindings.
- `R11-DISPOSABLE-POSTGRES-ACCEPTANCE`: shared `smartspec_test` includes `runner_nodes` but no DevelopmentRun table; it was not modified. The production service adapter depends on the app schema and no supported disposable complete schema/authority fixture is configured in this worktree. Next: use owner-approved disposable database plus genuine fixture authority; do not seed receipt-shaped objects.
- `R11-REAL-GIT-ACCEPTANCE`: no new disposable remote/ref was created because no trusted integration/receipt authority is available and R10 already proved isolated Git patch/repair milestones. Next: execute through the guarded authority flow when fixture Runner and, if needed, server-managed target approval are available.
- `R11-CANONICAL-WORKSPACE-CONVERGENCE`: PR #694 integrated the deadline-aware path at `5bc461753c6fbf968b9874257892631ad8c4b089`, but one bounded attempt on the registered dirty checkout returned timeout/unknown before recovery capture. Owner: canonical workspace owner / workspace-authority maintainers; next: inspect filesystem latency or owner-held activity using a different bounded diagnostic path, then retry only after a changed condition. The primary remains untouched; no convergence receipt exists.

Resume point: receipt trust-boundary code is in main via PR #691 (`0683e8eec2324672355e3329f9d05a987462f6b7`); bounded convergence repair is in main via PR #694 (`5bc461753c6fbf968b9874257892631ad8c4b089`). The 57-test suite and both PR #694 gates passed; the first bounded primary attempt returned timeout/unknown and was not retried. Next: obtain new filesystem/owner evidence before another convergence attempt; separately resume disposable Runner/PostgreSQL acceptance when authorized. Keep R10 evidence PARTIAL and unchanged.

## Post-checkpoint WorkUnit selection — 2026-10-11

- PR #695 merged the durable bounded-convergence outcome at `7d833297dd25566d1e9b99145bc24ec199258d5a`; its progressive integration gate passed. The bounded canonical selector returned only generic `CONTINUE_REQUIRED` records, not a SPEC-224 READY WorkUnit.
- Targeted read-only review of `LANE1_REMOTE_TRUST_VERIFIER_AUTHORITY_DISCOVERY` confirmed that `spec224RemoteSourceTrustVerifier.ts` defines the authority interface but has no non-test production caller/authority adapter in `apps/web/server`. Existing handoffs say the remote path remains deny-only pending approved issuer/storage/revocation authority and owner evidence. This candidate is therefore `WAITING_AUTHORITY`, not dispatchable implementation.
- Next reactivation predicate: owner identifies/provisions an approved remote verifier and trusted issuer/configuration, or supplies an authorized disposable Runner/PostgreSQL fixture for R11 acceptance. Until then, no independent R11 WorkUnit is READY; preserve `RUN_COMPLETED` fail-closed, protected dispatch DENY, and R10 PARTIAL.
