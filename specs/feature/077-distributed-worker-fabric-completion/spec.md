# 077 - Distributed Worker Fabric Completion

Version: 1.1
Date: 2026-04-08
Status: Proposed
Depends-on: 059-external-worker-provider-framework, 071-openclaw-external-runtime-integration, 072-claw-worker-platform-access, 074-claw-worker-mcp-platform-completion, 075-unified-web-desktop-agent-platform, 004-desktop-app, 007-python-backend
Supersedes: Feature 059 language that still frames ZeroClaw as a thin bundled sidecar where it conflicts with this feature
Audience: Web Control Plane, Desktop, Runtime, Media, Admin Ops, Security, QA

---

## 1. Executive summary

Features 071-074 made OpenClaw real inside SmartSpecPro:

- OpenClaw workers can register, heartbeat, claim jobs, publish artifacts, and appear in fleet admin
- delegated worker sessions let a personal worker call SmartSpecPro platform APIs safely
- delegated worker MCP is now truthful enough to be used in production for supported tool families

That work is substantial, but it does **not** yet complete the revised SmartSpecPro Distributed Worker Fabric spec.

The current repository still lacks the broader runtime-fabric pieces required by the revised architecture:

- SmartSpec Desktop as a real worker host
- ZeroClaw as a managed local runtime profile
- local file/GPU/media job classes such as `video_assembly`
- runtime-generalized control-plane behavior beyond OpenClaw
- NemoClaw and HiClaw registration/scheduling semantics

Feature 077 closes those missing areas without undoing the OpenClaw work already delivered by Features 071-074.

---

## 2. Current support assessment

### 2.1 Supported now

- worker registry tables, job tables, artifact tables, policy tables, and delegated session tables
- worker register / heartbeat / claim / event / artifact / diagnostics routes
- worker artifact publication into Library plus indexing trigger reuse
- owner-bound personal worker model and team binding through `externalWorkerId`
- delegated platform access for supported worker jobs
- worker budgets and worker credit source attribution
- delegated worker MCP with truthful discovery and execution for supported families
- admin monitoring and worker fleet controls

### 2.2 Supported partially

- runtime taxonomy exists in schema and shared types, but service behavior is still mostly OpenClaw-scoped
- runtime-aware Bound Worker eligibility exists as scaffolding, but not as a full runtime-family contract
- runtime profiles and worker policies exist in persistence, but policy snapshots remain gateway-centric
- docs are strong for OpenClaw workers, not yet for full worker fabric
- media/runtime assets exist elsewhere in the repo, but are not yet connected to worker jobs

### 2.3 Missing

- SmartSpec Desktop worker-host responsibilities
- ZeroClaw managed runtime lifecycle and profile model
- WSL2-managed versus native-constrained desktop execution profiles
- workspace/file-access onboarding and per-job workspace lifecycle
- typed local worker jobs:
  - `video_assembly`
  - `local_folder_ingest`
  - `comfy_image_generation`
  - `comfy_workflow_run`
- GPU-aware scheduling and local media adapters wired into worker jobs
- runtime-generalized scheduler, registry, auth, and policy behavior
- NemoClaw secure-pool registration and routing
- HiClaw cluster registration and routing

---

## 3. Goals

1. Complete the runtime-generalized worker fabric on top of the OpenClaw control-plane baseline from Features 071-074.
2. Reposition ZeroClaw from “thin sidecar” to “managed local runtime profile” inside SmartSpec Desktop.
3. Add the first real local execution job classes required by the revised spec, especially `video_assembly`.
4. Keep OpenClaw as the primary external general-purpose runtime while making the platform extensible to other runtime families.
5. Introduce runtime-specific rollout, policy, and scheduling rules instead of one OpenClaw-shaped contract for every worker.
6. Reuse existing desktop/media execution assets from `apps/tauri-shell` and `python-backend` where they already match the required adapters.

---

## 4. Non-goals

