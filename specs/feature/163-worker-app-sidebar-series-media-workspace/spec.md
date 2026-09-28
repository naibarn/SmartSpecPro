# Feature 163 — Worker App Sidebar, Series Binding and Media Workspace

**Status:** Proposed — implementation-ready design<br>
**Date:** 2026-08-25<br>
**Primary owner:** Worker App / Worker Control Plane / Vertical Drama
**Dependencies:** Feature 162 Worker-first media intelligence, Worker runtime
contracts, managed media/R2 publication, authenticated Worker pairing

## 1. Executive decision

Replace the current four-tab Worker App layout with a scalable desktop shell:

```text
Worker App
 ├─ Sidebar navigation
 ├─ Top bar: connection, selected Series, GPU, queue, account
 ├─ Screen router
 └─ Global Quick Actions
```

The Worker App discovers the Series available to the paired account through the
Worker Control Plane. A user selects a `SeriesID`, chooses a local footage
folder on the Worker device, and binds that folder to the Series. The server
derives the account and tenant from the authenticated Worker pairing; the UI
must never submit a `userId` as an authority.

Feature 163 owns navigation, Series discovery/binding, Worker context, queue
and runtime surfaces, and the orchestration UX. Feature 162 remains the source
of truth for local media intake, dead-air policy, subject-aware 9:16 reframing,
derived-artifact publication, vector indexing, B-roll readiness, and the
media-specific screens mounted under **Media Workspace**.

The existing background worker loop remains independent from navigation. A user
may move between screens, close the window, or lose UI state without cancelling
a claimed job or corrupting local source footage.

The Runtime/GPU screen must present the current media toolchain and ComfyUI MCP
readiness as separate capability lanes. HyperFrames is legacy/optional and
must not be presented as a prerequisite for the Feature 162 local media
workspace; any future reactivation belongs behind its own capability flag and
readiness gate.

## 2. Goals and non-goals

### 2.1 Goals

- Provide a clear Sidebar and separate screens as the Worker App grows.
- Fetch accessible Series from the server and bind a selected Series to one
  local footage workspace.
- Make the selected Series context visible and consistent across screens.
- Reduce repetitive work through safe, explainable Quick Actions.
- Host Feature 162's Media Workspace without duplicating its processing logic.
- Expose queue, published assets, AI/workflow policy, GPU/runtime, connection,
  and access state in dedicated screens.
- Support offline and degraded states without silently using stale permission.
- Make future Worker modules register a screen and capabilities without adding
  another collection of ad-hoc tabs.

### 2.2 Non-goals

- Implement FFmpeg, FFprobe, scene detection, silence detection, tracking,
  reframing, encoding, or media QC algorithms. These belong to Feature 162.
- Process original footage on the server or upload original bytes to R2.
- Replace the Drama Series storyboard or the nine-shot shot editor.
- Expose a raw ComfyUI graph editor in the Worker App.
- Allow the Worker to bypass server authorization by sending a user identity.
- Make a server scheduler record equivalent to a real Worker execution.

## 3. Existing contract and migration boundary

The current Worker App has a single large `apps/worker-app/src/main.tsx` with
`WORKER_TABS` and `activeTab` state for `connection`, `render`, `hermes`, and
`settings`. Feature 163 must migrate this surface to a route/screen registry;
it must not continue adding feature-specific tabs to the existing list.

Existing connection, registration, heartbeat, job claim, diagnostics, runtime,
workspace, and ComfyUI settings remain valid. Their screens become routes:

| Existing surface | Feature 163 route | Migration behavior |
|---|---|---|
| Connection tab | `/connection` | Existing controls preserved, new access state added |
| Render tab | `/queue` | Existing render/job status remains available |
| Hermes tab | `/ai-workflows` | Existing provider/runtime controls are grouped |
| Settings tab | `/settings` | General settings only; Series settings move to context screens |

Old tab identifiers are accepted as route aliases for one migration release.
Deep links and local persisted state are migrated to the canonical route names.

## 4. Architecture

