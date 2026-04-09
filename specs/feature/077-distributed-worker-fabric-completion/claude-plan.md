# Implementation Plan

## Objective

Add the missing feature-spec package that completes SmartSpecPro's revised distributed worker fabric beyond the OpenClaw-specific control-plane work already covered by Features 071-074.

## Current-codebase fit

The current repository already has three important foundations:

- a working OpenClaw-oriented worker control plane in `apps/web`
- an owner-bound delegated worker platform model
- reusable desktop/media execution pieces in `apps/tauri-shell` and `python-backend`

The missing work is therefore mostly integration and architectural completion:

- generalize the control plane beyond OpenClaw-only assumptions
- define the real desktop host/runtime story
- wire local execution job classes into the shared worker model
- align worker-fabric decisions with the canonical Desktop Host model already defined in Feature 075

## Affected files and modules

### Existing implementation references

- `apps/web/shared/workerRuntime.ts`
- `apps/web/shared/workerDelegation.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/*.sql`
- `apps/web/server/routes/workerRuntime.ts`
- `apps/web/server/services/workerRegistryService.ts`
- `apps/web/server/services/workerSchedulerService.ts`
- `apps/web/server/services/workerPolicyService.ts`
- `apps/web/server/services/teamService.ts`
- `apps/web/server/services/runEngine.ts`
- `apps/web/server/services/workerFleetService.ts`
- `apps/web/server/routers/workflow.ts`
- `apps/web/client/src/pages/WorkflowEditor.tsx`
- `apps/web/client/src/lib/workflow/useNodeRegistry.ts`
- `apps/web/client/src/components/workflow/config/DynamicNodeConfig.tsx`
- `apps/web/client/src/pages/AdminMonitoring.tsx`
- `apps/tauri-shell/src-tauri/src/video_editor/*`
- `python-backend/app/tasks/media_job_worker.py`
- `python-backend/app/video/pipeline.py`

### New planning package

- `specs/feature/077-distributed-worker-fabric-completion/spec.md`
- `specs/feature/077-distributed-worker-fabric-completion/sections/*`

## Persistence and migration strategy

Use the existing worker-runtime schema as the MVP persistence baseline instead of introducing a second database model for Feature 077.

Implementation defaults:

- keep using structured worker/job columns that already exist in `apps/web/drizzle/schema.ts`, including:
  - `workers.runtimeType`
  - `workers.workerMode`
  - `workers.runtimeMode`
  - `workers.fileScopeMode`
  - `workers.registeredByUserId`
  - `workerJobs.workflowRunId`
  - `workerJobs.requestedByUserId`
  - `workerJobs.requestedByPersonaId`
  - `workerJobs.requestedBySystemComponent`
- keep detailed runtime-family compatibility state, operator metadata, approval mode, and runtime-profile snapshots in the existing JSON/profile surfaces:
  - `runtimeProfiles.profileJson`
  - `workerPolicies.rulesJson`
  - `workers.capabilitiesJson`
  - `workers.healthSummaryJson`
  - `workerJobs.inputJson`
  - `workerJobs.instructionsJson`
  - `workerJobs.outputJson`
- do not add new top-level worker tables in the first implementation slice unless a concrete query/filter requirement proves the existing schema is insufficient

Backfill and rollout defaults:

- add an idempotent seed/backfill step that creates explicit runtime profiles and policy profiles for existing OpenClaw workers
- normalize existing worker rows so pre-Feature-077 OpenClaw workers continue to resolve through the new runtime-handler path without manual re-registration
- keep schema migration optional for MVP; if implementation discovers a truly query-critical field that cannot safely live in existing JSON/profile columns, add one focused Drizzle migration and keep it backward-compatible with current OpenClaw rows

Rollback posture:

- feature flags remain the primary kill switch
- backfill/seed scripts must be idempotent and safe to re-run
- runtime handlers must fail closed when compatibility metadata is missing or malformed

## Implementation approach

