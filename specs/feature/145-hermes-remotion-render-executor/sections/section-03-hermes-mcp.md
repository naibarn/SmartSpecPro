# Section 03 — Authenticated Hermes MCP Surface

## Objective and implementation boundary

This workstream adds the agent-facing MCP control surface for Hermes connection
management, Hermes-backed image/video generation, and server-owned Remotion
render jobs. It also preserves the existing Library and media-history tools as
the only supported way for an MCP caller to discover and obtain references to
authorized media. The work is additive: existing MCP names remain stable,
existing Worker App and Hermes worker protocols remain separate, and the MCP
handler never executes a CLI, subprocess, Remotion composition, provider URL, or
storage operation directly.

The server is authoritative at every step. MCP authenticates the caller and
describes intent; domain services authorize tenant/user/object access, reserve
credits, create or inspect durable jobs, and return safe projections. The Hermes
worker and the dedicated Remotion executor continue to use the authenticated
worker REST control plane. Binary files continue to use the ACL-aware download
broker outside JSON-RPC.

This section owns the MCP catalog definitions, strict tool schemas, MCP-facing
service adapters, safe result projections, and their focused tests. It does not
own the `remotion_executor` runtime contract, scheduler target resolution,
worker claim/lease behavior, artifact upload protocol, canonical storage ACL,
or Redis topology. Those contracts are consumed from Sections 01, 02, 05, and
07 respectively.

## Preconditions and invariants

Implementation starts only after Section 01 has established the shared runtime,
feature-flag, execution-target, and public-scope contracts. The following names
are treated as imported contracts rather than redefined here:

- `remotion_executor` is a dedicated worker runtime and is never an alias for
  `hermes_agent_gateway`.
- `remotionDedicatedExecutorEnabled` is a typed, default-off tenant flag. MCP
  input cannot set or override it.
- MCP may accept `auto | remotion_executor | desktop_worker` as a requested
  target, while a persisted job contains only the resolved immutable target
  defined by Section 02.
- Existing scopes remain valid: `hermes:connect`, `hermes:read`,
  `hermes:write`, `media:generate`, `media:read`, `media:download`,
  `library:search`, `library:read`, `library:download`, `jobs:create`, and
  `jobs:read`.
- Section 01 adds `hermes:disconnect` and `hermes:generate` as opt-in scopes, or
  supplies an equivalently strict compatibility normalizer. An old API key with
  only `hermes:write` does not acquire either permission implicitly.
- `HERMES_MEDIA_OPERATIONS`, `HERMES_OPERATION_REFERENCE_BOUNDS`, the Hermes
  capability manifest, and the Hermes typed error set remain the shared source
  of truth. This section may add MCP-facing schemas but must not create a second
  operation enum.
- The existing `remotion_render_video` worker payload remains server-owned and
  is never accepted as MCP input.

The implementation must preserve existing catalog behavior when all new flags
are disabled. Existing `smartspec.media.generate_image`,
`smartspec.media.generate_video`, `smartspec.media.status`, Library tools,
history tools, and generic job tools must not change behavior for requests that
do not select Hermes or Remotion.

## Files and ownership

### Primary files

Modify `apps/web/server/_core/mcpRegistry.ts` to register the new tools in the
existing catalog and to route execution through typed MCP-facing adapters. Use
the existing `listMcpToolsForSession`, `executeMcpToolByName`, family/group,
`requiredScope`, `readWrite`, `delegatedWorkerEligible`, `executionMode`,
`resultSafetyClass`, and `idempotencyMode` mechanisms. Do not create a parallel
registry or an ad-hoc route.

Modify `apps/web/server/_core/mcpPublicServer.ts` only where the shared MCP
transport needs an additive security property that cannot live in the registry:
effective session-scope normalization, sensitive-result idempotency behavior,
sanitized JSON-RPC error data, and audit/rate-limit metadata. `/v1/mcp` remains
the canonical MCP endpoint and continues to inherit the shared `/v1` CORS,
authentication, feature, quota, idempotency, rate-limit, and audit middleware.

Add `apps/web/server/services/hermesMcpService.ts` as the thin MCP-facing domain
adapter. It owns input-to-domain translation and safe projections, but no direct
SQL, Redis, subprocess, provider HTTP, or storage access. Its dependencies are
injected or imported from established domain services:

- `hermesConnectionService.ts` for availability, list/get, authorize,
  connection status, probe/test generation, and disconnect;
- `hermesMediaScheduler.ts` for generation submission;
- `hermesMediaAdapter.ts` for owner-scoped status and cancellation;
- the Section 02 owner-scoped Remotion submit/status/cancel facade;
- the Section 05 canonical media-reference and download authorization facade.

If Section 02 supplies the Remotion facade under a different verified filename,
use that service directly and do not add a second wrapper containing the same
authorization or state-transition logic. The required callable boundary is
equivalent to `submitOwnedRemotionJob`, `getOwnedRemotionJobStatus`, and
`cancelOwnedRemotionJob`: each accepts a server-derived actor and performs
tenant, owner, job-type, target, and state checks before returning a safe
projection.