1. This feature does not replace Features 071-074.
2. This feature does not make OpenClaw the preferred runtime for local Windows media or file-heavy jobs.
3. This feature does not require full production rollout of NemoClaw or HiClaw in the same implementation slice as the desktop worker foundation.
4. This feature does not introduce unrestricted shell access or arbitrary runtime execution.
5. This feature does not require SmartSpec Desktop to reimplement media engines that already exist elsewhere in the repo.

---

## 5. Locked product decisions

### 5.1 OpenClaw assumptions remain valid

Official OpenClaw docs verified on 2026-04-08 still show:

- Windows full experience prefers WSL2
- onboarding is wizard-driven
- dashboard / doctor / status are first-class operations
- sessions, channels, plugins, tools, and skills are real product surfaces

Therefore SmartSpecPro should keep OpenClaw as the first production external runtime, but it must not stretch OpenClaw into desktop-local media-worker semantics it was never meant to own.

### 5.2 Relationship to Feature 075

Feature 075 already defines the canonical **Desktop Host** model for SmartSpecPro.

Therefore Feature 077 must be read as:

- Feature 075 controls:
  - desktop-host naming
  - device identity
  - package/trust model
  - offboarding and revocation
  - product-level desktop runtime positioning
- Feature 077 controls:
  - worker-fabric runtime registration
  - worker scheduler and policy integration
  - typed local/offload worker job classes
  - runtime-family worker routing and artifact publication

If the two features appear to conflict:

- Feature 075 wins on desktop-host architecture and trust model
- Feature 077 wins on worker-fabric execution semantics

The runtime labels also live at different layers:

- Feature 075 product labels such as `Pi`, `Agency Swarm`, and `OpenClaw Gateway` are user-facing execution categories
- Feature 077 runtime types such as `desktop_zeroclaw_managed` and `openclaw_gateway` are worker-fabric registry identities

`desktop_zeroclaw_managed` is therefore the initial worker-fabric local execution profile. It does **not** replace Pi or Agency Swarm as the canonical desktop-interactive runtimes defined by Feature 075.

### 5.3 Feature 059 sidecar wording is superseded

Where Feature 059 still says “bundled ZeroClaw sidecar,” Feature 077 supersedes that with:

- SmartSpec Desktop is the machine host
- ZeroClaw is a managed local runtime profile
- runtime profiles may be:
  - `native_constrained`
  - `wsl2_managed`
  - `docker_isolated`

### 5.4 Generalize services by runtime handler, not by string branching everywhere

Shared control-plane services should move toward a runtime-handler model:

- runtime registration validator
- runtime policy snapshot builder
- runtime scheduler selector
- runtime capability mapper
- runtime admin serializer

The platform must still fail closed for unsupported runtimes.

### 5.5 Ownership model and worker class separation

Feature 072 locks `Bound Worker` and delegated platform access into an owner-bound personal-worker model by default.

Feature 077 must preserve that rule for the current external-worker path:

- `openclaw_gateway` bound-worker usage remains owner-bound and same-tenant
- a personal worker must not silently become a shared tenant worker
- delegated platform sessions must remain explicit, scoped, short-lived, and job-bound

At the same time, Feature 077 introduces or reactivates broader worker classes:

- `per_user`
- `shared_department`
- `dedicated_gpu`

Required distinction:

- personal external workers may carry delegated user-context work
- shared department and dedicated GPU workers may execute typed worker jobs for multiple users only through explicit scheduler and policy assignment
- shared or dedicated workers must not implicitly inherit the `Bound Worker` personal-delegation semantics from Feature 072

The initial desktop-local `video_assembly` path should therefore assume:

- typed worker-job execution first
- artifact upload/publish tokens as needed
- no automatic user-equivalent delegated platform session unless a later scope explicitly adds that rule for the specific desktop worker class

### 5.5.1 Service identity, approval, budget attribution, and token rotation for shared workers

Shared worker classes need explicit semantics beyond the owner-bound worker model.

Required rules:

- `shared_department` and `dedicated_gpu` workers register under a service-operated machine identity anchored to the Desktop Host trust model from Feature 075
- the worker registration record must keep both:
  - registration/operator ownership metadata
  - execution-time request origin metadata such as `requestedByUserId`, `requestedByPersonaId`, and `workflowRunId`
- the admin who registers or maintains the machine must not automatically become the execution identity for every queued job
- approval mode must be explicit per worker or policy profile, recommended values:
  - `preapproved_typed_jobs`
  - `per_job_approval`
  - `admin_only`
- budget and credit attribution default to the requesting workflow/user/team policy, not the machine-registration admin, unless a policy profile explicitly defines a service-owned cost center fallback
- worker registration, execution, and upload tokens for shared workers must rotate on:
  - periodic rotation windows
  - device offboarding or compromise
  - admin ownership transfer
  - policy profile change
  - forced revocation or drain events
- token revocation must invalidate future claims and uploads without requiring ambiguous reuse of delegated user-session tokens

### 5.6 Reuse existing media engines

The first local media-worker phase should reuse existing assets:

- `apps/tauri-shell/src-tauri/src/video_editor/*`
- `python-backend/app/tasks/media_job_worker.py`
- `python-backend/app/video/pipeline.py`

This feature is about worker-fabric integration, not inventing a second unrelated FFmpeg stack.

### 5.7 Secrets, token, and adapter-security posture

This feature must define explicit security posture for the new desktop-local and multi-runtime paths.

Required token classes:

- worker registration token
- worker execution token
- worker upload token
- delegated platform token where applicable
- desktop device/session secrets aligned with Feature 075 trust and revocation rules

All token classes must be:

- short-lived
- scope-limited
- revocable
- auditable

Required adapter boundary rules when reusing existing Tauri and Python media code:

- worker adapters accept typed job specs, not raw shell snippets
- untrusted FFmpeg argument fragments, shell fragments, or filtergraph fragments must not pass through directly
- source paths must be normalized and staged into the controlled workspace before execution
- UNC, team-drive, or full-machine paths require explicit allowlisted policy beyond the workspace-scoped default
- loopback-only or outbound-only defaults must remain the baseline for desktop and runtime communication
- Docker and WSL2 profiles must use least-privileged mounts and must not open inbound public control ports by default
- diagnostics, job events, and centralized logs must redact secrets, provider credentials, and non-essential local path details before leaving the desktop trust boundary

### 5.8 Runtime-profile schema versioning and compatibility

`WORKER_RUNTIME_PROTOCOL_VERSION` is not enough by itself once the platform supports multiple runtime families and profile schemas.

Required compatibility model:

- keep `WORKER_RUNTIME_PROTOCOL_VERSION` as the transport/control-plane envelope version
- add runtime-family schema version fields for:
  - registration metadata
  - policy snapshot/profile payloads
  - runtime profile payloads where applicable
- compatibility checks must evaluate:
  - transport protocol range
  - runtime-family metadata schema version
  - runtime-profile schema version
  - minimum required desktop/runtime version where applicable
- the control plane must keep a compatibility matrix by runtime family and runtime mode instead of guessing from ad-hoc JSON fields
- fleet/admin views should surface compatibility state truthfully so operators can see “registered but incompatible” versus “registered and executable”

### 5.9 Split rollout by runtime family

Keep `openClawExternalRuntime` for the current OpenClaw path and add separate feature flags for future runtime slices, recommended names:

- `desktopZeroClawWorker`
- `nemoClawSecureWorkerPool`
- `hiClawClusterRuntime`

### 5.10 Canonical `video_assembly` job contract

Feature 077 should lock a minimum cross-runtime contract for `video_assembly` even before the final JSON schema lands in shared code.

Minimum input contract:

- `jobType = "video_assembly"`
- `inputRefs[]` where each ref declares a `sourceKind` of:
  - `library_asset`
  - `authorized_local_path`
  - `staged_upload`