```text
┌──────────────────────────── Worker App ────────────────────────────┐
│ WorkerAppShell                                                     │
│  ├─ WorkerSidebar                                                  │
│  ├─ WorkerTopbar                                                   │
│  ├─ QuickActions                                                   │
│  └─ ScreenRouter                                                   │
│      ├─ OverviewScreen                                             │
│      ├─ SeriesScreen / SeriesBindingWizard                         │
│      ├─ MediaWorkspaceScreen (Feature 162 child routes)             │
│      ├─ QueueScreen / PublishedAssetsScreen                         │
│      ├─ AiWorkflowsScreen                                           │
│      ├─ RuntimeGpuScreen                                            │
│      ├─ ConnectionAccessScreen                                      │
│      └─ SettingsScreen                                              │
│                                                                     │
│ WorkerContext: connection + selected Series + root binding + jobs  │
│ ControlPlaneClient: authenticated Worker API                        │
│ LocalWorkspaceManager: native folder, scan, local-only state        │
│ JobStore: durable local execution and publication state             │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ authenticated Worker Control Plane
┌───────────────────────────────▼─────────────────────────────────────┐
│ Server                                                            │
│ Worker auth → paired-account resolver → Series access/binding       │
│ → job admission → artifact publication → vector/index projection   │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.1 Context ownership

`WorkerContext` is the single source for:

- connection status and last successful server sync;
- Worker identity, device binding, scopes, and registration status;
- selected `seriesId` and its server revision;
- local `rootId`, display name, permission, scan state, and stale state;
- queue summary and current blocking alerts;
- capability and policy snapshots used by Quick Actions.

Individual screens may request refreshes, but they must not create competing
selected-Series or root-binding state. A screen that requires a Series must
declare that requirement in its route metadata.

### 4.2 Background execution boundary

The UI router is presentation state. The Tauri/Rust worker loop, job store,
heartbeat, claim/report flow, local media executor, and publication retry state
are application state. Navigation events must not stop or restart those
services. The shell subscribes to them through a typed bridge and renders
read-only summaries plus explicit commands.

## 5. Authentication, authorization, and tenant safety

### 5.1 Worker identity

Every Control Plane request uses the existing Worker access token and device
proof. The server validates:

1. token signature, expiry, tenant, Worker ID, runtime type, and device binding;
2. required scope for the route;
3. the paired account/connection that owns or is allowed to operate the Worker;
4. Series access using the same neutral ownership/shared-permission rules as
   the web Series domain service; the Worker must not call a browser tRPC
   procedure as its authorization boundary.

The request body and query string must reject or ignore `userId`, `ownerId`, or
an arbitrary tenant identifier. The server resolves the effective account from
the Worker connection. A client cannot select a different user's Series by
altering a request field.

### 5.2 Scopes

Add versioned Worker scopes to the shared Worker runtime/access-key contracts.
The current code has two separate concepts—`WorkerScope` used by execution
token verification and `WorkerAccessPermissionScope` used by registration/key
policy. Feature 163 must introduce one canonical registry and derive both
schemas from it; adding string literals to only one enum is not acceptable.

Canonical registry:

| Scope | Purpose |
|---|---|
| `series:read` | List and read Series projections available to this Worker |
| `series:bind` | Create, update, or revoke a local Worker/Series binding |
| `media:workspace` | Read workspace inventory and submit media-workspace intents |
| `media:publish` | Publish verified derived artifacts and trigger indexing |

The registry must also declare token use, route requirement, and issuance
policy:

| Scope | Execution token | Upload token | Explicit admin permission |
|---|---:|---:|---:|
| `series:read` | yes | no | required |
| `series:bind` | yes | no | required |
| `media:workspace` | yes | no | required |
| `media:publish` | no | yes | required |

The server route checks the execution/upload token scope, while token issuance
checks the corresponding Admin/device permission scope from the same registry.
The issued scope set is the intersection of requested runtime scopes and
approved permission scopes; no layer may widen it. Add an explicit
`vertical_drama_media_operator` preset or equivalent custom-policy fixture
instead of silently adding these scopes to existing `readonly` or
`operator_basic` tokens. Re-pair/reissue is required for an existing Worker.

Contract tests must assert that every canonical scope appears in both schema
views, maps to exactly one token use, is required by the intended routes, and
cannot be granted by a preset that does not declare it.

Existing registration, heartbeat, claim, report, diagnostics, library, and RAG
scopes remain separate. Admin policy may issue a narrower token. The Worker UI
must hide or disable actions when a scope is absent, but the server remains the
authoritative enforcement point.

Token issuance must preserve least privilege. The execution token carries
`series:read`, `series:bind`, and `media:workspace` only when the Admin/device
policy grants them. The upload token carries `workers:report` plus
`media:publish` only for the verified-artifact publication endpoints; it cannot
list Series, bind roots, or invoke Quick Actions. The refresh token preserves
the same approved scope set and never escalates it. Existing tokens do not gain
these scopes silently: Admin must opt in or re-pair/reissue the Worker token,
and the UI must show `scope update required` until that happens.

### 5.3 Revocation and unpairing

When a Worker is revoked, expires, or is unpaired:

- the shell shows `Access revoked` and stops new claims/publications;
- in-flight local processing may finish into a private local quarantine, but
  cannot publish until re-authorized;
- cached Series data becomes read-only and visibly stale;
- local original footage is not deleted;
- binding records remain auditable and can be re-established after pairing.

## 6. Worker Control Plane contracts

The Worker uses REST Control Plane routes, not browser tRPC sessions. Server
handlers must reuse a neutral Series domain/access service so that the Worker
projection and web UI do not implement different ownership logic. If the
current `verticalDramaSeries.list` procedure still contains its access
predicate inline, extract that predicate into the neutral service first; both
the tRPC router and the Worker Control Plane route must call the same service
with an explicit server-derived principal/context. The Worker projection may
add its `accessSource` and capability projection, but it must not broaden the
browser procedure implicitly.

### 6.1 List Series

```http
GET /api/workers/{workerId}/series
Authorization: Bearer <worker-access-token>
X-Worker-Device-Proof: <proof>
```

Query parameters:

```text
search?: string
status?: active|draft|archived|all
cursor?: string
limit?: 1..200 (default 50)
includeArchived?: boolean (requires policy)
```

Response:

```json
{
  "items": [
    {
      "seriesId": "series_123",
      "title": "My Drama Series",
      "status": "active",
      "locale": "th-TH",
      "seasonNumber": 1,
      "episodeCount": 12,
      "mediaAssetCount": 38,
      "vectorIndex": {
        "status": "ready",
        "version": 4,
        "lastIndexedAt": "2026-08-25T10:00:00Z",
        "pendingCount": 0
      },
      "workerBinding": {
        "status": "bound",
        "rootId": "root_123",
        "displayName": "My-Series footage",
        "lastScanAt": "2026-08-25T10:03:00Z"
      },
      "permissions": {
        "canBind": true,
        "canProcess": true,
        "canPublish": true
      },
      "updatedAt": "2026-08-25T10:04:00Z"
    }
  ],
  "nextCursor": null,
  "serverTime": "2026-08-25T10:05:00Z"
}
```

The response is a safe projection. It contains no local absolute path, source
footage URL, R2 secret, or raw source bytes.

### 6.2 Read one Series

```http
GET /api/workers/{workerId}/series/{seriesId}
```

Returns the same access-checked Series summary plus the selected Series
revision, episode/shot counts, binding state, media index state, available
capability flags, and the server's current policy revision. A stale revision is
used to trigger a refresh before a mutating action.

### 6.3 Bind a local root

```http
POST /api/workers/{workerId}/series-bindings
Idempotency-Key: <stable-client-key>
```

Request:

```json
{
  "seriesId": "series_123",
  "rootId": "root_123",
  "displayName": "My-Series footage",
  "localPathFingerprint": "sha256:...",
  "workspaceMode": "existing_source_root",
  "policySnapshot": {
    "sourceBytesLocalOnly": true,
    "autoProcessNewFiles": false,
    "allowDerivedPublication": true
  },
  "clientRevision": 7
}
```

`localPathFingerprint` is a non-reversible device-local fingerprint. It is not
the path. The server stores the `rootId`, Worker/device identity, safe display
name, policy snapshot, and audit information; the native path remains in the
Worker's protected local configuration.

The server checks Series access, scope, Worker status, root ownership, and
idempotency before upserting the binding. One active root binding is allowed
per Worker/Series pair. More than one Worker may be bound to the same Series.
Changing a root creates a new binding revision. Queued jobs remain pinned to
the old `rootId`/revision and are drained, canceled, or explicitly re-planned;
they must never begin reading from the newly selected folder by accident.

### 6.4 Revoke a binding

```http
DELETE /api/workers/{workerId}/series-bindings/{seriesId}
```

Revocation stops new intake/publication for that pair but does not delete local
source bytes, R2 artifacts, Series records, vector records, or immutable job
history. Active jobs follow the cancellation policy declared by Feature 162;
the UI must show whether each job was completed locally, quarantined, or
cancelled.

### 6.5 Media Workspace projection

```http
GET /api/workers/{workerId}/series/{seriesId}/media-workspace
```

Returns counts and safe projections for intake, inventory, processing, review,
published assets, index state, disk/quota warnings, and the current Feature 162
policy revision. It does not return original source URLs or local absolute
paths. Media-specific mutations use the typed Feature 162 contracts.

### 6.6 Quick Action command

```http
POST /api/workers/{workerId}/quick-actions
```

Only allowlisted typed actions are accepted:

```json
{
  "action": "scan_series_workspace",
  "seriesId": "series_123",
  "bindingRevision": 7,
  "options": { "includeUnchanged": false },
  "idempotencyKey": "qa_..."
}
```

The server returns a command/job reference, not an instruction containing an
arbitrary shell command, path, workflow JSON, or provider payload. Actions
that are local-only are dispatched to the Worker after the server confirms the
Series/binding context.

### 6.7 Contract rules

- All list endpoints are paginated and return a server revision/time.
- Mutations require an idempotency key and client revision where applicable.
- Error responses use stable machine codes and a localized safe message.
- Server responses never make a local path directly fetchable.
- Route versions are additive; incompatible changes require `/v2` or an
  explicit contract version header.

### 6.8 Effective Worker principal and binding persistence

The current access token proves `tenantId`, `workerId`, `runtimeType`, scopes,
device proof, and (when present) `workerConnectionId`; it is not itself a user
session. The Series service must resolve an effective Worker principal before
querying or mutating Series data:

```text
1. Load Worker by auth.tenantId + auth.workerId.
2. Require Worker status not disabled/revoked and runtime/tenant match.
3. Load the active `connected_devices` row for tenant + worker + authKind
   `worker_executor`, matching the current device/connection when available.
4. Use connected_devices.ownerUserId as the paired owner and retain the
   Worker row's registeredByUserId only as an audited legacy fallback.
5. Resolve access mode from the Worker sharing policy:
   private → paired owner only;
   groups → paired owner plus explicitly configured active groups;
   tenant → tenant-scoped Series access only when an Admin policy grants it.
6. If a private/groups Worker has no active owner, fail closed with
   `WORKER_PRINCIPAL_UNRESOLVED`; never infer a user from request data.