Modify `apps/web/shared/hermesMedia.ts` only for additive MCP-safe request,
reference, capability, or projection schemas that must be consumed by both
server and clients. Keep the module free of database and server imports.

Modify `apps/web/shared/publicApiTypes.ts` and scope-normalization consumers only
as required by the Section 01 contract. This workstream consumes the resulting
scope names and proves catalog filtering; it must not invent a different scope
vocabulary locally.

### Existing files that remain authoritative

`apps/web/server/services/hermesConnectionService.ts` remains the only owner of
Hermes connection ownership, `server_shared` admin policy, durable control-job
creation, generation-test cooldown, and safe connection projection.

`apps/web/server/services/hermesMediaScheduler.ts` remains the only owner of
connection resolution, capability intersection, admission, quotas, credit
reservation, durable idempotency, and Hermes media job insertion.

`apps/web/server/services/hermesMediaAdapter.ts` remains the owner-scoped task
projection and cancellation adapter. MCP must not query `worker_jobs` directly.

`apps/web/server/services/mcpDownloadBrokerService.ts` remains the MCP binary
download boundary. Library and history tools return opaque, short-lived
download references; they do not return a raw R2 key, managed-storage path,
presigned URL, provider URL, or media bytes.

`apps/web/server/routers/hermesConnections.ts` is a behavioral reference for the
manual UI flow. MCP should call the same services rather than making loopback
tRPC or HTTP requests. The router and MCP adapter must project the same durable
connection states and typed failures.

## Authentication, session, and scope contract

Every call passes through the existing MCP initialization/session flow. A valid
`McpToolSession` must contain a verified `tenantId`, positive `userId`, auth
mode, effective scopes, and creation time. API-key identity comes only from the
validated key record; browser-session identity comes only from the authenticated
session; signed bearer identity comes only from verified claims. Caller headers
such as `x-tenant-id` and `x-user-id` are never authoritative for these tools.
The public MCP endpoint must not accept an anonymous or static internet-facing
identity fallback.

The effective-scope rules are:

| Authentication mode | Allowed behavior |
|---|---|
| `session` | Operates as the logged-in user in the verified current tenant. Read/download capabilities may follow the existing first-party session policy. In the first release, cookie-backed sessions cannot call mutating connection, generation, render-submit, or cancel tools; those tools require API-key, verified-bearer, or Connector `agent_pairing` authentication with the exact operation scope and `mcp:write`. |
| `api_key` | Requires the exact persisted tool scope plus `mcp:read`; write tools also require `mcp:write`. Revoked, expired, wrong-tenant, or userless keys fail before catalog execution. |
| `bearer` | Requires a trusted signed token with tenant, user, audience, token-use, expiry, and explicit scopes. `sub=static`/`sub=internal` and header-derived tenant/user fallback are forbidden for new Hermes/Remotion/download tools; isolated internal calls use a separately allowlisted service path. |
| `agent_pairing` | Requires a Connector-issued, owner/device-bound MCP session created through explicit browser consent/device authorization. It carries exact persisted scopes, rotates refresh material, and is never accepted as a worker/delegated token or provider credential. |
| `delegated_worker` | May not call any high-level Hermes connection, Hermes generation, Remotion submit/status/cancel, or media-cancel tool, even if a malformed grant contains matching strings. Library/history access is permitted only through explicit delegated object grants described below. |

Tool availability is checked twice. `tools/list` filters by required scope,
`mcp:write`, execution mode, feature/operator gates, and delegated-worker
eligibility. The domain service then repeats tenant/user/role/object checks
before any side effect. Catalog visibility is never treated as authorization.
Preserve subject class (`user`, `api_key`, `service`, `agent_pairing`, or
`delegated_worker`) in
the internal MCP session so `evaluateToolAvailability` can reject static/internal
bearer identities for new sensitive tools without breaking isolated legacy tests.

Scope compatibility is fail-closed. In particular:

- `hermes:read` permits capability and connection-status reads only.
- `hermes:connect` permits authorize and non-generating probe operations.
- `hermes:disconnect` permits disconnect and is not implied by an old
  `hermes:write` grant.
- `hermes:generate` permits `media_execute` and bounded connection test
  generation and is not implied by `hermes:connect` or `hermes:write`.
- `media:generate` continues to protect compatibility generation and cancel
  tools.
- `remotion:submit` protects dedicated Remotion submit,
  `remotion:cancel` protects dedicated Remotion cancel, and `remotion:read`
  protects dedicated Remotion status. Existing `jobs:create`/`jobs:read`
  behavior remains unchanged for generic job tools.
- Tool scopes do not replace object authorization. Possessing `jobs:read`, for
  example, does not allow reading another user's render job.

Cookie-backed MCP sessions remain read/download-only because
`normalizeMcpSessionAuth` currently grants that set explicitly. Mutating tools
(`hermes:connect`, `hermes:disconnect`, `hermes:generate`, `remotion:submit`,
and `remotion:cancel`) require an API key, verified bearer token, or
Connector-issued `agent_pairing` session carrying the exact operation scope and
`mcp:write`. The pairing session uses explicit browser consent/device
authorization, refresh rotation, revocation, and device binding; it cannot be
minted from a worker/delegated token or used as a provider credential.

