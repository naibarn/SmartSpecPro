# Section 07 — Tools, integrations, artifacts, and media adapters

## Goal

Connect workflow nodes to approved real tools and media capabilities with
security, provider readiness, progress, and artifact contracts.

## Owned paths

- `apps/web/server/services/workflowStudioNodeAdapters/tools.ts`
- `apps/web/server/services/workflowStudioNodeAdapters/media.ts`
- adapter security/contract tests.

## Node coverage

`http-request`, `mcp-tool`, `connector-action`, `database-query`,
`database-write`, `notification`, `file-transform`, `artifact-store`,
`artifact-publish`, `browser_session_start`, `browser_session_instruction`,
`browser_session_wait_for_user`, `browser_session_review_gate`,
`browser_observe`, `browser_action`, `browser_file_transfer`, `browser_verify`,
`browser_takeover`,
`image-generate`, `video-generate`, `audio-generate`,
`tts`, `transcription`, `storyboard`, `media-compose`, `media-qc`, `render`,
and `preview`.

Spec 204 runtime profiles are admission metadata for media/document/code/agent
nodes: `media-utils`, `video-render`, `remotion-render`, `document`, `hermes`,
`code-sandbox`, and `cpu-ml`. They are selected by the Runtime Router with
health/resource/stall/cost evidence; the graph must not expose arbitrary image,
container, host-path, or credential controls.

## Behavior and safety

- HTTP validates URL with `ssrfValidator`, method/header/body schemas, public
  allowlists, response size, timeout, status/error policy, and typed JSON/text
  outputs.
- MCP/connectors use registered tool manifests, schema validation, tenant/user
  permission scopes, approval requirements, and provider readiness.
- Browser nodes reuse `workflowBrowserSessionNodeTypes.ts`, live browser session
  contracts, the workflow browser feature flag, and the approved browser
  worker/MCP boundary. Start/instruction/user-wait/review-gate are distinct
  contracts with explicit session/evidence ports, allowlists, action policy,
  session ownership, and review before irreversible actions. Observe/action/
  file-transfer/verify/takeover use typed targets, stale-target handling,
  evidence, human fencing and finality checks. They must not restore Agency UI
  or a retired workflow engine.
- Database query/write accepts approved parameterized templates and mandatory
  tenant filters; user-entered arbitrary SQL or unbounded writes are rejected.
- Notification validates destination/secret reference and records delivery
  status without exposing credentials.
- File transform uses managed file references, MIME/size limits, and durable
  output objects. Artifact store/publish adds ownership, retention, preview,
  and publication metadata.
- Media nodes map to existing provider/Runner/worker contracts. They admit real
  jobs, project progress/provider errors, and return authorized media/artifact
  refs. A provider not ready state cannot appear as successful output.

## TDD-first checks

- SSRF/private address/oversized response/timeout HTTP cases fail safely.
- MCP/connector permission and schema failures happen before execution.
- Browser sessions enforce feature flag, tenant ownership, allowlist, approval,
  evidence retention, and resume policy.
- Database tenant filters and parameter binding are enforced.
- File/artifact refs are authorized, bounded, and previewable.
- Media adapters expose queued/running/progress/completed/failed output states.
- Runtime-profile tests cover image/version, resource limits, health, progress,
  timeout/OOM/stall, artifact postcondition, cleanup and truthful unavailable
  state for each Spec 204 profile.

## Exit criteria

At least one automation workflow and one media workflow use real approved
adapters, show honest readiness, and produce an artifact usable by Result View.

## UI/UX Contract

### Target User / JTBD

N/A for direct UI; tool/media adapters provide readiness, progress, output, and artifact contracts.

### Existing Pattern Reference

Reuse existing media model forms, render progress, artifact, and preview patterns; composition is section 10.

### Surface Inventory

N/A — adapter layer only.

### Component Map

N/A — section 10 renders integration/media settings and artifacts.

### State Matrix

Permission required, provider unavailable, queued, running, progress, failed, completed, and artifact-ready states are emitted.

### Responsive Matrix

N/A — section 10 owns responsive presentation.

### Accessibility Acceptance

N/A — section 10 verifies labels, progress, and artifact actions.

### Copy Contract

Return localized SSRF/permission/provider/artifact error keys; never expose secrets.

### Browser Evidence Required

N/A for direct browser behavior; section 12 proves automation/media flows.
