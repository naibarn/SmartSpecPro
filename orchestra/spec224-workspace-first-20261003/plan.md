# Spec 224 Workspace-First Implementation

## Classification
- Scope: large; Chat/client + tRPC + PostgreSQL + Runner execution boundary.
- Risk: high; tenant authorization, archive parsing, workspace mutation and autonomous execution.
- Branch/worktree: `codex/spec224-workspace-first-20261003` at `/home/dev/worktrees/spec224-workspace-first-20261003`, based on `origin/main`.
- User authorization: implement the Spec 224 Revision 21 scope and close previously identified gaps; no additional confirmation required.
- Dispatch: one read-only implementation scout completed; one backend/schema writer planned; conductor owns UI/runtime integration.
- Resource limits: no repo-wide typecheck/build/E2E. Never invoke npm run typecheck. Use only focused tests and static checks.
- Discovery fallback: no specialized code index used; targeted `rg`, source reads, existing tests and git refs.

## Goal
Make the existing Chat Task Control surface start and continue user-controlled Spec 224 work against an explicitly selected registered Runner workspace, accept prompt or multi-file Markdown/JSON/ZIP Spec Sets, compile runnable independent work packages, and preserve canonical authorization, worker_jobs state and scoped verification truth.

## Confirmed baseline
- DevelopmentRun persistence, admission/authorization and Runner continuation/reconciliation are implemented in slices.
- Task Control currently requires manual workspace/repository/base/plan/context fields.
- Chat generic attachment is separate from Spec 224; no Spec Set manifest/ZIP importer exists.
- Spec baseline + closure DAG are reusable primitives, but no production multi-artifact compiler exists.
- Runner snapshots expose opaque registered workspace IDs only; they do not expose paths, git head, or structured build/test results.
- Full verification is intentionally fail-closed as `FULL_VERIFICATION_RUNTIME_NOT_CONFIGURED`.

## Delivery sequence and current result
1. **Implemented in source (focused tests pass):** persistent Chat→registered Runner workspace binding, shared immutable multi-artifact Spec Set revisions, safe `.md`/`.json`/`.zip` intake, sanitized workspace Git facts, and immutable revisions.
2. **Implemented in source (UI tests pass):** workspace selection for the active Chat conversation, prompt and multi-file Spec modes, upload/revision preview, and preparation separated from execution.
3. **Implemented in source (focused tests pass):** deterministic cross-file requirement/work-package compilation. Only fully declared packages with resolved requirements/dependencies, acceptance criteria, verification obligations, and safe write sets are runnable; independent packages can remain runnable while others are blocked. Revision impact tracks affected packages.
4. **Implemented in source (focused tests pass):** authenticated task-input staging from pinned prompt/SpecSet bytes to the existing Runner command using durable immutable source + ephemeral lease-bound fetch grant; no content or fetch credential may enter command/event logs.
5. **Implemented in source (focused tests pass):** server-derived Start DevelopmentRun path pinned to selected workspace and Spec revision, presented as a separate action and left pending existing authorization. Build/test/application-run remain independent user-owned actions; the Chat path does not trigger them.
6. **Still open:** executable Final Verify adapter and live Runner/provider/migration certification. Keep existing fail-closed verifier behavior.

## Stop/claim boundary
Source/tests do not prove live Runner, provider, deployed migration, artifact-store or production certification. The source path supports explicit prompt/Spec-run creation, but Spec 224 is not ready for production certification until workspace freshness is pinned at execution, the verifier is configured, migrations are applied, and connected Runner/provider behavior is proven. Build/test/application-run stay user-owned and separate from prompt/Spec intake and Start.

## Completion plan
See [completion-roadmap.md](completion-roadmap.md) for the ordered closure waves, pass criteria, focused verification matrix, user-owned build/run scope boundary, and stop rules. The roadmap is the active plan for closing the remaining readiness gaps; this file records what this implementation slice delivered and its current claim boundary.

## Orchestra continuation classification (2026-10-04)
- Scope/risk: large/high. This touches React, tRPC, Drizzle, Runner Rust, filesystem mutation, tenant/lease-bound input and runtime certification.
- Route: resume existing implementation in this feature worktree; execute the roadmap as serial contract/security gates followed by independent bounded work where safe.
- User authorization: explicit continuation to finish without waiting for confirmation. Build/test/application-run remain user-operated; do not add a second control plane. Do not touch the dirty primary checkout or unrelated root `orchestra/` (Spec 215).
- Current implementation route: targeted conductor exploration plus one read-only Runner isolation scout. Schema remains single-writer and conductor-owned. No branch rewrite, reset, clean, migration application to shared DB, deploy or production side effect.
- Candidate parallel tasks: Runner/workspace isolation audit (read-only), SpecSet retention/API lifecycle audit (read-only); same-wave writers: none until isolation contract and data lifecycle contract are fixed.
- Sequential reason for implementation: source fingerprint, candidate isolation, write-set enforcement and result reconciliation cross Runner protocol, workspace filesystem and persisted DevRun contracts; one interface decision is required before splitting writers.
- Verification policy: focused behavior tests, Rust targeted tests, relevant UI checks, DB migration proof only on disposable database. Never run repository-wide typecheck/full build/full E2E on shared host.