Cookie-backed MCP requests retain the existing trusted-Origin CSRF check.
API-key and bearer requests retain CORS allowlisting and shared public-API
middleware. No MCP credential, provider credential, worker token, refresh token,
or download token is forwarded from one security plane into another.

`smartspec.hermes.connector.status` is intentionally safe for onboarding. It
returns only a bounded status enum, detected/adopted/provisioned source,
platform/architecture, doctor result codes, MCP pairing state, worker readiness,
and one next action. It never returns candidate paths, executable arguments,
tokens, device codes, signed URLs, provider details, or raw installation logs.
The Connector may poll this tool during setup, but a `ready` result is not a
server admission grant until worker registration and capability checks also pass.

## Catalog design

All new schemas are closed objects: `additionalProperties` is false at every
object level under MCP caller control. Strings are trimmed and bounded; IDs are
bounded opaque identifiers rather than paths; enums come from shared contracts;
arrays have explicit maximum lengths; and mutually exclusive reference forms use
an exact tagged union. Unknown fields fail with `INVALID_ARGUMENT` before a
service call.

The catalog additions are:

| Tool | Family / group | Scope | Mode | Idempotency | Result class | Delegated worker |
|---|---|---|---|---|---|---|
| `smartspec.hermes.capabilities` | `media` / `media_generation` | `hermes:read` | Read | None | `structured_json` | No |
| `smartspec.hermes.connection_status` | `media` / `media_generation` | `hermes:read` | Read | None | `structured_json` | No |
| `smartspec.hermes.connector.status` | `video_projects` / `video_generation` | `hermes:read` | Read | None | `structured_json` | No |
| `smartspec.hermes.connection_authorize` | `media` / `media_generation` | `hermes:connect` | Write | Required, service replay | `structured_json` | No |
| `smartspec.hermes.connection_probe` | `media` / `media_generation` | `hermes:connect` | Write | Required | `structured_json` | No |
| `smartspec.hermes.connection_disconnect` | `media` / `media_generation` | `hermes:disconnect` | Write | Required | `structured_json` | No |
| `smartspec.hermes.connection_test_generation` | `media` / `media_generation` | `hermes:generate` | Write | Required | `structured_json` | No |
| `smartspec.hermes.media_execute` | `media` / `media_generation` | `hermes:generate` | Write | Required | `artifact_ref` | No |
| `smartspec.media.cancel` | `media` / `media_generation` | `media:generate` | Write | Required | `structured_json` | No |
| `smartspec.remotion.render_video` | `video_projects` / `video_generation` | `remotion:submit` | Write | Optional | `artifact_ref` | No |
| `smartspec.remotion.job.status` | `video_projects` / `video_generation` | `remotion:read` | Read | None | `structured_json` | No |
| `smartspec.remotion.job.cancel` | `video_projects` / `video_generation` | `remotion:cancel` | Write | Optional | `structured_json` | No |

The existing Library and media-history catalog entries remain canonical and
must not be duplicated under a Hermes namespace. Their delegated-worker status
is conditional rather than generally permissive:

- `smartspec.knowledge.library.search`,
  `smartspec.knowledge.library.get`, and
  `smartspec.knowledge.library.download` require `library:search`,
  `library:read`, and `library:download` respectively, plus the explicit
  delegated Library grant already enforced by the Library service/manifest.
- `smartspec.media.history.list`, `smartspec.media.history.get`, and
  `smartspec.media.history.download` require `media:read`, `media:read`, and
  `media:download` respectively, plus an explicit delegated media-history
  grant scoped to the owner and allowed resource IDs. If the delegated manifest
  has no first-class history grant, these tools must be hidden and denied for
  delegated workers until Section 05 adds one; a bare `media:read` or
  `media:download` string is insufficient.
- Normal user sessions and API keys see only permission-visible Library items
  and owner-scoped media history in the authenticated tenant.

Catalog descriptions must be adequate for an agent to answer natural-language
usage questions without guessing. Each description identifies whether the tool
is read-only or mutating, the required server-owned reference type, asynchronous
behavior, idempotency requirement, polling guidance, and the fact that binary
download uses an opaque reference. Safe examples may use synthetic IDs only and
must contain no real URL, token, path, storage key, provider credential, or full
production prompt.

## Tool schemas and behavior

### Capability discovery

`smartspec.hermes.capabilities` accepts an optional `connection_id` and optional
`asset_type` (`image | video`). No provider command, model override, CLI
argument, executable name, or shell fragment is accepted.

The service intersects four sources: server/operator settings, tenant feature
flags, caller role and connection grants, and the latest authorized connection
capability manifest. The result includes safe connection state, Hermes version,
probe timestamp, last bounded generation-test result, models, every known
`HERMES_MEDIA_OPERATIONS` member, reference/output limits, required scopes, and
an `available` boolean plus stable `unavailable_reason` for every unavailable
operation. An absent or stale manifest narrows capability; it never enables an
operation by inference. The tool does not invoke Hermes, enqueue work, reserve
credits, or run a live probe.

