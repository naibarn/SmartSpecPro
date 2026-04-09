# Implementation Plan TDD

## Test-first strategy

Feature 077 is mainly a platform-contract completion effort, so the first failing tests should prove that the current implementation is still too OpenClaw-shaped for the revised worker fabric.

## 1. Runtime-generalized control plane

### Tests to add or update first

- `apps/web/server/services/__tests__/workerRegistryService.test.ts`
  - reject unsupported runtime only when no runtime handler exists
  - allow non-OpenClaw runtime registration once the correct feature flag and handler are enabled
- `apps/web/server/services/__tests__/workerSchedulerService.test.ts`
  - keep OpenClaw job routing intact
  - add runtime-aware scheduling selection tests for desktop-local jobs
- `apps/web/server/services/__tests__/workerAuthService.test.ts`
  - verify runtime-family feature flags are evaluated per runtime type
  - reject wrong-scope worker tokens, revoked JTIs, and cross-tenant replay against worker endpoints
- `apps/web/server/routes/__tests__/workerRuntime.test.ts`
  - verify non-OpenClaw runtime payloads fail closed until enabled
  - verify policy snapshots are runtime-specific
  - reject delegated platform tokens on worker register / heartbeat / claim / report routes
- `apps/web/shared/__tests__/workerRuntime.test.ts`
  - verify transport protocol compatibility is evaluated separately from runtime-family metadata/profile schema compatibility
  - verify runtime-mode compatibility matrices can reject otherwise transport-compatible workers
- backfill/seed tests for existing OpenClaw workers
  - create default runtime-profile and policy-profile rows idempotently
  - normalize legacy OpenClaw workers into the runtime-handler path without re-registration

### Expected failing condition today

- non-OpenClaw runtimes are still blocked by OpenClaw-specific service behavior and feature-flag checks

## 2. Desktop + ZeroClaw managed runtime foundation

### Tests to add first

- contract tests for desktop registration payloads using:
  - `runtimeType = "desktop_zeroclaw_managed"`
  - `runtimeMode = "native_constrained"`
  - `runtimeMode = "wsl2_managed"`
- diagnostics and policy snapshot tests for desktop-local workers
- desktop identity/trust tests where Feature 075 device rules intersect with worker registration
- future desktop-host tests covering drain/disable/maintenance state transitions
- shared-worker tests covering service identity, approval mode, and budget attribution
- token-rotation and revocation tests for shared and dedicated desktop worker credentials
- desktop secret-storage tests proving long-lived registration/device secrets use the desktop credential abstraction and execution/upload tokens are not persisted beyond policy
- cleanup tests proving revoke/drain/offboarding clears token caches and local secret residue

### Expected failing condition today

- the repo has no real desktop worker-host contract beyond generic schema support

## 3. Local workspace and media jobs

### Tests to add first

- scheduler tests for `video_assembly` resource and capability matching
- artifact/publication tests proving desktop-local outputs still publish through `workerArtifactService`
- artifact/publication safety tests proving desktop-local outputs still obey centralized content-type and safe-serving rules
- workspace/file-policy tests proving unauthorized paths are rejected
- adapter contract tests for a desktop media worker bridge
- `video_assembly` contract tests proving required progress stages and failure classes normalize consistently
- adapter-security tests proving raw shell fragments, raw FFmpeg fragment passthrough, and unstaged paths are rejected
- log-redaction tests proving sensitive local paths and secrets do not leak into worker event payloads
- cleanup tests proving failed-job temp artifacts, redacted diagnostics bundles, and local logs follow retention/scrub rules

### Reusable fixtures and modules

- media-job fixtures should reuse the existing structures from:
  - `apps/tauri-shell/src-tauri/src/video_editor/job_dispatcher.rs`
  - `python-backend/app/tasks/media_job_worker.py`
  - `python-backend/app/video/pipeline.py`

### Expected failing condition today

- there is no worker-fabric path for `video_assembly` or other desktop-local job classes

## 4. NemoClaw and HiClaw runtime profiles

### Tests to add first

- schema and serialization tests for runtime metadata requirements
- scheduler tests proving:
  - `sandbox_required` work does not default to OpenClaw
  - cluster-style work does not pretend to be a desktop worker
- fleet/admin tests for truthful runtime-family visibility
- compatibility-state tests proving “registered but incompatible” and “registered and executable” render differently in fleet/admin responses

### Expected failing condition today

- schema can represent these runtime types, but service behavior and admin semantics are not implemented

## 5. Workflow and admin surface tests

- `apps/web/server/routers/__tests__/workflow.workerDispatch.test.ts`
  - proves dispatch-time validation failures are synchronous and structured
  - proves worker-job terminal states surface stable failure payloads to workflow callers
- `apps/web/client/src/pages/__tests__/WorkflowEditor.workerRuntime.test.tsx`
  - proves gated worker-runtime nodes stay hidden until the correct rollout flags are enabled
  - proves node configuration surfaces runtime preference, security class, and output-policy inputs truthfully
- `apps/web/client/src/lib/workflow/useNodeRegistry.test.ts`
  - proves node-registry responses stay aligned with rollout flags and worker-runtime support
- `apps/web/client/src/pages/__tests__/AdminMonitoring.workerRuntime.test.tsx`
  - proves admin views expose runtime-family compatibility state, approval mode, and health truthfully

## 6. Regression checks

- OpenClaw registration, delegation, budget, fleet, and MCP tests must continue to pass
- Teams and run-engine tests must preserve current external-connector behavior
- workflow/persona routing tests should prove new worker capability routing does not collapse back into one OpenClaw-only scheduler path
- workflow/persona node-contract tests should prove dispatch / wait / publish / index steps expose stable terminal and failure semantics
- precedence tests or spec-alignment checks should prove Feature 075 desktop-host rules remain authoritative where intended
- help/docs truthfulness checks should verify the platform does not claim desktop-local or cluster runtime support before rollout is enabled
- cross-runtime verification should include `npm --prefix apps/web test`, `uv run --project python-backend pytest`, and `cargo test --manifest-path apps/tauri-shell/src-tauri/Cargo.toml` rather than treating one suite as exhaustive
