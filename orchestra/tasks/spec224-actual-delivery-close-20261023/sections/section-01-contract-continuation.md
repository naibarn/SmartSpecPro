# Section 01 — Contract and Continuation

- **Requirement IDs:** R1, R2, R3, R4, R5, R10
- **Objective:** Close code-level contract gaps without changing unrelated SPEC-224 architecture.
- **Owned paths:** Mini-App factory pipeline/state/executor/runtime, personal preview/repository services, App Home/continuation route and their focused tests.
- **Prerequisites:** Canonical `main` at or ahead of `cb3ca17b2d88a9126e57dcd27af15b4191400b0d`.
- **Deliverables:** Trusted browser evidence transition to USER_TRIAL_READY; explicit PREVIEW_AVAILABLE / VERIFICATION_PENDING behavior; managed and user-owned per-app repo bindings; no Core repo/SHA fallback; App Home survives failure; same appId/source/repository/artifact history on continuation; protected Runner path unchanged.
- **Verification:** Focused Vitest suites for durable state, executor, stage worker, repository, identity, private preview, App Home and spec226 control.
- **Completion predicate:** All scoped tests pass and changes are integrated in canonical main; no test fabricates browser evidence.
- **Evidence:** Commit SHA, test command/results, changed paths, and any provider/repo wait state.
- **Fallback:** Preserve content-addressed source and last-known-good artifact if repository provisioning or build fails.
- **Blocker challenge:** Inspect existing repo-authority/config and evidence APIs before adding interfaces. Use existing policy and worker state; no new approval framework.
- **Waiting/reactivation:** If real repository authority is absent, keep the source snapshot and retry predicate in App Home; continue other personal stages. If no independent browser receipt exists, remain VERIFICATION_PENDING.