If no connection is selected, the response may summarize all owner-visible
connections and identify the default eligible connection per asset type. It may
not reveal the existence or state of another user's private connection. A
caller can use this output and the catalog as the complete MCP usage manual for
supported Hermes media operations.

### Connection status

`smartspec.hermes.connection_status` requires `connection_id`. It delegates to
the same owner/admin-safe projection used by `getHermesConnection` and
`getHermesConnectStatus`, returning connection scope, state, assigned-worker
availability, safe control-job state, device-approval next action when the
caller is the authorized owner, capability summary, typed error code, and safe
timestamps.

The projection never returns profile paths, refresh/OAuth tokens, worker IDs not
already safe for the owner, raw job event payloads, raw CLI output, or internal
failure text. Cross-tenant and unauthorized IDs return the same public
`RESOURCE_NOT_FOUND` shape as an unknown ID.

### Connection authorize

`smartspec.hermes.connection_authorize` mirrors the current manual connect
service and accepts:

- required `scope`: `server_shared | server_personal | private_worker`;
- optional `worker_id`, allowed only for `private_worker` and checked in the
  authenticated tenant;
- optional `label`, trimmed and limited to 120 characters;
- required `consent_acknowledged: true`.

The strict schema rejects provider tokens, cookies, profile directories, command
arguments, arbitrary callback URLs, tenant/user IDs, role flags, and feature
flags. The adapter calls `startHermesConnect` with tenant, user, and admin status
derived from the session. Existing service rules decide whether to create a new
connection, resume a pending attempt, or reject the requested scope. The result
contains connection ID, durable control-job ID/status, expiry, and only the
minimal sanitized device-approval action that the owner must perform.

This tool requires an MCP idempotency key, but its response must not use the
generic Redis result cache. A device code is sensitive short-lived material and
must not be copied into Redis or audit logs. Add an additive catalog policy such
as `idempotencyReplay: service_lookup` or `cacheResult: false`; on replay, the
service looks up the durable connection/control job by the actor and
idempotency key and returns the current safe status. The service-level durable
idempotency record is authoritative.

### Connection probe and test generation

`smartspec.hermes.connection_probe` requires `connection_id` and performs the
existing non-generating authorization/tools/version probe through a durable
`hermes_connection_probe` control job. It does not accept a command or arbitrary
probe mode.

`smartspec.hermes.connection_test_generation` requires `connection_id` and
`asset_type: image | video`. It calls the existing probe service with
`testGeneration` and therefore inherits ownership/admin policy, tenant flags,
video enablement, the five-minute generation-test cooldown, fixed minimal test
prompt, output/time bounds, discarded test artifact, and manifest update. The
caller cannot supply the prompt, model, output path, duration, reference, or
provider options for this test.

Both tools return a durable control-job reference and safe status. Replays with
the same MCP idempotency key return the same active control operation instead of
creating parallel jobs. A normal probe must never be upgraded into a paid test
generation because an old key has `hermes:connect`.

### Connection disconnect

`smartspec.hermes.connection_disconnect` requires only `connection_id`. It
delegates to `disconnectHermesConnection`, preserving owner rules and the
existing admin requirement for a `server_shared` connection. It creates or
returns the durable disconnect control job and never removes an arbitrary path
from the web process. Repeated calls are idempotent; an already disconnected
connection returns a safe terminal projection. The service removes only the
isolated profile associated with the authorized connection when the worker
executes the control job.

### Hermes media execution

`smartspec.hermes.media_execute` is the complete provider-specific media tool.
Its strict input contains:

- required `operation`, using `HERMES_MEDIA_OPERATIONS`;
- optional `connection_id`; when absent, the server resolves the owner's
  eligible default connection without tier or cross-owner fallback;
- required `prompt`, trimmed and bounded by the existing media policy;
- required `settings.model` and optional validated `aspect_ratio`, `resolution`,
  `output_count`, and `duration_seconds` using the shared capability limits;
- optional `references`, bounded by `HERMES_OPERATION_REFERENCE_BOUNDS` and the
  selected connection manifest;
- optional server-recognized entity association and Library folder reference,
  each owner/tenant checked by the target service.

Each MCP reference is a tagged server-owned reference: either a visible
`library_item_id`, an owned completed `media_task_id`, or the opaque reference
type finalized by Section 05. A reference may include a bounded role/label but
cannot contain a URL, storage key, checksum supplied as authority, local path,
base64 media, authorization header, provider token, or worker token. The Section
05 resolver rechecks ACL, terminal/publication state, MIME compatibility, and
object ownership, then constructs the internal `HermesMediaReference` including
the authoritative asset ID and SHA-256. Caller-provided hashes are not trusted.

After references are resolved, the adapter calls `queueHermesMediaJob` with the
session actor, server-generated trace ID, validated settings, and required MCP
idempotency key. The scheduler remains responsible for connection resolution,
capability intersection, online-worker admission, queue/quota policy, credit
reservation, durable idempotency, and job insertion. The response is the shared
safe asynchronous envelope: task ID, kind, status, bounded progress, artifact
references, and typed safe error metadata. It contains no generated bytes or
raw result URL.

