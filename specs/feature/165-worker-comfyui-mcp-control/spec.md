# Feature 165 — Worker App ComfyUI Control via MCP

**Status:** Implementation-ready — spec audit closed (2026-08-27)
**Date:** 2026-08-26
**Primary owner:** Worker App / Worker Control Plane / ComfyUI Integration
**Dependencies:** Features 162, 163, 164; Worker pairing and lease protocol;
managed media/R2 Library; Series/episode/shot contracts

## 1. Executive summary

Implement a production-grade ComfyUI control layer in the Worker App. A user
can save several ComfyUI connections, test and activate one, inspect the
workflows and capabilities available through that connection, run a typed
workflow, save output on the local Worker disk, and optionally publish verified
output to the SmartAIHub Library.

The Worker can also claim dedicated SmartAIHub render-jobs for image generation,
video generation, and Series shot generation. A Series binds its image and
video generation defaults to registered workflow versions. The episode shot
page presents the chosen Worker/connection/workflow and collects only inputs
that the selected workflow schema requires. The browser submits a render-job;
the Worker claims it, invokes ComfyUI through MCP, collects and validates the
output, and reports the artifact back through the existing authenticated
Worker control plane.

The feature supports:

- ComfyUI on the same machine through local stdio MCP;
- self-hosted ComfyUI on LAN or another host through a configured `comfy-mcp`
  stdio bridge or an approved Streamable HTTP MCP endpoint;
- self-hosted remote ComfyUI through a managed SSH tunnel where required;
- ComfyUI Cloud through its hosted MCP endpoint and OAuth/API-key credential;
- many saved profiles, one active default, and explicit per-job selection;
- arbitrary registered ComfyUI workflows, dynamic input/output schemas,
  start/reference/last frames, image and video outputs, progress, cancellation,
  retries, local persistence, and optional Library publication.

The SmartAIHub Worker control plane remains separate from MCP. MCP is the
Worker-to-Comfy transport, not the user-facing job queue or authorization model.

## 2. Goals

1. Provide one safe adapter contract for all supported ComfyUI connection types.
2. Make connection state, capabilities, credentials, active selection, and
   expiry visible and editable in the Worker App.
3. Discover or register workflow schemas and render correct typed inputs without
   requiring raw graph JSON in the normal UI.
4. Allow admins to govern available connections/workflows and Series defaults,
   while allowing users to choose an allowed alternative at the correct step.
5. Add reliable image/video/shot job contracts with claim, lease, progress,
   cancellation, retry, idempotency, and output provenance.
6. Preserve local-source privacy and save finished outputs locally before any
   optional upload to SmartAIHub Library.
7. Make the episode storyboard workflow practical for nine-shot episodes,
   including start frame and ordered reference frames.
8. Make startup self-check and background job intake reliable without requiring
   the Worker window to remain open.
9. Make all user-visible Worker UI bilingual: Thai or English selected globally.

## 3. Non-goals

- Replacing the authenticated SmartAIHub Worker REST/control-plane protocol with
  MCP.
- Exposing a public, unauthenticated ComfyUI proxy or arbitrary MCP tool runner.
- Rebuilding ComfyUI's graph editor inside SmartAIHub.
- Uploading original local footage to the server merely to inspect it.
- Making HyperFrames a dependency or presenting it as a current capability.
- Automatically changing a user's selected connection after a failure without
  an explicit routing policy and an audit record.
- Making every ComfyUI custom node or provider workflow executable without an
  administrator-approved schema and output contract.

## 4. Current-state gaps to close

| Area | Current gap | Required result |
|---|---|---|
| Transport | Worker has one local stdio command and loopback URL | Adapter supports local stdio, remote stdio bridge/approved MCP HTTP, Cloud HTTP, and managed tunnel |
| Profiles | One global ComfyUI configuration | Multiple saved profiles with active/default and per-job resolution |
| Auth | No per-profile OAuth/API-key lifecycle | OS secure-store references, expiry, refresh/revoke, redacted diagnostics |
| Capabilities | Hardcoded operation names and aspect rules | Negotiated protocol/tools/workflows/input/output/file/job capabilities |
| Workflow | Workflow IDs are lightweight and not version-pinned | Registry, schema, checksum, mapping, compatibility, lifecycle status |
| Jobs | Existing types do not carry a complete connection/workflow resolution | Dedicated canonical image/video contracts plus legacy compatibility |
| Inputs | Static assumptions for start/reference frames | Typed asset staging and schema-driven mapping for image/video workflows |
| Outputs | Local artifact extraction is narrow | Multi-output collection, validation, local atomic save, optional Library upload |
| Series UI | Shot UI can submit Worker work without complete Comfy selection | Series defaults plus per-shot connection/workflow/input preflight |
| Recovery | No complete remote execution/output recovery state | Durable correlation, resume, cancel, retry and idempotent report |
| Security | No complete endpoint/tool/path policy | Allowlisted profiles/tools, SSRF/path/symlink protection, tenant/audit checks |
| UX | No connection/workflow/job management model for multiple profiles | Focused ComfyUI screens integrated with existing Sidebar and Queue |

## 5. Terminology and ownership

- **Connection profile:** Non-secret identity and secure credential reference
  describing how one Worker reaches one ComfyUI MCP server.
- **Capability snapshot:** The last verified MCP protocol, tools, schemas,
  limits, and health result for a profile.
- **Workflow registry entry:** Server-governed logical workflow identity.
- **Workflow version:** Immutable input/output schema, mapping, graph/template
  reference, checksum, and compatibility metadata.
- **Workflow resolution:** The exact profile and workflow version selected for a
  job, including why it was selected.
- **Job workspace:** A confined local directory for staged inputs, raw outputs,
  validated outputs, logs, and manifests for one job.
- **Derived artifact:** A validated local file that may be published to Library.

Ownership is split as follows:

| Boundary | System of record |
|---|---|
| User, tenant, Series, entitlement, billing, job lease | SmartAIHub server |
| Secret material, local paths, local staged bytes, local job workspace | Worker device |
| Comfy execution state and GPU queue | ComfyUI/MCP server |
| Workflow policy and Series binding | SmartAIHub server, cached read-only on Worker |
| Final artifact bytes before publication | Worker device |
| Published Library metadata/object | SmartAIHub server/R2 |

## 6. Architecture

```text
                         SmartAIHub Server
  Series/workflow policy ─ job creation ─ lease ─ progress ─ Library/R2
              │                       ▲                 ▲
              │ authenticated control│                 │artifact upload
              ▼                       │                 │
        ┌────────────── Worker App ───┴─────────────────┐
        │ Sidebar / Connections / Workflows / Queue      │
        │ Local secure store + job workspace             │
        │ ComfyMcpAdapter                                │
        │  ├─ Stdio adapter ─ local comfy-mcp            │
        │  ├─ stdio bridge/approved HTTP ─ self-hosted   │
        │  ├─ Streamable HTTP ─ ComfyUI Cloud            │
        │  └─ Managed SSH tunnel + one of the above      │
        └──────────────────────┬─────────────────────────┘
                               │ MCP JSON-RPC
                               ▼
                    ComfyUI / ComfyUI Cloud
```

### 6.1 Adapter interface

Implement one internal interface in the Rust Worker runtime. Transport details
must not leak into React or job routing:

```text
connect(profile, secret_ref) -> Session
negotiate(session) -> CapabilitySnapshot
list_workflows(session, filters) -> WorkflowDescriptor[]
get_workflow_schema(session, workflow_ref) -> WorkflowSchema
validate_workflow(session, workflow_ref, canonical_inputs) -> PreflightResult
stage_inputs(session, job_workspace, input_refs) -> StagedInputMap
submit(session, workflow_ref, mapped_inputs, idempotency_key) -> ExecutionRef
get_status(session, execution_ref) -> ExecutionStatus
wait_or_watch(session, execution_ref, deadline) -> ExecutionStatus
cancel(session, execution_ref) -> CancelResult
collect_outputs(session, execution_ref, job_workspace) -> CollectedOutputs
close(session)
```

The adapter must use only an allowlisted subset of discovered MCP tools. A
workflow payload cannot name a tool outside that allowlist or change the
connection endpoint.

The adapter normalizes provider responses into stable internal records:

```text
CapabilitySnapshot { protocol, server, tools, workflowRefs, limits,
  inputKinds, outputKinds, authState, observedAt, expiresAt, hash }
ExecutionRef { jobId, attempt, remoteExecutionId, profileId,
  profileRevision, permissionRevision, policyRevision,
  workflowVersionId, submittedAt }
ExecutionStatus { phase, progress?, queuePosition?, remoteState,
  cancellable, observedAt, sequence }
CollectedOutputs { outputs: [{ role, mediaType, remoteRef, localPath,
  bytes, sha256 }], collectedAt }
```

Provider-specific fields stay in a redacted extension map. The Worker executor,
server event contract, and UI consume these normalized records rather than
parsing Comfy tool responses independently.

### 6.2 Transport profiles

Supported profile kinds:

| Kind | Transport | Behavior and constraints |
|---|---|---|
| `local_stdio` | subprocess stdio | Launch configured executable/args; validate command; no shell interpolation; local ComfyUI must be running or explicitly launchable |
| `self_hosted_stdio_bridge` | subprocess stdio | Worker starts the approved `comfy-mcp` bridge and configures its explicit remote ComfyUI target; supports LAN/remote without assuming ComfyUI exposes MCP HTTP |
| `self_hosted_http_mcp` | Streamable HTTP | Only an approved self-hosted MCP server endpoint; explicit HTTPS/approved LAN endpoint; MCP session and auth headers; no arbitrary job endpoint |
| `comfy_cloud` | Streamable HTTP | Fixed official Cloud endpoint or approved future endpoint; OAuth or API key; signed output download handled by Worker |
| `ssh_tunnel` | managed local tunnel + MCP | Worker owns tunnel lifecycle, host-key policy, port allocation, and cleanup; Comfy adapter still sees a validated local endpoint |

The default Cloud endpoint is `https://cloud.comfy.org/mcp` as documented by
ComfyUI. The endpoint is configuration-controlled and must be allowlisted; a
future endpoint or regional endpoint requires a new compatibility entry and
probe rather than being accepted from a job payload.

Legacy HTTP+SSE may be implemented as a compatibility adapter only when a
profile's probe explicitly reports support and the release flag enables it. It
is not the default or a promise for local `comfy-mcp`.

### 6.3 MCP session and runtime contract

The implementation must use the MCP protocol handshake and negotiated
capabilities, not a collection of ComfyUI-specific HTTP shortcuts:

- stdio uses one supervised child process with JSON-RPC messages on stdin/stdout;
  stdout is protocol-only and stderr is redacted diagnostic output;
- Streamable HTTP uses the negotiated MCP endpoint, required `Accept` headers,
  session initialization, session identifier handling, bounded reconnect, and
  server notifications where available;
- the adapter validates protocol version, server identity, tool schemas, and
  session lifetime before marking a profile healthy;
- request IDs, deadlines, cancellation, and reconnect state are correlated to
  the SmartAIHub job ID without putting secrets in the correlation value;
- unsupported protocol versions, missing session headers, malformed JSON-RPC,
  or tool-schema drift produce `MCP_PROTOCOL_INCOMPATIBLE` or
  `MCP_SCHEMA_CHANGED`, never a guessed invocation.

Runtime packaging is explicit for Windows and macOS. The Worker release ships
the adapter and its pinned compatibility metadata, detects the approved
`comfy-mcp`/`comfy-cli` runtime, reports the installed and required versions,
and provides actionable installation/update guidance. It must not silently
install arbitrary Python packages, binaries, or custom nodes. Runtime discovery,
upgrade, and licensing status are shown read-only in the canonical Runtime
screen, with a deep link to Connections when the user must edit a profile or
credential. Runtime never owns profile authoring, authentication, or job
controls, so it cannot become a duplicate Connections screen. An unavailable
optional profile does not stop other Worker job families.

The compatibility record includes Worker App version, OS/CPU architecture,
Python/runtime method, `comfy-mcp` version, `comfy-cli` version, ComfyUI server
version, custom-node/model prerequisites, and supported MCP protocol versions.
The same record is attached to the job manifest so an output can be reproduced
or diagnosed after a runtime upgrade. An upgrade must be staged, verified with
the fake-MCP/local smoke suite, and support rollback to the previous compatible runtime;
it must not mutate a running job's runtime in place. The previous compatible
runtime remains available until the new runtime passes its release gate and can
be selected for rollback.

## 7. Connection profiles and lifecycle

### 7.1 Profile model

Server metadata (no secrets):

```text
ComfyConnectionProfile {
  id, workerId, localProfileId, ownerScope, displayName, kind, transport,
  endpointLabel, endpointOrigin?, credentialRefFingerprint,
  tlsPolicy, allowedToolSet, allowedWorkflowScopes,
  timeoutPolicy, concurrencyPolicy, enabled, isActiveDefault,
  capabilitySnapshotId, capabilityHash, capabilityExpiresAt, sessionExpiresAt?,
  profileRevision, permissionRevision, policyRevision, projectionRevision,
  lastProbeAt, lastHealthyAt, healthState,
  createdAt, updatedAt
}
```

Worker-local secure record:

```text
ComfyConnectionSecret {
  profileId, credentialKind, osKeychainRef,
  refreshTokenOrApiKey, sshKeyRef, knownHostRef,
  expiresAt, lastRefreshAt
}
```

The API never returns secret values. Logs contain profile ID and redacted
endpoint label only. A local path, API key, OAuth token, SSH private key, or
signed output URL must never enter server metadata, telemetry, or job payload.
`endpointOrigin` is a normalized, policy-approved network origin for HTTP,
Cloud, or a remote stdio-bridge/SSH target; it is null for a same-machine
`local_stdio` profile and may be null when a remote target has no safe origin
to disclose. It must never contain a local filesystem path, command argument,
tunnel-local address, or private credential.

`profileRevision` versions non-secret profile configuration and its workflow
scope binding; `permissionRevision` versions the effective Worker/Comfy scope
set; `policyRevision` on this profile record versions the applicable admin/
tenant connection policy. Series binding, input-resolution, approval, and
remote-transfer policies have their own typed revisions captured in the job
fields that apply to them. `projectionRevision` is only the server
synchronization/read-model revision and is not an authorization revision.
Each relevant mutation increments its revision atomically and records
revision namespace, scope, actor, and time in the audit ledger. A capability
probe may update the capability snapshot and projection revision without
granting permission. Job creation captures the profile, permission, and every
applicable policy revision used for the attempt so later changes cannot rewrite
its provenance; revision numbers from different namespaces are never compared
as if they were one global counter.

