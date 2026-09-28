# Synthesized Implementation Specification — Feature 148

## Source and scope

This document synthesizes `spec.md`, `claude-research.md`, and
`claude-interview.md`. The source spec is the governing requirement set. This
implementation is additive to Features 145–147 and existing MCP, Worker App,
Remotion, Hermes media, Library, Media History, ACL, billing, and feature-flag
authorities.

## Outcome

SmartAIHub must provide one governed capability model for MCP clients, Hermes
agents, Windows/macOS workers, Remotion, FFmpeg, ComfyUI, and future Local AI.
The server owns identity, tenant/user/device authorization, quota/credits, job
state, artifact publication, ACL/download, audit, and rollout. Local runtimes
execute only typed, admitted, workspace-scoped operations.

## Required implementation outcomes

### MCP and client access

- `/v1/mcp` is the canonical MCP endpoint with the baseline methods:
  `server/discover`, `initialize`, `tools/list`, `tools/call`, `resources/list`,
  `resources/read`, `ping`, and session termination/error behavior.
- OAuth/PKCE is preferred for browser-capable Hermes, Claude, and Codex.
- Protected Resource Metadata and `WWW-Authenticate` resource metadata
  challenges must be truthful, audience-bound, and fail closed when production
  verification configuration is absent.
- Existing device authorization must support browserless CLI approval from
  another browser. If a client cannot use it, a dedicated MCP CLI key is
  created in the SmartAIHub UI with scopes, expiry, quota, one-time reveal, and
  revoke. Worker/provider/refresh tokens are never substituted.
- Settings UI generates client-specific setup for Hermes One, Hermes CLI,
  Claude/Claude Code, Codex CLI, and generic MCP clients. Existing integration
  panels remain separate. UI must distinguish MCP connected, Hermes device
  connected, and renderer runtime ready.
- `tools/list`, resources, guides, and UI must derive availability from the
  same tenant/scopes/feature/runtime evidence. Experimental MCP tasks and
  subscriptions remain disabled until separately implemented and verified.

### Hermes gateway and worker jobs

- Reuse existing `queueHermesWorkerJob`, `external_agent_task`,
  `hermesAgentRuntime`, and external connector dispatch as the parent lane.
- A Hermes parent task correlates conversation/message, target device,
  approval, quota/credit aggregate, and child job ids. It is not arbitrary
  shell or raw workflow execution.
- Child work uses existing typed `worker_jobs` contracts for ComfyUI, Remotion,
  FFmpeg, and Local AI; every child is independently authorized, leased,
  idempotent, cancellable, auditable, and artifact-published.
- `hermes_media_*` provider-account generation remains a distinct namespace and
  must not share connection/result/billing state with the agent gateway.
- Relay delivery is outbound from the device, using existing claim/heartbeat/
  event/artifact endpoints when sufficient; persistent transport or polling
  fallback has the same cursor/idempotency semantics. Browser close cannot cancel
  a task.

### Worker runtime and ComfyUI

- Existing runtime manifests, worker control plane, Remotion contracts, and
  signed runtime-pack serving are extended rather than replaced.
- Worker doctor/readiness must block claims before late dependency failure and
  expose Install/Repair/Update/Verify/manual prerequisite/Check again states.
- Windows 11 native/WSL2 and Hermes Windows are supported only with matching
  signed packs and machine evidence. Current Hermes macOS support is arm64;
  macOS Remotion remains blocked until a signed sidecar pack and real evidence
  exist. macOS Intel is unsupported unless a separately signed allowed pack
  exists.
- ComfyUI uses existing `comfy_image_generation` and `comfy_workflow_run`
  contracts. The missing adapter must discover a registered loopback service,
  verify version/model/custom-node/GPU/disk readiness, submit `/prompt`, observe
  progress/history/WebSocket as available, interrupt by prompt id, collect only
  approved outputs, validate image/video/ffprobe metadata, and use existing
  artifact init/upload/complete/publication.
- Web and MCP submit the same jobs. Default Comfy concurrency is one per
  runtime; sequential A→B→C, cancel, retry, disconnect/reconnect, upload
  resume, lease recovery, and exactly-once publication are required.

### Security, quota, persistence, and operations

- Deny arbitrary shell, arbitrary filesystem, arbitrary PID kill, arbitrary
  Comfy URL/custom-node execution, direct browser-to-local-service calls, raw
  tokens, permanent URLs, and cross-tenant references.
- Maintain device/user/tenant binding, scope checks, prompt-injection/task-plan
  boundaries, step-up approval, audit, data-locality/egress consent, and
  short-lived ACL-checked download references.
- Apply one durable credit/quota decision to web, MCP, Hermes, and Worker paths
  across five-hour, one-day, and seven-day windows; retries and child jobs must
  not double-reserve. Redis is ephemeral acceleration only.
- Durable task/event/install/correlation state must use existing authorities or
  a justified additive migration with tenant-safe uniqueness, cursors, CAS,
  leases, retention, and rollback.
- Feature flags and MCP runtime settings are DB/UI controlled in production,
  disabled by default, audited, and exposed only after dependent gates pass.

## Evidence boundary

Focused code/tests can prove contracts, adapters, authorization, and UI states.
They cannot prove real provider behavior, clean Windows/macOS installation,
GPU/model compatibility, signed release artifacts, or production telemetry.
Those remain explicit production gates and must not be reported as complete from
mocks or package availability alone.