### Provider-neutral compatibility tools

`smartspec.media.generate_image` and `smartspec.media.generate_video` keep their
existing name, scope, defaults, and behavior. Add optional `provider` and
`connection_id` fields only through a backward-compatible strict schema update.
When `provider` is absent, the current platform route is unchanged. When
`provider` is `hermes`, the adapter maps the request into the same
`hermesMcpService` media-execution path and therefore receives identical
connection, reference, quota, credit, idempotency, artifact, and error behavior.
An unknown provider fails validation; no provider URL is accepted.

Compatibility calls remain protected by `media:generate`. They do not make
`hermes:generate` implicit for existing API keys. The server must adopt one
explicit policy and test it: either require both `media:generate` and
`hermes:generate` when `provider: hermes`, or keep the compatibility tool limited
to a tenant-controlled provider-neutral route that independently authorizes
Hermes. The preferred implementation is both scopes because it prevents an old
media key from silently gaining a newly connected Hermes account.

`smartspec.media.cancel` requires `task_id`. It resolves the task type from a
validated server task reference and dispatches to the established provider,
MCP-media, or `cancelHermesMediaTask` adapter. For Hermes, tenant, owner, and
terminal state are checked by the service. Completed/failed/expired/canceled
tasks return an idempotent terminal projection; another user's task is
indistinguishable from an unknown task.

### Remotion submit, status, and cancel

`smartspec.remotion.render_video` requires `project_id` and `profile` and accepts
optional `execution_target: auto | remotion_executor | desktop_worker`, defaulting
to `auto`. The ID must resolve to an existing server-created
`remotion_render_video` job/request owned by the authenticated tenant/user. The
tool does not accept a Remotion payload, composition ID, module/template path,
input URL, output path, shell command, environment variable, worker ID/token,
storage key, credit amount, or billing metadata.

The MCP adapter passes the request to the Section 02 owner-scoped submit facade.
That facade owns feature-flag/readiness checks and target resolution before a
new durable worker job is inserted. If `render_job_id` already identifies the
durable worker job, submit is an idempotent admission/dispatch assertion: it may
return the existing job only when ownership, job type, and requested target
match. It must never rewrite an immutable resolved target. A conflicting target
returns `RENDER_TARGET_CONFLICT`; a legacy unresolved row must be handled by the
explicit Section 02 compatibility path or rejected, never silently retargeted.
An explicit unavailable dedicated target fails before a new credit reservation
or worker-job insert.

The submit result contains `render_job_id`, safe status, resolved
`execution_target`, progress summary, and safe message. The required MCP
idempotency key is an outer request replay key; the scheduler's server-computed
render idempotency key remains authoritative for job and billing uniqueness.

`smartspec.remotion.job.status` requires `job_id`. The
Section 02 facade verifies tenant, owner/team policy, and exact job type before
returning status, immutable target, bounded progress stage/percent, safe failure
code/message/retryability, artifact references, download availability, and safe
timestamps. It does not expose a lease token, worker access key, attempt secret,
internal instructions, input payload, local workspace, object key, stack trace,
or signed URL.

`smartspec.remotion.job.cancel` requires `job_id`. It delegates to
the Section 02 cancel transition, preserving assignment-attempt and terminal
state rules. Queued or running work enters the established cancellation flow;
completed/failed/expired/canceled work returns an idempotent terminal response.
A stale assignment cannot be canceled through a guessed job ID, and cancellation
does not directly kill a process from the MCP handler.

### Library and media-history references

Do not add duplicate Hermes Library/history tools. Extend the existing tools only
where Section 05 adds canonical fields:

- Library search returns permission-visible metadata and stable item IDs.
- Library get returns metadata, registered MIME/size information, and an opaque
  media reference usable by supported generation/render tools when authorized.
- Library download returns `download_ref`, expiry, filename, content type, and
  size when known. It supports every registered file type; it does not inline
  file bytes.
- Media-history list merges the same provider, deferred, HyperFrames, MCP, and
  Hermes sources as the user UI, with owner/tenant filters, stable pagination,
  deduplication, and media/status/date/series filters supplied by Section 05.
- Media-history get returns one safe task/artifact projection and an opaque input
  reference when the completed asset can be reused.
- Media-history download returns the same broker reference shape after owner,
  tenant, terminal status, publication, and object ownership are rechecked.

MCP download redemption remains an HTTP GET to the existing broker route because
binary and Range responses do not belong in JSON-RPC. The broker reauthorizes the
underlying object at redemption and on every Range request. An expired, revoked,
deleted, moved, unshared, or cross-tenant resource fails even if the opaque token
was previously valid.

## Capability and connection-control gates

Catalog visibility and runtime availability use separate gates:

1. The caller must have the exact scope and authentication mode allowed by the
   catalog.
2. The operator MCP family/tool-group policy must permit the tool.
3. Hermes connection tools require the existing Hermes runtime/media settings
   and tenant feature flags. Capability discovery may remain visible when the
   feature is disabled so it can return an explicit `FEATURE_DISABLED` reason.