### 7.2 Selection rules

- Each Worker installation/user context may save many profiles and has at most
  one active default for that paired Worker. Active selection is local to that
  Worker installation and is projected to the server as non-secret metadata;
  it is not a global account-wide switch that can change another machine's
  active profile. The default is shown in the header and used only when no
  explicit per-job selection exists.
- A profile is owned by one paired Worker (`workerId`) and one local secret
  (`localProfileId`). The server projection is discoverable only to the account,
  tenant, and Worker scope that owns it; a profile ID cannot be copied to a
  different Worker to obtain access to its secret.
- An admin may disable a profile, restrict it to a tenant/team/Series, restrict
  workflow families, or require approval for Cloud/remote use.
- A user may choose another allowed profile in the shot drawer or Worker job
  runner. The UI shows the reason it is available and the exact workflow
  version it will use.
- Server job resolution is authoritative. Worker-side selection is a request,
  not an authorization grant.
- When more than one Worker is eligible, routing matches the requested profile
  projection, workflow capabilities, GPU/resource policy, tenant scope, and
  current capacity. If the selected profile exists on another Worker, the job
  is not claimed by a Worker that lacks that profile; the UI must show the
  matching Worker/profile or explain that no eligible Worker is online.
- No silent failover. If policy permits fallback, the server supplies an
  ordered allowed list and the Worker records the selected fallback and reason.

### 7.3 Permission projection and revocation

The connection card must show two separate permission sets so users do not
mistake ComfyUI access for SmartAIHub access:

1. **Worker control-plane permissions** — claim/report jobs, read Series
   bindings, upload verified artifacts, and read the user's permitted Library
   targets. These come from Worker pairing and are displayed as server-issued
   scopes. The implementation reuses the shared scope catalog and must show
   the exact IDs and action mapping, including the existing
   `workers:register`, `workers:heartbeat`, `workers:claim`,
   `workers:report`, and `workers:diagnostics` scopes, the applicable Series/
   artifact/Library scopes, and the additive `workers:jobs:read` scope.
   A label such as “Worker access” is not sufficient evidence of an effective
   permission.
2. **ComfyUI profile permissions** — the exact MCP tool families, workflow
   scopes, file-upload/download ability, execution/cancel ability, concurrency
   limit, and expiry. These come from the profile policy plus negotiated
   capabilities.

The UI marks each permission as `granted`, `not granted`, `expired`,
`disabled`, or `unsupported`; it must not render an empty “scope: 0” as if the
profile had no useful capabilities when a capability snapshot exists. Users
can revoke a credential, disable a profile, remove a workflow scope, or unset
the active profile. Admins can revoke the Worker pairing or tenant access.
Revocation is checked before claim, preflight, submit, output upload, and final
publication. A revoked permission cancels/blocks only the affected operation,
preserves source and diagnostic evidence, and reports an actionable reason.
Neither the Worker UI nor a job payload can grant itself a new scope.

The pairing/install consent is the initial source of truth for Worker
control-plane scopes. It presents the effective scope list and policy preset
before completion; scopes granted at that point are shown checked/read-only in
the later permission view. The server persists the granted scope set,
permission revision, actor, and timestamp. Adding a scope later requires an
explicit reauthorization/permission-revision flow; an unchecked, revoked, or
unsupported scope is never silently enabled by the Worker or by a migration.
When a scope is revoked, the server marks the effective revision immediately,
the Worker applies it on the next authenticated sync/heartbeat, and every
affected claim, read, report, upload, and publication gate re-evaluates it.
Already running work follows the documented cancel/orphan policy, while
unrelated scopes remain unchanged.

Profile removal is a soft delete: disable new selection/claims, revoke local
credentials, retain a non-secret tombstone and historical job references, and
purge only after the configured audit-retention period. Deletion is blocked
while an active execution depends on the profile unless the user explicitly
chooses the documented cancel/orphan-reconciliation action.

### 7.4 Connection state machine

```text
draft → testing → healthy
                 ├─ credential_expired → reauthorize → testing
                 ├─ capability_stale → probing → healthy
                 ├─ degraded → retrying → healthy/degraded
                 └─ disabled/revoked
```

Save flow:

1. User chooses kind and transport.
2. UI collects only fields valid for that kind.
3. Native Worker validates endpoint/command, stores secret in OS keychain,
   creates a non-secret profile projection, and runs a probe.
4. Probe negotiates MCP protocol, tools, server info, workflow access,
   input/output capabilities, and a safe no-op/test validation.
5. The profile is selectable only when the probe result is healthy and the
   policy allows it.

For an expired credential, the UI must say what expired, when, and provide
Reauthorize/Refresh/Remove actions. For an unreachable profile, it must show
last successful probe, retry guidance, and whether jobs are blocked or queued.
When the MCP session or credential has a known expiry, the profile projection
and header show the exact expiry time in the user's locale and mark the profile
`expired` at that time with bounded clock-skew handling. An expired session
cannot claim or submit new work until reauthentication/reconnect succeeds;
already claimed work follows the lease and orphan-reconciliation policy.

### 7.5 Credential flows

- Cloud OAuth uses Authorization Code + PKCE through the system browser and a
  one-time, state-bound callback/deep link handled by the Worker. The callback
  exchanges the code in the native Worker process, verifies issuer/audience,
  stores refresh/access material only in the OS keychain, and returns only a
  redacted result to the UI.
- API-key profiles accept the key once in the native command, verify it with a
  capability probe, and never put it in React state, server payloads, crash
  reports, clipboard, or URL query parameters.
- Refresh is performed before expiry with bounded clock-skew handling. A failed
  refresh marks the profile `credential_expired` and pauses only jobs requiring
  that profile. Reauthorization must not create a second duplicate profile.
- Disconnect/revoke removes the local keychain reference and sends a non-secret
  disable/revocation event to the server. In-flight jobs follow the cancellation
  and orphan-reconciliation rules in Section 11.4.

## 8. Capability negotiation

Persist a signed/hashable capability snapshot locally and as non-secret server
metadata. At minimum it includes:

- MCP protocol version and transport;
- server implementation/version and compatibility result;
- advertised tools and allowlisted tools actually callable;
- workflow/template/saved-workflow discovery support;
- dynamic input schema and output schema support;
- image/video/audio/reference upload support and maximum sizes;
- start frame, last frame, reference frame count/order, masks and audio support;
- execution ID, status, progress, wait/watch, cancel and recovery support;
- output fetch/download behavior and URL expiry information;
- concurrency, queue, timeout, model/node availability if advertised.

The Worker re-probes on startup, before claiming a job whose snapshot is stale,
after an MCP protocol error, and after a profile credential refresh. It must
not advertise unsupported functions based solely on a cached snapshot. If the
capability snapshot expires or changes after claim but before the pre-submit
gate, the Worker must probe again and revalidate the required capabilities; it
must not submit until the new snapshot is healthy and compatible. A failed
re-probe releases or blocks the lease according to the existing retry policy
and records the exact missing capability.

### 8.1 Official tool-family mapping

The adapter maps capability families to tool names returned by the negotiated
server. Tool names are configuration data from the approved adapter version,
not user input. The implementation must tolerate aliases and missing optional
tools, but must fail closed when a required family is absent:

| Capability family | Local/bridge examples | Cloud examples | Required behavior |
|---|---|---|---|
| discovery | `server_info`, template/node/model/workflow discovery | `search_templates`, `get_template`, `get_template_schema` | build a capability snapshot and workflow descriptors |
| validation | `validate_workflow` | template/schema validation or preflight equivalent | stop before submit on schema/policy failure |
| submit | `run_workflow` | `run_template` or `submit_workflow` | return a durable remote execution reference |
| status | `job_status`, `wait_for_job`, `watch_job` | `get_job_status`, `wait_for_job` | report phase/progress and survive UI close |
| output | `fetch_outputs` | `get_output` | copy bytes/validated delivery metadata into the Worker workspace |
| input upload | bridge upload capability | `upload_file` | upload only staged, authorized input assets |
| cancellation | advertised cancel operation | `cancel_job` | cancel where supported and record unsupported cancellation |

The adapter must negotiate the actual tool schema before invocation and map
errors into stable internal codes. It must never assume that a Cloud tool and a
local tool with similar names have identical arguments. `partner_generate`,
batch, saved-workflow, and node/model management tools are optional and remain
disabled unless an approved workflow version explicitly requires them.

## 9. Workflow registry and schema mapping

### 9.1 Registry records

Add server-governed records equivalent to:

```text
ComfyWorkflow {
  id, slug, displayName, kind(image|video|multi), ownerScope,
  lifecycle(published|draft|deprecated|disabled), policy, createdAt
}

ComfyWorkflowVersion {
  id, workflowId, version, checksum, sourceType,
  sourceRef, inputSchema, outputSchema, mapping,
  supportedOperations, requiredCapabilities, estimatedResources,
  compatibleConnectionKinds, lifecycle, publishedAt
}

SeriesComfyWorkflowBinding {
  seriesId, operation(image_generation|video_generation),
  workflowVersionId, allowedConnectionProfileIds,
  fallbackPolicy, approvalPolicy, updatedBy, revision
}
```

`sourceRef` may point to a registered Comfy template, saved workflow, or
API-format JSON stored in managed configuration. Raw graph JSON is never
accepted directly from a normal shot form. The checksum is verified on every
execution.

### 9.2 Discovery and approval

The Worker can discover templates/saved workflows from a healthy profile and
send descriptors to the server. An admin approves a descriptor, assigns a
stable workflow ID/version, defines canonical mappings, and publishes it. A
discovered but unapproved workflow is visible as “available for review” and
cannot be used by render-jobs.

Deprecating a version blocks new jobs but does not invalidate completed runs.
Disabling a version immediately blocks new claims; in-flight cancellation is a
separate explicit action.

### 9.3 Typed input mapping

The schema mapping translates product inputs to workflow node inputs. It must
support text, number, boolean, enum, seed, model, image, video, audio, mask,
start frame, end/last frame, ordered reference frames, duration, FPS, width,
height, aspect ratio, and output format. Each field declares required/optional,
constraints, default, source type, privacy, and whether AI may suggest it.

Preflight returns structured errors, not a generic failure:

```text
missing_field | invalid_range | unsupported_media | capability_missing |
workflow_checksum_mismatch | asset_unavailable | ASSET_NOT_AUTHORIZED |
ASSET_HASH_MISMATCH | INPUT_RESOLUTION_EVIDENCE_REQUIRED |
INPUT_POLICY_DENIED | policy_denied | connection_unhealthy |
estimated_budget_exceeded
```

AI-assisted editing may propose a typed mapping and explain it. The server
validates it against the workflow schema, Series policy, credits, and Worker
capability before submission. The job/form carries an explicit
`inputResolutionMode`: `manual`, `guided_ai`, or `automated_ai`. `guided_ai`
may suggest values but requires the user to review the diff; `automated_ai` may
fill only allowlisted canonical fields and select only an already-approved
profile/workflow, then must show the resolved inputs, selected workflow,
remote-transfer consent, and cost/budget result before submit. It cannot invent
raw graph nodes, broaden permissions, bypass preflight, or silently submit
unless a separately enabled Series/admin policy explicitly permits unattended
execution and records that policy decision in the audit trail. A rejected or
uncertain AI suggestion falls back to manual input and leaves the job unclaimed.

Model-specific routes such as MiniMax H3 are represented as workflow/model
capabilities and registry mappings, not hardcoded as a universal Worker mode.
An H3 workflow may be bound to video generation only when its published schema
declares the required start/reference inputs, duration limits, model/node
availability, and output contract. If the connected ComfyUI instance does not
advertise that capability, preflight must explain the missing model/node and
leave the job unclaimed.

### 9.4 Canonical schema contract

Workflow versions use a versioned JSON Schema contract owned by SmartAIHub.
The MCP-provided schema is normalized into this contract before it reaches the
web UI or job validator. Each schema has a schema version, immutable field IDs,
labels/localization keys, type, required flag, default, enum/range constraints,
asset role, secret/sensitive flag, AI-suggestion policy, and target node/input
mapping. Provider-specific fields remain in an adapter extension namespace and
cannot change canonical validation rules.

Output schemas declare role, media type, cardinality, dimensions/duration
constraints, codec/container expectations, and whether the result is publishable
to Library. Schema changes create a new workflow version; an existing checksum
and published job never changes meaning. Schema validation is performed both
when publishing a workflow and again at preflight/submit, with the same fixture
used by server and Worker tests.

## 10. Canonical job contracts

### 10.1 Job types

Add these dedicated types while preserving existing types:

- `comfy_image_generation`: generic image output through a selected workflow;
- `comfy_video_generation`: generic video output through a selected workflow;
- `shot_video_generation`: Series shot-specific video job, routed through the
  same adapter and output pipeline;
- `comfy_workflow_run`: advanced/multi-output registered workflow execution.

An image generated for a storyboard shot uses `comfy_image_generation` with
`seriesId`, `episodeId`, `shotId`, and the `image_generation` binding; it does
not require a second hidden shot-image queue. A storyboard video uses
`shot_video_generation` with the corresponding `video_generation` binding.
Both paths use the same Worker lease, projection, artifact, and publication
contract, so the UI can show one canonical job record per submit.

Existing `comfy_image_generation` and `comfy_workflow_run` payloads without the
new resolution fields are upgraded in memory through legacy resolution. They
must remain claimable and reportable.

### 10.2 Common payload

```text
ComfyRenderJob {
  jobId, tenantId, ownerId, projectId, seriesId?, episodeId?, shotId?,
  jobType, idempotencyKey, requestedAt, deadlineAt,
  requestedWorkerId?,
  requestedConnectionProfileId?,
  workerResolution { selectedWorkerId?, selectionReason, fallbackUsed },
  connectionResolution {
    selectedProfileId?, selectionReason, fallbackUsed,
    profileRevision?, permissionRevision?, policyRevision?
  },
  workflowResolution {
    workflowId, version, checksum, sourceType,
    bindingRevision, registryRevision
  },
  inputResolutionMode?,
  inputResolutionEvidence? {
    policyRevision, resolvedAt, reviewedAt?, reviewedBy?,
    unattendedPolicyRevision?, resolvedFieldIds, resolvedInputHash
  },
  canonicalInputs,
  assets: [{ assetRef, role, mediaType, localOrManagedSource }],
  remoteInputPolicy {
    mode, consent? { actorId, grantedAt, scope, policyRevision },
    allowedRoles, maxBytes, retention
  },
  outputPolicy { uploadLibrary, libraryTargetId?, retainRaw, retainValidated },
  retryPolicy, budgetPolicy, approvalPolicy,
  costEstimate { amount?, currency?, basis, confidence }
}
```

