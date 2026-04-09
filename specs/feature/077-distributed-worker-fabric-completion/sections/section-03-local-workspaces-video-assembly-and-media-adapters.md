# Section 03: Local Workspaces, Video Assembly, and Media Adapters

## Goal

Introduce the first real desktop-local worker job slice with workspace-scoped file access, artifact publication, and reuse of existing media execution primitives.

## Why this section exists

The revised distributed worker fabric is not complete until SmartSpecPro can send at least one local file/GPU/media job to a desktop-local worker. `video_assembly` is the clearest first slice because it matches the original architecture goals and the repo already contains reusable FFmpeg/media assets.

## Scope

1. Add the `video_assembly` job type to the shared worker model.
2. Define per-job workspace structure:
   - source workspace
   - staging workspace
   - temp workspace
   - output workspace
3. Define workspace-scoped file access, audit, cleanup, and quota rules.
4. Lock a canonical `video_assembly` contract for minimum inputs, outputs, progress stages, and failure classes.
5. Connect the worker job path to existing media execution assets in:
   - `apps/tauri-shell/src-tauri/src/video_editor/*`
   - `python-backend/app/tasks/media_job_worker.py`
   - `python-backend/app/video/pipeline.py`
6. Preserve artifact upload, publish, and indexing through the existing worker artifact services.

## Cross-section role

- This section depends on Section 01 for runtime selection and compatibility gating.
- It depends on Section 02 for desktop-worker registration, runtime profile, and shared-worker identity rules.
- It exports the canonical local job contract and artifact-publication behavior that Section 05 must describe truthfully in workflow and admin/docs surfaces.

## Suggested files

- `apps/web/shared/workerRuntime.ts`
- `apps/web/server/services/workerSchedulerService.ts`
- `apps/web/server/services/workerArtifactService.ts`
- `apps/web/server/services/runEngine.ts`
- `apps/web/server/services/workerCallbackService.ts`
- future desktop worker adapter modules
- existing media runtime files in `apps/tauri-shell` and `python-backend`

## Design rules

- Do not reimplement FFmpeg business logic if an existing module already matches the needed adapter.
- File access must remain policy-bound and auditable.
- Artifact publication must stay inside SmartSpecPro's current Library and indexing flow.
- `video_assembly` must not be routed through OpenClaw simply because the worker fabric already exists there first.
- Reused media modules must sit behind a typed adapter boundary; raw shell fragments, ad-hoc FFmpeg argument passthrough, and unnormalized user paths are out of scope.
- Workspace-scoped staging is the default; UNC, team-drive, and full-machine paths require explicit policy elevation.
- Worker job logs and diagnostics must redact secrets and avoid echoing unnecessary local-path details into centralized control-plane logs.
- Desktop-local artifact publication must reuse `workerArtifactService` validation, safe-serving, and indexing behavior instead of creating a desktop-only publish bypass.

## Canonical `video_assembly` contract

### Minimum input payload

- `jobType = "video_assembly"`
- `inputRefs[]` with `sourceKind` in:
  - `library_asset`
  - `authorized_local_path`
  - `staged_upload`
- `editPlan` describing deterministic clip order, trim ranges, reframe/resize instructions, and intro/outro or watermark toggles
- `subtitlePlan` describing source priority, subtitle mode, and optional transcript/subtitle refs
- `renderProfile` describing aspect-ratio targets, codec/quality preset, and whether GPU is required
- `workspacePolicy` describing approved source roots and staging rules
- `outputTargets` describing required rendered assets, optional subtitle/thumbnail outputs, and publish expectations

### Required outputs

- one or more rendered media artifacts
- optional subtitle artifacts
- optional thumbnail artifacts
- media metadata manifest with checksums and basic duration/resolution details
- structured adapter execution summary for audit/debug use

### Required progress stages

- `resolve_inputs`
- `stage_workspace`
- `probe_media`
- `build_edit_plan`
- `render_outputs`
- `verify_outputs`
- `upload_artifacts`
- `publish_artifacts`
- `trigger_indexing`

### Failure taxonomy

- retryable:
  - `transient_input_fetch_failed`
  - `temporary_disk_pressure`
  - `runtime_restart_required`
  - `artifact_upload_failed`
  - `index_enqueue_failed`
- terminal:
  - `unauthorized_path`
  - `unsupported_media`
  - `insufficient_gpu`
  - `insufficient_temp_disk`
  - `adapter_contract_violation`
  - `render_failed`
  - `artifact_publish_failed`

## Testing first

- worker scheduler tests for `video_assembly` matching
- file-scope and unauthorized-path rejection tests
- artifact publication tests for desktop-local outputs
- artifact publication tests proving desktop-local outputs still obey `workerArtifactService` safe-serving and content-type rules
- adapter contract tests proving progress and artifacts normalize into worker job events
- canonical `video_assembly` contract tests proving required progress stages and failure classes normalize consistently
- adapter-security tests for path normalization, staged-input enforcement, and rejection of unsafe command fragments
- log-redaction tests for sensitive local-path and secret handling
