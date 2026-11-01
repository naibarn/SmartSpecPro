# SPEC-224 Modular SaaS Project Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Specs 312–324 discoverable as one canonical project, compile their existing requirement ledgers into SPEC-224 WorkPackages without changing requirement identity, and expose truthful readiness through Mission Control.

**Architecture:** Reuse the repository-backed `spec224FeatureSpecCatalog`, canonical handoff manifests/ledgers, SPEC-224 SpecSet/DevelopmentRun, and SPEC-294 Mission Control. A small project descriptor under SPEC-312 identifies project membership and package definitions; prerequisite relationships remain in each Spec's existing `dependencies.specs`. Spec/ledger content is snapshotted only as an immutable, digest-bound Run input. Execution remains on `worker_jobs` plus outbox.

**Tech Stack:** TypeScript, tRPC, Drizzle/PostgreSQL, existing `tools.spec_handoff` Python CLI, Vitest, React.

**Spec:** `docs/superpowers/specs/2026-11-01-spec224-modular-saas-project-control-design.md`

## Global Constraints

- Keep normative Specs and canonical handoffs in SmartSpecPro; do not vendor copies into `smartaihub-platform`.
- Preserve stable `requirement_id` values from canonical requirement ledgers.
- Do not create a separate PM task database, scheduler, approval system, or job ledger.
- Resolve deployment targets through `apps/web/scripts/deployment-targets.json`; do not activate production or change live traffic.
- Preserve SPEC-224 source admission, tenant boundaries, write sets, authorization, leases/fencing, and final verification.
- Preserve unrelated dirty work; stage only paths owned by this plan.
- Do not run repository-wide `npm run typecheck` in the shared workspace.

## Review Focus

- Stale Spec or ledger digest: catalog load and ingestion must fail closed before compile.
- Duplicate canonical requirement IDs across Specs: preserve each Spec-scoped row, surface a deterministic collision finding, and never merge rows. Duplicate requirement source keys within one Spec fail closed.
- Missing dependency or dependency cycle: project graph must report a blocker and must not make the affected package runnable.
- Missing acceptance, verification, or allowed write set: package remains blocked with actionable reasons.
- Cross-tenant, non-platform workspace, or stale Runner source snapshot: existing authorization/admission checks must reject ingestion or preparation.
- Partial compile/test/runtime evidence: Mission Control must preserve the exact evidence scope and never present it as whole-Spec or deployed completion.

## Planned Files

- Create `specs/feature/312-smartaihub-modular-saas-rebuild-master-plan/handoff/modular-saas-project.json`: member Spec IDs and initial bounded package declarations; no copied requirement prose.
- Modify the 13 Specs' existing `handoff/manifest.json` only through the shared writer when source evidence proves an edge; generated STATUS/history/index are maintained by existing tooling.
- Modify `apps/web/server/services/spec224FeatureSpecCatalog.ts`: load/validate the project descriptor, canonical Spec files, manifests, and ledgers with existing path/digest protections.
- Modify `apps/web/server/services/spec224IncrementalSpecCompiler.ts`: accept canonical requirement objects and ID-based refs while preserving current Markdown/JSON compatibility.
- Modify `apps/web/server/services/spec224WorkspaceSpecSet.ts` and `apps/web/server/routers/spec226DevelopmentControl.ts`: ingest a pinned multi-Spec project revision through current workspace authorization and idempotency.
- Modify the existing Mission Control server read model and `apps/web/client/src/components/chat/MissionControlWorkspace.tsx` to present project/Spec/package readiness from canonical evidence.
- Add focused tests beside the affected services, routers, and UI; no parallel status store or test-only production interface.

## Tasks

### Task 1: Bind the R1.4 project inventory and dependency graph

**Files:**
- Create: `specs/feature/312-smartaihub-modular-saas-rebuild-master-plan/handoff/modular-saas-project.json`
- Modify: evidenced child handoff manifests through `tools.spec_handoff update`
- Test: `apps/web/server/services/spec224FeatureSpecCatalog.test.ts` (new if no service test exists)

- [x] Confirm the current SmartSpecPro SHA, all 13 Spec IDs, Spec/manifest/ledger digests, and explicit dependency evidence from their normative text.
- [x] Write the descriptor containing project semantic ID, canonical member Spec IDs, implementation repository identity, and only the first bounded package declaration.
- [x] Populate `dependencies.specs` only for evidenced relationships, preserving relationship type/status; leave ambiguous edges unresolved.
- [x] Add graph checks for missing Specs, digest mismatch, duplicate IDs, self-edge, and cycles.
- [x] Run focused service tests and `python3 -m tools.spec_handoff validate` for every touched Spec.