```

The Series list/detail path must not call the existing owner-only
`verticalDramaSeries.list` procedure and assume that its result is the Worker
catalog. The current Series router is intentionally scoped to
`tenantId + ctx.user.id`; the Worker Control Plane therefore needs a separate
server-side access service (for example `workerSeriesAccessService`) that
evaluates the resolved principal and returns a safe projection:

| Series access mode | Eligible Worker principal | `accessSource` | Default Worker capability |
|---|---|---|---|
| `private` | paired owner only | `owner` | list/read/bind/process/publish only when the Series policy grants each action |
| `groups` | paired owner plus active members of the explicitly configured groups | `owner` or `group` | read/bind/process/publish are independently policy-checked |
| `tenant` | any Worker principal whose Admin policy and Series policy both allow tenant discovery | `tenant_policy` | discovery does not imply bind, process, or publish |

The service must define and test one precedence rule (`owner` before
`group`, then `tenant_policy`) and include `accessSource`, `canBind`,
`canProcess`, and `canPublish` in the projection. Every list, detail, bind,
workspace, and Quick Action request re-checks current access; the
`ownerUserId` stored in a binding is an audit snapshot and never a permanent
authorization grant. Group membership must be active at evaluation time, and
tenant mode must be an explicit Admin opt-in rather than an implicit
"list every Series in the tenant" behavior. Denied or unknown Series IDs use
the same safe `SERIES_NOT_FOUND` response shape so the Worker cannot enumerate
hidden Series. The service must also expose a migration-compatible adapter for
the current owner-only router while shared/group/tenant Series access is being
rolled out; it must not broaden the existing router's authorization in place.

`registeredByUserId` in a registration token is not sufficient evidence for a
long-lived execution request because the current execution-token contract does
not carry it. The resolver must use the durable Worker/connected-device records
and must fail closed when the records disagree. A token refresh or a new
connection ID does not create a new Series owner; the Worker/device binding is
the stable authorization boundary.

Return an internal typed principal, never to the client:

```ts
type WorkerSeriesPrincipal = {
  tenantId: string;
  workerId: string;
  workerConnectionId: string | null;
  ownerUserId: number | null;
  accessMode: "private" | "groups" | "tenant";
  groupIds: number[];
  authorityRevision: string;
};
```

Feature 162 defines `vertical_drama_media_roots` as the source of truth for
local media roots. Feature 163 owns its binding lifecycle and must add/verify
these fields and constraints (or create a typed companion table if the current
migration has already shipped):

| Field/constraint | Requirement |
|---|---|
| `rootId` | opaque Worker-generated ID; unique within tenant + Worker |
| `tenantId`, `seriesId`, `workerId` | non-null ownership/foreign-key boundary |
| `ownerUserId` | server-resolved principal snapshot; never client-supplied |
| `displayName` | bounded safe label; no absolute path |
| `localPathFingerprint` | hash/fingerprint only; no reversible path or source bytes |
| `workspaceMode` | `existing_source_root` or `managed_subfolders`; prevents derived-output re-ingest |
| `policySnapshotJson` | validated Feature 162 policy and policy revision |
| `bindingRevision` | monotonically increasing optimistic-concurrency revision |
| `status` | `active`, `revoked`, `stale`, or `quarantined` |
| `lastValidatedAt`, `lastScanAt` | server-observed timestamps, nullable |
| `revokedAt`, `revokedByUserId`, `revocationReason` | auditable revocation |
| unique active binding | at most one active root per tenant + Worker + Series |
| root reuse | one root cannot be active for two Series unless the Worker explicitly creates separate root IDs |

The binding mutation runs in one transaction: resolve principal, verify
Series access, verify Worker/device state, enforce the unique-active-root
constraint, write the new revision, and append an audit event. A failed
publication or unbind must not delete the source-root record or published
derived artifacts. Binding records are never used as proof that original bytes
were uploaded.

### 6.9 HTTP envelope, replay protection, limits, and freshness

All Worker Control Plane routes use:

- `X-Worker-Device-Proof` over the canonical method/path/body-hash/nonce
  envelope already used by Worker auth;
- `X-Request-Id` supplied by the client or generated by the server and returned
  in the response;
- `X-Worker-Contract-Version: worker-series-workspace.v1` with additive
  negotiation and a `contractVersion` response field;
- `Cache-Control: no-store` for identity, permission, binding, and local-root
  projections;
- bounded JSON body size, bounded search/label lengths, enum validation,
  pagination limits, and no arbitrary action/command strings.

Mutation idempotency is scoped to `tenantId + workerId + action +
Idempotency-Key`. The server stores the normalized request hash and terminal
response for the retention window. Reusing a key with a different request
returns `IDEMPOTENCY_KEY_REUSED` and never executes the second request. A
replayed device nonce, expired timestamp, or mismatched body hash is rejected
by the existing device-proof verifier.

Minimum response/status contract:

| HTTP | Stable code | Use |
|---:|---|---|
| 200/201/202 | — | read, binding success, or accepted action |
| 400 | `INVALID_REQUEST` | schema, cursor, enum, or body-limit failure |
| 401 | `WORKER_AUTH_INVALID` | missing/expired/invalid token or proof |
| 403 | `WORKER_SCOPE_DENIED` / `SERIES_ACCESS_DENIED` | valid identity without permission |
| 404 | `SERIES_NOT_FOUND` / `BINDING_NOT_FOUND` | resource not visible to this principal |
| 409 | `SERIES_BINDING_CONFLICT` / `STALE_SERIES_CONTEXT` | revision or active-binding conflict |
| 422 | `CAPABILITY_UNAVAILABLE` / `QUICK_ACTION_NOT_ALLOWED` | valid shape but policy/capability rejects action |
| 429 | `WORKER_RATE_LIMITED` | route or action quota exceeded; return `Retry-After` |
| 503 | `WORKER_CONTROL_PLANE_UNAVAILABLE` | temporary server/dependency failure |

Error body:

```json
{
  "error": {
    "code": "STALE_SERIES_CONTEXT",
    "message": "Series state changed; refresh before continuing.",
    "requestId": "req_123",
    "retryable": false,
    "details": { "serverRevision": "rev_8" }
  },
  "contractVersion": "worker-series-workspace.v1"
}
```

Suggested initial route limits are `series list: 30 requests/minute per
Worker`, `series detail/projection: 60/minute`, `binding mutations: 10/minute`,
and `quick actions: 30/minute`, with tenant-wide abuse protection layered on
top. The exact values are Admin-configurable within safe bounds and must be
included in the runtime policy snapshot.

List cursors are opaque, signed, principal-scoped, filter-scoped, and expire
within a bounded window (recommended 10 minutes). A cursor from another Worker,
tenant, access mode, or filter returns `INVALID_REQUEST`; it must not reveal
whether a hidden Series exists.

### 6.10 Binding/job lifecycle and concurrency

Binding mutations use both the numeric `clientRevision` in the body and an
`If-Match` header containing the server revision (one may be omitted only for
the first create). The server rejects a mismatch before any local dispatch;
the response includes the current revision and a safe rebind action. This
prevents two app windows, a stale reconnect, or a second Worker process from
silently replacing a root selected by another operator.

Unbind is a state transition, not a delete:

1. atomically mark the binding `revoked`, stop new claims/intake/publication,
   increment the binding revision, and invalidate the local root capability;
2. mark queued authority-dependent actions blocked and retain their
   idempotency/result records;
3. let an already-running local stage checkpoint within the drain grace
   period, then finish only if its pinned root, policy, and job lease remain
   valid; otherwise quarantine/reconcile it;
4. reject any later publication from the revoked revision until the user
   explicitly rebinds and re-authorizes that artifact.

The Worker has one native background coordinator per Worker identity. Multiple
windows/tabs subscribe to its local event stream and never start a second
heartbeat, claim loop, upload loop, or GPU lease. The coordinator uses a
durable local job record containing `jobId`, `seriesId`, `rootId`,
`bindingRevision`, `sourceFingerprint`, `policyRevision`, `idempotencyKey`,
`remoteExecutionId`, `state`, `checkpoint`, and `updatedAt`; state transitions
are monotonic except for explicitly recorded retry/recovery transitions.
Authority-sensitive commands are not queued indefinitely while offline. Only
already-admitted local work may continue; bind, discovery, publication, and
permission changes wait for a fresh server decision.

## 7. Information architecture

### 7.1 Sidebar

The default Sidebar is:

```text
Overview
Series & Projects
Media Workspace
  Intake
  Inventory
  AI Plan
  Review & QC
  Processing
  Published Assets