Nullable fields have an explicit meaning: `selectedWorkerId` and
`selectedProfileId` are null while a valid job is queued without an eligible
assignment; they must not be replaced with the viewer's Worker or active
profile. When `selectedProfileId` is null, `connectionResolution.profileRevision`,
`connectionResolution.permissionRevision`, and
`connectionResolution.policyRevision` are also null because no profile policy
was resolved; they become immutable non-null snapshots only when a profile is
assigned for that attempt. `remoteInputPolicy.consent` is null only for
`local_only` and is required with actor, timestamp, scope, and policy revision
for remote transfer.
Optional cost/limit fields remain null when the provider cannot estimate them
and are still subject to the configured unknown-cost policy. A null value is
never a permission grant, a successful probe, or evidence that a resource is
available.

The nullable fields are validated as atomic groups: an unassigned job has
`selectedProfileId`, `profileRevision`, `permissionRevision`, and
`policyRevision` all null; an assigned attempt has all four values non-null and
captured from the same profile-permission-connection-policy snapshot. Every new Comfy job has both
`inputResolutionMode` and `inputResolutionEvidence`, while a legacy job with
no resolution metadata has both null. A partial pair or a mixed snapshot is
invalid and is rejected before claim with the applicable stable error code;
the server must not repair it by borrowing a viewer, active profile, or
current policy.
An incomplete input-resolution pair returns
`INPUT_RESOLUTION_EVIDENCE_REQUIRED`; a mixed or stale profile-policy snapshot
returns `REVISION_CONFLICT` with no claim or submit side effect.

`inputResolutionMode` is server-validated as `manual`, `guided_ai`, or
`automated_ai` for every new Comfy job. `inputResolutionEvidence` is
server-created and immutable for the job attempt: it records the policy
revision, resolution time, reviewed actor/time when applicable, the approved
unattended-policy revision when used, the canonical field IDs changed or
resolved, and a hash of the resolved typed inputs. It must not store raw
prompts, sensitive asset bytes, or secrets. A manual job still records the
policy revision and resolved input hash; an automated job cannot be claimed or
submitted without evidence that its fields, workflow/profile, consent, and
budget passed the applicable policy gate. Existing legacy jobs may leave both
fields null when the source payload has no resolution metadata; migration must
not invent a mode, actor, approval, or input hash for them, and such jobs are
never treated as Automated AI executions.

`ComfyRenderJob` is the server-enriched, persisted job envelope, not the
browser request schema. The browser may submit only a typed intent containing
the Series/episode/shot reference, requested Worker/profile IDs, selected
workflow ID/version request, canonical input values, selected asset roles,
remote-transfer mode, publication intent, and an idempotency key. The server
derives `jobId`, `tenantId`, `ownerId`, `projectId`, job type, timestamps,
`workerResolution`, `connectionResolution` profile/permission/policy revisions,
workflow/binding revisions,
consent actor/timestamp/policy revision, approval/policy snapshots, budget,
and cost estimate after authenticating and authorizing the request. Any
client-supplied value for those server-owned fields is ignored or rejected with
`SERVER_FIELD_FORBIDDEN`; it can never override tenant, ownership, policy, or
billing state.

The resolution revisions are captured when the server creates the job and are
immutable for that job attempt. A later change to the active profile, effective
permission scopes, Series binding, workflow registry, or policy never silently
rewrites a queued job; claim revalidation either accepts the captured
compatible revisions or leaves the job queued/blocked with an actionable
revision-conflict reason. An explicit user-approved retry creates a new
attempt and records the new resolution.

`requestedWorkerId` and `requestedConnectionProfileId` are user preferences,
not grants. The server verifies that the requester may target them and that the
selected Worker owns the selected profile. If no Worker is requested, the
scheduler may choose any eligible Worker; if a requested Worker/profile is
offline, revoked, incompatible, or at capacity, the job remains queued with
the exact reason and is not silently routed elsewhere unless the recorded
fallback policy permits it.

`outputPolicy.libraryTargetId` is a server-issued Library target identifier,
never a filesystem path, URL, bucket name, or arbitrary destination supplied by
the browser. The create-job API accepts only a logical publication intent; the
server resolves and authorizes the target within the caller's tenant/Series
scope before persisting the job. Local output directories are selected from
the Worker's confined job workspace and are never configurable through the
remote job payload. The output-policy pair is atomic: when `uploadLibrary` is
true, the server must persist a non-null authorized `libraryTargetId`; when it
is false, `libraryTargetId` is null. A missing or unauthorized target returns
`LIBRARY_TARGET_UNAVAILABLE` before claim and has no local or remote execution
side effect.

`canonicalInputs` is schema-validated JSON. It may contain:

- prompt, negative prompt, seed, model/LoRA selections;
- `startFrame`, `lastFrame`, and ordered `referenceFrames` as asset refs;
- reference video/audio/mask assets;
- duration, FPS, output aspect/size, motion or camera intent;
- Series/episode/shot continuity context where policy permits.

`remoteInputPolicy.mode` is one of `local_only`, `selected_assets`, or
`managed_asset_handoff`; `selected_assets` and `managed_asset_handoff` require
an explicit consent record containing the actor, timestamp, scope, and policy
revision, plus an allowlisted role set. For `local_only`, the consent object is
null and no source bytes leave the Worker. The policy is immutable after claim
and cannot be broadened by the Worker or the Comfy workflow; a changed consent
or role set requires a new job attempt.

For `shot_video_generation`, the authoritative duration budget comes from the
shot/episode contract. The requested duration must be no greater than both the
shot budget and the selected workflow/connection limit. The system must reject
an over-budget request before submission and must never silently stretch,
truncate, or publish a clip with a different duration. Any intentional trim or
extension is a new explicit job revision.

Asset refs are SmartAIHub IDs or Worker-local staged IDs, never arbitrary file
paths or unvalidated URLs. Before a job is claimable or any remote transfer is
started, the server resolves every managed `assetRef` through the authenticated
artifact flow and verifies the caller's tenant, owner, Series/Episode/Shot
relationship, current lifecycle, permitted role, media type, byte size, and
content hash against the persisted asset manifest. A ref that is valid in the
tenant but belongs to another Series, shot, or role is still rejected. The
Worker-local staged ID is minted only by the native process of the paired
Worker after a local file was selected and scanned; the browser cannot create,
forge, or substitute one in a server job-create request. It is valid for
exactly one job attempt, has a bounded TTL, records the same hash/type/size
manifest, and is accepted only from that Worker; it cannot be replayed by
another Worker or job. Any mismatch fails closed with `ASSET_NOT_AUTHORIZED` or
`ASSET_HASH_MISMATCH` before claim/transfer, and no direct URL or local path is
ever accepted as an asset reference.

For every Comfy job, the Worker writes the validated output to its local job
workspace before it can be reported complete. `retainValidated` controls later
retention cleanup; it cannot disable the mandatory local write. `uploadLibrary`
only controls the additional publication step.

### 10.3 Lifecycle and lease

Use the existing render-job claim/lease protocol. Extend status evidence with:

```text
queued → claimed → preflighting → staging_inputs → submitted_to_mcp →
remote_running → collecting_outputs → validating_outputs →
saved_locally → publishing_library → completed
```

The phase names above are execution evidence and must not be confused with the
existing `worker_job_status` transport enum (`queued`, `claimed`, `preparing`,
`running`, `uploading`, `publishing`, `indexing`, `completed`, `failed`,
`canceled`, `expired`). Keep that enum backward-compatible; expose the finer
grained values through the authoritative phase/event projection. If a new
persisted status enum is introduced, it requires a versioned contract and an
explicit adapter for old Workers rather than silently writing values that old
claim/report code cannot read.

The compatibility adapter maps the detailed phase to the existing persisted
transport status deterministically: `queued` → `queued`, `claimed` →
`claimed`, `preflighting` and `staging_inputs` → `preparing`,
`submitted_to_mcp`, `remote_running`, `collecting_outputs`, and
`validating_outputs` → `running`, `saved_locally` → `running` until the job
becomes terminal (or → `uploading` when Library transfer has started),
`publishing_library` → `publishing`, and any explicit server-side Library
indexing event → `indexing`. A local-only job emits `completed` only after the
validated local save has committed. Failure/cancel/expiry retain the existing
`failed`/`canceled`/`expired` transport status while exposing the detailed
phase and classification separately. The adapter must write the coarse status
and detailed projection atomically and must never persist phase names as
unsupported values in `worker_job_status`.

`retryable_failure`, `permanent_failure`, and `needs_user_action` are failure
classifications, not additional values for the existing transport enum. Their
projection mapping is explicit: a retryable or permanent failure uses transport
status `failed` with `failureClass` set accordingly; a user-action failure also
uses `failed` with `failureClass=needs_user_action`; `canceled` remains reserved
for an intentional cancellation. The Worker and Web UI render the
classification/retryability from the projection and never attempt to persist
these classification strings as an unsupported `worker_jobs.status` value.

`orphan_pending` is a recovery state, not a transport status. Persist it as an
adjunct `recoveryState` (`none`, `reconciling`, `orphan_pending`, or
`manual_action`) with the remote execution reference, lease/attempt, next poll
time, and retention deadline. It is visible in Overview and job detail,
cannot be claimed or published, and is cleared only after the server confirms
cancel/reconciliation or records the required user action. If the remote state
is still known to be running, the transport status remains `running`; if the
remote state is unknown after the bounded reconciliation policy, the server
uses `failed` with `failureClass=needs_user_action`. This prevents an orphan
from appearing completed or becoming eligible for duplicate execution.

Cancellation is represented by the server-authoritative adjunct
`cancellationState`: `none`, `requested`, `confirmed`, `unsupported`, or
`pending`. A cancel request returns its idempotent request ID and current state;
the Worker acknowledges the request, attempts the negotiated Comfy cancel
operation when possible, and reports the resulting state with the lease and
attempt. `requested`/`pending` jobs remain visibly non-terminal until the
server confirms the remote/local outcome or applies the bounded cancellation
timeout policy. Neither client may convert `requested` or `pending` into
`canceled` locally.

Terminal/error states include `canceled`, `expired`, `retryable_failure`,
`permanent_failure`, and `needs_user_action`. A lease or execution deadline
expiry is terminal for the current attempt: it persists transport status
`expired`, releases the capacity slot, records the expiry reason and recovery
evidence, and cannot be claimed again under that attempt. A policy-approved
retry creates a new attempt; it never rewrites the expired attempt. Each event includes job ID,
attempt, Worker ID, selected profile, workflow version, remote execution ID if
safe, timestamp, progress, profile/permission/policy revisions, and redacted
error code.

Exactly one Worker wins a lease. A lost lease prevents final publication and
causes the remote execution to be canceled when possible. Idempotency keys and
artifact fingerprints prevent duplicate charges and duplicate Library assets.

Claim admission is atomic at the server: the claim transaction locks the
eligible queued job and the target Worker's capacity ledger/slot, rechecks
tenant, scope, capability, profile/workflow policy, and lease expiry, then
creates the lease, assigns `capacitySlot`, updates the projection, and appends
the claim event before commit. A competing claim receives a deterministic
`JOB_ALREADY_CLAIMED` or `CAPACITY_FULL` result and cannot observe or create a
partial assignment. The Worker never treats a successful poll response without
the committed lease token and attempt as a claim. Lease renewal, release,
expiry recovery, and slot accounting use the same transaction boundary so a
crash or retry cannot overbook a serial Worker or strand a slot indefinitely.

The server revalidates tenant access, Worker scope, selected profile and its
captured profile/permission/policy revisions, workflow version, Series binding
revision, credits, and budget at claim time. The Worker revalidates profile
permission against the captured permission revision, capability hash, workflow
checksum, and input policy at the **pre-submit gate**, immediately before remote
submission. If an
admin revokes a profile or
workflow after claim but before submit, the Worker must not submit; it reports
`POLICY_REVOKED` and releases/settles the lease according to the existing
control-plane contract.

Credit reservation handling is idempotent: job admission creates one reservation
keyed by
`jobId` and the billing operation key; a no-submit failure releases it, while a
submitted execution settles it once according to the existing render-job
policy. Retries of the same attempt cannot create another reservation.

Progress must distinguish Worker staging, MCP queue, Comfy execution, output
download, validation, and upload. A job is not complete when Comfy only returns
an execution ID.

### 10.4 Shared job summary projection

The web app and Worker App must consume the same server-authoritative
`WorkerJobSummary` projection. The Worker must not create a reduced or locally
reinterpreted version for Overview. Minimum fields are:

```text
WorkerJobSummary {
  jobId, displayName, jobType, jobTypeLabelKey,
  status, phase, progressPercent?, queuePosition?, capacitySlot?,
  workerId?, workerDisplayName?, workerMachineName?, workerStatus?,
  tenantId?, seriesId?, episodeId?, shotId?, resourceProfile?,
  createdAt, queuedAt?, claimedAt?, startedAt?, updatedAt, lastHeartbeatAt?,
  terminalAt?,
  connectionProfileId?, connectionDisplayName?, workflowId?, workflowVersion?,
  remoteExecutionId?, retryable, failureClass?, waitReason?, blockedByJobId?,
  errorCode?, statusReason?, failureReason?, latestEventType?,
  latestEventMessage?, cacheHit?, nextAction?, recoveryState?, canCancel,
  cancellationState?, outputCount?,
  lastEventSequence, observedAt, staleAt
}
```

The server stores timestamps as ISO-8601 UTC. Both applications display the
same values using the user's selected locale/time zone, while retaining a
copyable raw ISO value in job details. `jobId` is fully visible/copyable in the
detail view and may be visually shortened only in a table with an explicit
copy action. `jobType` remains visible alongside its localized label so the
Worker and web table can be compared exactly. Local absolute paths, secrets,
prompts, and provider tokens are excluded from this projection.

