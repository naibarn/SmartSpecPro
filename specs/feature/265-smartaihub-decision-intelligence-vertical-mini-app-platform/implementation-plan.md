# Spec 265 Implementation Plan

## Dependency decision

Spec 266 is the prerequisite authority. Implement Spec 265 only against versioned 266 contracts: no duplicate registry, research provider, evidence store, scheduler, workflow, chat, task, billing, or map renderer. Existing 260/262 and 261 remain their owners. Protected branch and dirty worktree require focused, non-destructive edits and no commit/stage/deploy.

## Ordered phases

1. **265-A — Domain persistence/contracts:** project/question/template/scenario/immutable analysis/claims/evidence references; tenant scoped and version pinned.
2. **265-B — Planning/calculation:** intent/template matching, EvidencePlan, missing evidence, reproducible calculations/readiness/explainability/safety.
3. **265-C — Shared services and integration:** 266 DataRequirement resolution; ResearchNeed adapter only after 266 v1 contract and job gates; existing Chat/Task Control integration.
4. **265-D — Workspace/map/field capture:** established chat panel and Spec 262 renderer; no second UI authority; feature surfaces show functional states and real data.
5. **265-E — Watches/retention/commercial/mini-apps/ecosystem:** new immutable runs, canonical jobs/notifications, SPAAS packs and billing; no legacy `/workflows`.
6. **265-F — evaluation, migration, acceptance and release gates:** per-criterion proof; preserve genuine external/professional/provider/production gates.

## Repository evidence

- Read-only audit found no DecisionProject, DecisionTemplate, AnalysisRun, ResearchNeed, Decision router/service/UI implementation.
- Existing `worker_jobs` + outbox and producer gateway are the only async admission boundary.
- `geoSources` is an upstream 260/262 adapter input, not a Spec 266 resolver.
- Existing Chat and Task Control are canonical; use references/actions only.
- Do not run repository typecheck per AGENTS.md. Use focused Vitest and `git diff --check`.

## Section manifest

Sections map all Spec 265 normative requirements to code/tests or a verified external gate. A local feature slice does not prove production DoD.

## Completion semantics

Decision runs are immutable and tenant-scoped. Every result pins template, policy, evidence, calculation and methodology versions. Missing/ambiguous/unadmitted evidence remains a visible gap. Production is gated by §53.
