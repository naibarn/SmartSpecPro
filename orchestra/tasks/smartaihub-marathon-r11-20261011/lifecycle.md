# R11 Lifecycle

| Stage | Status | Evidence / next action |
|---|---|---|
| DISCOVERY | COMPLETE | Canonical source `d3d6e9d9`; R10 PRs merged; current primary checkout preserved dirty. |
| PLANNING | COMPLETE | Scope/risk and policy approval boundary in `plan.md`. |
| IMPLEMENT | COMPLETE, PARTIAL OUTCOME | Resolve existing successful `workspace.authority.safe_action` job outputs from canonical worker-job persistence and require them in both completion paths. |
| TEST | PASS, SYNTHETIC | Six focused Vitest files / 40 tests passed, including fabricated worker-object denial and Runner snapshot-envelope mismatch. Python bounded resolver regression remains 53/53 from canonical source. |
| REVIEW | PASS WITH OPEN POLICY GATE | Reader validates scoped job type/status, tenant/actor/project/repository/action, Runner snapshot envelope, inner receipt identity, run binding, target and integrated SHA. Delivery-mode change remains inactive pending owner/security approval. |
| VERIFY | PENDING PROMOTION | Run final diff/security/fast integration gate on exact reconciled candidate; full typecheck/build remain prohibited/pending. |
| FINAL_VERIFY | BLOCKED, EXTERNAL AUTHORITY | Shared test DB read-only inventory has no trusted fresh Runner and no DevelopmentRun table. No genuine authority-issued lifecycle evidence or post-restart terminal readback can be produced safely. Keep `RUN_COMPLETED` fail-closed without real authority evidence. |

## Open gaps

- `R11-RECEIPT-READER`: the reader now resolves successful action output from canonical worker-job persistence. Remaining proof: real registered Runner action and durable post-restart readback. Owner: Spec 224/workspace-authority maintainers; next: provide an owner-authorized disposable Runner registration/snapshot on a fixture target.
- `R11-DELIVERY-POLICY`: server-managed canonical delivery requires SPEC-224 owner and security approval plus trusted target-policy authority. Proposal and executable acceptance matrix: `policy-proposal.md`. Default remains existing convergence contract.
- `R11-LIVE-RUNNER`: bounded read-only inventory of local `smartspec_test` found 0 trusted, non-revoked Runner nodes with fresh snapshots. Source trust, job-specific budget, evidence storage, and independent verifier authority remain unproven; protected dispatch stays DENY. Next: owner provisions/identifies an authorized disposable Runner and validates those exact capability bindings.
- `R11-DISPOSABLE-POSTGRES-ACCEPTANCE`: shared `smartspec_test` includes `runner_nodes` but no DevelopmentRun table; it was not modified. The production service adapter depends on the app schema and no supported disposable complete schema/authority fixture is configured in this worktree. Next: use owner-approved disposable database plus genuine fixture authority; do not seed receipt-shaped objects.
- `R11-REAL-GIT-ACCEPTANCE`: no new disposable remote/ref was created because no trusted integration/receipt authority is available and R10 already proved isolated Git patch/repair milestones. Next: execute through the guarded authority flow when fixture Runner and, if needed, server-managed target approval are available.

Resume point: reconcile latest canonical source and integrate the safe receipt trust-boundary slice. Resume positive acceptance only when owner-provisioned disposable Runner/PostgreSQL authority is available or policy approves a fixture target. Keep R10 evidence PARTIAL and unchanged. Do not retry the primary checkout resolver.
