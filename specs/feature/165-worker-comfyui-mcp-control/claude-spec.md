# Feature 165 Synthesized Specification

This document synthesizes the approved Feature 165 specification, the
codebase/research findings, and the confirmed product decisions recorded in
`claude-interview.md`. The source specification remains
`spec.md`; this file is the planning input for implementation decomposition.

## Outcome

Upgrade the SmartAIHub Worker App so it can operate ComfyUI through MCP as a
real, secure, recoverable render backend. It must support multiple saved
connections, workflow discovery/approval/versioning, typed image/video/shot
jobs, start/last/reference frames, local output validation, optional Library
publication, and a truthful bilingual Worker dashboard. Existing Worker,
Remotion, Hermes, legacy Comfy jobs/settings, and persisted data must remain
compatible.

## Non-negotiable boundaries

1. Worker-to-Comfy communication uses an internal MCP adapter. Supported
   profiles are same-machine stdio, approved stdio bridge, approved
   self-hosted Streamable HTTP, Comfy Cloud Streamable HTTP, and managed SSH
   tunnel.
2. Worker-to-SmartAIHub pairing, job claim/lease, heartbeat, progress, cancel,
   monitoring, artifact upload, and publication continue through the existing
   authenticated control-plane HTTP/REST route family. MCP is not a replacement
   for that control plane, and Worker App must not expose an unauthenticated
   REST proxy.
3. Secrets, local paths, staged bytes, local execution ledger, and final
   pre-publication output stay on the Worker. Server stores only non-secret
   projections, authorized manifests, job/lease state, and published Library
   metadata.
4. Existing legacy settings and job contracts are read through compatibility
   adapters. New Feature 165 Comfy jobs use the MCP path and cannot be claimed
   without an eligible profile, capability snapshot, workflow version, and
   policy/permission checks.
5. HyperFrames is explicitly excluded from new capability, dependency,
   readiness, claim routing, and UI defaults. Existing compatibility code is
   left intact.

## Functional requirements

### Connection/profile management

- Save multiple profiles per paired Worker installation and select one active
  default; permit a per-job allowed override.
- Store credentials only in the OS keychain/native secure store. Server
  projection contains no secret, local path, command argument, or signed URL.
- Probe MCP protocol/server/tools/workflows/input/output capabilities and keep
  a hashable, expiring capability snapshot.
- Display profile kind, transport, auth/session expiry, health, capabilities,
  effective permissions, policy/permission/profile revisions, last probe, and
  recovery action.
- Support enable/disable/revoke/remove/reauthorize/refresh/set-active with
  revision-checked server acknowledgement and audit records.
- HTTP profiles enforce approved origin, TLS, Origin/SSRF policy, MCP protocol
  version header, session ID, auth on every request, reconnect, and safe 404
  session restart. Stdio uses supervised child process, protocol-only stdout,
  no shell interpolation, and bounded cleanup.

### Workflow and capability model

- Discover from a healthy profile but require server/admin approval before use.
- Store stable workflow ID, immutable version, checksum, input/output schemas,
  canonical mapping, supported operations, required capabilities, resource
  limits, and compatible connection kinds.
- Map typed product inputs to workflow inputs: prompts, models, images, video,
  audio, masks, start frame, last frame, ordered reference frames, duration,
  FPS, size/aspect, seed, and output format.
- Validate schema/checksum/capability/policy at job creation, claim, and the
  Worker pre-submit gate. Tool names and workflow graph/endpoint selection are
  never arbitrary browser input.
- MiniMax H3 is a capability/workflow mapping only; no universal hardcoded
  provider mode.

### Canonical jobs and execution

Support dedicated `comfy_image_generation`, `comfy_video_generation`,
`shot_video_generation`, and `comfy_workflow_run` types. A shot card can submit
image or video with Worker/profile/workflow selection, duration, start/last/
reference frames, schema-driven advanced inputs, Manual/Guided AI/Automated AI
input resolution, preflight, cost/credit policy, queue status, cancel, retry,
and output publication state.

The server enriches the browser intent into a persisted job envelope. It owns
tenant/owner/job IDs, timestamps, worker/profile/workflow resolution, policy,
budget, credit, lease, and Library target. Job attempts capture immutable
profile, permission, connection-policy, workflow-binding, input-policy,
approval, and remote-transfer revisions. Unassigned Worker/profile values are
explicitly null; no viewer device or active profile is substituted.