### Task 2: Preserve canonical requirement IDs in the SPEC-224 compiler

**Files:**
- Modify: `apps/web/server/services/spec224IncrementalSpecCompiler.ts`
- Test: `apps/web/server/services/spec224IncrementalSpecCompiler.test.ts`

- [x] Add a failing test for a JSON requirement object with canonical Spec ID, ledger `requirement_id`, source path, source digest, and requirement text.
- [x] Add a failing test for a WorkPackage referencing a canonical requirement ID and cross-Spec dependency.
- [x] Add same-Spec duplicate-ID, Spec-scoped collision, unresolved-ref, missing acceptance/verification/write-set, and cycle tests.
- [x] Implement the minimal normalized input extension; preserve existing Markdown line and JSON-pointer behavior.
- [x] Run the compiler test file and confirm old behavior remains compatible.

### Task 3: Ingest the pinned canonical project through existing SPEC-224 controls

**Files:**
- Modify: `apps/web/server/services/spec224FeatureSpecCatalog.ts`
- Modify: `apps/web/server/services/spec224WorkspaceSpecSet.ts`
- Modify: `apps/web/server/routers/spec226DevelopmentControl.ts`
- Test: matching service and `spec226DevelopmentControl.test.ts`

- [x] Add a catalog loader that reads only descriptor-listed Specs and their existing handoff manifest/ledger, validates all digests/statuses, and returns source refs plus immutable files.
- [x] Ensure catalog ingestion requires the registered `PLATFORM_ENGINEERING` Runner workspace already required by canonical Spec ingestion.
- [x] Add idempotent `ingestModularSaasProject` over the existing SpecSet writer; bind input to project descriptor digest and SmartSpecPro source SHA.
- [x] Ensure stale/missing source, stale Runner snapshot, oversized input, and conflicting idempotency key fail closed.
- [x] Run focused API/service tests; do not dispatch a live Runner job as part of ingestion.

### Task 4: Expose project readiness through Mission Control

**Files:**
- Modify: existing SPEC-294 project read-model service and `spec226DevelopmentControl.projectMissionControl`
- Modify: `apps/web/client/src/components/chat/MissionControlWorkspace.tsx`
- Test: focused read-model and component tests

- [x] Add a canonical project projection for 13 Specs, proven dependency edges, package readiness, requirement counts, next actions, source digests, and linked DevelopmentRuns.
- [x] Keep status facts tenant/actor scoped; source facts come from digest-validated handoffs, SpecSet revisions, and exact SPEC-224 Run references. Deployment remains UNKNOWN because no deployment/runtime evidence is connected.
- [x] Add compact project and per-Spec navigation in Developer mode with stale, blocked, and not-ingested states; actions continue through canonical SPEC-224 flows.
- [x] Add focused tests for tenant authority, stale source, partial package readiness, evidence scope, and missing ingestion.
- [ ] Run browser evidence for responsive empty/loading states if the local development runtime is available; this checkpoint used a JSX transform and did not launch or change a runtime.

### Task 5: Pilot, handoff, and integration

**Files:**
- Update existing SPEC-312/313/316 handoff manifests/ledgers with exact evidence through shared writers.
- Update generated `specs/_status/*` projections through `tools.spec_handoff`.
- Update `orchestra/progress.md` only if this existing task needs a durable continuation pointer.

- [x] Compile the documentation/catalog package against the descriptor-pinned SPEC source SHA `1f6e5432a278f05e9811e88fb7bc61fb70938d32` and implementation source SHA `7456bbe549050473543acbec2b9094d95e5a2e95`; result is READY with no blockers.
- [ ] Prepare it through existing SPEC-224. **UNVERIFIED:** no authenticated Platform Engineering Runner binding or SpecSet preparation was exercised in this task; no plan/run or runtime evidence is claimed.
- [x] Resolve deployment boundaries from `apps/web/scripts/deployment-targets.json`; existing port-3100 health returned 200 and was left unchanged. `smartsihub.com` remains registered-not-activated.
- [x] Run focused unit/API tests, JSX transform, staged diff check, and staged secret-pattern scan. Handoff files were not changed in this checkpoint.
- [x] Commit only owned files, push to `origin/main`, fetch, and verify local `main == origin/main`.

## Execution Notes

- Use native sequential execution in the primary checkout; no task worktree or sub-agent is needed.
- The user explicitly authorized implementation and requested no additional confirmation. Proceed through all safe slices without approval pauses.
- Live Runner dispatch, owner approval, external credentials, and production changes remain governed by their existing authority boundaries; these do not block offline compiler, catalog, or UI work.