4. Hermes media execution requires an authorized owner-visible connection,
   supported operation/model, valid references, an online compatible Hermes
   worker, and scheduler admission.
5. Remotion submit is hidden or reported unavailable until the base Remotion
   feature is enabled and the Section 02 service is deployed. Dedicated routing
   additionally requires `remotionDedicatedExecutorEnabled`, the operator kill
   switch, and a healthy compatible executor pool. Status/cancel remain visible
   for already owned jobs during a routing kill switch so in-flight work can be
   observed and reconciled.
6. Library/history tools follow object grants independently of Hermes/Remotion
   flags.

An unavailable tool must not fall through to another provider, target, tenant,
connection, or arbitrary worker unless the server-owned scheduler explicitly
defines that fallback. `auto` target fallback is the Section 02 policy; an
explicit `remotion_executor` request never silently becomes `desktop_worker`.

## Idempotency and concurrency

Every mutating tool marked Required rejects a missing or blank
`params._meta.idempotencyKey` before any domain call. Keys are namespaced by
tenant, user, tool name, and key value. The key itself is never treated as a job
ID or authorization credential.

Durable domain idempotency wins over MCP response caching:

- authorize/probe/disconnect use the durable Hermes control-job seam;
- Hermes generation uses `queueHermesMediaJob` and its canonical contract hash;
- Remotion submit uses the Section 02 scheduler idempotency seam;
- cancel operations use idempotent domain state transitions.

Generic MCP result caching is permitted only for non-sensitive safe projections
and only with the bounded TTL/payload policy from Section 07. It is forbidden for
device codes, authorization next actions containing secrets, credentials,
prompts, media/reference payloads, raw URLs, and download tokens. A replay of a
sensitive operation reconstructs the current safe result from durable state.
Concurrent requests with the same key must converge on one durable operation and
one credit reservation. Concurrent requests with different keys continue to
pass through existing admission and quota controls.

## Rate limits and backpressure

The shared `/v1` API-key/IP limiter and quota middleware remain the outer gate.
Add actor/tenant/object-aware MCP limits through the existing rate-limit service
or the Section 07 shared limiter; do not implement process-local counters in
tool handlers. The initial defaults are conservative and configuration-backed:

| Operation class | Default limit |
|---|---|
| capability and ordinary status reads | 60 calls per minute per user/API key |
| connection authorize | 5 attempts per 15 minutes per user and tenant |
| connection probe | 12 per hour per connection |
| connection test generation | existing one-per-five-minutes per connection cooldown, plus generation admission |
| connection disconnect | 10 per hour per user and tenant |
| Hermes media execute and Hermes-selected compatibility generation | 10 submissions per minute per user, plus existing per-user/per-connection queue and quota limits |
| Remotion submit | 6 submissions per minute per user and 30 per minute per tenant, plus scheduler capacity/admission |
| media/Remotion cancel | 20 calls per minute per user |
| Library/history list/get/download-reference creation | 60 calls per minute per user/API key, plus broker redemption and Range controls |

Limits return a sanitized `RATE_LIMITED` error with bounded `retry_after_ms` and
do not expose internal Redis keys or fleet capacity. Polling responses should
include `recommended_poll_after_ms`; clients are expected to use backoff and
jitter. Queue-full, worker-offline, provider cooldown, credit exhaustion, and
executor-unavailable states are domain admission outcomes, not reasons to bypass
the limiter. Redis outage behavior follows Section 07: security-sensitive writes
fail closed or use the already-proven durable admission seam, and no outage may
allow duplicate generation, render, or billing.

## Safe results and error mapping

All MCP-facing service results are explicit projections. Use stable public codes
and short actionable messages; preserve the original typed code only when it is
already safe. At minimum, map failures into:

- `AUTHENTICATION_REQUIRED`, `SESSION_EXPIRED`, `API_KEY_REVOKED`,
  `INSUFFICIENT_SCOPE`, and `FORBIDDEN_AUTH_MODE`;
- `INVALID_ARGUMENT`, `IDEMPOTENCY_REQUIRED`, and `IDEMPOTENCY_CONFLICT`;
- `RESOURCE_NOT_FOUND` for unknown and unauthorized cross-tenant/user object
  IDs, without an existence oracle;
- `FEATURE_DISABLED`, `CONNECTION_REQUIRED`, `CONNECTION_BUSY`,
  `CONNECTION_REAUTH_REQUIRED`, `OPERATION_UNSUPPORTED`, and the existing safe
  `HERMES_*` admission codes;
- `INSUFFICIENT_CREDITS`, `QUOTA_EXHAUSTED`, `RATE_LIMITED`, and `QUEUE_FULL`;
- `EXECUTOR_UNAVAILABLE`, `RENDER_TARGET_CONFLICT`, `JOB_NOT_CANCELABLE`, and
  safe shared Remotion failure codes;
- `DOWNLOAD_UNAVAILABLE`, `TEMPORARY_UNAVAILABLE`, and `INTERNAL_ERROR`.