### Workstream 1: Runtime-generalized control plane

Refactor the worker control-plane assumptions so the system can represent all declared runtime types honestly while preserving current OpenClaw production behavior.

Key outcomes:

- replace hardcoded OpenClaw-only runtime guards in shared services
- add runtime-family feature flags and compatibility checks
- separate transport protocol version checks from runtime-family metadata/profile compatibility checks
- make scheduler selection extensible by runtime handler
- make policy snapshots and fleet serialization runtime-aware
- persist compatibility envelopes and approval/runtime metadata through the existing schema/profile surfaces plus an idempotent backfill for current OpenClaw rows
- preserve the owner-bound external-worker rules from Feature 072 while adding explicit semantics for shared and dedicated desktop workers

### Workstream 2: Desktop host and ZeroClaw managed runtime

Define the SmartSpec Desktop worker-host modules, lifecycle, runtime profiles, and onboarding rules required by the revised architecture.

Key outcomes:

- desktop registration and diagnostics model
- native vs WSL2-managed runtime choice
- explicit ZeroClaw profile manager and runtime lifecycle
- background/tray/startup modes and maintenance/drain semantics
- explicit reuse of Feature 075 device identity, trust, and revocation posture
- shared-worker service identity, approval mode, budget attribution, and token-rotation rules
- desktop secret-storage and token-cache lifecycle rules covering registration credentials, short-lived execution/upload tokens, and cleanup on drain/offboarding

### Workstream 3: Local workspace and media jobs

Define the first desktop-local job path and connect it to existing media primitives.

Key outcomes:

- `video_assembly` job model
- canonical `video_assembly` input/output/progress/failure contract
- workspace-scoped file-access rules
- per-job source/staging/temp/output layout
- adapter bridge to FFmpeg/media execution assets already in the repo
- artifact publication and indexing path identical to other worker outputs via `workerArtifactService`
- typed adapter security shims for command and path safety

### Workstream 4: Additional runtime-family semantics

Add truthful registration, routing, and admin semantics for NemoClaw and HiClaw without making them MVP blockers for the desktop worker path.

Key outcomes:

- secure-pool posture for NemoClaw
- cluster/manager posture for HiClaw
- non-substitution rules encoded in docs and scheduler behavior

### Workstream 5: Documentation, migration, and rollout

Update operator and product truth so the platform does not overclaim worker-fabric completion.

Key outcomes:

- docs differentiate OpenClaw workers from desktop-local workers
- docs clarify Feature 075 product runtime labels versus Feature 077 worker runtime types
- workflow and persona surfaces gain runtime-aware worker dispatch, wait, publish, and index building blocks with explicit failure semantics
- workflow and persona implementation targets are explicit in the router, node-registry, editor, and admin-monitoring surfaces
- migration guidance from Feature 059 wording
- rollout order that protects already-working OpenClaw flows

## Risks and mitigations

### Risk: breaking current OpenClaw flows while generalizing the control plane

Mitigation:

- keep OpenClaw as the reference implementation during generalization
- add runtime-generalization tests before changing service branching

### Risk: duplicating media/runtime logic

Mitigation:

- reuse existing Tauri and Python media primitives as adapters
- avoid introducing a second FFmpeg business-logic stack

### Risk: making all runtimes look interchangeable in UI or policy

Mitigation:

- keep runtime-family-specific capability, policy, and routing rules explicit
- preserve non-substitution rules in docs, admin visibility, and scheduler semantics

### Risk: colliding with Feature 075 desktop-host decisions

Mitigation:

- treat Feature 075 as authoritative for desktop-host identity, trust, and package lifecycle
- keep Feature 077 focused on worker-fabric execution semantics and typed offload jobs

### Risk: mixing personal-worker and shared-worker ownership models too early

Mitigation:

- preserve current owner-bound worker assumptions for OpenClaw
- add shared department and dedicated GPU worker modes as explicit future expansion, not silent behavior changes