Processing Queue
AI & Workflows
Runtime & GPU
Connection & Access
Settings
```

The selected Series is a context selector in the top bar, not a second
navigation tree. Media Workspace children require a selected Series and an
authorized binding; the UI explains the missing prerequisite instead of
showing an empty unexplained page.

### 7.2 Top bar

The top bar contains, in order:

1. Sidebar collapse control and breadcrumb;
2. selected Series selector with status/binding badge;
3. Worker readiness indicator;
4. GPU/runtime indicator;
5. queue summary and alerts;
6. connection/access menu.

The Series selector always shows the currently active `SeriesID` in a details
popover, but uses title as the primary label. Switching Series requires a
confirmation only when there are unsaved UI edits or an active local wizard.

### 7.3 Screen registry

Each screen registers:

```ts
type WorkerScreen = {
  id: string;
  path: string;
  label: string;
  group: string;
  requiresSeries: boolean;
  requiresBinding: boolean;
  requiredScopes: string[];
  capabilities?: string[];
};
```

The registry controls Sidebar visibility, route guards, Quick Action targets,
and future module insertion. A module may add screens and actions through a
typed registry; it may not mutate the global navigation array at runtime.

## 8. Screen specifications

### 8.1 Overview

Purpose: answer “Is this Worker ready and what needs attention?”

Show:

- connection and token state;
- selected Series and binding readiness;
- local disk and GPU capacity;
- queue counts by state;
- latest scan, QC, publication, and vector-index status;
- blocking alerts and recent activity;
- Quick Actions with eligibility explanations.

Overview is read-only except for explicit Quick Actions.

### 8.2 Series & Projects

Show a searchable, paginated list of Series returned by the Control Plane.
Filters include status, binding state, vector-index state, and recent update.
Each row shows title, status, SeriesID, episodes, media count, binding badge,
index badge, and permitted actions.

Actions:

- Select Series;
- Bind or change local folder;
- Open Media Workspace;
- Refresh access/index state;
- View safe Series details.

Archived Series are hidden by default and require an explicit policy-supported
filter. A Series absent from the server response cannot be bound by manually
typing its ID.

### 8.3 Series binding wizard

The wizard has four short steps:

#### Step 1 — Select Series

Search and select an accessible Series. Show title, SeriesID, status, and
permission summary. Do not ask the user to type an account or tenant ID.

#### Step 2 — Choose local folder

Open the native Tauri folder picker. Show the absolute path only locally. Run
the local permission and writeability check. Offer a separate derived/cache
location when the source folder should remain read-only.

#### Step 3 — Scan preview and policy

Display detected file count, supported/unsupported formats, duplicates,
unstable files, estimated disk usage, and a compact policy summary:

- original bytes remain local;
- dead-air default: suggest/keep/trim;
- target aspect: preserve or subject-aware 9:16;
- focus mode: auto/person/face/object/manual;
- processing mode: guided, AI-assisted review, or automated AI;
- publication and vector-index behavior.

The user can change policy before binding, subject to server allowlists.

#### Step 4 — Confirm and bind

Show Series, Worker device, safe root display name, local-only boundary,
estimated work, and the exact actions that will occur. Binding is explicit.
After success, navigate to Media Workspace > Intake and show the binding
revision.

If the Series already has an active binding, the confirmation step shows the
impact on queued/local jobs and offers `keep old jobs`, `drain then switch`, or
`cancel queued then switch` according to policy. The user cannot switch roots
while a job is in a non-recoverable publication stage without an explicit
operator confirmation.

### 8.4 Media Workspace

Feature 162 defines the media-specific behavior. Feature 163 provides the
host, selected Series context, route guards, refresh/error handling, and
cross-screen links for these child routes:

| Route | Feature 162 responsibility |
|---|---|
| `/media-workspace/intake` | local folder/upload intake and stable-file scan |
| `/media-workspace/inventory` | inventory, duplicate/status filters, metadata |
| `/media-workspace/ai-plan` | AI edit plan, intent, dead-air/reframe/motion options |
| `/media-workspace/review` | original/derived review and editable QC decisions |
| `/media-workspace/processing` | local processing progress and retry decisions |
| `/media-workspace/published` | derived Series assets and publication/index status |

Every child route shows the selected Series and local binding badge. It must
not silently switch context when opened from a stale link.

### 8.5 Processing Queue

Show all jobs known to this Worker with filters for Series, state, type,
priority, and failure. A job row contains job ID, Series, source fingerprint,
requested intent, resolved workflow/model labels, progress, GPU/CPU lane,
retry count, and safe error code.

Actions are `Pause`, `Resume`, `Cancel`, `Retry`, `Open review`, and `Open
Series`. Cancellation must distinguish “not started”, “stopped safely”, and
“cannot cancel after publication”.

The queue renders two state columns: the existing Worker transport state
(`queued`, `claimed`, `preparing`, `running`, `uploading`, `publishing`,
`completed`, `failed`, `canceled`, or `expired`) and the Feature 162 domain
state (`scanning_local_files`, `processing_local_derivatives`, `local_qc`,
`publishing_series_assets`, `indexed_for_series_ai`, `needs_review`, or
`succeeded`). `completed` is not displayed as `Ready` unless the verified
artifact manifest and domain QC state say `succeeded`. A transport/domain
mismatch is a blocking `PUBLICATION_STATE_INCONSISTENT` alert with a retry or
operator-diagnostics action.

### 8.6 Published Assets

Show only verified derived assets published to the selected Series or chosen
filter. Show duration, dimensions, subject/focus mode, QC state, source
lineage summary, vector-index state, and usage count. Provide `Copy asset
reference`, `Open in Series`, `Re-index`, and `Archive derived asset` where
the server policy allows it. Never offer deletion of original local footage
from this screen.

### 8.7 AI & Workflows

The screen exposes policy-safe choices, not provider payloads:

| User mode | Behavior |
|---|---|
| Quick Auto | Use admin default workflow and Feature 162 safe defaults |
| AI-assisted review | Propose a typed plan and require review before processing |
| Manual/Advanced | User selects allowlisted workflow and edits supported options |

For any operation, show:

- admin default workflow and version;
- whether a user override is allowed;
- capability compatibility and estimated cost/time;
- required GPU/provider/runtime;
- approval threshold and fallback behavior;
- a concise impact preview before queueing.

Workflow selection is resolved at queue time by the server policy resolver. The
user may choose a workflow only from the allowlisted compatible registry. The
Worker stores the immutable `WorkflowResolution` with the job and never
accepts an unvalidated graph from the UI.

### 8.8 Runtime & GPU

Show detected GPU(s), VRAM, driver/runtime versions, FFmpeg/FFprobe state,
ComfyUI/MCP capability probe, active leases, concurrency, disk, cache, and
health. Controls include bounded concurrency, pause new GPU work, clear safe
derived cache, and rerun capability probe. Source footage and active jobs are
never deleted by a cache action.

### 8.9 Connection & Access

Show server URL, Worker ID/label, pairing status, token expiry, device binding,
scopes, last heartbeat, last error, and reconnect controls. Sensitive token
values are never displayed. Provide `Reconnect`, `Re-pair`, `Refresh scopes`,
and `Open diagnostics` according to permission.

### 8.10 Settings

General settings remain here: language, theme, launch behavior, notification
preferences, safe local log level, and default screen. Series selection,
folder binding, processing intent, and workflow selection stay in their
contextual screens so Settings does not become a dumping ground.

### 8.11 Future modules

New modules must declare a registry entry, required scopes/capabilities,
route-level loading/error states, background-job ownership, and a Quick Action
eligibility contract. The module must provide a disabled explanation when its
runtime is unavailable. It must not add a global tab or access raw tokens.

### 8.12 UI/UX contract

#### Target user / JTBD

- **Primary role:** creator/editor or operator who owns a local GPU Worker and
  needs to prepare footage for one or more Vertical Drama Series.
- **Secondary role:** admin/operator validating Worker access, runtime health,
  and policy availability.
- **Entry point:** launching the Worker App, reconnecting an existing pairing,
  or selecting a Worker from the connection flow.
- **Job to be done:** select the correct Series, bind the correct local folder,
  run safe media actions, and understand what is waiting, blocked, local-only,
  published, or ready for the Series.
- **Success outcome:** the user can reach a valid Series/root context in a few
  clear steps, perform only authorized actions, recover from errors without
  losing local work, and never confuse an original local file with a published
  derived asset.

#### Existing pattern reference and reuse decision

The targeted repository search used:

```text
rg -n -i "sidebar|navigation|useMenuItems|wizard|stepper|folder picker|
series.*list|queue|Dialog" apps/web/client/src apps/worker-app/src
```

Relevant existing patterns found:

- `apps/web/client/src/hooks/useMenuItems.ts` for permission-aware sidebar
  taxonomy and navigation labels;
- `apps/web/client/src/components/DashboardLayoutSkeleton.tsx` and
  `apps/web/client/src/components/AppPage.tsx` for shell, loading, and page
  hierarchy conventions;
- `apps/web/client/src/pages/VerticalDramaSeriesPage.tsx` and
  `apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx` for Series
  list/detail/search and dialog patterns;
- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx` plus the existing
  Vertical Drama dialog/sheet components for contextual actions, focus return,
  and long-running status;
- `apps/worker-app/src/main.tsx` and `apps/worker-app/src/styles.css` for the
  current Worker status cards, queue summary, connection/settings vocabulary,
  and runtime states.

**Decision: reuse the interaction semantics and status vocabulary, diverge at
the shell boundary.** The Worker App needs a native desktop Sidebar and local
folder/runtime context that the web Dashboard cannot own. Reuse loading/error,
permission, status, dialog, focus, and Thai/English copy patterns; do not copy
browser-only routing or add a second web navigation system.

#### Surface inventory

| Surface | Canonical route/screen | Owner | Required states |
|---|---|---|---|
| App shell | `WorkerAppShell` | Worker App | booting, connected, offline, revoked |
| Sidebar | `WorkerSidebar` | Worker App | expanded, collapsed, keyboard, unavailable item |
| Top bar | `WorkerTopbar` | Worker App | no Series, selected Series, stale, queue alert |
| Quick Actions | `QuickActionsBar` / command palette | Worker App | eligible, blocked, pending, accepted, failed |
| Series list | `/series` | Feature 163 | loading, empty, access denied, paginated success |
| Series detail/context | `/series/:seriesId` | Feature 163 | stale, selected, binding required, ready |
| Binding wizard | `/series/:seriesId/bind` | Feature 163 | four steps, validation, conflict, success |
| Media Workspace host | `/media-workspace/*` | Feature 163 + 162 | missing context, loading, child states |
| Queue | `/queue` | Feature 163 | queued, running, review, failed, canceled |
| Published Assets | `/published` | Feature 163 + 162 | indexing, ready, unavailable, empty |
| AI & Workflows | `/ai-workflows` | Feature 163 + 162 | policy locked, default, override, stale |
| Runtime/GPU | `/runtime-gpu` | Feature 163 | probe, healthy, degraded, unavailable |
| Connection/Access | `/connection` | Feature 163 | pairing, connected, expired, revoked |
| Settings | `/settings` | Feature 163 | dirty, saved, validation error |

#### Component map and ownership

| Component | Proposed path | Owns | Consumes/calls |
|---|---|---|---|
| `WorkerAppShell` | `apps/worker-app/src/app/WorkerAppShell.tsx` | layout, route boundary, global error boundary | `WorkerContext`, screen registry |
| `WorkerSidebar` | `src/components/navigation/WorkerSidebar.tsx` | navigation groups, active/disabled state | route metadata, scopes/capabilities |
| `WorkerTopbar` | `src/components/navigation/WorkerTopbar.tsx` | Series selector, readiness, alerts | `WorkerContext`, refresh commands |
| `QuickActionsBar` | `src/components/quick-actions/QuickActionsBar.tsx` | eligible actions and confirmation | typed action eligibility/dispatch |
| `SeriesListScreen` | `src/screens/series/SeriesListScreen.tsx` | search/filter/pagination/select | Control Plane Series projection |
| `SeriesBindingWizard` | `src/screens/series/SeriesBindingWizard.tsx` | local picker, scan preview, policy confirmation | Tauri root commands + binding API |
| `WorkerContextProvider` | `src/app/workerContext.tsx` | selected Series/root/revision state | typed bridge subscriptions |
| `ScreenRegistry` | `src/app/workerRoutes.ts` | screen metadata/guards | module registrations |
| media child screens | `src/screens/media-workspace/` | host-only context and error boundary | Feature 162 typed contracts |
| queue/runtime screens | `src/screens/queue/`, `runtime-gpu/` | projections and commands | Worker loop/runtime bridge |

