# Implementation Plan — Complete Spec 214 v4

## Context and outcome
Spec 214 owns semantic Node Type declarations, not execution. SmartSpecPro already has a partial TypeScript implementation and consumers. This plan completes the existing contract in place, adds tests and R20 evidence, and preserves Spec 215/Feature 195 ownership. It deliberately does not perform destructive legacy cutover because deployed workflow data inventory is absent.

## Architecture and ownership
- Canonical module: `apps/web/server/services/workflowNodeContracts.ts` (types, frozen manifests, digest validation, registry, projection, instance validation, extension admission).
- Spec 215 consumer: `workflowCompilerRuntimeContracts.ts`; only validate/consume declared Spec 214 contracts and preserve its own interface/bindings/scopes/policies/instrumentation/execution-plan responsibilities.
- Spec 209 facade: `workflowStudioCanonicalAdapter.ts`, `workflowStudioContracts.ts`, `workflowStudioRuntime.ts`, `workflowBuilderCompiler.ts`, `routers/workflowStudio.ts`. These may convert, validate, search, and build authoring candidates; they do not own a duplicate registry.
- R20 proof artifacts: feature 212 coverage manifest and machine-readable disposition artifact for Appendix A. Tests validate identity and local static conformance only.
- Physical jobs: Feature 195 `worker_jobs` + outbox only.

## Data and security constraints
No migration or persisted-definition deletion is planned. Registry manifests are immutable and digest-checked. Never persist secret values, runtime state, or provider credentials in node config/metadata. Derived effects use conservative preflight declarations and block until resolved. Unknown bindings and historical manifests fail closed. Any production cutover requires a separately evidenced inventory and rollback plan.

## UI/UX contract
- Target user/job: workflow authors and AI Builder consumers selecting typed nodes; the current task preserves existing authoring behavior while making its contracts honest and typed.
- Route/surface inventory: no browser route or visual surface changes are planned; the existing Studio API/service boundary is the only integration surface.
- Component map/ownership: no component changes; `workflowStudio` service/router owns façade validation and existing React components remain untouched.
- State matrix (loading, empty, error, success, disabled, hover, focus, selected): N/A because no UI state is changed; API blocked/error result codes must remain explicit.
- Responsive matrix (mobile, tablet, laptop, desktop): N/A because no layout changes are planned.
- Accessibility acceptance (keyboard, focus, labels, semantics, contrast, reduced motion): N/A because no rendered control changes are planned.
- Visual direction/token strategy: N/A; do not style or redesign the Workflow Studio surface as part of a contract change.
- Copy contract (Thai/English labels, validation/error, empty/loading/success, fallback): no new user-facing copy; preserve localization behavior and expose stable reason codes to existing presentation layer.
- Browser evidence: not required for server/shared-contract-only changes. If implementation adds or changes browser-visible behavior, pause that change until responsive/accessibility/browser evidence is added.

## Section sequence and acceptance
See `sections/index.md`; sections 01–08 are ordered by dependencies. Each has tests that fail before its implementation. No section may claim provider readiness from a syntactically valid binding.

## Failure and recovery
Each failing focused gate returns to the earliest affected section/TDD stage. After at most two ordinary targeted attempts, collect concrete failure output and inspect the owning boundary before a third repair. Preserve all unrelated dirty state. Do not use broad staging or commit because the branch is `main` with many unrelated staged/unstaged/untracked edits.

## Verification
Run section-focused Vitest suites in `apps/web`; run R20 and disposition JSON integrity tests; run relevant Node scripts only if added; run `git diff --check`; scan the changed paths for forbidden retired systems and stale claims. Do not run `npm run typecheck` or `npm run check` (AGENTS.md). Browser, provider, deployment, and production DB evidence are separate and must be reported as unavailable unless executed through authorized runtime proof.

## Completion and review loop
Complete all eight sections in manifest order. Then perform ten numbered review rounds covering requirement traceability, source ownership, schema completeness, validation boundaries, secret/runtime leakage, binding readiness, adapter migration boundaries, corpus/disposition integrity, regression/test adequacy, and final impact/stale-gate closure. Fix safe in-scope findings immediately, update lifecycle and rerun stale gates, and continue until the user-requested minimum is met. This explicit minimum supersedes Orchestra's default eight-round ceiling; repair attempts remain evidence-led and capped at three for an individual failing gate.