`jobTypeLabelKey` is resolved from a shared versioned localization registry used
by both applications. If a label is missing, the UI shows the raw job type and
an explicit “untranslated” fallback; it must not substitute an unrelated label.
`displayName` is a server-produced stable work title (with the raw job type as
fallback) and is not a client-generated label. The localized presentation may
change with locale, but the underlying job identity and type do not.

Status and phase are server event values, not derived from `progressPercent`.
The projection includes a monotonic `lastEventSequence` and `staleAt`; an older
or stale response cannot overwrite a newer active-job card. The same projection
is used for Comfy, Remotion, media preprocessing, Hermes, and every other job
type the Worker can claim.

The server defines ordering: active jobs are grouped by capacity slot; waiting
jobs are ordered by the existing render-job priority and FIFO `queuedAt`; recent
terminal jobs are ordered by `terminalAt` descending. `queuePosition`,
`waitReason`, and `blockedByJobId` are server-calculated and must not be guessed
by the Worker UI.

Ordering is deterministic even when timestamps are equal: the server applies
the existing priority direction, then `queuedAt` ascending, then `jobId`
ascending as a stable tie-breaker. Active slots use the server-assigned slot
and lease start sequence. A reconnect or refresh cannot reorder work based on
local arrival time.

The current `worker_jobs` schema has `createdAt`, `startedAt`, and `finishedAt`
but not every timestamp required by this projection, and the current event row
does not provide a durable sequence/event key. Implementation must therefore
add nullable, server-maintained `queuedAt`, `claimedAt`, `updatedAt`, and
`lastHeartbeatAt` fields (or an equivalent all-job projection read model), map
`finishedAt` to `terminalAt`, and add a monotonic per-job event sequence plus an
idempotent event key. Existing rows are backfilled conservatively: `queuedAt`
uses `createdAt`, `terminalAt` uses `finishedAt`, `updatedAt` uses the newest
known job/event timestamp, and `claimedAt`/`lastHeartbeatAt` remain null when
there is no authoritative evidence. Every status, phase, heartbeat, lease, and
terminal transition updates the projection atomically with its event. No client
may manufacture missing timestamps or sequence values.

The server computes `staleAt` from the state-specific heartbeat/event TTL and
the latest authoritative activity; it returns the server clock used for that
calculation. A Worker heartbeat updates a job's `lastHeartbeatAt` only when it
contains the matching leased `jobId` and attempt; a worker-level heartbeat
alone cannot make every job appear healthy. Clients compare
`projectionRevision`/`lastEventSequence` and discard older data, and display
the server-provided stale state rather than applying a client-specific timeout.

The existing web job list is an adapter consumer of this projection, not a
second interpretation. The implementation must update the server-side
`workerJobs` monitor service/router and the web `RenderJobsPage` (the current
`apps/web/client/src/pages/RenderJobsPage.tsx` route, plus its generated/runtime
counterpart where the build requires it) so both Web and Worker read the same
fields, status catalog, job-type label key, ordering, and redaction policy.
During migration, the Web tRPC response keeps a versioned compatibility
adapter for existing clients: `id` aliases `jobId`, `finishedAt` aliases
`terminalAt`, `workflowRunId` and `runtimeType` remain available when present,
`latestEvent` is composed from the canonical latest-event fields, and the
legacy nested `worker` object is composed from the canonical Worker identity
fields. `outputRefs`, `canCancel`, status/failure reasons, and existing filter
and cancellation behavior remain available under their current contract until
all clients consume the canonical names. The adapter is read-only and derives
every alias from the same projection in the same request; it must not query a
second job state or compute a different status. A contract-version migration
test must prove old Web clients, new Web clients, and Worker clients observe
the same job identity and state during the compatibility window.
At minimum, the legacy fields map as follows: `worker_jobs.id` to `jobId`,
`createdAt` to `createdAt`, `startedAt` to `startedAt`, `finishedAt` to
`terminalAt`, `status`/`statusReason` to the authoritative status/wait reason,
the latest progress event to phase/progress/event sequence/message/cache hit,
and the joined Worker display name, machine name, and status to the Worker
projection. `resourceProfile` comes from the server job row, never from a
client label. Missing timestamps remain null; clients must not infer
`claimedAt`, `startedAt`, queue position, or completion from another timestamp
or from a button click. `terminalAt` is
rendered as the completed/failed/canceled time in detail views, while
`createdAt` remains the canonical “created when” value shown in list views.
For queued/unassigned jobs, `workerId` and `workerDisplayName` are null and the
UI must show an explicit “not assigned” state; it must never invent the current
Worker from the viewer's device or from a requested profile.

The existing Web monitor also exposes a compatibility detail surface that the
new projection must preserve. `statusReason` is the server-provided safe
reason for the current status or wait state; `failureReason` is an optional
server-redacted, user-actionable failure explanation and must never contain
tokens, prompts, signed URLs, absolute local paths, or raw provider secrets.
`canCancel` is calculated by the server from the authoritative status, lease,
policy, and caller permission. It is false for terminal or otherwise
unsupported jobs and is never derived from a client status allow-list.
`outputRefs[]` contains only verified, tenant-authorized artifact references;
the Web detail adapter may return it together with `events[]`, while a bounded
list/Overview response may return only `outputCount` and `latestEvent`. These
fields are part of the canonical bounded summary/detail compatibility contract;
`outputRefs[]` remains detail-only so a queue snapshot cannot grow without
bound. A parity fixture must prove the following equivalence
before localization: `statusReason`/`waitReason`, safe `failureReason`/`errorCode`
and `nextAction`, `canCancel`, verified output count/references, latest event,
Worker identity, timestamps, phase, progress, and queue state. If a field is
not authorized for the Worker caller, the server returns an explicit null or
redacted state rather than silently changing its meaning.

The projection query is authorized per user/tenant and, for Worker requests,
per paired Worker identity. It may include all supported job families, not only
Comfy jobs. The Web list may retain filters and detail links, and the Worker
Overview may retain its active/waiting/recent layout, but neither client may
join raw job tables, reinterpret status, calculate queue position, or expose
local paths, secrets, prompts, or provider tokens. A shared fixture containing
the same job must serialize to equivalent Web and Worker projections before
localization and time-zone formatting.

Visibility is different from execution eligibility: the Web projection returns
only jobs within the authenticated user's tenant/job-read scope, while a Worker
projection returns active jobs assigned to that paired Worker and waiting jobs
that the scheduler currently considers eligible for that Worker (tenant,
capability, profile/workflow policy, and capacity all match). Other users'
jobs, another Worker's private active job, and ineligible waiting-job payloads
are not exposed. If a Worker needs a global queue count for its status banner,
the server returns only a redacted count, not job details. A Worker must never
use visibility of a waiting item as permission to claim it; claim authorization
and lease admission remain server-side.

## 11. Input staging and output handling

### 11.1 Local job workspace

Create a confined workspace such as:

```text
<worker-data>/jobs/<job-id>/
  inputs/
  outputs/raw/
  outputs/validated/
  manifest.json
  events.jsonl
```

Rules:

- reject traversal, absolute paths from job payloads, symlinks escaping the
  workspace, unexpected extensions, and files whose magic/MIME disagree;
- never modify original source footage;
- use atomic write/rename and fsync where supported;
- validate image/video decodability, dimensions, duration, codec/container,
  file size, and expected output count before publication;
- retain raw output only if policy allows; clean abandoned workspaces by a
  bounded retention job and never delete source footage;
- manifest records source refs, workflow checksum, connection profile,
  capability hash, processor version, output fingerprint, QC result, and the
  retention policy revision. Manifest and `events.jsonl` contents are redacted
  for secrets/prompts and are subject to the same local retention policy.

Retention is a server-approved policy with a safe minimum and maximum. After a
validated output is durably published (or a job reaches its terminal retention
deadline), the Worker removes eligible raw outputs, staged remote-input
copies, and diagnostic material using an idempotent cleanup record; source
footage and published Library objects are never removed by this cleanup. A
cleanup failure is visible as `CLEANUP_PENDING` and retried with bounded
backoff, but never triggers a new Comfy execution or artifact publication.
Remote staged-input deletion is recorded as confirmed, unsupported, or
unknown, with the configured retention deadline shown to the user.

### 11.1.1 Remote input transfer policy

Local source bytes are never uploaded to SmartAIHub merely because a Comfy
profile exists. When a remote self-hosted or Cloud workflow requires input
files, the job must contain an explicit `remoteInputPolicy` and the Worker may
transfer only the selected, authorized asset roles (for example a start frame
or ordered reference frames), never the source folder or an unbounded glob.

The policy records destination class, consent/approval, asset IDs and hashes,
maximum size, retention/deletion request, and whether the transfer is allowed
for sensitive content. The Worker shows this transfer in preflight, encrypts
in transit, uses the MCP upload capability or approved artifact handoff, and
records success/failure without recording the bytes. After completion it asks
the remote service to delete staged inputs when supported and records whether
deletion was confirmed, unsupported, or unknown. Cloud/remote transfer is
denied by default when consent or policy is absent.

### 11.2 Comfy output collection

For local/remote MCP, use the advertised output-fetch capability and write into
the confined destination. For Cloud, validate the temporary download URL before
fetching: HTTPS, approved host/origin, expiry, content length, redirect policy,
MIME/magic, and no private-network destination. Do not execute a shell command
returned by an MCP server.

Remote output references are opaque handles or URLs, not trusted filesystem
paths. A path returned by a Comfy tool is treated as metadata only; the Worker
must fetch by an approved output handle and choose the local destination itself.
If a server offers only an unsafe path-based output contract, the profile is
healthy for discovery but not eligible for production execution.

Multi-output workflows must map every output to a declared role. Unknown or
missing outputs fail validation and remain local for diagnosis; they are not
silently published.

An `outputRef` is a tenant-scoped storage reference plus verified metadata, not
a permanent download URL. Any Web download URL is minted by the server for the
authorized caller with a short expiry and is reissued after expiry; the Worker
uses its authenticated artifact route or its own local path. The projection
must not persist or expose a provider-signed URL as a durable Library link.

### 11.3 Library publication

If `uploadLibrary=true`, upload only after local technical validation and
policy/QC. Reuse the existing authenticated Worker artifact/publication route.
The server associates the result with Series/Episode/Shot and stores provenance,
but never receives the original local source unless a separate explicit source
ingest feature authorizes it.

If upload is disabled or unavailable, the job may complete as
`saved_locally`/`needs_user_action` according to policy and must show the exact
local output location inside the Worker App without leaking it to the server.

For large video outputs, Library publication uses the existing artifact upload
protocol with an init/complete handshake, checksum, bounded multipart/chunk uploads,
resume support, and an abort/cleanup path. The Worker persists upload
session ID and completed parts in the local ledger, resumes only when the
artifact fingerprint is unchanged, and never restarts a remote Comfy execution
solely because a Library upload was interrupted.

### 11.4 Failure and orphan reconciliation

The Worker persists a local execution ledger before submit and checkpoints every
remote state transition. Recovery behavior is deterministic:

| Failure | Behavior |
|---|---|
| Control plane unavailable before claim | Do not claim; retry with backoff and show disconnected status |
| Control plane unavailable after claim | Continue within lease grace period; persist events locally; reconcile when online |
| MCP unavailable before submit | Release/retry the lease without charging or creating a remote execution |
| MCP disconnect after submit | Reconnect and query the stored execution reference; never blindly resubmit |
| Worker process/app crash | On restart reconcile every non-terminal execution before claiming new work |
| Worker window close or graceful quit | Keep the background loop alive when the user only closes the window; on explicit quit, stop new claims, flush the local ledger, send a final heartbeat/drain signal, and preserve lease/recovery state for restart |
| OS shutdown, sleep, or network suspension | Enter draining when detectable, stop new claims, persist the execution reference and upload checkpoints, and let lease expiry/reconciliation decide recovery; never report completion from a local shutdown event |
| Remote job still running after lease loss/revoke | Attempt cancel; if unsupported, mark `orphan_pending`, poll with bounded retention, and prevent duplicate publication |
| Output URL expired or output fetch fails | Retry fetch only within policy; request a fresh output reference if supported; otherwise retain execution evidence and require user action |
| Local validation fails | Keep raw output in the confined workspace, report a typed failure, and never upload it |
| Library upload fails after local save | Mark `saved_locally`, retain idempotency/fingerprint, and allow safe resume of publication |

The server completion endpoint is idempotent on `(jobId, attempt,
artifactFingerprint)`. A late result from a revoked or lost lease is accepted
only as diagnostic evidence or a deduplicated artifact according to server
policy; it cannot overwrite a newer successful result.

### 11.5 State-transition invariants

The server owns the authoritative job state. The Worker may emit evidence only
for its current lease and attempt. Allowed transitions are:

```text
queued → claimed → preflighting → staging_inputs → submitted_to_mcp →
remote_running → collecting_outputs → validating_outputs → saved_locally →
publishing_library → completed

saved_locally → completed (when Library publication is disabled or not
required)

retryable_failure → queued (new attempt after policy/backoff)
needs_user_action → queued (after the user/admin resolves the reported cause)

queued/claimed/preflighting/staging_inputs/submitted_to_mcp/remote_running/
collecting_outputs/validating_outputs/saved_locally/publishing_library →
canceled | expired |
retryable_failure | permanent_failure | needs_user_action
```

`completed` is terminal. A retry creates a new attempt linked to the same
logical job and billing reservation; it does not rewrite the previous attempt.
Events with an old lease token, lower sequence number, or duplicate event key
are ignored idempotently and retained only in diagnostics. A cancel request
wins over a not-yet-submitted job; after remote submission, the system records
whether cancellation was confirmed, unsupported, or still pending.

## 12. Series and episode/shot UI

### 12.1 Admin ComfyUI policy on the web app

Add an admin-only **ComfyUI Control Policy** screen. It governs the defaults
and limits inherited by Workers and Series:

- default image-generation and video-generation workflow version per tenant or
  global scope;
- approved connection kinds/endpoints and Cloud/remote usage policy;
- approved MCP tool families, workflow families, model/node prerequisites, and
  maximum concurrency/duration/output limits;
- default credit, storage, retention, fallback, and approval policies;
- Automated AI input-resolution policy: disabled, guided-only, or allowed for
  unattended execution, with permitted fields, review/consent requirements,
  budget ceiling, and audit retention;