Claim is an atomic server lease and capacity operation. Only the lease owner
executes. A default Worker has serial capacity across all Worker job families;
waiting work is visible in Overview. Retries create a new attempt, never
rewrite an old attempt. Expiry is terminal for the attempt, releases capacity,
and returns `JOB_EXPIRED`; it cannot be reclaimed in place.

Execution phases are normalized from preflight/staging through MCP submit,
remote running, output collection, validation, local save, Library publication,
and completion while remaining compatible with the existing coarse
`worker_job_status` enum. Progress events are monotonic/idempotent and include
safe job/profile/workflow/revision provenance.

### Outputs and recovery

- Stage inputs only from authorized managed or Worker-local one-time staged
  asset references with hash/type/size/role/Series scope verification.
- Remote transfer requires explicit consent/policy and allowlisted roles; local
  only means no source bytes leave the Worker.
- Fetch output through the negotiated MCP capability, never trust returned
  filesystem paths, validate MIME/magic/ffprobe/count/size/codec/duration,
  atomically save to a confined local job workspace, and reject malformed or
  unknown-role outputs.
- Upload only validated outputs through the existing authenticated artifact
  protocol. `uploadLibrary=true` requires a server-authorized logical Library
  target before claim; multipart upload resumes by fingerprint and never
  reruns Comfy.
- Persist a local execution/upload ledger before submit. On restart, reconcile
  every nonterminal execution using the immutable execution reference. Never
  blindly resubmit after disconnect. Orphans cannot publish or be claimed until
  bounded reconciliation completes.

### Shared monitoring and UI

- Web and Worker consume one server-authoritative `WorkerJobSummary` projection
  containing full/copyable Job ID, raw/localized job type, Worker/machine,
  Series/Episode/Shot, resource/profile/workflow, timestamps, phase, progress,
  queue/capacity, connection, remote execution ID, failure/wait/recovery/cancel
  state, event sequence, observed/stale times, and safe output count.
- Worker Overview puts active work immediately below the header, shows Ready/
  Busy/Waiting/Paused/Disconnected/Needs attention truthfully, then waiting and
  recent jobs. Display freshness never grants execution authority.
- Header separately reports SmartAIHub pairing, Worker loop, and active Comfy
  session, including expiry/last checked/reconnect guidance.
- Sidebar is canonical: Overview, Connection, Series, Media Workspace, Queue,
  Published, AI Plan, ComfyUI Connections/Workflows/Jobs, Runtime, Settings.
  Remove duplicate Quick Actions and keep Media Workspace, Queue, Runtime,
  and ComfyUI Jobs single-purpose.
- All Worker screens, dialogs, errors, statuses, accessibility labels, dates,
  and recovery actions support Thai/English with safe fallback.

## Authorization and data model

Worker pairing consent is the initial source of truth for Worker scopes and
later views show those granted scopes checked/read-only. Revoke/disable applies
on server revision immediately and on the next authenticated Worker sync;
affected claim/preflight/submit/upload/publication gates fail closed. The
additive `workers:jobs:read` scope controls job-summary/detail synchronization
and is never silently granted to old pairings.

Logical server records are Comfy connection profiles, capability snapshots,
workflow registry/version records, Series operation bindings, the shared
all-job projection, and a Comfy execution ledger. Revision namespaces are
typed and auditable: profile, effective permission, connection policy,
workflow binding, input/approval/transfer policy, and projection freshness are
not interchangeable.

## Migration, compatibility, and rollout

Migrations are additive, nullable/defaulted, idempotent, dry-run capable,
non-destructive, and reversible by disabling new paths. Preserve legacy Comfy
settings and job rows; import legacy connection data at most once as an
unverified profile. Preserve old Web responses through read-only projection
adapters. Negotiate Worker/server contract ranges and reject incompatible
required versions without weakening security.

Roll out read-only projections, local profiles, workflow registry/bindings,
image/video jobs, remote self-hosted transport, Cloud, and finally automated AI
mapping behind independent flags. Each enabled flag needs focused tests and
controlled environment proof; static tests do not prove provider/GPU access.

## Quality gates

Rust tests cover profile/transport/MCP/session/capability/schema/mapping/path/
output/ledger behavior. Web Vitest tests cover Zod contracts, authorization,
revision/idempotency, migrations, projection parity, routes, and UI states.
Fake stdio/HTTP MCP servers run in CI. Release gates require controlled local,
self-hosted remote, and Cloud smoke tests for enabled transports, including
authentication, submit/status/output, expiry, cancellation, recovery, and no
duplicate publication. UI evidence must verify the real Worker/Web flows and
all enabled buttons must map to a real command, API, or persisted transition.