Validation errors identify the invalid field and expected bound but never echo
an entire prompt, token-like value, URL, path, or nested payload. Provider/CLI
errors are translated by existing Hermes error helpers. Database, Redis,
filesystem, subprocess, provider HTTP, and stack-trace details are logged only in
the protected server channel after redaction and are returned as safe public
codes. Tool results never contain credentials, refresh tokens, OAuth cookies,
device secrets after their minimum owner action, worker proof material, lease
tokens, raw provider URLs, presigned URLs, object keys, local paths, or raw
database rows.

## Audit and observability

Reuse the existing MCP/public-API audit pipeline and Hermes media observability.
Emit one attempt event and one outcome event for each mutating tool, and a sampled
or aggregated event for high-volume reads. Audit records include:

- trace/request ID, timestamp, tool name, action class, result safety class, and
  auth mode;
- tenant ID, user ID, API-key ID or delegated-session ID as appropriate, with
  sensitive identifiers hashed or truncated according to the existing policy;
- target resource type and safe resource ID, connection scope, operation enum,
  requested/resolved execution target, and durable job/task ID when created;
- feature/availability decision, outcome, safe error code, retryability, rate-
  limit decision, latency, and whether idempotency was new or replayed.

Audit and metrics must not include the raw prompt, full settings/reference body,
device URL/code, OAuth/provider data, download token, signed URL, object key,
local path, media bytes, response body, raw idempotency key, or unredacted error.
Hash the idempotency key when correlation is required. Required counters include
catalog visibility denials by reason; calls by tool/outcome; owner/scope denials;
connection-control outcomes; Hermes and Remotion submissions/replays;
rate-limit denials; download-reference creation; and sanitized error-code counts.

## TDD implementation sequence

Tests are written before catalog handlers. Use Vitest and the existing MCP,
Hermes service, scheduler, and download-broker test conventions. Stubs describe
behavior and dependency fakes; they are not full implementations.

### Catalog and schema tests

Add `apps/web/server/_core/__tests__/mcpRegistry.hermesRemotion.test.ts` with
focused stubs that:

- assert every canonical tool name, family/group, scope, read/write flag,
  idempotency mode, safety class, and delegated-worker policy;
- assert `tools/list` includes or hides each tool for exact scope combinations,
  missing `mcp:write`, disabled flags, operator gates, and delegated sessions;
- prove an old `hermes:write` key cannot list or call disconnect/generation;
- prove all schemas reject unknown fields, oversized strings/arrays, invalid
  enums, caller tenant/user fields, URLs, paths, commands, tokens, raw Remotion
  payloads, raw hashes, base64 media, and billing fields;
- prove catalog examples contain synthetic safe values only;
- prove capability discovery enumerates every shared operation with explicit
  availability or unavailability and performs no worker/CLI invocation.

### MCP transport and auth tests

Extend `apps/web/server/_core/__tests__/mcpPublicServer.test.ts` and
`mcpPublicServerSecurity.test.ts` with stubs that:

- reject anonymous, expired-session, revoked-key, wrong-audience/token-use,
  missing-tenant/user, untrusted-Origin, and header-spoofed identities;
- verify API-key and bearer scope normalization does not broaden old grants;
- reject all high-level Hermes/Remotion tools for delegated workers before the
  domain adapter is called;
- require `params._meta.idempotencyKey` for every required tool;
- prove authorize replays bypass generic result caching and do not write device
  action data to Redis;
- prove safe idempotency replays converge on one domain operation;
- verify JSON-RPC failures contain stable codes and no stack, token, URL, path,
  prompt, raw provider output, or database detail;
- verify shared timeout, maximum-result, batch, rate-limit, audit, and CSRF/CORS
  controls still apply.

### MCP adapter and service-boundary tests

Add `apps/web/server/services/__tests__/hermesMcpService.test.ts` with injected
fakes. The tests must prove that:

- session tenant/user/admin context overrides and rejects caller-supplied
  identity fields;
- authorize/status/probe/test/disconnect call the corresponding connection
  service once and preserve owner/admin rules and durable control-job states;
- capability projection narrows stale/missing/disabled manifests and never
  invents models or operations;
- media references are resolved by the Section 05 authorization service before
  `queueHermesMediaJob`, and a denial prevents admission and credit calls;
- media execution passes one canonical idempotency key/trace ID and returns the
  safe task envelope;
- compatibility image/video tools are unchanged without `provider: hermes` and
  converge on the same Hermes path when it is selected with all required scopes;
- status/cancel enforce tenant, owner, task type, and terminal-state policy;
- Remotion submit/status/cancel call only the Section 02 owner-scoped facade,
  reject target conflicts, and never query/mutate generic automation jobs;
- all cross-tenant and cross-user IDs produce the same safe not-found response;
- no result projection leaks a raw input payload, credential, URL, storage key,
  signed URL, path, worker identifier/secret, or stack trace.

### Existing-service regression tests

Extend focused existing suites only where behavior is newly exposed:

- `hermesConnectionService.test.ts`: durable authorize/probe/disconnect replay,
  server-shared admin gates, owner-only device action, test-generation cooldown,
  and terminal settlement projection;