Screen components must not own tokens, raw paths, tenant resolution, direct
ComfyUI calls, or cross-screen selected-Series state. Native commands return
typed results and safe errors; server mutations stay in the Control Plane
client/service boundary.

#### State matrix

| State | Expected UI | Required behavior |
|---|---|---|
| booting | shell skeleton with stable Sidebar frame | do not flash stale mutation controls |
| disconnected | connection banner and `Reconnect` | cached read-only data may remain marked stale |
| connecting | progress/status region | prevent duplicate pairing/reconnect actions |
| connected, no Series | Overview with `Select Series` CTA | hide Series-dependent mutation actions |
| Series loading | list skeleton and cancel/refresh | preserve previous selected context only as stale |
| Series empty | clear empty state + refresh/search guidance | distinguish no accessible Series from API failure |
| access denied | permission explanation + Connection/Access link | never reveal hidden Series existence |
| Series selected, no binding | context badge + `Bind folder` CTA | Media Workspace actions blocked with reason |
| binding wizard | step indicator, local validation, policy summary | prevent completion without valid native root |
| binding conflict | conflict details and refresh/change action | preserve local source and unsaved policy draft |
| ready | active context, eligible actions, queue/index summary | allow only scope/capability-approved actions |
| stale context | amber/banner with `Refresh` | block mutation until revision is refreshed |
| offline/revoked | explicit status and blocked server actions | local admitted jobs remain recoverable; no publish |
| action pending | inline progress and command/job ID | disable duplicate action using idempotency state |
| action success | result summary and next contextual action | refresh affected projections |
| action failure | stable code, cause, correction, retryability | keep user on relevant screen and preserve state |
| disabled/focus/hover | visible explanation and keyboard focus | no color-only state communication |

#### Responsive matrix

The primary target is a desktop Worker App, but the embedded webview and future
compact windows must not overflow:

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | Sidebar becomes modal drawer; top bar wraps; tables become cards | manual/browser evidence when webview supports it |
| tablet 768x1024 | collapsible Sidebar; Series list remains searchable; wizard stacks | screenshot/manual evidence |
| desktop 1440x900 | persistent Sidebar + top bar + content; queue/actions visible | screenshot/manual evidence |
| small-mobile 360x800 | no page-level horizontal overflow; actions stack | extended evidence for dense screens |
| laptop 1024x768 | collapsed Sidebar by default; binding summary stays above fold | extended evidence for navigation risk |
| wide-desktop 1280x800 | data tables may scroll internally, never the whole shell | extended evidence for queue/published screens |

#### Accessibility acceptance

- Sidebar navigation uses semantic navigation landmarks, grouped labels, active
  route state, and keyboard traversal; collapse has an accessible name and
  preserves the active route.
- Series selector, search, filters, wizard steps, native folder action, policy
  controls, Quick Actions, queue actions, and dialogs are keyboard-operable.
- Focus is visible, trapped inside open dialogs/wizards, and returned to the
  invoking control after close or completion.
- Loading, progress, stale, offline, revoked, and action-result updates use a
  polite live region without repeatedly announcing polling noise.
- Every icon-only action, status badge, thumbnail, path warning, and disabled
  action has an accessible name or text explanation.
- Status, scope, binding, QC, and confidence never rely on color alone; focus
  contrast and light/dark semantic tokens are required.
- Reduced motion disables animated Sidebar transitions and nonessential queue
  effects while retaining state text and progress values.

#### Visual direction

Use the existing Worker App visual language from `styles.css`: operational,
dense but calm, status-first, semantic surfaces, restrained motion, and clear
primary actions. Reuse product semantic tokens and existing button/input/dialog
patterns. Do not introduce raw hex colors, a second theme, or a decorative
dashboard that hides queue and permission state. Sidebar density must remain
scannable at laptop width and must not compete with the selected Series context.

#### Copy and localization contract

- Thai-first labels with English fallback; technical IDs, hashes, paths, and
  execution IDs belong in a details disclosure.
- Required labels: `Series`, `SeriesID`, `โฟลเดอร์ต้นฉบับในเครื่อง`, `ผูกโฟลเดอร์`,
  `Media Workspace`, `Quick Actions`, `Processing Queue`, `AI & Workflows`,
  `Runtime & GPU`, `Connection & Access`, and `Published Assets`.
- Local-only explanation must state: `ไฟล์ต้นฉบับยังอยู่ในเครื่อง Worker
  ระบบจะอัปโหลดเฉพาะไฟล์ derived ที่ผ่าน QC แล้ว`.
- Error copy names cause and correction, for example:
  `ยังหา Series ที่มีสิทธิ์ไม่พบ กรุณา Refresh หรือเชื่อมต่อ Worker ใหม่`,
  `โฟลเดอร์นี้ถูกผูกกับ Series อื่น`, and
  `สิทธิ์เปลี่ยนแปลง ต้องเชื่อมต่อ Worker ใหม่ก่อนเผยแพร่`.
- Do not promise completion from an accepted command. Use `กำลังรอ Worker`,
  `กำลังสแกน`, `กำลังประมวลผล`, `รอตรวจสอบ`, `เผยแพร่แล้ว`, and `ต้องแก้ไข`.

#### Browser/native evidence required

The Worker App is a Tauri/native desktop surface, so browser screenshots alone
cannot prove native folder picker, device proof, GPU, or local-only behavior.
Implementation must record:

- Tauri/manual evidence for the binding wizard, local path disclosure,
  reconnect/revoke, Sidebar keyboard flow, and Quick Actions;
- Control Plane/API contract evidence for Series list, binding, auth denial,
  idempotency, stale revision, and offline recovery;
- browser evidence only for any web handoff/deep-link surface, using mobile
  390x844, tablet 768x1024, desktop 1440x900 plus extended dense-layout
  viewports;
- screenshots/logs under `artifacts/ui/worker-app/` or an equivalent evidence
  path, with skipped checks marked `SKIPPED` and the blocker stated. Missing
  browser tooling, a running Worker, GPU, or managed-media fixture is not a
  pass.

## 9. Quick Actions

### 9.1 Initial actions

| Action | Preconditions | Result |
|---|---|---|
| Connect to server | Worker configured | Authenticated connection/retry |
| Select Series | `series:read` | Sets global Series context |
| Bind folder | Series selected, `series:bind` | Opens four-step binding wizard |
| Scan selected Series | Bound root, `media:workspace` | Starts local stable-file scan |
| Auto-process new footage | Bound root, policy permits | Queues Feature 162 safe plan |
| Review exceptions | Review items exist | Opens filtered Review/QC screen |
| Publish ready assets | Approved derived assets, publish scope | Starts verified publication |
| Index Series | Published changes exist, publish/index policy | Enqueues vector-index update |
| Open queue | Always | Opens Processing Queue |
| Pause Worker | Worker online | Stops new claims; preserves active state |

Actions are shown in Overview, the top bar, and context screens only when
relevant. They have one primary button and a small “Why unavailable?” detail.
Destructive or externally visible actions require a confirmation that states
Series, count, policy, and expected server effect.

### 9.2 Minimum-click happy path

For a first-time user:

```text
Select Series → Bind folder → Auto-process new footage
```

The wizard may combine scan preview and policy defaults, but it must not hide
the local-only boundary or silently enable automated publication.

### 9.3 Media intent controls

Quick Actions expose a compact intent preset; detailed controls remain in
Media Workspace > AI Plan:

- dead air: keep, suggest cuts, trim automatically with review, or trim under
  an approved automated policy;
- duration: exact shot budget, bounded range, or reusable segment bank;
- aspect: preserve source or subject-aware 9:16;
- focus: auto, person, face, object, manual region, or multi-subject;
- motion for stills: push-in, pull-out, pan, depth/parallax, or restrained;
- audio: keep, normalize, mute, or extract for review;
- analysis: technical only, editorial assist, or full AI analysis;
- output: shot-specific clip or reusable Series asset.

Every automated decision records confidence, reason, policy, and whether human
review was required. Low-confidence decisions become Review items rather than
silently passing through.

### 9.4 Quick Action command contract

Quick Actions are typed intents, not shell commands. The client sends only an
allowlisted action and bounded options:

```ts
type WorkerQuickActionRequest = {
  actionId: string;
  action:
    | "connect_server"
    | "select_series"
    | "bind_folder"
    | "scan_series_workspace"
    | "auto_process_new_footage"
    | "review_exceptions"
    | "publish_ready_assets"
    | "index_series"
    | "open_queue"
    | "pause_worker";
  seriesId?: string;
  rootId?: string;
  bindingRevision?: number;
  options?:
    | { includeUnchanged?: boolean }
    | { automationPolicy?: "guided" | "ai_assisted_review" | "automated_ai"; maxFiles?: number }
    | { assetIds?: string[] }
    | { dryRun?: boolean };
  idempotencyKey: string;
  clientRevision?: string;
};
```