- publish, deprecate, disable, revoke, and audit workflow/profile changes;
- a dry-run impact view listing Series bindings and queued jobs affected by a
  change. Disabling a default does not rewrite historical job provenance.

The admin screen must distinguish “configured default” from “currently healthy
on a Worker”. It cannot mark a workflow ready until at least one eligible
Worker reports the required capability.

### 12.2 Series settings on the web app

Add a **Worker + ComfyUI** section to Series settings:

- default Image generation workflow: workflow name, version, checksum status;
- default Video generation workflow: workflow name, version, checksum status;
- allowed Worker connection policy: active default, selected profiles, or
  “any approved compatible Worker”;
- fallback policy: disabled, ordered approved fallback, or admin approval;
- output policy: local-only, publish to Library, retention and QC policy;
- AI input-resolution default and allowed override: Manual, Guided AI, or
  Automated AI, subject to the admin policy and explicit per-job evidence;
- capability/test panel showing the last probe and missing requirements;
- revision and audit history.

Defaults inherit from admin/global policy. A Series owner may choose an allowed
published version. A shot-level override is allowed only when the user has
permission and the workflow is compatible with the Series.

Only active, tenant-authorized Series and episodes/shots are selectable for a
new binding or job. Deleted/archived Series are removed from Worker and Web
selection lists; their historical bindings, jobs, and artifacts retain the
original IDs for audit but are read-only. Job creation fails with
`SERIES_UNAVAILABLE` when the parent is deleted or archived. Unclaimed queued
jobs for that parent are blocked with the same reason and are not routed to a
different Series; already claimed work follows the cancellation/orphan policy.
Binding reads also revalidate the parent Series, profile, and workflow
lifecycle so no dangling or disabled reference appears as an executable
default.

### 12.3 Episode storyboard shot card

For each of the nine shots, the existing shot card gains a compact **Generate
with Worker** area matching the current design language:

1. Worker selector: “Active Worker” or an allowed named Worker. Each option
   shows its display name, machine name, online/last-seen state, capacity, and
   compatible Comfy profile summary; selecting it records
   `requestedWorkerId` and the server resolves the final Worker explicitly.
2. ComfyUI connection selector: Series default or allowed profile.
3. Mode: Image or Video.
4. Workflow selector showing display name and exact version; default is
   preselected, alternatives are behind “Change workflow”.
5. Duration selector for video, constrained by the selected workflow and shot
   budget.
6. Start frame, last frame, and ordered reference-frame picker from shot/Series
   assets, with thumbnails, count, and schema validation.
7. “Advanced inputs” drawer generated from the workflow schema; raw JSON is
   permissioned advanced inspection only.
8. Input-resolution mode: Manual, Guided AI, or Automated AI. Guided and
   Automated AI show the proposed field changes and explanation; Automated AI
   additionally shows the exact approved workflow/profile, transfer consent,
   budget, and the explicit confirmation or unattended-policy decision.
9. Preflight summary with green/amber/red checks before enabling Submit.
10. For Cloud/paid remote profiles, show estimated credit/cost and whether the
   estimate is provider-reported, policy-derived, or unavailable. If the cost
   cannot be estimated, require the Series/user policy to allow unknown cost;
   never imply a free run.
11. Submit action creates the dedicated render-job and shows queued, claimed,
   running/progress, output, retry, cancel, and publish state inline.
12. A details link opens the full job screen; it never navigates to a duplicate
   workflow editor.

The card must clearly say “ส่งเข้าคิว Worker” / “Send to Worker queue”. It must
not imply that the browser is directly calling ComfyUI. If no compatible Worker
or workflow exists, show the reason and the action needed (connect Worker,
authorize profile, publish workflow, or provide missing frame).

### 12.4 Worker App information architecture

Use the existing Sidebar and avoid another top Quick Actions bar. Add one
canonical **ComfyUI** area, or mount these screens under existing routes when
that is less disruptive:

```text
ComfyUI
 ├─ Connections       saved profiles, active selection, test, auth, health
 ├─ Workflows         catalog, discovery, schema, mapping, test run
 └─ Jobs              Comfy-specific queue and output details
```

The global Queue remains the cross-function job view. ComfyUI Jobs is a filtered
detail view, not a second queue implementation. Runtime/Overview shows a
summary card with active connection, capability health, GPU/Comfy queue, and
current execution. Existing Series Media Workspace remains for footage intake;
ComfyUI Connections/Workflows are not duplicated there.

Screen ownership is explicit so the growing Worker App does not present two
pages that look like the same workspace:

| Screen | Single responsibility | Must not duplicate |
|---|---|---|
| Series | choose a server Series and bind its local root folder | media scanning, Comfy connection editing, or job execution |
| Media Workspace | scan/preprocess local footage, review derived assets, and publish them | Comfy workflow catalog or the global job queue |
| Queue | show every job family and its lease/progress state | a second claim/queue implementation |
| ComfyUI Jobs | filter the global Queue to Comfy jobs and show output details | a separate scheduler or alternate job state |
| Runtime | diagnostics, compatibility, and health evidence | connection/profile authoring |

Every Sidebar destination has one canonical route and one primary action. A
cross-link may open the owning screen with the selected job/Series/profile
context, but it must not clone the controls or create a second source of truth.

Localization is a Worker-wide contract: the selected `th`/`en` locale is loaded
before the shell renders, persisted in the Worker settings, and passed through
every route, dialog, validation message, status badge, empty state, error
recovery action, and accessibility label. Missing catalog keys fall back to
English with a diagnostic marker; provider/server message text is never shown
as an accidental third language. Dates, times, numbers, and durations use the
same locale and the user's configured time zone, while raw IDs remain
copyable.

Connection screen requirements:

- cards for every saved profile with kind, transport, endpoint label, auth
  state, expiry, capability chips, last probe, active marker, and current use;
- Add/Edit wizard for all supported profile kinds;
- wizard fields are type-specific: local stdio (approved executable/argv and
  local target), remote stdio bridge (approved bridge plus explicit target),
  self-hosted MCP HTTP (allowlisted origin, TLS and auth method), Cloud profile
  (fixed Cloud origin plus OAuth/API-key choice), and SSH tunnel (host, port, user,
  keychain key reference, known-host policy, and forwarded target). Secret
  fields are submitted directly to native secure-storage commands and are not
  retained in React state;
- Test connection, refresh capability, set active, duplicate, disable, revoke
  credential, remove (blocked while in-flight unless an explicit safe action);
- permission and workflow-scope summary visible before activation;
- an expandable permission inspector showing each scope/tool family as
  `granted`, `effective`, `blocked`, `expired`, `unsupported`, or `pending`,
  its source (pairing, user/profile policy, admin policy, or negotiated
  capability), permission revision, last changed actor/time, and last sync;
  revoke controls create a server-authoritative revision and show when the
  native Worker has acknowledged it. A local checkbox alone must never imply
  that server access changed;
- diagnostics with copy-safe redacted logs.

The Worker top bar/header is a truthful global status surface. It shows
three independent status sources: (1) SmartAIHub control-plane pairing,
(2) Worker loop readiness, and (3) the active Comfy profile/MCP session. Each
source uses `connected`, `disconnected`, `expired`, `stale`, or the applicable
`not configured`/`disabled` state, with its own last-checked time and token or
profile expiry when known. A compact aggregate may say `Ready` only when the
control plane and Worker loop are healthy and the selected Comfy profile is
healthy when the current job requires Comfy; it must never hide which source is
unhealthy. The header also shows the selected Worker, active Comfy profile,
capability health, current job phase, queue depth, and a clear
reconnect/reauthorize/probe action. If disconnected, it explains whether new
jobs are blocked, whether already claimed jobs are continuing, and the exact
recovery action. Status is reconciled from heartbeat/probe results; it must not
be inferred from a button click or optimistic local state. When no profile is
selected, the header explicitly says `Comfy not configured` and Comfy jobs are
blocked while unrelated Worker job families remain eligible.

#### Overview active-job dashboard

The Overview screen places the current execution immediately below the Worker
status header and above capability/configuration cards. It must be visually
prominent when the Worker is busy:

1. **Worker state banner:** `Ready`, `Busy`, `Waiting`, `Paused`, `Disconnected`,
   or `Needs attention`, with the reason and last update time.
2. **Active job card:** full/copyable Job ID, localized job type plus raw
   `jobType`, Series/Episode/Shot when present, Worker name/ID, selected
   connection/workflow, created/claimed/started/updated times, current phase,
   progress, queue position, capacity slot, and safe remote execution ID.
3. **Waiting queue:** new jobs that cannot run yet show `Waiting for Worker
   capacity` or the precise policy/capability reason. They remain server-queued
   and are not claimed prematurely.
4. **Recent jobs:** a compact list using the same `WorkerJobSummary` fields as
   the web job list, including terminal time and result/error action.

The default Worker capacity policy is serial **within each paired Worker**
(`maxConcurrentJobs=1`), which means a new job from any supported Worker family
waits on that Worker while its active job is processing. It is not a tenant-wide
lock: another eligible Worker may claim a job independently. Admins may
explicitly configure separate runtime lanes or more slots per Worker only when
the Worker capability and resource policy support it. The Overview then shows
one active card per slot, the lane owning it, and the remaining waiting count.
A Comfy profile is serial by default even when another runtime lane is
configured in parallel. If a tenant-wide capacity policy is ever enabled, its
scope and blocking job must be returned by the same server projection rather
than inferred by clients.

The Overview refreshes from the shared projection on the existing heartbeat/
job-status cadence or an approved server-push channel, shows `last refreshed`
and stale state, and reconciles after reconnect. It must not show “Ready” while
an active job is still running, and must not hide a queued job merely because
the Worker window was closed.

The freshness policy is explicit and configurable: while the Worker App is
visible, active-job summaries target a refresh within 5 seconds and must mark
the card stale after 15 seconds without a newer server observation; waiting and
recent summaries target 15 seconds and mark stale after 60 seconds. A server
push channel may replace polling only when it provides the same projection
revision and heartbeat guarantees. These are display/update bounds, not claim
authority: the Worker continues to use the lease and control-plane responses
for execution, and every stale banner shows the last server observation time
and the recovery action.

Workflow screen requirements:

- approved/pending/deprecated/disabled filters;
- discover from selected profile, compare checksum/version, inspect input/output
  schema, map canonical fields, run a no-charge test where supported;
- open a **Run workflow** form for a published workflow. The form is generated
  from its schema, shows the selected profile and output policy, performs
  preflight, submits through the same leased job path, and exposes local-save
  and optional Library-publication results. It must not accept an unbounded raw
  tool call or arbitrary graph from the form;
- show compatible profiles and missing capabilities;
- publish/disable/version actions restricted to admin policy.

Every visible action in Connections, Workflows, Jobs, Overview, and the shot
card must be backed by a native Worker command, an authenticated control-plane
request, or a real persisted local state transition. There must be no fabricated
success, fake progress, placeholder capability, or button that appears enabled
without its required permission/capability. During an in-flight request the UI
shows pending state and reconciles with the server/Worker result; on failure it
shows the stable error code and recovery action.

Every screen and drawer also implements the same explicit state set: loading
(with controls disabled), populated, empty (with the next useful action),
stale/offline (with last-known timestamp and read-only limitation), permission
denied, capability unavailable, validation error, and server error (with retry
and correlation ID where appropriate). Destructive actions such as revoke,
disable, delete, cancel, and discard require a localized confirmation that
states what will stop immediately and what is retained. A disabled action must
show the missing permission, capability, policy, or connection reason; it must
not become enabled merely because a local request is pending.

Job detail requirements:

- selected Worker, connection, workflow/version/checksum, remote execution ID;
- phase-by-phase progress and timestamps;
- staged input roles and output roles without exposing secrets;
- local save path only on the Worker; Library link only after publication;
- retry/cancel/recover actions with idempotency evidence.

The detail contract returns the same `WorkerJobSummary` plus server-authorized
`events[]`, verified `outputRefs[]`, a safe `inputResolutionEvidence` summary
(`mode`, policy revision, resolved/reviewed times, reviewed actor when
authorized, unattended-policy revision when used, resolved field IDs, and
resolved-input hash), the compatibility `statusReason` and safe
`failureReason`, and a server-calculated `canCancel`/next action. Web
clients may receive Library links and redacted artifact metadata, but never the
Worker's absolute save path or local diagnostics. `canCancel` is false for a
terminal job and is not inferred from a client-side status list; when
cancellation is requested, both clients show the server's
`cancellationState` (`requested`, `pending`, `confirmed`, or `unsupported`)
until reconciliation completes. The Worker detail view
uses the same contract but receives only artifacts and fields allowed by its
paired Worker/job scope; lack of authorization is displayed as a clear
unavailable state, not as an empty successful result.

## 13. APIs and persistence

### 13.1 Server control-plane contracts

Add authenticated, tenant-scoped contracts for:

- list/create/update/disable/delete non-secret connection metadata;
- report Worker capability snapshot and profile health;
- list/discover/approve/publish/deprecate workflow versions;
- read/update Series workflow bindings with revision checks;
- create `comfy_image_generation`, `comfy_video_generation`,
  `shot_video_generation`, and `comfy_workflow_run` jobs, including Series
  shot jobs;
- read server-authorized job detail, events, verified output references, and
  safe input-resolution evidence through the existing job-monitor boundary;
- claim, heartbeat, progress, cancel, retry, artifact upload and completion
  through existing Worker routes and lease semantics.

Connection test that depends on a local secret is Worker-side. The server may
record the result, but must not pretend it performed the test.

Do not add a broad unauthenticated REST server to the Worker App. Native
commands and the existing outbound control-plane client are the boundary.

### 13.1.1 Logical API matrix

These are logical contracts to add to the existing authenticated routers; the
implementation may map them to the project's established tRPC/HTTP style, but
must preserve the ownership and scope rules:

| Operation | Authority | Minimum authorization |
|---|---|---|
| List/create/update/disable Worker Comfy profiles | authenticated account + server policy | Account owner/editor for its paired Worker; admin for tenant/global policy; native Worker may only persist local secrets and report/probe its own profile |
| Set/clear the active default profile for a paired Worker | server-persisted non-secret projection plus native Worker local state | Paired Worker owner/editor; at most one active default per Worker; revision-checked and auditable |
| Update/revoke effective Worker or Comfy permission scopes | server policy and pairing/profile authority; native Worker acknowledges and applies | Scope owner/admin as applicable; server increments permission revision, preserves unaffected scopes, and blocks affected operations immediately |
| Test a saved Comfy profile | native Worker probe plus server-recorded non-secret result | Paired Worker owner/editor; native Worker may test only its own profile and local secret |
| Refresh a profile capability snapshot | native Worker probe plus server projection | Paired Worker identity and profile ownership; stale or failed probes cannot authorize new Comfy claims |
| Report profile probe/capability snapshot | Worker | Paired Worker identity and profile ownership, plus the existing `workers:diagnostics` scope for diagnostic probe data and `workers:report` scope for health/capability projection; neither scope grants job claim |
| List/discover/approve/publish workflow versions | server | admin/publisher scope; discovery remains unapproved until review |
| Read/update Series image/video bindings | server | Series owner/editor; admin override |
| Create shot/generic Comfy render-job | server | Series permission, credit/budget policy, approved workflow |
| Read active/recent Worker job summaries | shared server projection | Worker identity plus `workers:jobs:read`; Web uses the authenticated user's job-read scope; same fields for web and Worker |
| Read Comfy job detail/evidence/output references | shared server projection/detail service | Web user/job-read scope; Worker paired identity plus `workers:jobs:read` and job eligibility/lease scope; return only redacted, authorized fields |
| Claim/heartbeat/progress/cancel/retry | existing Worker control plane | Worker lease and job scope |
| Init/part/complete/abort artifact upload | existing artifact control plane | job lease, artifact target, tenant scope |
| Revoke profile/credential or Worker access | server + native Worker | profile owner/admin; confirmation for active work |

Responses must include a stable operation-specific error code and effective
authorization result. “Profile exists” or “workflow discovered” is not
equivalent to “job may execute”.

Every failed or partially completed operation uses the same safe error envelope:

```text
WorkerComfyError {
  code, category, messageKey, retryable, nextAction?, retryAfterSeconds?,
  correlationId, contractVersion, projectionRevision?, safeDetails?
}
```

`messageKey` and `nextAction` are resolved by the locale catalog; provider
error text, credentials, URLs, prompts, and local paths are never forwarded as
the user message. At minimum, `CREDENTIAL_EXPIRED` maps to reauthorize,
`MCP_PROTOCOL_INCOMPATIBLE`/`MCP_SCHEMA_CHANGED` to upgrade or re-probe,
`POLICY_REVOKED` to permission recovery, `REVISION_CONFLICT` to refresh and
review, `JOB_ALREADY_CLAIMED`/`CAPACITY_FULL` to remain queued, and
`OUTPUT_VALIDATION_FAILED` to inspect local output without publication, while
`LIBRARY_TARGET_UNAVAILABLE` maps to selecting or authorizing a valid Library
target before retrying job creation.
`CANCEL_UNSUPPORTED` maps to an explicit unsupported result without a retry
loop, `LEASE_LOST` maps to reconciliation/orphan recovery, and
`JOB_EXPIRED` maps to an expired-attempt record with a new policy-approved
retry action and never to an in-place claim retry. `CLEANUP_PENDING` maps to
bounded cleanup retry while keeping the validated output state visible.
`SERIES_UNAVAILABLE` maps to a read-only historical
record and prevents new binding/job selection. The
`INPUT_RESOLUTION_EVIDENCE_REQUIRED` code maps to resolving the typed inputs
again through the permitted Manual/Guided/Automated flow, while
`INPUT_POLICY_DENIED` maps to reviewing the Series/admin policy; neither code
may be bypassed by changing raw graph data or submitting directly to MCP. The
`ASSET_NOT_AUTHORIZED` code maps to reselecting an asset in the caller's
authorized Series/shot scope, while `ASSET_HASH_MISMATCH` maps to rescanning or
restaging the asset; neither code may be retried by changing only a URL/path or
by bypassing the server manifest check. The
envelope is returned consistently by native commands, Worker control-plane
routes, and Web adapters so every visible failure has a truthful recovery
action.

Every mutating operation carries an authenticated `requestId` and, where the
operation can be retried, an idempotency key scoped to tenant, actor, resource,
and contract version. Profile create/duplicate, profile activation/revocation,
workflow publish/disable, Series binding update, job creation, cancel/retry,
and artifact upload completion return the original committed result for a
repeated key instead of applying the mutation twice. Revision checks are
mandatory for profile policy, workflow publication, and Series bindings; a
stale revision returns `REVISION_CONFLICT` with the current safe revision and
does not overwrite the newer value. Audit records distinguish an original
mutation from an idempotent replay.

The active/recent summary contract is a read model, not a second job database.
Expose it to the Worker through the exact existing authenticated control-plane
route `GET /api/worker-runtime/jobs/summary` (logical operation
`worker.jobs.summary`) with `active`, `waiting`, and `recent` scopes. The route
must be Worker-token authenticated and must not be exposed as an unauthenticated
Comfy endpoint. The Worker's identity and tenant are taken from the verified
token; a caller-supplied Worker ID is not accepted. The Web app's
`workerJobs` tRPC router calls the same projection service; it is a user-facing
adapter, not the protocol used by the Worker. Both clients use the same server
query/projection for the web job list. The contract
must support `includeAllJobFamilies=true` for the global Worker Overview and
an optional `jobType` filter for the ComfyUI Jobs screen; the default is all
job families. `active` returns every active capacity slot, `waiting` returns
server-ordered queued work with its server-computed reason/position, and
`recent` returns terminal work ordered by `terminalAt` descending. The response
must include `projectionRevision`, `observedAt`, and the server time used for
staleness evaluation. The Worker may cache the last successful projection for
offline display, but must label it stale and may not use it to claim, complete,
or report a job.

The Worker mapping is `GET /api/worker-runtime/jobs/summary` with the existing
Worker bearer-token verification (`worker_execution` token use) plus the
dedicated `workers:jobs:read` scope. This is an additive scope in the shared
Worker permission catalog, not an implicit grant to old pairings; the Worker
connection/permission screen must show a pending
permission revision and require the existing user/admin reauthorize flow
before adding it. Until granted, the Worker keeps heartbeat/claim behavior
unchanged and Overview explains that job detail sync is unavailable. The Web
tRPC adapter uses the user session and must never forward a Worker
token or accept a caller-supplied Worker identity.

Permission-preset behavior is explicit: newly paired Workers may receive
`workers:jobs:read` only when the selected preset includes job monitoring or
the user/admin checks it in a custom grant. Existing pairings keep their exact
scope set until reauthorization; migration must not silently add this scope.
Removing the scope disables summary/detail synchronization only and does not
silently add or remove `workers:heartbeat`, `workers:claim`, or
`workers:report`.

The request and response are bounded and snapshot-consistent:

```text
worker.jobs.summary(request) {
  scope: active|waiting|recent|all,
  includeAllJobFamilies?, jobType?, limit?, cursor?, projectionRevision?
} -> {
  projectionRevision, observedAt, serverNow, staleAfterSeconds,
  active[], waiting[], recent[], counts, nextCursor?
}
```

`cursor` is an opaque, signed, short-lived continuation token. Its protected
claims include contract version, tenant ID, paired Worker ID, scope, job-type
filter, all-family flag, projection revision, stable ordering version, offset
or keyset position, and expiry. The server never accepts a browser/native
numeric offset as a cursor and never allows a caller to alter those claims.
Missing, expired, cross-tenant, cross-Worker, filter-mismatched, or
revision-mismatched cursors return `JOB_SUMMARY_CURSOR_INVALID` or
`JOB_SUMMARY_CURSOR_STALE` with `restartRequired=true`; the client then starts
at the first page. `projectionRevision` is a snapshot identifier, not a
permission revision, and must change whenever the ordered visible set or its
authoritative state changes. `counts` describe the complete authorized snapshot
for the request, not merely the returned page; `nextCursor` is present only
when another page exists in that same snapshot. A snapshot that cannot remain
consistent is rejected rather than returning mixed-page data.

The server applies a safe maximum to every list and returns `nextCursor` when
more work exists; the Worker Overview requests a small recent window and does
not download the entire historical queue. A cancel action creates a
server-authoritative cancellation event;
the Worker observes it on the next heartbeat/status exchange, attempts remote
cancellation when applicable, and reports the confirmed/unsupported/pending
result. Neither Web nor Worker may optimistically render a terminal cancel
state before that result is reconciled.

### 13.2 Proposed database additions

Use project naming conventions and existing tenant/owner helpers; the logical
records are:

- `comfy_connection_profiles` — non-secret server metadata and policy;
- `comfy_capability_snapshots` — versioned probe evidence;
- `comfy_workflows` and `comfy_workflow_versions` — registry/schema/checksum;
- `series_comfy_workflow_bindings` — image/video defaults and revisions;
- `worker_job_projection` (or equivalent additive fields/read model on
  `worker_jobs`) — all-job active/waiting/recent summary fields, server ordering,
phase/event sequence, heartbeat freshness, capacity slot, wait reason,
  recovery state, cancellation state, cleanup state/evidence, next
  reconciliation time, retention deadline, and projection revision; it must
  cover Remotion, media preprocessing, Hermes, Comfy, and every other
  claimable Worker family;
- extension fields or a dedicated `comfy_job_runs` ledger for input-resolution
  mode/evidence, connection/workflow resolution and its immutable
  profile/permission/policy revisions, execution ID, attempt, output manifest,
  publication evidence, and remote input consent/cleanup evidence.

All rows carry owner/tenant scope where applicable, timestamps, status, and
indexes for active bindings, workflow lookup, profile ownership, and job
idempotency. Enforce these invariants:

- foreign keys from capability snapshots, workflow bindings, and job runs to
  their owning profile/workflow/Series/job where the existing schema supports
  them; missing parent rows fail closed;
- unique `(workerId, localProfileId)` and unique active-default per Worker;
- unique `(workflowId, version)` and immutable checksum after publication;
- unique `(seriesId, operation)` for current bindings with optimistic revision;
- unique `(jobId, attempt, eventKey)` and unique billing reservation key;
- soft-delete/status checks prevent disabled, revoked, deprecated, or deleted
  records from new selection while preserving historical references.

Validate JSON schema documents and enum values at the application boundary and
again at migration/administrative publish time. Secrets are excluded by schema
and serialization review.

### 13.3 Migration safety

- Add nullable/defaulted fields and tables only; never overwrite existing
  Worker settings or job payloads.
- Preserve the current `comfyui_enabled`, `comfyui_mcp_enabled`,
  `comfyui_base_url`, and `comfyui_mcp_command` values. Import the URL/command
  at most once per Worker into a local `legacy_local_stdio` or
  `legacy_self_hosted` profile with an explicit “needs verification” state.
  Record the source setting names, import timestamp, and migration revision so
  rerunning the migration is a no-op and never creates duplicate profiles or
  changes the legacy values. If the legacy command/URL is empty, do not create
  a profile; preserve the old disabled/empty behavior.
- Version the Worker-local profile/secret/ledger store separately from the
  server migration. Migrate it with a write-ahead backup, atomic replacement,
  checksum validation, and a recovery copy; a failed local migration keeps the
  previous store usable and leaves the new profile disabled.
- Keep old job types readable and map missing fields at runtime. Do not invent
  AI-resolution evidence for legacy payloads; expose null legacy fields and
  keep them ineligible for Automated AI semantics until a new explicit attempt
  supplies valid evidence.
- Use unique constraints only after deduplicating non-secret metadata through a
  deterministic, non-destructive migration step.
- Migration is backward-compatible and reversible by disabling the new paths;
  rollback must not delete existing profiles, jobs, artifacts, or bindings.
- A migration dry-run reports rows to be imported and conflicts before apply.

### 13.4 Contract versioning and synchronization

Every Worker control-plane request and capability projection carries the
Worker contract version, schema version, Worker ID, and `projectionRevision`.
`profileId` is included when the operation is Comfy/profile-specific and is
explicitly null for other Worker job families. Server updates use optimistic
concurrency; an older Worker cannot overwrite a newer profile policy or
capability snapshot.

At registration and on every contract-sensitive request, the Worker sends its
supported contract range and schema versions. The server selects a compatible
version and returns the selected version, minimum supported version, and any
required feature flags. Minor versions may add nullable fields or capabilities;
unknown optional fields are ignored, while a major-version or required-schema
mismatch fails closed with `CONTRACT_VERSION_UNSUPPORTED` and actionable
upgrade guidance. The server must not silently downgrade security, permission,
lease, artifact, or redaction semantics. A Worker may continue only the
legacy job families explicitly supported by the selected adapter; it cannot
claim a new Comfy job until the required contract and schema versions are
negotiated successfully.

Synchronization rules:

- Worker registers/refreshes its non-secret profile projections and capabilities
  after pairing and after every probe; the server marks old snapshots stale;
- server policy changes are pulled before claim and are applied to the local
  cache atomically; a cache with an unknown schema version is ignored;
- a Worker may continue non-Comfy jobs when Comfy sync fails, but cannot claim
  Comfy jobs using stale policy or an unverified profile;
- API responses expose a stable machine error code, contract version, retry
  hint, and correlation ID. UI copy is resolved from the locale catalog and
  never from provider error text.

The implementation must add contract fixtures for old and new payloads and
explicitly document which fields are nullable, immutable after claim, or
server-authoritative.

## 14. Security, privacy, and authorization

1. Worker pairing credentials and Comfy credentials are different trust domains.
2. Missing identity, tenant, profile permission, workflow approval, or Series
   ownership fails closed.
3. Only admin-approved MCP tools and workflow versions are callable.
4. Job payloads cannot supply endpoint URLs, shell commands, arbitrary headers,
   tool names, local paths, or output destinations.
5. HTTP endpoints use HTTPS by default, explicit LAN/private-network policy, TLS
   verification, bounded redirects, and no SSRF to metadata/private services.
6. Local commands use an executable allowlist, argv arrays, no shell, bounded
   environment, resource/time limits, and process cleanup.
7. SSH uses host-key verification, explicit allowed hosts, keychain references,
   bounded forwarding, and tunnel cleanup.
8. File handling checks path confinement, symlinks, size, magic/MIME, decoder
   safety, output count, and retention policy.
9. All profile, permission, workflow, job, cancel, artifact, and publication
   mutations create an audit record with actor, scope, reason, and result.
10. Rate limits, concurrency limits, credit/budget checks, and per-tenant
    storage quotas apply before remote execution.
11. `comfy-mcp` licensing and redistribution obligations are reviewed before
    packaging it with a release; the Worker must not silently download an
    incompatible server binary.
