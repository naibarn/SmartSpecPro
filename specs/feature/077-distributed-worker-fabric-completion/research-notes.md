# Research Notes

Date: 2026-04-08  
Scope: current SmartSpecPro worker-fabric implementation truth versus the revised distributed worker fabric spec

## 1. Existing feature chain

### Feature 059

`specs/feature/059-external-worker-provider-framework/spec.md` is the original worker-fabric baseline. It still contains useful job-model and worker-model ideas, but it frames ZeroClaw as a bundled sidecar and does not reflect the later OpenClaw-focused implementation work.

### Feature 071

`specs/feature/071-openclaw-external-runtime-integration/spec.md` turns OpenClaw into the first real external runtime class by defining:

- worker registration and heartbeat
- job claim and artifact publication
- worker policies and runtime profiles
- team binding through `externalWorkerId`
- OpenClaw-compatible gateway expectations

This is the real implementation baseline for current worker runtime work in the repo.

### Feature 072

`specs/feature/072-claw-worker-platform-access/spec.md` adds delegated platform access, owner-bound worker semantics, budget and credit posture, and runtime-aware Bound Worker direction. It explicitly says the model should later grow beyond OpenClaw, but does not complete that broader runtime expansion.

### Feature 074

`specs/feature/074-claw-worker-mcp-platform-completion/spec.md` completes the delegated worker MCP story. It improves truthful discovery and makes `/v1/mcp` usable for delegated workers, but it still does not solve desktop-local execution, ZeroClaw managed runtime lifecycle, or runtime-generalized scheduling.

## 2. Current repository truth

### 2.1 What is already implemented in the web control plane

`apps/web/shared/workerRuntime.ts` and `apps/web/drizzle/schema.ts` already define a forward-compatible worker vocabulary:

- runtime types:
  - `openclaw_gateway`
  - `desktop_zeroclaw_managed`
  - `nemoclaw_sandbox`
  - `hiclaw_cluster`
- worker modes
- runtime modes
- file scope modes
- worker job statuses
- worker resource profiles

`apps/web/server/routes/workerRuntime.ts` already exposes the main worker routes:

- `POST /api/workers/register`
- `POST /api/workers/:workerId/heartbeat`
- `GET /api/workers/:workerId/policy`
- `POST /api/workers/:workerId/jobs/claim`
- delegated session + delegated manifest routes
- worker callbacks
- job event reporting
- artifact upload init/complete
- diagnostics push

`apps/web/server/services/workerArtifactService.ts`, `workerCallbackService.ts`, `workerBudgetService.ts`, `workerDelegationService.ts`, and `workerFleetService.ts` show that the web control plane already has:

- artifact publication into Library
- indexing trigger reuse
- worker callbacks into rooms/workflows/notifications
- owner-bound budget caps
- delegated worker sessions and manifests
- fleet/admin visibility

### 2.2 What is still OpenClaw-scoped in implementation

The data model is generic, but the main services remain OpenClaw-first and mostly OpenClaw-only:

- `apps/web/server/services/workerRegistryService.ts`
  - hardcodes `SUPPORTED_RUNTIME_TYPE = "openclaw_gateway"`
  - rejects other runtime types at service level
- `apps/web/server/services/workerSchedulerService.ts`
  - only queues `queueOpenClawWorkerJob()`
  - supported job types are limited to:
    - `external_agent_task`
    - `browser_automation_task`
    - `plugin_workflow_task`
  - explicitly rejects `gpu_required` and `sandbox_required`
- `apps/web/server/services/runEngine.ts`
  - only dispatches external connector follow-up work via `queueOpenClawWorkerJob()`
  - this is not yet a general persona/workflow capability-routing model
- `apps/web/server/services/workerAuthService.ts`
  - all worker auth is gated by the tenant flag `openClawExternalRuntime`
- `apps/web/server/services/workerDelegationService.ts`
  - delegated worker platform access is also gated through the same OpenClaw feature flag
- `apps/web/server/services/workerPolicyService.ts`
  - always returns `DEFAULT_CLAW_GATEWAY_COMPATIBILITY`, which is gateway-centric and not runtime-specific

### 2.3 Team binding is partially generalized, but not runtime-complete

`apps/web/server/services/teamService.ts` already includes a future-facing helper:

- `workerSupportsBoundConnector()`

This means the code no longer relies only on a raw runtime name at every call site. However:

- OpenClaw is still the only runtime treated as production-ready by default
- there is no complete runtime-family eligibility matrix
- the product docs still truthfully describe Bound Worker as an OpenClaw gateway path, not a ZeroClaw desktop path

### 2.4 Desktop/local execution is not yet part of the worker fabric

`specs/feature/004-desktop-app/spec.md` describes the current desktop app as:

- Tauri + React
- localhost python proxy
- chat and multimodal artifact flow

It does **not** define the worker-host responsibilities required by the revised fabric spec:

- worker registration UX
- runtime provisioning
- background service/tray worker lifecycle
- workspace/file policy onboarding
- ZeroClaw profile management
- local job poller / heartbeat / uploader modules

In other words: SmartSpec Desktop exists, but not yet as a worker-host product slice.

### 2.5 Existing media/runtime assets that should be reused

The repo already contains reusable media execution building blocks:

- `apps/tauri-shell/src-tauri/src/video_editor/job_dispatcher.rs`
  - typed local media job spec and dispatch model
- `python-backend/app/tasks/media_job_worker.py`
  - FFmpeg-based media-job worker with validation and progress semantics
- `python-backend/app/video/pipeline.py`
  - two-stage assembly and final render pipeline

These are important because the missing worker-fabric work should bridge to them instead of inventing an unrelated media pipeline from scratch.

## 3. Current support assessment against the revised spec

### 3.1 Supported now

- worker registry tables and core control-plane entities
- worker register / heartbeat / claim / event / artifact / diagnostics APIs
- artifact publication back into SmartSpecPro Library + indexing
- owner-bound personal worker model
- OpenClaw team binding through `externalWorkerId`
- delegated worker sessions for platform HTTP access
- budget caps and worker credit attribution
- delegated worker MCP surface for truthful tool execution
- admin fleet visibility and worker actions

### 3.2 Supported partially

- runtime taxonomy exists in shared schema, but not in service behavior
- runtime-aware Bound Worker direction exists, but mostly as eligibility scaffolding
- runtime profiles and worker policies exist in schema, but are not yet runtime-family-specific in practice
- docs/admin flows are strong for OpenClaw workers, not for full worker fabric
- gateway compatibility exists for HTTP-first Claw clients, but is not the same as local desktop/runtime completion

### 3.3 Missing

- SmartSpec Desktop as machine host for worker fabric
- ZeroClaw managed runtime profile lifecycle
- Native vs WSL2-managed worker profile behavior
- workspace/file-access onboarding and per-job workspace lifecycle
- typed local job families such as:
  - `video_assembly`
  - `local_folder_ingest`
  - `comfy_image_generation`
  - `comfy_workflow_run`
- GPU-aware scheduling and local media/job adapters wired into worker jobs
- runtime-generalized scheduler, registry, auth, and feature-flag model
- NemoClaw secure-pool registration and routing semantics
- HiClaw cluster registration and routing semantics
- workflow-builder nodes for worker dispatch/wait/publish/index routes

## 4. OpenClaw official-doc verification

Verified on 2026-04-08 using official OpenClaw docs:

- Install docs:
  - https://docs.openclaw.ai/install/index
  - Windows path still strongly recommends WSL2
  - installer script handles onboarding
  - docs explicitly mention `openclaw doctor`, `openclaw status`, and `openclaw dashboard`
- Onboarding wizard docs:
  - https://docs.openclaw.ai/wizard
  - wizard configures gateway mode, channels, skills, and workspace defaults
- Docs home:
  - https://docs.openclaw.ai/
  - OpenClaw is still positioned as a self-hosted gateway with channel surfaces and plugin-driven extension points
- Plugin docs:
  - https://docs.openclaw.ai/plugins
  - plugins extend commands, tools, Gateway RPC, HTTP routes, services, and skills
- Session docs:
  - https://docs.openclaw.ai/session
  - session model remains a real product concept, not a thin request/response shim

## 5. Conclusion

The revised spec is directionally correct about OpenClaw itself:

- OpenClaw still looks like a full gateway/runtime product
- WSL2 is still the recommended Windows path
- onboarding, dashboard, sessions, channels, plugins, and skills are still part of the official surface

The main gap is not that OpenClaw lost these capabilities. The main gap is that SmartSpecPro currently implements only the OpenClaw-centric control-plane slice and has **not yet completed the broader distributed worker fabric** described in the revised architecture.
