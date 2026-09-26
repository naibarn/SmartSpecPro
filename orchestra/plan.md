# Orchestra Plan — Spec 214 Completion

## Task classification
- Scope: large; canonical contracts, authoring integration, compiler boundary, corpus coverage, migration safety, and conformance verification.
- Risk: high; node semantics and persisted workflow definitions are shared product contracts. No production deployment or destructive migration is authorized by this repo-local task.
- Route: standard-light direct conductor; explicit `deep-plan` followed by `deep-implement` as requested.
- Implementation target: SmartSpecPro repo root; planning directory `specs/feature/214-node-type-contract-architecture/`.
- Worktree: heavily dirty before task. Preserve all unrelated changes; no broad staging, reset, stash, or commit.
- Research: SocratiCode unavailable; targeted shell evidence used. Web research not needed because scope is existing repo contracts, not changing an external API.
- Retired systems: do not use Agency, `work/request(s)`, `workpacks/*`, `/workflows` legacy engine, OpenSandbox, `sandbox_jobs`, or Docker dispatch.

## Existing implementation snapshot
`workflowNodeContracts.ts` already contains 16 v4 core IDs, manifest digesting, registry lookup/search, and instance secret/runtime-key checks. The manifest shape is partial relative to Spec 214. `workflowCompilerRuntimeContracts.ts` has partial WorkflowDefinitionV2/Spec 215 v3 compiler contracts. Studio adapter/compiler/runtime and focused tests exist in the dirty worktree. Feature 195 `worker_jobs` remains the physical durable job authority.

## Non-negotiable proof boundaries
- Code/contracts and focused local tests do not prove live provider generation, production data inventory, deployed route activation, or Spec 212’s 5,860 authenticated prompt executions.
- Do not delete or rewrite historical type registrations or persisted workflow data without the required read-only production inventory and rollback evidence. Implement fail-closed canonical authoring and local conformance safely first.
- Preserve migration `0341_feature_209_workflow_studio.sql` and all unrelated worktree state.

## Delivery waves
1. Evidence, spec synthesis, and TDD section plan.
2. Canonical v4 manifest/type/validation completeness.
3. Registry/version/search and binding-derived contract resolution.
4. Studio/AI Builder canonical node selection and compiler boundary integration.
5. Extension admission, legacy-name disposition guard, and R20 static corpus coverage.
6. Focused tests, implementation review, 10+ gap-convergence passes, lifecycle closeout.

## Verification policy
Use focused Vitest suites for changed contract/service/router modules, focused Python/Node static validators where applicable, `git diff --check`, corpus identity/localization checks, and forbidden-system scans. Never run repository `typecheck` (AGENTS RAM policy). Browser/live provider/production-data checks are reported separately if unavailable.

## Loop policy
- mode: standard-light inline conductor
- minimum convergence rounds requested: 10
- max implementation retries per failed focused gate: 3 before evidence-led debug/backtrack
- subagents: none unless a skill-required independent review step is needed and has a bounded ownership scope
- stop only for destructive/external action or unresolved product decision; continue local safe work meanwhile.
