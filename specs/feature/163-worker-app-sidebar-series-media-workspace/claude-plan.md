# Feature 163 implementation plan

## Outcome and boundaries

Turn the existing Worker App four-tab UI into a scalable Sidebar/route shell
with a selected-Series context, safe local-root binding, queue/runtime/access
surfaces, and typed Quick Actions. Feature 163 is the Worker Control Plane and
orchestration owner; Feature 162 remains the media algorithm/publication owner.

## Repository evidence and integration points

- Extract the current `WORKER_TABS`/`activeTab` presentation from
  `apps/worker-app/src/main.tsx` into `WorkerAppShell`, route registry,
  `WorkerContext`, Sidebar, Topbar, and screen modules. Keep legacy aliases.
- Extend `apps/worker-app/src-tauri/src/control_plane.rs` with typed REST
  Series/binding/projection/Quick-Action calls and device-proof headers.
- Add Rust native root manager, local binding store, HMAC fingerprint,
  protected cache, and single background coordinator; preserve existing
  credentials/settings/runtime behavior.
- Add a neutral server-side Series access service extracted from the current
  owner-only `verticalDramaSeries` predicate. Do not call browser tRPC from the
  Worker.
- Extend `apps/web/shared/workerRuntime.ts` and
  `apps/web/shared/workerAccessKeys.ts` through one canonical scope registry,
  derived execution/upload views, and an explicit media-operator preset.
- Add Control Plane routes in `apps/web/server/routes/workerRuntime.ts` or a
  focused companion registered from `apps/web/server/_core/index.ts`, reusing
  `workerAuthService`, `connectedDeviceService`, idempotency and rate limits.
- Add additive Drizzle binding/policy/audit persistence and focused route,
  service, shared, UI, and Rust tests.

The neutral authorization module is
`apps/web/server/services/verticalDramaSeriesAccessService.ts`; both the
existing browser router and Worker routes call it with an explicit server
principal. Feature 163 owns binding/control-plane persistence and tests, while
Feature 162 owns media-job/artifact persistence. Execution-token routes admit
work; upload-token routes can only finalize verified derived artifacts.

## Shared identity, scope, and access contracts

Create strict schemas for Worker principal, Series projection, binding,
workspace projection, Quick Action discriminated union/result, cursor, error,
contract version, idempotency record, and audit event. The effective principal
comes from active Worker + connected-device owner + sharing mode. Access
precedence is owner, active group, explicit tenant policy; hidden resources
return the same safe not-found shape. `ownerUserId` in a binding is a snapshot,
not authorization.

Every list/detail/bind/workspace/action/publication request re-resolves current
principal, Series access, Worker status, binding revision, and policy revision.
Cached projections are stale/read-only and never enable authority-sensitive
actions. Safe projections redact source filenames, raw paths, fingerprints,
provider URLs, and secrets; denied Series IDs use the same timing/shape as
unknown IDs.

Build a canonical scope registry with route requirement, execution/upload token
use, and Admin permission. Derive both existing scope unions from the registry,
intersect requested scopes with approved policy, and provide
`vertical_drama_media_operator` without broadening readonly/operator presets.

## Control Plane API and persistence

Implement:

- `GET /api/workers/:workerId/series` with signed principal/filter-scoped
  cursor and safe projections;
- `GET /api/workers/:workerId/series/:seriesId`;
- `POST /api/workers/:workerId/series-bindings` with `If-Match`, idempotency,
  root metadata, safe label, policy snapshot, and binding revision;
- `DELETE /api/workers/:workerId/series-bindings/:seriesId` as revoke/drain;
- `GET /api/workers/:workerId/series/:seriesId/media-workspace`;
- `POST /api/workers/:workerId/quick-actions` with bounded typed actions.

Every route validates token/device proof, scope, tenant/Worker status, current
principal/access, Series/root revision, body size, request ID, contract version,
rate limit, and idempotency. No client user/tenant/path/provider graph is
accepted. Status/error codes must include auth/scope/access/not-found,
conflict/stale, capability, offline, rate-limit, and publication inconsistency.

Add an additive binding table/indexes and audit/idempotency persistence. Use
transactional active uniqueness and optimistic concurrency. Dry-run reports
unresolved owners, duplicate roots, invalid policies, and orphan Series IDs;
there is no destructive down migration.

## Native Worker architecture

Create a native typed command boundary:

- `pick_local_root`, `validate_local_root`, `scan_preview`,
  `get_local_workspace_status`, `revoke_local_root`;
- local job/coordinator commands that are not authority grants.

Absolute paths remain in protected native state. Root IDs are opaque and
fingerprints are versioned HMAC-SHA-256 over canonical path/filesystem identity
and workspace mode using a device-local secret. Tokens/private keys use the
existing secure credential path. Webview cache is bounded/stale-read-only and
invalidated on unpair/account/tenant/root revocation.