12. Prompts, negative prompts, frame thumbnails, and workflow inputs are
    treated as potentially sensitive user content. They are not copied into
    ordinary logs/metrics; diagnostic capture is explicit, access-controlled,
    time-limited, and redacted where possible.

## 15. Observability and operational behavior

Every job and probe carries a correlation ID. Emit metrics for:

- profile probe success/failure and capability staleness;
- connection kind/transport and credential expiry;
- queue wait, Comfy execution, output download, validation, and upload time;
- retry/cancel/recovery rates and failure codes;
- output size, codec/dimensions/duration validation failures;
- duplicate/idempotency suppression and lease loss.

Logs are structured and redact token, key, cookie, signed URL, local absolute
path, prompt-sensitive asset data, and private endpoint details. The Overview
screen is a real-time summary, not a second source of truth: refresh/polling or
server push must show stale time and degrade visibly when disconnected.

On startup the Worker loads local profiles, refreshes eligible credentials,
probes the active profile, checks the control-plane session, and starts the job
loop. A stale or failed Comfy profile must not prevent the Worker from claiming
other supported job types; it must not claim Comfy jobs until ready.

### 15.1 Operational limits and service behavior

All limits are policy/configuration values with safe bounded defaults, not
unlimited values supplied by a workflow or browser:

- per-profile and per-Worker concurrency, queue depth, execution timeout,
  reconnect count, upload/download size, output count, and local retention;
- per-tenant credits, remote provider budget, local disk reservation, and
  maximum input/reference-frame count;
- control-plane lease, heartbeat, event retry, and status polling/watch cadence
  aligned with the existing Worker contract;
- bounded exponential backoff with jitter and a dead-letter/needs-user-action
  state after retry policy is exhausted.

The Overview must expose the effective limits and current usage when a job is
blocked by capacity, budget, disk, or policy. The Worker must reject a job
before remote submission when any known limit is exceeded. A remote server may
impose a lower limit; the negotiated capability snapshot and final error must
show that limit rather than silently truncating inputs or duration.

## 16. Test strategy

### Rust Worker tests

- profile validation for Windows/macOS paths, URLs, TLS, SSH and Cloud;
- profile projection tests keep same-machine origins null and allow only
  policy-approved remote origins, never local paths, command arguments, or
  tunnel-local addresses;
- OS secure-store reference behavior and secret redaction;
- stdio and Streamable HTTP MCP JSON-RPC negotiation;
- timeout, reconnect, stale capability, malformed tool/schema, cancellation;
- credential/MCP-session expiry, clock skew, reauthentication, and refusal to
  claim or submit while expired;
- MCP contract-range negotiation, major-version rejection, minor-version
  nullable-field compatibility, and deterministic detailed-phase to legacy
  `worker_job_status` mapping;
- workflow mapping and preflight for image/video/start/reference/last frames;
- managed-asset tenant/Series/Episode/Shot ownership, role/type/size/hash
  verification, and Worker-local staged-ID one-time/TTL/paired-Worker scope;
- path confinement, symlink/traversal, MIME/magic, atomic output and cleanup;
- large-output multipart/chunk upload resume, abort, checksum mismatch, and
  no-rerun behavior;
- remote-input consent scope/actor/revision enforcement and retention cleanup,
  including `CLEANUP_PENDING` without rerunning execution;
- Cloud signed URL validation and no-shell-command guarantee;
- idempotency, lease loss, remote execution recovery and duplicate publication;
- window close, explicit quit, OS shutdown/sleep, network suspension, and
  background-loop draining/restart reconciliation;
- legacy settings/job payload compatibility.

### Server tests

- tenant/owner/admin authorization for profiles, workflows, bindings and jobs;
- safe error-envelope localization/redaction, cancellation-state reconciliation,
  and audit evidence for remote-input consent and cleanup recovery;
- Worker scope-catalog and permission-revision tests for
  `workers:jobs:read`, including new-pairing grant, old-pairing reauthorize,
  revoke, and no-impact behavior for heartbeat/claim/report;
- profile probe/capability report authorization requires the appropriate
  `workers:diagnostics` or `workers:report` scope and cannot grant claim access;
- schema/checksum/version lifecycle and revision conflicts;
- `inputResolutionMode` and immutable resolution evidence, including reviewed
  Guided AI changes, unattended-policy revision, field IDs, and input hash
  without raw prompt/secret persistence; legacy jobs retain nulls without
  fabricated mode/evidence;
- stable `INPUT_RESOLUTION_EVIDENCE_REQUIRED` and `INPUT_POLICY_DENIED`
  mappings with localized next actions and no direct-MCP bypass;
- nullable resolution/consent semantics: unassigned jobs never inherit the
  viewer's Worker/profile and `local_only` never carries remote consent;
- contract negotiation/feature-flag compatibility and projection revision
  monotonicity;
- deleted/archived Series filtering, `SERIES_UNAVAILABLE` job admission, and
  preservation of historical read-only provenance;
- `ASSET_NOT_AUTHORIZED` and `ASSET_HASH_MISMATCH` admission/transfer failures,
  including cross-tenant, cross-Series/shot, wrong-role, expired-staged-ID, and
  replayed-staged-ID cases, plus rejection of browser-created staged IDs;
- worker capability routing and explicit fallback audit;
- job type validation, lease uniqueness, progress/report idempotency;
- lease/deadline expiry transitions to terminal `expired`, releases the
  capacity slot, preserves the expired attempt, and permits only a new
  policy-approved retry; the stable `JOB_EXPIRED` code and next action are
  returned consistently;
- output-policy pair validation requires an authorized Library target exactly
  when `uploadLibrary=true`, and rejects missing or unauthorized targets with
  `LIBRARY_TARGET_UNAVAILABLE` before claim;
- rate-limit, per-Worker/per-profile concurrency, credit/budget, disk, and
  per-tenant storage-quota enforcement before remote execution;
- database uniqueness/foreign-key/status invariants and contract-version
  optimistic-concurrency conflicts;
- migration dry-run/apply/rollback with pre-existing rows;
- artifact provenance and Library publication ownership.

### UI tests

- Thai/English switch updates every ComfyUI screen, status, validation and
  action without restart;
- connection wizard fields vary correctly by profile kind;
- active/expired/unhealthy/disabled states and recovery actions;
- permission inspector renders source/revision/actor/time and distinguishes
  effective, revoked, expired, unsupported, and pending acknowledgement;
- workflow selector, schema-driven form, frame ordering, preflight and submit;
- Worker selector displays machine/last-seen/capacity truthfully and persists
  the requested Worker/profile without silently selecting another machine;
- nine-shot screen shows correct Series binding and no duplicate queue/editor;
- deleted/archived Series are absent from new-job selectors while historical
  jobs remain read-only and show the actionable unavailable state;
- queue progress, cancellation, retry, missing Worker and missing capability;
- job detail shows the safe input-resolution mode/evidence summary without
  exposing raw prompts, asset bytes, local paths, or secrets;
- output policy requires a valid authorized Library target when publication is
  enabled and rejects an invalid target before submit;
- `cancellationState` transitions, unsupported cancellation, lease-loss
  reconciliation, and no optimistic terminal state;
- truthful header/Overview states, disconnected recovery guidance, and rejection
  of fabricated success/progress;
- active summary refresh/stale thresholds, server-push fallback, and no
  execution decision based on display freshness;
- web/Worker parity fixtures for Job ID, job type, Worker display name and
  machine name/status, Series/Episode/Shot, resource profile, latest event
  message/type, cache state, timestamps, phase, progress, queue position,
  terminal state, and localized time-zone rendering;
- shared job-type localization registry fixtures, including missing-label
  fallback to the raw type without an incorrect translation;
- busy Worker admission: a second job remains server-queued, is not claimed
  before capacity is free, becomes visible in the Overview waiting queue, and
  preserves deterministic priority/FIFO ordering;
- keyboard accessibility, responsive layout, and no secret/path leakage.

### Integration fixtures and live proof

CI uses fake stdio and fake Streamable HTTP MCP servers with deterministic
workflow schemas, queue states, failures, multi-output files, expiring URLs,
and all four Comfy job types. Fixtures also cover server-owned job enrichment,
cross-tenant/Series/shot asset rejection, wrong-role and hash mismatch,
one-time staged-ID expiry/replay, and deleted/archived Series admission.
Provider credentials and real GPU jobs are never required in CI. A release
candidate additionally requires a controlled local Comfy smoke test and a
separate controlled self-hosted remote and ComfyUI Cloud smoke test when
credentials, network access, quota, and licensing approval exist. The Cloud
smoke test must verify OAuth/API-key authentication, capability negotiation,
submit/status/output download, URL expiry handling, cancellation behavior, and
no duplicate publication; a mocked test is not sufficient for release sign-off.
Static tests alone must not be reported as proof of production connectivity.

## 17. Rollout

Feature flags:

- `worker_comfy_mcp_profiles_v1`
- `worker_comfy_remote_http_v1`
- `worker_comfy_cloud_v1`
- `worker_comfy_shot_jobs_v1`
- `worker_comfy_ai_mapping_v1`

Rollout order:

1. Ship schema/contract fixtures and read-only profile/capability projection.
2. Enable local stdio profile import and connection manager.
3. Enable registry, Series bindings, and image/video job contracts behind flags.
4. Enable remote self-hosted HTTP after transport/security integration proof.
5. Enable Cloud after OAuth/API-key, signed-output, quota, and licensing proof.
6. Enable automated AI mapping only after typed validation and audit evidence.

Rollback disables new claim paths and UI actions while preserving in-flight
legacy jobs and all local/published artifacts. No rollback step deletes source,
job, workflow, binding, or output records.

## 18. Acceptance criteria

### P0 — required before default enablement

- A Worker can save and test at least one local stdio profile and one supported
  remote/Cloud profile without storing secrets on the server.
- Multiple profiles are displayed with accurate active, health, capability,
  credential expiry, and permission state; profile selection is enforced.
- Known credential and MCP-session expiry times are shown in the selected
  locale; expired profiles cannot claim or submit new Comfy work until
  reauthentication/reconnect succeeds, while already claimed work follows
  lease/recovery rules.
- A published workflow version exposes validated input and output schemas and a
  checksum; unsupported/missing fields stop preflight with an actionable error.
- Queued jobs without an eligible assignment serialize null Worker/profile
  resolution fields, while remote-transfer jobs require consent and
  `local_only` jobs carry no consent or source-byte handoff.
- An episode shot can submit image and video jobs with workflow version,
  duration, start frame, last frame, and ordered reference frames.
- Only a leased Worker executes a job; progress, cancel, retry, recovery,
  idempotency, and final artifact provenance work across restart.
- Output is saved and validated on the Worker before optional Library upload;
  malformed, wrong-type, duplicate, or unsafe output is not published.
- A job requesting Library publication has a server-authorized target before
  claim; a missing or unauthorized target returns `LIBRARY_TARGET_UNAVAILABLE`
  without creating a Comfy execution, while local-only output remains usable.
- Large Library video uploads can resume from an interrupted part without
  rerunning the Comfy execution or duplicating the artifact.
- Existing Worker settings and legacy Comfy job types remain functional.
- Existing in-flight legacy jobs continue to report, complete, or recover
  without being rewritten by the new projection or Comfy adapter.
- Detailed execution phases map deterministically to the existing
  `worker_job_status` values, including local-only save, artifact upload, and
  Library publication, without persisting unsupported phase strings.
- No endpoint, shell command, secret, local absolute path, or unapproved MCP
  tool can be supplied through the browser job payload.
- Managed asset references are reauthorized against tenant and
  Series/Episode/Shot ownership and the persisted hash/type/size manifest;
  cross-scope, wrong-role, stale, tampered, or replayed references fail closed
  with `ASSET_NOT_AUTHORIZED` or `ASSET_HASH_MISMATCH` before claim/transfer.
- Worker-local staged IDs can be created only by the paired native Worker after
  local scanning; browser-created or browser-substituted staged IDs are rejected
  before a job is claimable.
- Pairing consent, permission revisions, and revocations are reflected in the
  effective scope list; a revoked scope blocks only its affected operations
  and an old pairing is never silently granted a new scope.
- Retried mutations return the original idempotent result, while stale policy
  or binding revisions fail without overwriting newer data.
- Cancel requests expose server-authoritative `cancellationState` and remain
  pending until the remote/local result is reconciled; unsupported cancel,
  lease loss, and cleanup failures expose stable recovery codes.
- Lease or execution deadline expiry transitions the current attempt to
  terminal `expired`, releases its capacity slot, remains visible with the
  expiry reason, returns `JOB_EXPIRED` with a localized recovery action, and
  cannot be reclaimed or retried in place.
- An orphan/reconciling execution remains visible and ineligible for duplicate
  claim or publication until bounded recovery completes or requires user action.
- Worker/server contract-range negotiation accepts compatible minor versions,
  rejects incompatible major or required-schema versions before Comfy claim,
  and returns actionable upgrade guidance without weakening security semantics.
- Overview/Queue accurately distinguish ready, unavailable, queued, running,
  failed, and stale states.
- Foreground Overview meets the configured active/waiting freshness targets and
  shows the last server observation plus recovery action when stale.
- When a Worker is processing a job, the active job appears at the top of
  Overview with the same Job ID, job type, Worker, Series context, created /
  claimed / started / updated time, phase, progress, and queue information as
  the web app. A second job remains visibly waiting until declared capacity is
  available.
- Under the default per-Worker serial capacity policy, a second job from any
  Worker job family is server-queued for that Worker and cannot be claimed by
  that Worker until its active job ends; another eligible Worker may claim an
  independent job. Parallel lanes require explicit admin policy and are visible
  in Overview.
- Rate limits, concurrency, credit/budget, disk reservation, and tenant storage
  quota are enforced before remote submission with a localized actionable
  reason; no workflow or browser payload can raise those limits.
- Web and Worker receive the same projection revision and job fields; queued
  jobs without an assignment show `workerId=null`, while Worker waiting details
  are limited to jobs eligible for that paired Worker.
- Every enabled UI action has a real command/API/state-transition proof; no
  fabricated success or progress is accepted.
- Job detail exposes the server-authorized input-resolution evidence needed to
  distinguish Manual, Guided AI, and Automated AI without exposing sensitive
  input content.

### P1 — required for full feature completion