The TypeScript union is illustrative; the shared Zod contract must be a
discriminated union by `action`. Unknown option keys, arbitrary nested objects,
raw paths, workflow graphs, shell commands, and provider payloads are rejected
before admission.

The server validates the action against the effective principal, current
Series/root revision, scopes, Feature 162 policy, capability snapshot, and
Worker status. The response is one of:

```json
{
  "status": "accepted",
  "actionId": "qa_123",
  "commandId": "cmd_123",
  "jobId": "job_123",
  "serverRevision": "rev_9",
  "nextScreen": "/queue",
  "contractVersion": "worker-series-workspace.v1"
}
```

```json
{
  "status": "blocked",
  "actionId": "qa_123",
  "code": "LOCAL_ROOT_NOT_CONFIGURED",
  "missingPrerequisites": ["active_binding"],
  "nextScreen": "/series/series_123/bind"
}
```

`accepted` means admitted, not completed. The queue/domain state is read from
the Worker/job projection and Feature 162 domain states. `blocked` is not an
HTTP/network failure and must be rendered as an actionable prerequisite. A
repeated idempotency key returns the original response. The UI must not issue
a second action merely because polling has not yet changed.

### 9.5 Quick Action eligibility matrix

| Action | Required context | Required scopes/capabilities | Server/local execution |
|---|---|---|---|
| Connect to server | configured endpoint | none before auth | local connection handshake |
| Select Series | connected | `series:read` | server list, local context update |
| Bind folder | Series selected + native writable/readable root | `series:bind` | local root validation, then server binding |
| Scan selected Series | active binding | `media:workspace` + local scanner | Worker local scan, server projection update |
| Auto-process new footage | active binding + policy allows | `media:workspace` + Feature 162 capability | server admission, Worker local execution |
| Review exceptions | selected Series | `media:workspace` | local/server projection read |
| Publish ready assets | approved derived artifacts | execution `media:workspace` to admit + upload token `media:publish` to transfer | Worker upload + server verification |
| Index Series | published changes and index policy | execution `media:workspace` + index policy | server/index job, Worker reports state |
| Open queue | connected or cached | none/read projection | local queue screen |
| Pause Worker | Worker process available | local operator permission | local claim/drain state |

The UI computes an optimistic eligibility preview for responsiveness, but the
server response is authoritative. A capability disappearing between preview
and dispatch produces `QUICK_ACTION_NOT_ALLOWED` or
`CAPABILITY_UNAVAILABLE`; it must not silently select a different workflow.

## 10. State model and navigation behavior

### 10.1 App states

```text
booting
  → disconnected
  → connecting
  → connected_no_series
  → series_loading
  → series_selected
  → binding_required
  → ready
  → degraded
  → access_revoked
```

`ready` means the selected Series, binding, required scopes, and required local
capabilities have passed checks. `degraded` means the UI can show cached data
or local progress but a specific action is blocked; the screen must name the
blocked dependency.

### 10.2 Persistence

Persist locally only:

- last canonical route;
- selected `seriesId` and server revision;
- `rootId` and a non-reversible local binding reference;
- safe UI preferences and dismissed notices.

Never persist access tokens in UI state, raw local paths in server-facing
payloads, or a permission decision as if it were current. On launch, validate
the Series and binding before enabling mutations.

### 10.3 Deep links and stale context

Routes may include `seriesId` for navigation convenience, but the server and
Worker context validate it. If a Series is deleted, archived beyond policy,
unshared, or its binding is revoked, show a recovery screen with `Refresh
access`, `Choose another Series`, and `Open local quarantine` where applicable.

Switching Series while a local wizard has unsaved changes prompts to save a
draft, discard, or cancel. Switching does not cancel unrelated background
jobs.

## 11. Local workspace boundary

The native folder is on the computer where the Worker App is installed. The
server stores only safe binding metadata. The Worker owns the absolute path and
performs all original-footage reads and writes locally.

Recommended local layout:

```text
<user-selected-root>/
  footage/                 # source or copied source; never mutated by pipeline
  .smartaihub/
    manifest/              # local fingerprints and revisions
    previews/              # optional local review previews
    derived/               # local derived staging before publication
    jobs/                  # resumable local job state
  quarantine/            # unpublishable or access-revoked outputs
```

This layout is an optional managed-workspace mode, not a requirement that the
user create a nested `footage/` directory. If the user selects an existing
footage directory, the Worker treats that directory as the read-only source
root and stores `.smartaihub` state in the separately approved derived/cache
location when possible. The binding record must state which mode was chosen so
the scanner never scans its own derived output as new source footage.

The user may choose a separate derived/cache location. The UI explains the
location and available disk before processing. `Revoke access` removes the
binding and local authorization; it does not delete source footage. Any
cleanup command must target only explicitly identified derived/cache files and
must show a recoverability warning.

Folder selection, copy-to-folder, native upload, stable-file detection,
fingerprinting, and local-only processing follow Feature 162. The Worker must
not treat a server path or R2 URL as a local source root.

### 11.1 Native root safety and restart recovery

The native root manager must perform the following before binding or scanning:

- canonicalize the path using the platform filesystem API without resolving it
  into a server payload;
- reject non-existent roots, files selected as directories, symlink/junction/
  reparse-point escapes, hidden system roots, removable media that disappears
  during a run, and roots outside the user-approved allowlist;
- enforce a maximum depth, file count, file size, extension allowlist, and
  free-disk threshold from the validated policy;
- treat a file as stable only after size/mtime remain unchanged for the settle
  interval and re-check the fingerprint before processing;
- write derived/staging output outside the source file or into an explicitly
  approved `.smartaihub` area; never replace, rename, or mutate the original;
- write the local manifest and job checkpoint atomically, with a temporary file
  plus fsync/rename strategy appropriate to the platform.

On Worker process crash, power loss, device sleep, or app upgrade:

1. mark the local execution as `interrupted` and preserve the source,
   manifest, partial output, and last safe checkpoint;
2. on restart, reconcile local checkpoints with the server job lease and
   binding revision;
3. resume only when the source fingerprint, policy, Worker identity, and job
   idempotency key still match;
4. quarantine incomplete outputs that fail checksum/QC; never publish a partial
   file and never restart a billable external/provider run without remote
   execution reconciliation;
5. report `WORKER_RESTART_RECOVERY` with a human-readable recovery action.

Pause/close uses a drain protocol: stop claiming new jobs, allow the current
safe stage to checkpoint, wait for the configured cancel grace period, then
quarantine/reconcile anything still active. `Force quit` is visibly unsafe and
never deletes source files. Local cleanup can delete only explicitly selected
derived/cache/quarantine files after showing exact paths locally and a
recoverability warning.

### 11.2 Native boundary, fingerprinting, and local secret/cache policy

The webview never receives an arbitrary filesystem capability. All filesystem
operations go through a small typed Tauri command surface owned by the native
Worker:

| Native command | Input | Output visible to webview |
|---|---|---|
| `pick_local_root` | workspace mode and user intent | opaque `rootId`, bounded display label, validation result |
| `validate_local_root` | `rootId` plus policy revision | bounded counts, disk/QC warnings, no raw path in server-facing data |
| `scan_preview` | `rootId`, binding revision, scan policy | bounded inventory summary and local job ID |
| `get_local_workspace_status` | `rootId` | state, progress, warnings, checkpoint summary |
| `revoke_local_root` | `rootId` and confirmation token | revocation result; no implicit deletion |

The native layer may display the absolute path locally for confirmation and
diagnostics, but it must never return it through the Control Plane, log it in
structured server telemetry, or accept a webview-supplied path as an authority
grant. `rootId` is an app-generated opaque identifier. The fingerprint is
HMAC-SHA-256 with a device-local secret over the canonical path, filesystem
identity, and `workspaceMode`; the server stores only the versioned fingerprint
and cannot recompute or reverse the path. The secret is generated once per
device proof and kept in OS-protected storage where available (with the
existing native credential-protection fallback); device reset rotates it and
invalidates affected bindings. Plain SHA-256 of a path is not sufficient.

The native cache and resumable job store must be encrypted at rest where the
platform supports it and must use the OS credential store for access/refresh
tokens and device private keys. The webview may persist only the safe
projection listed in §10.2; it must not put tokens, raw paths, source names, or
provider credentials in `localStorage`, browser IndexedDB, crash reports, or
remote logs. Cached Series projections are stale/read-only until revalidated,
have a bounded TTL, and are cleared or cryptographically invalidated on
unpair, account switch, tenant switch, or root revocation. Source footage stays
on the Worker machine; cache cleanup never implies source deletion.

## 12. Error handling and offline behavior

Stable error codes:

| Code | Meaning | UI behavior |
|---|---|---|
| `WORKER_SCOPE_DENIED` | Missing required Worker scope | Explain access and stop list/mutation |
| `SERIES_ACCESS_DENIED` | Principal lacks access to the Series | Do not reveal hidden Series; open Connection & Access |
| `WORKER_PRINCIPAL_UNRESOLVED` | Durable paired owner/access mode cannot be resolved | Fail closed; open Connection & Access |
| `SERIES_NOT_FOUND` | Series no longer accessible | Clear selected context and offer refresh |
| `SERIES_LIST_UNAVAILABLE` | Server list failed | Retry; show cached list as stale/read-only |
| `SERIES_BINDING_CONFLICT` | Another active root or revision conflict | Refresh binding and offer change flow |
| `IDEMPOTENCY_KEY_REUSED` | Same key was used with a different request | Show conflict; do not execute |
| `LOCAL_ROOT_NOT_CONFIGURED` | No native root | Open binding wizard |
| `ROOT_REVOKED` | Server/local binding invalid | Stop new intake/publication; preserve local data |
| `SERVER_OFFLINE` | Transport unavailable | Show last sync and block authority-dependent actions |
| `STALE_SERIES_CONTEXT` | Selected revision changed | Refresh before mutation |
| `QUICK_ACTION_NOT_ALLOWED` | Preconditions or policy fail | Show exact missing prerequisite |
| `CAPABILITY_UNAVAILABLE` | GPU/MCP/FFmpeg/runtime unavailable | Offer compatible fallback or review |
| `PUBLICATION_STATE_INCONSISTENT` | Transport completed without verified domain artifact | Block Ready state; open diagnostics/reconcile |
| `WORKER_RESTART_RECOVERY` | Local job resumed or quarantined after interruption | Show checkpoint/recovery decision |

Offline rules:

- local processing already admitted may continue if its immutable policy and
  job authorization are valid;
- new Series discovery, binding, publication, and permission-sensitive actions
  are blocked until authority is refreshed;
- cached list/inventory is visibly marked `stale` and cannot be mistaken for a
  current permission grant;
- retries use idempotency keys and exponential backoff;
- reconnecting refreshes access, binding revision, policy, and queue state.

## 13. Observability and audit

Record structured events for:

- screen/Quick Action ID and result;
- Worker ID, root ID, SeriesID, binding revision, and job ID;
- server revision and policy revision used;
- workflow resolution ID where applicable;
- error code, retry count, and duration.

Do not log raw local paths, source filenames when they reveal private content,
source bytes, tokens, provider secrets, or arbitrary workflow JSON. Audit
Series binding, unbinding, policy changes, publication, re-index, cancellation,
and access failures on the server.

Metrics should distinguish UI failure from worker execution failure:

- Series list latency/error rate;
- binding success/conflict rate;
- Quick Action eligibility and completion rate;
- stale/offline duration;
- queue time, local processing time, publication time, and index lag;
- navigation/render errors by screen.

Initial operational budgets are acceptance targets, not claims about current
production performance: Series list/detail p95 <= 1 second for a 200-item page,
binding acknowledgement p95 <= 2 seconds excluding native permission/picker
time, Quick Action acknowledgement p95 <= 2 seconds, and no polling loop may
block the UI thread. A budget breach emits a warning metric and does not cause
the Worker to bypass authorization or local-only processing.

## 14. Testing and verification

### 14.1 Contract and security tests

- list returns only Series accessible to the paired account and tenant;
- private, group, and tenant sharing modes resolve the expected principal;
- missing, revoked, conflicting, or legacy-unowned Worker principals fail
  closed and never fall back to a request `userId`;
- request `userId`, `ownerId`, and arbitrary tenant values are rejected or have
  no authority effect;
- missing/expired/revoked scope blocks the exact operation;
- execution/upload/refresh token scope separation prevents a publish token from
  listing Series or binding a root;
- binding is idempotent and revision conflicts are deterministic;
- one active root per Worker/Series pair is enforced;
- concurrent bind requests cannot create two active roots or cross Series;
- cursor signatures, expiry, filter binding, body hashes, nonces, and request
  IDs are validated;
- idempotency-key reuse with a changed request returns a conflict and does not
  execute the second request;
- route rate limits return `Retry-After` and do not leak hidden Series;
- unbind preserves source, published artifact, vector, and immutable history;
- response fixtures contain no absolute local path, secret, or source URL.

### 14.2 Worker/client tests

- Control Plane client maps success, pagination, stale revision, and stable
  error codes;
- selected Series/root context survives route changes and reconnects;
- invalid or revoked context disables mutations;
- old tab identifiers resolve to canonical routes;
- background heartbeat/claim loop is unaffected by navigation;
- local folder picker and root fingerprint never send the raw path;
- Quick Actions expose the correct preconditions and idempotency keys.
- restart/reconnect reconciliation resumes only matching local checkpoints and
  quarantines incomplete outputs;
- native root validation rejects symlink/junction escapes and unstable files.

### 14.3 UI tests

- Sidebar expands/collapses without losing route or Series context;
- each screen has loading, empty, error, offline, access-denied, and success
  states;
- Series list search/status filters and pagination work with 0, 1, 50, and
  1,000 Series fixtures;
- four-step binding wizard prevents confirmation without a valid root and
  policy;
- switching Series warns about unsaved wizard changes;
- keyboard navigation, focus order, labels, and disabled-action explanations
  pass accessibility checks;
- narrow desktop windows do not turn the Sidebar into an overflowing tab bar.

### 14.4 Integration tests

1. Pair Worker.
2. Fetch Series projection.
3. Select Series.
4. Choose a local folder and bind it.
5. Scan and queue Feature 162 local media work.
6. Review QC, publish derived artifact, and update vector index.
7. Reopen the app and verify the Series/root context and published state.
8. Revoke access and verify no new publication is possible while local source
   and safe quarantine remain intact.

Include offline during list, bind, scan, processing, and publication. Include
unauthorized Series, changed binding, duplicate files, and missing GPU/MCP
capability cases.

### 14.5 Migration and compatibility tests

- additive migration creates or extends the Feature 162 media-root binding
  records without changing existing Series, media, B-roll, Worker, or
  connected-device rows;
- migration dry-run reports active root conflicts, missing owner principals,
  duplicate active bindings, and invalid policies before apply;
- legacy Workers without a durable paired owner remain eligible for existing
  heartbeat/claim behavior but cannot list/bind Series until explicitly paired;
- old `connection`, `render`, `hermes`, and `settings` links resolve to the
  canonical routes and preserve their existing settings/runtime behavior;
- rollback disables new routes/flags and preserves historical jobs, local
  manifests, published derived artifacts, and old tab aliases;
- contract fixtures cover the current `verticalDramaSeries.list` ownership
  semantics and the new Worker projection without directly invoking tRPC from
  the Worker.

## 15. Rollout and implementation phases

### Phase 0 — contracts and flags

Add typed screen/context contracts, Control Plane route definitions, scopes,
stable errors, feature flags, and fixtures. Reuse the existing Series domain
access service. Add the additive binding migration and migration dry-run/check
before enabling any route. The migration must not blind-backfill
`ownerUserId`; unresolved roots remain explicitly unbound/quarantined.

### Phase 1 — shell migration

Introduce `WorkerAppShell`, Sidebar, Topbar, route registry, context provider,
loading/error boundaries, and old-tab aliases. Preserve current runtime and
settings commands.

### Phase 2 — Series discovery and binding

Implement list/detail/binding/revoke routes, paired-account resolution, native
folder picker integration, local root validation, and the four-step wizard.

### Phase 3 — Media Workspace integration

Mount Feature 162 child screens, add global Series/root guards, intake/scan
Quick Actions, queue projection, and local-only safety states.

### Phase 4 — operations and AI controls

Add Published Assets, AI & Workflows, Runtime & GPU, Connection & Access,
policy-aware workflow selection, publication/index actions, and diagnostics.

### Phase 5 — extensibility and hardening

Add module registry documentation, migration cleanup, accessibility,
performance, offline recovery, audit dashboards, and canary rollout.

Feature flags must be independently able to disable Series binding, automated
Quick Actions, publication, AI routes, and future modules. Disabling a feature
stops new mutations but leaves existing local jobs and approved artifacts
recoverable.

The minimum independently auditable flags are
`workerAppSidebarShell`, `workerSeriesControlPlane`,
`workerSeriesAccessMigration`, `workerSeriesBinding`,
`workerMediaWorkspaceIntegration`, `workerQuickActions`,
`workerAutomatedAi`, and `workerDerivedPublication`. The server evaluates the
flags before route admission and the Worker treats a missing/unknown flag as
disabled. A flag rollback cannot revoke a completed artifact or erase local
source data. Each flag change records actor, tenant, previous/new value,
reason, policy revision, and effective time.