The coordinator is singleton per Worker identity; UI windows subscribe to it.
Durable jobs pin Series/root/binding/policy/source/idempotency/remote execution
references. Unbind revokes authority, blocks new claims/publication, drains or
quarantines pinned jobs, and never deletes source or verified artifacts.

The shared state machine distinguishes transport state from domain state and
permits only explicit retry/recovery transitions. A remote execution that may
have completed is reconciled by execution ID before another billable attempt;
uploading/publishing/indexing after revoke is blocked unless the user creates
a new binding revision and re-authorizes the artifact. The coordinator owns a
single heartbeat/claim/upload/GPU lease loop even when multiple windows are
open.

## UI/UX contract

### Target user and JTBD

The creator needs to operate a local Worker across many Series and footage
folders, understand what can run now, trigger safe automation, and recover from
offline/revoked/GPU/media failures without navigating an expanding tab bar.

### Route/surface inventory

`/overview`, `/series`, `/series/:seriesId`, `/series/:seriesId/bind`,
`/media-workspace/*` (Feature 162), `/queue`, `/published`, `/ai-workflows`,
`/runtime-gpu`, `/connection-access`, `/settings`; aliases map old
`connection`, `render`, `hermes`, `settings` identifiers.

### Component map and ownership

`WorkerAppShell` owns layout; `WorkerSidebar` navigation; `WorkerTopbar`
connection/Series/GPU/queue; `WorkerContext` selection/revision; `QuickActions`
eligibility/dispatch; screens own projections and forms; Tauri bridge owns
native path operations; server owns authority/policy. No screen owns tokens,
raw paths, tenant resolution, or background loops.

### State matrix

Shell and each screen must support booting, disconnected, connecting,
connected/no Series, loading, empty, stale/offline read-only, access denied,
binding required, capability unavailable, processing, success, error/retry,
revoked, and recovery. Quick Action button state is derived optimistically but
server admission is authoritative; accepted is not completed.

### Responsive/accessibility/visual/copy contract

Desktop uses persistent Sidebar and content workspace; tablet collapses the
Sidebar and keeps Series context in Topbar; narrow desktop/mobile uses a
drawer/compact navigation without horizontal tab overflow. Use existing Worker
tokens/styles and semantic web UI tokens where applicable; do not introduce a
global reset or raw color/spacing values. Keyboard/focus,
labels, landmarks, live status, contrast, reduced motion, and disabled-action
explanations are acceptance criteria. Thai/English copy covers connection,
Series, local-only path, stale, blocked prerequisite, recovery, and publish
states with locale fallback.

Stale deep links clear invalid Series context and offer refresh/choose another
Series/open local quarantine. Unsaved binding/AI plans prompt before context
switch. Browser screenshots prove shell/layout states; Tauri evidence proves
native picker/path disclosure and is not substituted by a browser screenshot.

### Browser/native evidence

Component tests must cover route/selection/state matrices. Browser evidence is
required for Sidebar collapse, Series selection, binding wizard, Quick Actions,
queue and Media Workspace host. Native evidence is required for folder picker,
path redaction, restart/recovery, and revoke. Real GPU/MCP/provider execution
remains an environment gate.

## Testing and rollout

- Shared scope/principal/Quick Action schemas: Vitest.
- Server route/service/persistence contracts: focused Vitest with mocked DB or
  existing route dependency injection.
- Rust root/fingerprint/cache/coordinator/recovery: `cargo test`.
- Worker shell/context/route/Quick Action: TypeScript tests plus `typecheck`
  and `build`.
- Integration: pair → list → select → bind → scan Feature 162 → publish →
  revoke → restart/recovery.
- Flags: shell, control plane, access migration, binding, Media Workspace,
  Quick Actions, automated AI, derived publication. Canary read-only first;
  rollback drains new authority-sensitive work and preserves durable outputs.

Legacy Workers/tokens remain eligible for existing heartbeat/claim behavior but
cannot access new Series/binding routes until explicitly paired and reissued
with approved scopes. Existing tab aliases remain available for one migration
release. Focused tests do not prove a deployed migration, browser/native
behavior, GPU/MCP/provider execution, or production rollout; those are tracked
as explicit evidence gates.

## Implementation order

1. shared principal/scope/action contracts and tests;
2. neutral access/binding persistence and Control Plane routes;
3. native Tauri root/coordinator/client bridge;
4. Worker shell/context/sidebar/screens/Quick Actions;
5. Feature 162 Media Workspace mounting and end-to-end contracts;
6. migration/flags/observability/accessibility and final review.