- Admin can publish/deprecate/disable workflow versions and configure Series
  image/video defaults and allowed connection policy.
- Database constraints and contract-version checks prevent duplicate active
  defaults, binding conflicts, stale projection overwrites, duplicate billing,
  and duplicate artifact publication.
- User can choose an allowed connection/workflow alternative at shot submit
  without cluttering the default form.
- Manual, Guided AI, and Automated AI input modes enforce typed validation,
  visible resolution evidence, and explicit consent/unattended policy before
  any remote submission.
- Every new Comfy job persists the selected input-resolution mode and a
  redacted, immutable evidence record tied to the policy revision and
  resolved-input hash; Automated AI cannot claim or submit without it. Legacy
  jobs may retain null fields and must never be upgraded into fabricated AI
  evidence.
- Missing or policy-denied AI evidence returns
  `INPUT_RESOLUTION_EVIDENCE_REQUIRED` or `INPUT_POLICY_DENIED` with a
  localized recovery action and cannot be bypassed through direct MCP calls.
- Worker can recover an execution after UI close/restart and reconcile output
  without duplicate Library publication.
- Remote input transfer records actor/scope/policy consent, and cleanup removes
  only eligible staged/diagnostic data without deleting source or published
  Library artifacts.
- Closing the Worker window does not stop the background loop; explicit quit or
  OS shutdown drains new claims and preserves enough ledger/lease evidence for
  deterministic recovery after restart.
- Local/LAN/remote/Cloud help text, errors, auth expiry, and all controls are
  fully bilingual.
- Worker Overview job synchronization is enabled only when the paired Worker
  has the explicit `workers:jobs:read` scope; an old pairing without it shows
  the documented recovery state and does not receive a silent permission grant.
- Fake MCP integration suite and migration safety suite pass. Controlled local,
  self-hosted remote, and Cloud smoke tests pass for every corresponding
  transport flag enabled in the release; Cloud sign-off includes the real
  authentication/output-expiry checks in Section 16.

## 19. Implementation work packages

1. Contract/types and migration ledger; preserve legacy adapters.
2. Rust profile store, secure credentials, transport adapters, MCP negotiation.
3. Capability/workflow registry synchronization and schema mapping engine.
4. Worker job executor for all four Comfy job types, staging/output validation,
   output-policy target resolution, lease/recovery integration.
5. Server routing for all four Comfy job types, Series bindings, job creation,
   policy, output-target authorization, and audit.
6. Episode shot UI and Series settings UI.
7. Worker Sidebar ComfyUI screens, Overview/Queue integration, localization.
8. Fixture-based integration tests, platform packaging, rollout and smoke.

Each package must include focused tests and must not claim real Comfy/Cloud or
production proof unless that environment was actually exercised.

## 20. Requirement traceability

| Requested outcome | Covered by |
|---|---|
| Local, same-machine, remote, LAN, SSH and Cloud connections | Sections 6.2, 7, 8, 17 |
| Save several connections and choose the active one | Sections 7.1–7.2, 12.4 |
| See/revoke permissions and prevent unauthorized work | Section 7.3 and Section 14 |
| Change active profile and permission scopes with server acknowledgement | Sections 7.2–7.3, 12.4, 13.1.1, 16, 18 |
| Enforce server-owned job fields and tenant/Series/shot-safe asset references | Sections 10.2, 11.1.1, 14, 16, 18 |
| Preserve explicit null semantics for unassigned jobs and local-only consent | Sections 10.2, 10.3, 11.1.1, 13.2, 16, 18 |
| Show exact credential/session expiry and block new work while expired | Sections 7.1, 7.4, 12.4, 16, 18 |
| Discover workflow inputs/outputs and select a precise workflow | Section 8.1 and Section 9 |
| Generate image/video and use start/reference/last frames | Section 10 and Section 12.3 |
| Create dedicated render-jobs and let the first leased Worker execute | Section 10.3 and Section 13.1 |
| Save to Worker hard disk and optionally upload Library output | Sections 10.2, 11, 13.1.1, 16, 18 |
| Require a server-authorized Library target before publication | Sections 10.2, 11.2–11.3, 13.1.1, 14, 16, 18 |
| Bind image/video defaults at Series level | Section 12.2 |
| Generate from each storyboard shot without duplicating the queue | Sections 12.3 and 12.4 |
| Start automatically, monitor status, recover and cancel | Sections 10.3, 12.4, 15 |
| Handle lease/deadline expiry without stranded capacity or in-place retry | Sections 10.3, 10.4, 11.4–11.5, 16, 18 |
| Show web-parity active job at top of Worker Overview and queue new work while busy | Sections 10.4, 12.4, 13.1.1, 18 |
| Preserve current Web job response during projection migration | Sections 10.4, 13.1.1, 16, 18 |
| Prevent duplicate claims, mutations, billing, and publication | Sections 10.3, 11.4–11.5, 13.1.1–13.3, 18 |
| Recover orphaned remote executions without duplicate execution | Sections 10.3, 10.4, 11.4–11.5, 15, 18 |
| Provide manual, guided-AI, and automated-AI workflow input modes safely | Sections 9.3, 12.3, 16, 17, 18 |
| Persist auditable input-resolution mode and policy-bound evidence | Sections 9.3, 10.2, 12.3, 14, 16, 18 |
| Inspect safe input-resolution evidence in job detail | Sections 10.4, 12.4, 16, 18 |
| Negotiate compatible Worker/server contracts and preserve legacy statuses | Sections 10.3, 13.4, 16, 17, 18 |
| Show truthful realtime status, cancellation, error recovery, and cleanup state | Sections 10.4, 11.1, 11.4, 13.1.1, 15, 16, 18 |
| Bilingual, secure, migration-safe implementation | Sections 13.3, 14, 16, 17 |

## 21. Codebase impact map

The implementation must start from these existing boundaries and keep unrelated
Worker runtimes intact:

| Existing path | Required Feature 165 change |
|---|---|
| `apps/worker-app/src-tauri/src/comfy_mcp_client.rs` | Replace the single local-only session with the transport adapter, secure profile resolution, MCP handshake, schema/tool negotiation, output collection, cancellation, and recovery contract |
| `apps/worker-app/src-tauri/src/settings.rs` | Add versioned local profile/secret/ledger storage while preserving `comfyui_enabled`, `comfyui_mcp_enabled`, `comfyui_base_url`, and `comfyui_mcp_command` |
| `apps/worker-app/src-tauri/src/worker_executor.rs` | Route and execute all canonical Comfy types (`comfy_image_generation`, `comfy_video_generation`, `shot_video_generation`, `comfy_workflow_run`) while keeping Remotion and Hermes behavior isolated |
| `apps/worker-app/src-tauri/src/worker_loop.rs` | Route claimed jobs through profile/workflow resolution and pre-submit gates; do not use the old single-command path for new profiles |
| `apps/worker-app/src/main.tsx` | Mount Connections, Workflows, and Comfy Jobs in the existing Sidebar/route registry; remove no unrelated runtime screen and do not add a second global queue |
| `apps/web/shared/workerRuntime.ts` | Add versioned schemas, job types, capability hints, stable error codes, legacy payload adapters, and the additive `workers:jobs:read` scope contract |
| `apps/web/shared/workerAccessKeys.ts` and worker auth policy | Register `workers:jobs:read` as an explicit least-privilege read scope; preserve existing pairings without silently granting it and expose reauthorize/permission-revision recovery |
| `apps/web/server/services/workerSchedulerService.ts` | Add admission/routing for all four canonical Comfy types using existing lease, capability, credit, output-target, and idempotency rules |
| `apps/web/server/routes/workerRuntime.ts` | Extend existing authenticated heartbeat/claim/progress/artifact routes with the Worker-token `worker.jobs.summary` operation at `GET /api/worker-runtime/jobs/summary`; known boundaries include `/api/workers/:workerId/heartbeat`, `/api/workers/:workerId/jobs/claim`, and `/api/worker-jobs/:jobId/artifacts/*` |
| `apps/web/server/routers/workerJobs.ts` and `apps/web/server/services/workerJobMonitorService.ts` | Expose the shared `worker.jobs.summary` projection and adapt existing list/detail responses without leaking raw local paths or changing legacy authorization; preserve filters/cancel behavior through the same authoritative job rows |
| `apps/web/client/src/pages/RenderJobsPage.tsx` (and generated/runtime counterpart where applicable) | Render the shared projection for the Web job table/detail, including full/copyable Job ID, raw and localized job type, Worker/device, Series/Episode/Shot, created/claimed/started/updated/terminal times, phase/progress, queue/capacity, stale state, and localized labels |
| `apps/web/server/routes/workerSeriesControlPlane.ts` | Reuse tenant-safe Series binding/publication projections; do not send local absolute paths or Comfy secrets |

HyperFrames code paths may remain for backward compatibility where already
supported, but Feature 165 must not add new HyperFrames dependencies, readiness
requirements, job claims, or UI defaults. Existing `WorkerJobKind::Hyperframes`
and runtime-pack compatibility are migrated only when required by the existing
contract and are separately reported in tests.

## 22. Spec completeness closure addendum

This addendum is normative and closes implementation ambiguity found during the
five-round review on 2026-08-27. Where an earlier section uses “recommended”,
“may follow”, or an equivalent alternative for one of the items below, this
addendum is the selected contract.

### 22.1 One projection endpoint and cursor contract

- The native Worker reads the shared summary only from
  `GET /api/worker-runtime/jobs/summary` using a verified
  `worker_execution` bearer token and `workers:jobs:read`.
- Tenant and Worker identity always come from the token. The request has no
  Worker-ID override. The Web adapter uses the user session and the same
  projection service; it never forwards a Worker token.
- The response is a bounded snapshot. `counts` are totals for the authorized
  snapshot, not counts of the current page. `nextCursor` continues that same
  snapshot only.
- `limit` is an aggregate page limit across `active`, `waiting`, and `recent`,
  while the response splits those returned items into the three arrays. A
  scope-specific request returns empty arrays and zero counts for the other
  scopes; it never changes the meaning of the shared fields.
- Cursors are signed opaque tokens containing the tenant, paired Worker,
  filters, contract/order version, projection revision, position, and expiry.
  On the wire, `cursor`/`nextCursor` are bounded strings (maximum 2048 bytes),
  not resource IDs. Numeric offsets, altered claims, expired tokens, filter
  changes, and stale projection revisions are rejected with a stable error and
  `restartRequired=true`. The client refreshes from page one and never guesses
  queue position locally.
- The response includes both `projectionRevision` and `observedAt`; `serverNow`
  is the server clock used for freshness evaluation. A projection revision is
  generated for the ordered authorized snapshot, not hardcoded as a process
  label. A cursor is never reused across revisions.
- A missing `workers:jobs:read` scope is an explicit permission-denied state,
  not an empty successful queue. Heartbeat, claim, report, and unrelated job
  families remain governed by their own scopes.

### 22.2 Permission truth model

The permission inspector renders a complete server-issued manifest, not only a
list of currently effective scope strings. Each entry has `id`, category
(`worker_control`, `comfy_tool`, `workflow`, `file_transfer`, or `publication`),
action description, source, requested/granted/effective state, blocking reason,
permission revision, last-change actor/time, and native acknowledgement state.
The effective state is calculated server-side from pairing grant, user/profile
policy, admin/tenant policy, credential/session validity, and negotiated
capability. A negotiated capability never grants a permission by itself.

The browser/admin policy surface is the only place that adds or revokes server
grants. The native Worker can acknowledge, refresh, probe, disable its local
credential, and report its own state, but cannot self-grant a scope. A revoke
increments the authoritative permission revision immediately; the next claim,
preflight, submit, transfer, artifact upload, and publication gate rechecks it.
The UI shows the affected operation as blocked and displays the acknowledgement
timestamp. Adding a scope requires explicit reauthorization and never happens
through migration, profile activation, or a local checkbox.

### 22.3 Output and local-only completion

Every published workflow version declares an ordered output-role contract. Each
required role must occur exactly once; optional roles may be absent; unknown
roles, duplicate roles, missing required roles, wrong media type, unsafe path,
bad magic/MIME, invalid dimensions/duration/codec, or output-count overflow
fail collection/validation and cannot publish. The local manifest records every
accepted and rejected output with role, media type, size, hash, and validation
reason. Publication is all-or-nothing for the declared required set.

`uploadLibrary=false` means no Library target is resolved and no artifact bytes
or publication event are sent to the server. The Worker reports a terminal
local-save result with a redacted local-output handle and retains the local
manifest under policy. The existing coarse `worker_job_status` remains
backward-compatible; `saved_locally` is a detailed phase, not an unsupported
transport status. If publication is required, local save succeeds first and
multipart upload resumes by artifact fingerprint without rerunning ComfyUI.

### 22.4 Canonical Worker information architecture

The Worker has one Sidebar **ComfyUI** group with exactly three destinations:
`Connections`, `Workflows`, and `Jobs`. The global `Queue` remains the only
cross-family queue. Any legacy `workflows` or duplicate quick-link route is a
redirect/alias to the canonical ComfyUI Workflows screen and must not render a
second screen or top Quick Actions bar. `Series` owns Series selection and
folder binding; `Media Workspace` owns local footage scan/preprocessing and
asset publication; neither owns Comfy profile/workflow controls.

The shell loads the selected `th`/`en` catalog before the first render. This
includes existing Connection, Binding, Series, Media Workspace, Queue,
Published, AI Plan, Runtime, and Settings screens—not only the newer ComfyUI
screens. Provider text, raw error text, and unregistered labels cannot leak a
third language. Every displayed status includes text plus a truthful state;
the active job card is above the fold in Overview and uses the same ID, raw and
localized type, Worker, Series context, created/claimed/started/updated and
terminal times, phase, progress, and queue data as the Web projection.

### 22.5 Completion and evidence gate

Feature 165 is not “complete” when only the fake-MCP or compile suites pass.
Release evidence has three independently recorded classes: local deterministic
tests, browser/WebView proof, and controlled external Comfy/Cloud proof. A
missing class is `pending`, never `ready`. The implementation checklist must
include negative tests for permission revocation, cursor tampering/staleness,
multi-output mismatch, local-only non-publication, expired credentials, lease
loss, restart reconciliation, deleted Series, duplicate publication, and
legacy response parity. Each item records commit/build identity, test command,
result, and environment; production, browser, real GPU, provider, migration,
and signed-installer claims require their own evidence and cannot be inferred
from static checks.
