# Research findings — Spec 209 runtime completion addendum

## Research decision

- Codebase research: yes. This is an existing git repository with the current
  Spec 209 UI, router, schema, canonical Job control plane and test suites.
- SocratiCode research: unavailable in the current transport. Targeted `rg`
  and line-range reads were used instead and this fallback is recorded here.
- Web research: skipped. The requested work is an internal integration plan
  whose authoritative contracts are already in this repository; external web
  guidance would not decide the Feature 195/207/210 ownership boundaries.
- Testing research: Vitest is the repository's focused unit/router/service/UI
  test framework; Playwright is used for authenticated browser evidence under
  `apps/web/tests/e2e`; migration and runtime parity tests already exist.

## Current Spec 209 implementation

Relevant files:

- `apps/web/server/routers/workflowStudio.ts` currently exposes `previewCandidate`,
  `list`, `get`, `createDraft`, `publishVersion`, `publishApp` and
  `marketplace`. It does not expose a workflow run, invoke, entitlement,
  dependency-check or run-control mutation.
- `apps/web/server/services/workflowStudioContracts.ts` owns semantic
  definition validation, draft creation and content hashing/version contracts.
- `apps/web/server/services/workflowBuilderCompiler.ts` creates deterministic
  candidates and has an in-memory candidate acceptance helper. It is not yet
  the durable accept-to-draft path for the UI.
- `apps/web/server/services/workflowDataBinding.ts` validates tenant/type
  bindings, nested graph cycles and stale run events.
- `apps/web/server/services/workflowMiniAppService.ts` validates Mini App input,
  tenant artifact authorization, immutable publication and public marketplace
  filtering. These are contract helpers rather than a full invocation path.
- `apps/web/server/services/workflowStudioEconomics.ts` provides a workflow
  reservation/capture contract but is not called by a real workflow run.
- `apps/web/client/src/pages/WorkflowStudioPage.tsx` is mockup-aligned and
  responsive. Builder, subflow, Library, Marketplace and Run surfaces exist,
  but builder mutations and Run are intentionally fail-closed until the
  canonical runtime handoff is wired.

## Canonical execution and lifecycle patterns to reuse

- `apps/web/server/services/jobControlPlaneGateway.ts` is the producer-facing
  Job creation boundary. It derives tenant/actor context, validates the
  executor registry, preserves idempotency and creates the canonical Job.
- `apps/web/server/services/orchestration/gateway.ts` submits approved plan
  steps through the canonical gateway and resolves dependency Job IDs. A
  workflow adapter should produce a compatible `PlanRevision` or an explicitly
  approved single-step `GatewayJobDefinition`; it must not call a queue directly.
- `apps/web/server/services/jobControlPlane.ts` already has durable lifecycle
  semantics for retry, external wait/resume, cancellation, event idempotency,
  fencing and checkpoint recovery. Spec 209 should project and constrain these
  operations rather than duplicate them.
- `apps/web/server/routers/workerJobs.ts` and
  `apps/web/server/services/jobControlPlaneMonitor.ts` provide existing detail,
  timeline, user retry/cancel and canonical control-plane projections that can
  inform the workflow-friendly API.
- `worker_jobs` already stores `workflowRunId`, `definitionHash`, input,
  instructions, progress, retry/timeout policy, attempt and result references.
  `worker_job_events`, `worker_job_attempts` and `worker_artifacts` already
  provide the durable event/attempt/artifact substrate.
- `apps/web/server/services/workerArtifactService.ts` validates tenant/job
  storage prefixes, checksums, size/content type and publishes artifacts into
  the library. A workflow output adapter should call this path after a
  canonical Job result, not expose provider URLs directly.

## Existing Spec 209 schema implications

- `workflow_studio_definitions` stores tenant, owner, semantic definition,
  Mini App schema, access mode and current version.
- `workflow_studio_versions` stores immutable semantic definition, input/output
  schemas, content hash and published status.
- `workflow_studio_views` is already per-user/per-definition and is the natural
  home for persisted canvas layout/inspector state, not semantic execution
  truth.
- `workflow_studio_apps` stores published definition/version, slug, tags,
  access mode and publication state. It has no entitlement, dependency snapshot,
  pricing disclosure, run projection or invocation record.
- The addendum therefore needs additive tables or a clearly justified extension
  for workflow runs, checkpoints, dependency/readiness snapshots, approval/input
  waits, and invocation/entitlement facts. It must not alter published version
  identity or create a second Job lifecycle table.

## Existing UI and browser patterns

- The attached mockups are represented by the current builder/subflow/run
  surfaces. Existing browser evidence uses Playwright with intercepted tRPC
  responses and viewport coverage at 390x844, 768x1024 and 1440x900.
- The next UI plan should preserve the same shell and add stateful cards/panels
  for readiness, entitlement, run status, approval, recovery and artifact
  states instead of inventing a new product surface.
- Existing Marketplace components under `apps/web/client/src/components/marketplace`
  provide filter/card patterns, but they are not proof of Mini App entitlement
  or workflow invocation behavior.

## Key risks and design decisions

1. A workflow graph is not executable merely because its nodes and edges are
   valid. The compiler must resolve each node to a registered capability/job
   contract and fail with setup-required/readiness reasons when it cannot.
2. A client-supplied workflowRunId, tenant, provider, cost or worker cannot
   authorize execution. The server must resolve these values from the exact
   Workflow Version, authenticated context, policy snapshot and canonical Job.
3. Retry/cancel/resume/checkpoint behavior already exists at Job level but must
   be bound to the exact Workflow Version, checkpoint digest and run revision.
4. Artifact publication must use authorized managed storage and the existing
   worker artifact validation path; raw external URLs are not a stable output
   contract.
5. Marketplace public visibility is not the same as run entitlement. The
   invocation path must recheck access, dependency readiness, budget and
   economic policy at the moment of run admission.

## Testing baseline

- Unit/service/router tests: `apps/web/vitest.config.ts` with targeted
  `node_modules/.bin/vitest run --config apps/web/vitest.config.ts ...`.
- Browser: `apps/web/playwright.config.ts` and `apps/web/tests/e2e`; run with
  the repository's JWT test secret and the configured dev server.
- Migration/schema: existing Drizzle migration/parity tests under
  `apps/web/drizzle/__tests__`.
- Repository rule: do not run `npm run typecheck` or any equivalent unless the
  user explicitly requests it. Use focused tests, esbuild transforms, runtime
  schema checks and browser evidence instead.