Migration ownership is singular: one additive Drizzle migration owns the
binding table/indexes and any canonical Worker-scope registry changes. Before
apply, the dry-run emits counts and a conflict report for unresolved paired
owners, duplicate active roots, invalid policies, and orphaned Series IDs. The
apply runs transactionally where the database permits, verifies row/index
counts afterward, and writes a migration receipt. There is no destructive
down-migration; rollback is operational (disable flags, stop new admissions,
preserve history, reconcile/quarantine in-flight work). Tenant/user deletion
and unpair flows must revoke active bindings, invalidate local cached
authority, preserve artifact lineage/audit according to retention policy, and
never reach back to delete source files on the Worker device.

Rollout order is:

```text
shared schemas + migration dry-run
  → server read-only Series projection
  → canary binding for one internal Worker
  → local scan/queue without publication
  → derived-only publication/indexing
  → Quick Actions and AI/workflow controls
  → bounded tenant cohort
```

Every stage has a kill switch, audit/metric dashboard, and rollback check. A
rollback must first drain new claims/actions, then leave already admitted local
jobs to reconcile or quarantine; it must not delete local sources or published
R2 artifacts.

## 16. Acceptance criteria

- [ ] Worker App has a Sidebar and separate canonical screens; adding a new
  function does not require another top-level tab.
- [ ] Top bar shows connection, selected Series, binding, GPU/runtime, queue,
  and access state without exposing secrets or local absolute paths remotely.
- [ ] Worker can fetch a paginated Series list from the server and select a
  SeriesID available to the paired account.
- [ ] Server derives tenant/account identity from Worker pairing and does not
  trust a submitted `userId`, `ownerId`, or tenant ID.
- [ ] Server resolves the effective principal from durable Worker/connected
  device records, handles private/groups/tenant sharing policy explicitly, and
  fails closed when a private Worker has no active paired owner.
- [ ] User can bind exactly one active local root per Worker/Series pair through
  a native folder picker and see its safe binding status.
- [ ] Binding persistence has tenant/Series/Worker ownership, monotonic
  revision, active uniqueness, policy snapshot, revocation audit, and safe
  migration behavior.
- [ ] The scope contract has one canonical registry, an explicit media-operator
  preset, and tests proving execution-token versus upload-token separation.
- [ ] Native root identity uses a versioned device-keyed HMAC fingerprint;
  raw paths, source names, tokens, and provider secrets do not cross the
  webview/server telemetry boundary.
- [ ] Binding wizard clearly states that original footage stays on the Worker
  device and that only verified derived output is published to R2.
- [ ] Media Workspace child screens integrate Feature 162 without duplicating
  its processing contract or creating a second navigation system.
- [ ] Quick Actions show only eligible operations, explain blocked
  prerequisites, use idempotency, and never submit arbitrary shell commands or
  ComfyUI graphs.
- [ ] Quick Action requests are discriminated, bounded, replay-protected, and
  return explicit `accepted` versus `blocked` state with a command/job reference.
- [ ] HTTP errors, cursor expiry/signature, request IDs, body limits, rate
  limits, and `Retry-After` follow the Feature 163 Control Plane contract.
- [ ] User can choose Quick Auto, AI-assisted review, or Manual/Advanced within
  server allowlists; admin defaults remain visible and auditable.
- [ ] Processing Queue and Published Assets show Series, job, QC, publication,
  and vector-index state with safe lineage.
- [ ] Offline, stale, revoked, unauthorized, missing-root, and capability
  failures have explicit states and do not silently process or publish.
- [ ] Existing `connection`, `render`, `hermes`, and `settings` tab links
  continue to work as canonical route aliases during migration.
- [ ] Background claim/heartbeat/execution continues while navigating or
  restarting the UI, with resumable state and no source mutation.
- [ ] Crash/power-loss recovery resumes only matching checkpoints, reconciles
  remote execution IDs before retry, quarantines partial outputs, and follows
  Worker drain semantics.
- [ ] Worker App UI meets the UI/UX contract in §8.12, including state,
  responsive, keyboard/focus, reduced-motion, copy, and native/browser evidence
  requirements.
- [ ] Contract, security, UI, accessibility, and end-to-end tests in §14 pass
  before enabling the feature for general users.
- [ ] Feature flags, migration receipt/conflict report, unpair/tenant-delete
  revocation, and operational rollback evidence are recorded before canary
  expansion.

## 17. Implementation map

### Worker App

- `apps/worker-app/src/main.tsx`: extract shell and remove feature growth from
  `WORKER_TABS`/`activeTab` after aliases are in place;
- `apps/worker-app/src/app/WorkerAppShell.tsx`;
- `apps/worker-app/src/app/workerRoutes.ts` and screen registry;
- `apps/worker-app/src/app/workerContext.tsx`;
- `apps/worker-app/src/components/navigation/WorkerSidebar.tsx`;
- `apps/worker-app/src/components/navigation/WorkerTopbar.tsx`;
- `apps/worker-app/src/components/quick-actions/QuickActionsBar.tsx`;
- `apps/worker-app/src/screens/overview/`;
- `apps/worker-app/src/screens/series/` including binding wizard;
- `apps/worker-app/src/screens/media-workspace/` as the Feature 162 host;
- `apps/worker-app/src/screens/queue/`, `published/`, `ai-workflows/`,
  `runtime-gpu/`, `connection-access/`, and `settings/`;
- Tauri/Rust Control Plane client, series commands, local root picker, and
  typed event bridge. Keep background worker execution separate from screen
  components.

### Server and shared contracts

- Add Worker Control Plane Series routes beside the existing Worker routes in
  `apps/web/server/routes/workerRuntime.ts` (or a focused companion route
  module), with domain access reused from a neutral service extracted from
  `apps/web/server/routers/verticalDramaSeries.ts`; never call the browser
  procedure from the desktop client;
- register routes through `apps/web/server/_core/index.ts` with route-level
  body limits, rate limits, auth/device-proof verification, and stable error
  mapping;
- extend the paired-account resolution boundary in
  `apps/web/server/services/workerAuthService.ts` without trusting a client
  supplied user identity;
- reuse `apps/web/server/services/connectedDeviceService.ts` and the Worker
  registry's durable `registeredByUserId`/sharing policy only as the resolver
  inputs; do not copy ownership logic into the Worker;
- add paired-account/Series access and binding services;
- add one canonical scope registry, including an explicit
  `vertical_drama_media_operator` preset, and derive
  `series:read`, `series:bind`, `media:workspace`, and `media:publish` in both
  `apps/web/shared/workerRuntime.ts` and
  `apps/web/shared/workerAccessKeys.ts`; test the execution/upload token split;
- add request/response/error schemas and contract tests;
- add `workerSeriesAccessService`/binding services that adapt the neutral
  owner-only `verticalDramaSeries` authorization without broadening it;
- add binding persistence with tenant, Worker, Series, root, revision, policy,
  audit, revoked-at, and active uniqueness fields, with an additive Drizzle
  migration and dry-run/invariant checks;
- add projection queries for queue, published assets, and vector-index state;
- extend the Worker-side Control Plane client from
  `apps/worker-app/src-tauri/src/control_plane.rs` (or a focused companion
  module) with typed Series, binding, projection, and Quick Action commands.

### Feature boundary

- Feature 162 owns media algorithms, local ingest, typed edit plans,
  Worker-first processing, QC, R2 derived publication, and Series vector
  indexing.
- Feature 163 owns how a user reaches those functions, selects a Series,
  binds the local root, triggers safe actions, and understands state/errors.
- Both features must share immutable Series/root/job references and must not
  pass raw paths or provider-specific payloads through the UI.

## 18. Design decisions and research notes

1. **REST Control Plane for Worker discovery.** The browser's protected tRPC
   session is not available inside a paired desktop Worker. A Worker-specific
   REST projection keeps device auth, scope checks, retries, and versioning
   explicit while reusing the same server domain authorization.
2. **Server-derived identity.** A Worker is an execution device, not a user
   identity. Accepting `userId` from the desktop client would create a tenant
   and ownership bypass, so pairing is the only identity source.
3. **Sidebar plus routes.** The current four tabs are adequate for connection,
   rendering, AI/runtime, and settings but do not scale to Series, media
   inventory, QC, publication, and diagnostics. A registry-backed Sidebar
   keeps these concerns discoverable and gives future modules a contract.
4. **Quick Actions as intent commands.** Quick Actions reduce steps without
   turning the Worker into an unrestricted automation shell. They submit typed,
   policy-checked intents and return job references.
5. **Polling first, push later.** Series list, binding, queue, and index state
   can use bounded polling with server revisions in the first release. A later
   push channel may optimize freshness without changing screen contracts.
6. **Pairing is a durable authorization relation.** The current access token
   does not carry `registeredByUserId`; Series access therefore resolves from
   the active connected-device owner and Worker sharing policy. Missing private
   ownership is a hard denial, not an invitation to trust a body field.
7. **No new routing dependency by default.** Implement the route registry and
   deep-link adapter using the existing Worker App stack. Add a routing package
   only if the current Tauri/webview constraints make nested routes unsafe;
   document that decision in implementation review.
8. **MCP remains behind a capability contract.** ComfyUI/MCP workflow choice,
   probing, and execution details remain behind Feature 162's typed workflow
   resolver. Feature 163 shows status and user intent, not raw MCP tools.