- `hermesMediaScheduler.test.ts`: MCP actor mapping, explicit connection
  ownership, capability/reference bounds, durable idempotency, credit uniqueness,
  and denied-reference-before-fee ordering;
- `hermesMediaAdapter.test.ts`: owner-scoped status/cancel and safe terminal
  projections;
- the Section 02 scheduler/service suite: MCP existing-job ownership, immutable
  target, explicit-target unavailability before billing/insertion, status/cancel,
  and stale-assignment safety;
- Section 05 broker/history suites: opaque reusable references, explicit
  delegated grants, redemption reauthorization, Range behavior, and complete
  merged history.

### Negative and resilience matrix

At least one table-driven test covers each tool against: missing authentication,
missing exact scope, missing `mcp:write`, delegated worker, wrong tenant, wrong
user, deleted/revoked object, disabled feature, operator kill switch, rate limit,
missing idempotency key, idempotent replay, service timeout, Redis unavailable,
and unexpected dependency failure. Assert that denied calls create no control
job, media job, render job, credit reservation, provider call, download token,
or audit leak.

Run focused web tests with the repository's existing Vitest command and exact
test paths. Report focused Feature 145 proof separately from unrelated
repository-wide typecheck/test failures; a focused pass is not evidence that the
whole repository baseline is clean.

## Delivery order and integration checkpoints

1. Consume Section 01 scope/runtime/flag contracts and add red catalog/schema
   tests with all new tools still `gated`.
2. Add the MCP-facing service adapter and safe projection types with injected
   dependencies; make capability and connection read paths green first.
3. Wire durable authorize/probe/test/disconnect operations, including sensitive
   idempotency replay behavior.
4. Wire Hermes media execution and compatibility selectors to the existing
   scheduler after Section 05 reference authorization is available.
5. Wire Remotion submit/status/cancel only after Section 02 publishes the
   owner-scoped immutable-target facade.
6. Upgrade Library/history catalog projection and delegated grants only after
   Section 05 canonical ACL/download tests pass.
7. Enable per-tool availability and rate-limit/audit hooks after Section 07
   supplies the shared Redis/failure policy.
8. Change each tool from `gated` to `implemented` only when its service,
   security, idempotency, and negative tests are green. Dedicated Remotion submit
   remains unavailable until a healthy compatible executor pool is observable.

Cross-workstream contract checks must verify that Section 03 uses the exact
execution-target, Hermes operation, media-reference, status, artifact-reference,
and opaque-download shapes produced by Sections 01, 02, and 05. If any shared
name changes, update producer, consumer, fixture, and section documentation in
the same change.

## Rollback and failure containment

Rollback is visibility- and routing-based, not destructive:

- Disable the new MCP tool definitions through their execution/availability
  gate and the tenant/operator feature switches. Keep additive scope values and
  catalog code deployed if database/API keys already reference them.
- Disable dedicated Remotion dispatch with the Section 02 kill switch. Status
  and cancel remain available for already owned jobs; in-flight jobs follow the
  established reconciliation policy.
- Disable Hermes-selected compatibility routing without changing the legacy
  provider-neutral generation behavior.
- Existing Library/history tools remain available under their prior safe
  behavior; never roll back to raw storage-key or raw URL download access.
- Do not delete connection, job, media, audit, or artifact rows during rollback.
  Durable state remains available for reconciliation and billing settlement.
- Do not remove `hermes:disconnect` or `hermes:generate` from persisted scope
  catalogs after keys exist. Leave them inert behind tool gates if necessary.

A partial deployment fails closed. A catalog entry whose dependent service or
shared contract is absent remains `gated`/hidden and cannot execute. If Redis is
unavailable, sensitive authentication/idempotency/rate-limit paths follow
Section 07's fail-closed behavior; no handler falls back to process-local
authorization or unbounded execution. If the Hermes worker or Remotion executor
is offline, MCP returns an actionable safe availability error and creates no
duplicate charge or uncontrolled fallback.

## Completion criteria

This section is complete when the canonical tools appear through the existing
`/v1/mcp` catalog with strict schemas and exact scope filtering; every handler
calls an established owner-scoped server service; all high-level Hermes and
Remotion tools deny delegated-worker use; Library/history references and
downloads use the canonical ACL broker; sensitive authorize results never enter
generic Redis result caching or logs; safe errors, audit fields, rate limits, and
idempotency behavior pass focused tests; and disabling the feature leaves all
legacy Worker App, media-generation, Library, history, and generic MCP behavior
unchanged.

## UI/UX Contract

### Target User / JTBD
N/A — this section adds an MCP/API catalog, not a browser UI.

### Surface Inventory
N/A — no browser route, component, dialog, or page is introduced.

### Component Map
N/A — no frontend ownership changes.

### State Matrix
N/A — state is represented by MCP tool availability, typed responses, and durable jobs.

### Responsive Matrix
N/A — no responsive layout is changed.

### Accessibility Acceptance
N/A — no browser interaction is introduced; API errors remain bounded and sanitized.

### Copy Contract
N/A — MCP descriptions and safe messages are covered by the tool contract.

### Browser Evidence Required
N/A — MCP/API contract evidence belongs to Section 08.