### Risk: version drift between runtime families and control-plane payloads

Mitigation:

- separate global transport protocol versioning from runtime-family metadata/profile schema versioning
- keep compatibility matrices explicit in code and operator views

### Risk: desktop-local artifact publication bypassing existing safety rules

Mitigation:

- require desktop-local outputs to publish through `workerArtifactService`
- reuse centralized content-type validation, safe-serving, and indexing hooks

### Risk: long-lived desktop credentials leaking through local cache, logs, or failed-job residue

Mitigation:

- keep registration/device secrets in OS-backed secure storage or an equivalent desktop credential abstraction
- keep execution and upload tokens short-lived and memory-first where possible
- scrub token material from logs, crash payloads, temp workspaces, and offboarding flows
- add explicit revocation and cleanup tests before enabling shared desktop workers

## Security and boundary concerns

- worker access must remain outbound-only
- local file access must stay policy-bound and auditable
- runtime-family feature flags must fail closed
- delegated platform sessions must remain separate from worker control-plane tokens
- desktop-local jobs must preserve artifact publication and audit trails under SmartSpecPro ownership
- reused media adapters must reject raw command passthrough and enforce staged workspace inputs
- desktop-originated logs and diagnostics must redact secrets and sensitive local-path details before central ingestion
- shared-worker registration/admin identity must remain distinct from execution-time request origin and budget attribution
- artifact publication must reuse the existing worker artifact safe-serving/content-type path instead of introducing a parallel desktop publish route
- worker endpoints must reject delegated platform tokens, wrong-scope worker tokens, revoked JTIs, and cross-tenant token replay
- delegated platform endpoints must reject worker control-plane tokens even when issued for the same job
- desktop-host secret storage must define where long-lived credentials live, how short-lived tokens are cached, and how both are removed during revoke/drain/offboarding
- workspace cleanup must include failed-job residue, redacted diagnostics bundles, and log scrubbing rules for local secrets

## Acceptance criteria

- Feature 077 acceptance criteria from `spec.md` are satisfied
- the plan does not regress Feature 071-074 semantics
- the plan clearly identifies how desktop-local jobs differ from OpenClaw external-runtime jobs

## Verification matrix

The `PROJECT_CONFIG` test command in `sections/index.md` is the primary web-control-plane gate for deep-plan automation, but Feature 077 is not complete until the relevant surfaces below have targeted verification.

| Surface | Primary modules | Baseline verification |
|---------|------------------|-----------------------|
| Web control plane | `apps/web/shared/workerRuntime.ts`, `apps/web/server/services/*`, `apps/web/server/routers/workflow.ts` | `npm --prefix apps/web test` |
| Python media adapters | `python-backend/app/tasks/media_job_worker.py`, `python-backend/app/video/pipeline.py` | `uv run --project python-backend pytest` |
| Desktop/Tauri host contracts | `apps/tauri-shell/src-tauri/src/video_editor/*` and future desktop worker-host modules | `cargo test --manifest-path apps/tauri-shell/src-tauri/Cargo.toml` |
| Workflow/admin UI surfaces | `apps/web/client/src/pages/WorkflowEditor.tsx`, `apps/web/client/src/lib/workflow/useNodeRegistry.ts`, `apps/web/client/src/pages/AdminMonitoring.tsx` | targeted web UI tests inside the `apps/web` test suite |

## Rollout and testing notes

- start with runtime-generalized service contracts and OpenClaw regression protection
- add runtime-family compatibility matrix coverage before enabling non-OpenClaw execution paths
- add desktop runtime foundation behind a separate feature flag
- connect `video_assembly` only after workspace/file policy contracts are in place
- lock workflow/persona node contracts and desktop-local artifact publication semantics before broader UI rollout
- treat web, Python, and Tauri verification as separate rollout gates, not one interchangeable “tests passed” signal
- keep NemoClaw and HiClaw admin-gated until their runtime metadata and scheduler semantics are truthful enough for operators