- `editPlan` containing ordered clips plus deterministic trim/reframe/concat instructions
- `subtitlePlan` containing source priority, burn-versus-mux mode, and optional transcript/subtitle refs
- `renderProfile` containing aspect-ratio targets, codec/quality preset, and declared GPU requirement
- `workspacePolicy` containing approved source roots and staging behavior
- `outputTargets` declaring which rendered outputs, subtitles, thumbnails, and metadata manifests must be uploaded and published

Minimum output contract:

- at least one rendered media artifact
- optional subtitle artifacts
- optional thumbnail artifacts
- media metadata manifest including checksum and basic duration/resolution details
- structured adapter execution summary for audit and failure diagnosis

Required progress-stage vocabulary:

- `resolve_inputs`
- `stage_workspace`
- `probe_media`
- `build_edit_plan`
- `render_outputs`
- `verify_outputs`
- `upload_artifacts`
- `publish_artifacts`
- `trigger_indexing`

Required failure taxonomy:

- retryable classes:
  - `transient_input_fetch_failed`
  - `temporary_disk_pressure`
  - `runtime_restart_required`
  - `artifact_upload_failed`
  - `index_enqueue_failed`
- terminal classes:
  - `unauthorized_path`
  - `unsupported_media`
  - `insufficient_gpu`
  - `insufficient_temp_disk`
  - `adapter_contract_violation`
  - `render_failed`
  - `artifact_publish_failed`

### 5.11 Workflow and persona node contracts

Workflow and persona integration must be more concrete than “route by capability” prose.

Minimum node contracts to lock:

- `Dispatch Worker Job`
  - accepts capability intent, job type, resource profile, runtime preference, security class, file-scope hints, and output policy
  - returns a stable worker-job reference plus initial scheduler decision metadata
- `Wait for Worker Completion`
  - accepts a worker-job reference and timeout/terminal-state policy
  - returns terminal state, failure summary, and artifact refs when present
- `Publish Worker Artifacts`
  - accepts a completed worker-job reference
  - returns published library/media/document refs and safe-serving metadata
- `Trigger RAG Index`
  - accepts published item refs or artifact refs
  - returns indexing job refs or indexing-state metadata

Required failure semantics:

- dispatch-time validation failures fail synchronously before job queueing
- terminal worker-job states such as `failed`, `canceled`, and `expired` must return structured failure payloads to workflow/persona callers
- artifact publication and indexing failures must remain separately observable so a render success is not misreported as a full publish success

### 5.12 Artifact publication safety reuse

Desktop-local and future runtime-family artifacts must reuse the existing worker artifact publication safety path rather than inventing runtime-specific bypasses.

Required rule set:

- desktop-local outputs must publish through `workerArtifactService`
- content-type validation, checksum validation, storage-prefix validation, and payload sanitization remain centralized there
- safe-serving behavior such as `inline` versus `download_only` must stay authoritative in that service
- artifact publication must continue to reuse the current Library creation and `safeEnqueueLibraryIndexJob` path
- new desktop adapters must not write directly into Library or invent parallel content-type rules

### 5.13 First new typed job set

The first non-OpenClaw worker jobs added by this feature family should be:

- `video_assembly`
- `local_folder_ingest`
- `comfy_image_generation`
- `comfy_workflow_run`

---

## 6. Workstreams

### 6.1 Runtime-generalized control plane

Convert the current OpenClaw-heavy worker services into runtime-aware services while preserving OpenClaw as the first production path.

Must include:

- remove single-runtime hardcoding from registry and scheduler layers
- add runtime-specific feature-flag checks
- add runtime-family schema version and compatibility-matrix checks
- make policy snapshots runtime-family-aware
- preserve OpenClaw compatibility and backward-compatible worker tokens

### 6.2 SmartSpec Desktop + ZeroClaw managed runtime foundation

Add the missing desktop host layer responsibilities:

- worker registration UX
- runtime install/provision choice
- profile selection: native vs WSL2 vs optional docker
- local diagnostics and health reporting
- background/tray worker lifecycle
- workspace onboarding and policy acceptance
- explicit shared-worker service identity, approval, and token-rotation rules
- alignment with Feature 075 device identity, trust, and offboarding rules

### 6.3 Local workspace, file access, and media jobs

Add the first typed local execution path:

- `video_assembly`
- workspace-scoped file access
- per-job staging/temp/output workspaces
- canonical `video_assembly` input/output/progress/failure contract
- artifact upload and publish flow
- explicit reuse of `workerArtifactService` validation, safe-serving, and indexing behavior
- GPU-aware and disk-aware scheduling inputs
- adapter bridge to existing FFmpeg/media primitives
- typed adapter security shims for path normalization, command safety, and workspace-only staging

### 6.4 NemoClaw and HiClaw registration semantics

Add runtime-specific registration, metadata, and routing for:

- `nemoclaw_sandbox`
- `hiclaw_cluster`

This must preserve the non-substitution rule:

- NemoClaw is not the desktop default
- HiClaw is not a desktop worker replacement

### 6.5 Admin, docs, and rollout truthfulness

Update the operator and product truth:

- worker fleet views become runtime-family-aware
- docs explain what is ready now versus future-gated
- workflow and persona surfaces gain runtime-aware dispatch / wait / publish / index building blocks with explicit failure semantics
- rollout sequencing preserves current OpenClaw flows
- migration path is explicit from Feature 059 wording to Feature 077 wording
- docs explicitly distinguish Feature 075 product runtime labels from Feature 077 worker runtime types

---

## 7. Acceptance criteria

1. Current OpenClaw worker registration, delegation, MCP, and admin flows still work without behavioral regression.
2. SmartSpec Desktop can register a worker as `desktop_zeroclaw_managed` when the runtime family flag is enabled and compatibility checks pass.
3. The control plane can queue and claim at least one local runtime job type, `video_assembly`, without routing it through the OpenClaw scheduler path.
4. Scheduler selection considers runtime type, declared capabilities, file scope, and resource profile instead of only OpenClaw job-type filters.
5. Workspace-scoped file access and artifact publication rules are explicit for desktop-local jobs.
6. NemoClaw and HiClaw can be represented in the worker registry with truthful runtime-specific metadata, even if their rollout remains admin-gated.
7. Public and help docs clearly distinguish:
   - OpenClaw external gateway workers
   - Desktop + ZeroClaw local workers
   - NemoClaw secure pools
   - HiClaw collaborative clusters
8. Workflow and persona routing can target worker capabilities without hardcoding every runtime choice into one OpenClaw-only path, and the dispatch / wait / publish / index contracts expose stable terminal and failure semantics.
9. Shared department and dedicated GPU workers preserve separate execution identity, explicit approval mode, and budget attribution rules instead of inheriting owner-bound personal-worker behavior.
10. Runtime registration and policy payloads expose runtime-family schema versions and compatibility state in addition to the global transport protocol version.
11. `video_assembly` has a canonical minimum input/output/progress/failure contract that desktop-local workers must implement consistently.
12. Desktop-local worker execution preserves explicit security controls for token scoping, workspace-bound paths, and adapter command boundaries.
13. Desktop-originated diagnostics and job-event streams preserve redaction rules for secrets and sensitive local-path details.
14. Desktop-local artifact publication reuses `workerArtifactService` validation, content-type restrictions, safe-serving behavior, and indexing hooks rather than a parallel publish path.

---

## 8. Recommended implementation order

1. Runtime-generalize registry/auth/policy/scheduler layers without changing current OpenClaw behavior.
2. Add SmartSpec Desktop worker-host and ZeroClaw profile foundations.
3. Connect `video_assembly` to a desktop-local worker path with workspace-scoped file access and artifact publication.
4. Add admin/runtime profile truth for NemoClaw and HiClaw.
5. Expand to additional local job families and richer workflow-builder routing.
