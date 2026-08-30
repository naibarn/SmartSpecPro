# Feature 164 — Worker App UX, Localization, and Multi-Series Local Workspace

**Status:** Proposed — implementation-ready design<br>
**Date:** 2026-08-26<br>
**Primary owner:** Worker App / Worker Control Plane / Vertical Drama<br>
**Dependencies:** Feature 162 media intelligence, Feature 163 Worker App
sidebar/workspace, authenticated Worker pairing, local ComfyUI MCP contract

## Status

Proposed feature specification for the next Worker App improvement cycle.
This specification is additive to the completed Feature 162/163 work and does
not replace or rewrite `2026-08-25-feature-162-163-gap-closure-design.md`.

The implementation must preserve the existing Worker control-plane contract,
local-source privacy boundary, ComfyUI MCP execution path, connected-device
permission enforcement, and legacy route aliases.

## Problem

The Worker App has grown from a small tabbed helper into a multi-purpose local
media worker, but its information architecture has not converged. The current
shell exposes a large set of routes plus a duplicated Quick Actions bar. The
Series media and Binding screens overlap, and Queue, Video render, AI Plan,
Published, Runtime, and Hermes expose related states in separate places. This
makes the next action difficult to discover.

The current UI also contains a mixture of Thai and English strings. A user can
select a Series from the server, but folder management is still partly path
oriented and does not provide a complete native workflow for browsing and
creating a local folder. Series results must match the web app's active-Series
visibility rules, and selecting a Series must show enough detail to safely
choose or verify its local workspace.

## Outcome

Deliver a focused Worker App workspace with:

1. A complete Thai/English locale switch that changes all user-visible Worker
   App content without restarting the app.
2. One canonical Sidebar navigation set. The top Quick Actions links are
   removed; core actions remain available inside the screen that owns them.
3. A native Windows/macOS folder picker and explicit New folder action.
4. One local root folder binding per Series on the current machine, with the
   root path kept local and never returned in a server projection.
5. Active Series list/detail behavior consistent with the web application;
   archived/deleted Series are never shown in the default Worker workspace.
6. A clear separation between server authority, native local filesystem
   authority, and Worker execution state.
7. A smaller, understandable screen model that retains backward-compatible
   route aliases while preventing duplicate screens from rendering.

## Scope

### In scope

- Worker App React shell, Sidebar, topbar, route registry, screen composition,
  translations, status/error copy, and responsive layout.
- Tauri commands for selecting a folder, creating a child folder, validating a
  folder, initializing a Series workspace, and reading local binding state.
- Server Series list/detail projections needed by the Worker App.
- Additive local binding-state migration from the current single-root format to
  a per-Series format.
- Automated and manual tests for Windows and macOS behavior where the runner
  supports the platform.

### Out of scope

- Replacing the Worker ↔ SmartAIHub REST control plane with MCP.
- Replacing the Worker ↔ local ComfyUI MCP integration.
- Changing the completed media preprocessing, workflow resolution, permission,
  R2 publication, or vector-index contracts except where this feature needs a
  stable projection or UI entry point.
- Deleting local footage, derived assets, old workspace metadata, or server
  Series data.
- Reintroducing or expanding HyperFrames as a product surface.

## Product principles

### One job, one home

Every action has one canonical owner screen. Navigation should answer “where do
I do this?” without requiring the user to understand implementation terms.

### Local path is local authority

The native process receives the selected absolute path from the OS picker and
validates it. The server receives only opaque root identity, binding revision,
and safe counts/status. No absolute path, path fragment, or local filename
outside the approved projection may be sent to SmartAIHub.

### Server data is authoritative for Series visibility

The Worker App does not reconstruct Series access from cached data. It requests
the server projection on every refresh/selection flow, honors pagination, and
does not display archived/deleted or inaccessible Series in the default
workspace.

### Language is a global application preference

Changing language changes navigation, headings, labels, help text, statuses,
validation errors, confirmation dialogs, empty states, and accessibility labels
through one locale catalog. Raw backend error codes remain stable and are
mapped to localized messages at the Worker UI boundary.

## Target information architecture

The Sidebar is the only primary navigation. The topbar contains only the
current screen title and global connection/Series/queue/runtime context.
`QuickActionsBar` is removed from the shell and must not be rendered as a
second navigation surface.

| Canonical screen | User purpose | Consolidated from |
| --- | --- | --- |
| Overview | Health, connection, active job, and next recommended action | Overview |
| Connection | Pair/reconnect this machine and inspect connection state | Connection |
| Series workspace | Find an active Series, inspect its details, choose/create/verify/bind its local root | Series media, Binding |
| Media workspace | Scan, inventory, AI/manual intent, review, QC, process, and publish local media | Media Workspace, AI Plan, Published |
| Queue | See queued/running/completed/failed work and perform permitted job actions | Queue, Video render |
| Workflows | Inspect advertised ComfyUI MCP capabilities and select workflow policy where applicable | Workflows |
| Runtime & agents | Runtime readiness, ComfyUI readiness, Hermes status, and diagnostics | Runtime, Hermes agents |
| Settings | Language, worker behavior, concurrency, local runtime settings, and preferences | Settings |

`Published` remains an internal filter/state in Media workspace. `AI Plan`
remains a stage within Media workspace. `Binding` becomes a section within
Series workspace. `Video render` becomes a Queue filter/detail state.

### Compatibility routing

The existing route IDs remain accepted as aliases:

- `binding` → `series`
- `render` → `queue`
- `published` → `media-workspace` with Published filter
- `ai-plan` → `media-workspace` with AI Plan stage
- `hermes` → `runtime`
- `media-workspace` → `media-workspace`
- `home`, `footage`, and `jobs` continue to resolve to their existing
  canonical equivalents.

Aliases must redirect or render the canonical screen, not create a second
screen implementation. Existing automation and stored deep links must remain
usable during rollout. The Sidebar iterates only the eight canonical routes;
alias IDs are not visible as additional menu items and cannot create a second
navigation entry.

### Action ownership after Quick Actions removal

Removing the top bar removes only the duplicate navigation surface. The
existing actions remain discoverable in these owners:

| Action | Canonical owner |
| --- | --- |
| Refresh/search/select Series, browse/create/validate/initialize/bind/unbind folder | Series workspace |
| Scan inventory, choose manual or automated AI editing, choose intent, review, QC, process, publish | Media workspace |
| Inspect progress, pause, resume, cancel, retry, and open job details | Queue |
| Inspect/select ComfyUI MCP workflow capability and policy | Workflows, opened contextually from Media workspace |
| Runtime doctor, GPU/ComfyUI/Hermes readiness, update, and diagnostics | Runtime & agents |
| Pair/reconnect, inspect identity, and inspect effective permissions | Connection |
| Language, worker behavior, concurrency, and preferences | Settings |

No action may exist only in the removed `QuickActionsBar`. If a legacy deep
link targets one of those actions, it lands on the owning screen with the
appropriate stage/filter/context selected.

## Localization contract

### Supported locales

The first release supports:

- `th` — Thai
- `en` — English

The locale is persisted in the Worker App settings file using the versioned
`locale` field with values `th` or `en`. The field must exist in both the
React `Settings` contract and the Rust `WorkerAppSettings` contract. Do not
introduce a second `language` field. The settings migration must preserve
unrelated settings and must treat an absent/invalid locale as an unset value,
not as a corrupted settings file.

Default selection follows this order:

1. Explicitly saved Worker App locale.
2. Supported OS/browser locale, normalized from `th-*` or `en-*`.
3. English fallback.

Changing the locale updates the React tree immediately and persists the choice.
No reconnect, runtime restart, or Worker restart is required.

Locale persistence uses the existing settings write boundary with an atomic
temporary-file replacement (or an equivalent crash-safe mechanism). If the
write fails, the UI reports a localized error and retains the last durable
locale/settings value; it must not claim persistence or overwrite unrelated
settings. Series titles, descriptions, and other user-authored content are
data, not translation keys, and are displayed unchanged.

The route registry stores translation keys (or resolves labels through the
catalog at render time); it must not remain a second source of localized
labels. The locale switch is available from Settings and from a compact
topbar control, with the same persisted value and no separate per-screen
language state.

The Sidebar remains usable with keyboard navigation and at narrow widths: it
has a visible current-route state, an accessible name, focus styles, and a
collapsible presentation that does not introduce another horizontal action
bar. Content must remain usable without hover, and destructive actions require
an explicit confirmation in the active locale.

### Catalog rules

- Every user-visible string in React must use a translation key.
- Every Tauri error/status code shown to a user must map to a localized key.
- Server responses carry stable codes and structured fields, never UI-localized
  prose.
- Dates, times, numbers, byte sizes, durations, and counts use `Intl` with the
  active locale.
- Workflow IDs, Series IDs, file extensions, checksums, and technical command
  names remain unchanged; their surrounding labels are translated.
- Native picker titles and confirmation text are passed in the active locale
  where the OS dialog API permits it.
- Missing keys fail visibly in development and fall back to English in a
  packaged build; locale key parity is tested in CI.

### Required translation domains

The catalog must cover, at minimum:

- Sidebar and topbar
- Connection/pairing/reconnect
- Series search, active/deleted/empty/access states
- Series detail and local-folder binding
- Browse, create folder, validate, initialize, bind, unbind
- Media stages: Intake, Inventory, AI Plan, Review, QC, Processing, Published
- Dead-air, 9:16, focus tracking, still motion, duration, manual/automated AI
- Queue states and pause/resume/cancel/retry
- Workflow capability and schema errors
- Runtime, ComfyUI, Hermes, update, and diagnostics states
- Permission/authorization/reconnect-required errors
- Destructive-action confirmations and accessibility labels

## Series workspace UX

### List and selection

The left side of Series workspace shows a searchable, paginated list returned by
the server. The list must:

- Apply the same active-Series predicate as the web app at the server query
  boundary. In the current schema, `archiveSeries` is a soft delete implemented
  by `status = 'archived'`, so the default Worker request must exclude
  archived rows in SQL (`status <> 'archived'`) before projection. The current
  `vertical_drama_series` table has no `deletedAt`; if a future additive
  deletion marker is introduced, the shared predicate must also require
  `deletedAt IS NULL`. A client-side filter is never sufficient.
- Match the web app's tenant/user/team access behavior.
- Show title, Series ID, active status, access mode, and binding summary.
- Preserve stable selection when refreshing if the selected Series still exists.
- Clear selection and explain why when the Series becomes inaccessible or is
  deleted while the app is open.
- Never silently substitute another Series after a selected Series disappears.

Archived Series may be shown only when the web app explicitly requests its
archived/history view; they are not part of the default Worker workspace.
Deleted/archived Series must never reappear from a Worker cache. The server
list, detail, queue projection, and every Series-scoped action must apply the
same visibility rule.

### Selected Series detail

Selecting a Series loads a detail projection and displays:

- Title and Series ID
- Status and access mode
- Safe description/summary fields available from the server projection
- Last updated time
- Binding status and binding revision
- Local workspace status, if a local binding exists
- Counts such as local files, supported files, processed assets, and published
  assets when available
- Capability hints such as whether the user can bind, scan, process, and
  publish

The detail panel must clearly distinguish:

- `Not selected`
- `Selected but no local folder`
- `Folder selected and validated locally`
- `Bound and ready`
- `Binding stale/revoked`
- `Folder missing or changed`

The detail projection must be safe and intentionally bounded: title, status,
summary, timestamps, counts, binding state, and capability hints are allowed;
raw scripts, local filenames, absolute paths, tokens, and unbounded media
payloads are not.

### One folder per Series

The Worker App supports one active local root per Series per Worker machine.
Selecting another Series changes the active context but does not discard other
Series bindings stored locally. The UI shows the selected Series' binding only.

The local binding record contains at least:

```text
seriesId
rootId
canonicalPath              # native-only, never sent to server
rootFingerprint             # opaque, device-keyed
workspaceMode
createdAt
updatedAt
lastValidatedAt
status
```

The server binding record contains only safe fields:

```text
seriesId
workerId
rootId
rootFingerprint
workspaceMode
bindingRevision
status
lastValidatedAt
```

### Native folder picker

The Browse button invokes the Tauri native directory picker with
`directory: true`, `multiple: false`. The selected path is placed into native
state and displayed locally. A user may still paste a path only as a fallback,
but the primary and documented path is Browse; validation must be identical for
both paths.

Validation requirements:

- Absolute path only.
- Existing directory only for “Use existing folder”.
- Reject symlink roots and path traversal.
- Canonicalize before storing or using.
- Reject hidden/system roots according to the existing platform-safe policy.
- Verify the user can read/write the folder before binding.
- Prevent selecting the root of an unrelated protected system directory.
- Return stable error codes, translated by the UI.

### New folder

The New folder action opens a native parent-folder picker followed by a simple
folder-name input/confirmation. It then:

1. Validates the parent directory locally.
2. Validates the child name against platform rules, reserved names, length, and
   traversal characters.
3. Creates exactly one child directory with exclusive-safe behavior.
4. Re-validates/canonicalizes the resulting directory.
5. Offers the created directory as the selected Series root.

Creating a folder is not deletion or overwrite. If the name already exists,
the UI reports a conflict and does not merge or replace contents. The feature
must not create a folder from a server-supplied absolute path.

### Workspace initialization

After the user chooses a root and before binding, the Worker offers
“Initialize Series workspace”. Initialization creates only missing child
directories:

```text
<series-root>/incoming/
<series-root>/derived/
<series-root>/derived/.checkpoints/
```

Existing files and directories are preserved. Initialization is idempotent and
must reject symlinks or incompatible existing objects at each path. The UI
shows which directories were created and which already existed.

Binding requires a successful local validation/initialization result, the
Series `operate` access mode, a current server binding revision, and an
idempotency key. Unbinding revokes only the server binding and local pointer;
it never deletes footage, derived assets, or workspace directories.

## Media workspace UX

Media workspace is the only screen for media operations. It uses a stage model
with one active Series context:

```text
Intake → Inventory → AI Plan → Review → QC → Processing → Published
```

The screen must show only controls relevant to the current stage. For example,
workflow selection and GPU readiness appear when a GPU/MCP processing plan is
selected, not as permanent global controls.

The existing manual-intent and automated-AI-editing modes remain available.
The UI must preserve the distinction between:

- User-confirmed intent
- AI-proposed plan
- Server-admitted job
- Worker-local execution
- Verified/published result

Media workspace must display the selected Series title/ID and binding status in
its context header. If no folder is bound, scan/process controls are disabled
with a localized explanation and a link to Series workspace.

## Queue and runtime UX

### Queue

Queue owns job progress and job actions. It supports filters for all, queued,
running, needs review, failed, completed, and canceled. It retains the current
idempotent pause/resume/cancel/retry rules. Job details show Series, job type,
workflow when applicable, status, progress, timestamps, and safe failure code.

### Runtime & agents

Runtime & agents owns:

- Worker runtime readiness and update state
- GPU/ComfyUI readiness and advertised capabilities
- Hermes runtime status and provider lane health
- Diagnostics and logs location

It must not duplicate Queue job status or Series media controls. Runtime
messages must explicitly distinguish “runtime unavailable” from “server
connection unavailable”.

### Connection and effective permissions

Connection is the read-only authority view for the current Worker identity.
When connected, it must display the worker label/ID, machine label, runtime
kind (including the actual Hermes lane when Hermes is installed), connection
and heartbeat timestamps, and the effective server-issued permission scopes.
Scopes are grouped into human-readable capabilities such as Series discovery,
binding, scan, process, publish, queue control, diagnostics, and workflow
execution. Each capability shows `Allowed`, `Not granted`, `Temporarily
blocked`, or `Reconnect required`, together with the stable reason code where
applicable.

The Worker App cannot grant itself a scope. A capability can become usable
only after the server issues the scope and the Worker refreshes its connection
session. The UI provides a link/instruction to the server's Worker access
management surface for granting or revoking scopes. After a revocation, the
Worker must stop admitting new actions that require that scope, cancel or
quarantine only work that cannot safely continue, refresh its effective
capabilities, and show the changed state without requiring a reinstall. The
permission view must not be duplicated in Runtime, Queue, or Series screens;
those screens consume the same capability snapshot and only show contextual
disabled reasons.

## Server contracts

### Series list

The existing Worker Series endpoint remains the control-plane transport. Its
contract must guarantee:

- Tenant/user/team authorization is applied before projection.
- The default list uses the canonical web active-Series predicate at the
  database query boundary: today this is `status <> 'archived'` because the
  Series table's soft-delete operation is `archiveSeries`; if a nullable
  `deletedAt` marker is added later, the predicate becomes
  `status <> 'archived' AND deletedAt IS NULL`. This predicate must be shared
  or contract-tested against the web list so the Worker cannot return rows the
  web app hides. It must never be implemented only in the client.
- Pagination cursor and query filtering are stable.
- Response contains safe summary fields and binding summary.
- No local absolute path is present.

### Series detail

Add or extend a Worker-safe detail endpoint only if the existing projection
cannot provide the selected-Series fields. It must be tenant-scoped, worker-
scoped, permission-checked, and return the same not-found shape for missing,
deleted, and inaccessible Series. It must include the current binding summary
but never the local path.

### Binding refresh

After bind, unbind, server refresh, reconnect, or a binding conflict, the
Worker reloads the Series detail and replaces stale local server projections.
Revision mismatches fail with a stable stale-binding error and do not overwrite
newer server state.

### Effective capability contract

The connection bootstrap/heartbeat response used by the Worker must expose a
server-issued, versioned capability snapshot containing at least the granted
scope names, capability state, authority revision, and refreshed-at time. The
snapshot is safe metadata only and must not contain access tokens. The Worker
stores it in memory for immediate UI gating and refreshes it after reconnect,
heartbeat authority changes, a `WORKER_PERMISSION_DENIED` response, or an
explicit refresh. The server remains the enforcement point for every action;
the snapshot is never treated as authorization by itself.

## Native commands and boundary

Command names may follow the existing `worker_app_*` convention; the exact
names are implementation details, but the final contract must provide:

- list/get local Series binding records
- choose/validate an existing local folder
- choose a native parent folder
- create one validated child folder
- initialize a Series workspace
- set/remove the selected local Series context

All commands must be registered in Tauri capabilities and tested through the
same command boundary used by the UI. The webview must not use Node filesystem
access, shell commands, or server-side path validation as a substitute for the
native boundary. The packaged capability manifest must explicitly allow the
directory-picker operations required by the supported OSes and no broader
arbitrary shell/filesystem capability. A canceled native dialog is a normal
user outcome (no error toast and no state mutation); an OS permission failure
is a stable localized error.

## Implementation impact map

The implementation plan must begin with an impact scan and then cover these
existing surfaces:

| Area | Existing surface | Required change |
| --- | --- | --- |
| Shell/navigation | `src/app/WorkerAppShell.tsx`, `src/app/workerRoutes.ts`, `src/app/QuickActionsBar.tsx`, `src/app/WorkerTopbar.tsx` | Canonical eight-screen registry, alias redirects, no Quick Actions render, translated topbar and locale switch |
| Screen composition | `src/main.tsx`, `src/screens/CanonicalWorkerRouteScreen.tsx`, `src/SeriesWorkspacePanel.tsx`, `src/screens/WorkerBindingScreen.tsx` | Route-to-screen ownership, merge Series/Binding, move media stages, remove placeholder/duplicate screen paths |
| Localization | `src/main.tsx`, all `src/**/*.tsx`, new locale module/catalog, `src-tauri/src/settings.rs`, `src-tauri/src/commands.rs` | Persist `locale`, runtime switch, translated errors/statuses, locale-aware formatting, migration |
| Local filesystem | `src-tauri/src/series_workspace.rs`, `src-tauri/src/commands.rs`, Tauri dialog capability | Per-Series state, native picker, safe child-folder creation, initialization, atomic migration |
| Server Series contract | `server/routes/workerSeriesControlPlane.ts`, shared Worker projection types, route tests | Shared active-Series predicate (`status <> archived` today; `deletedAt IS NULL` when available) on list/detail/queue/action lookups, selected-Series detail, safe binding summary, stable error codes, effective capability snapshot |
| Worker tests | `src-tauri/src/*` unit/integration tests and existing Worker React tests | Cross-platform path/state tests, route/locale/UI state tests, no-duplicate navigation proof |

The plan must identify the final owner of every moved component and remove or
deprecate unused imports/files. It must not leave `QuickActionsBar` or the old
Binding/Series duplicate as a second active implementation.

## Local-state migration

The current Worker stores a single persisted root in
`series-workspace-root.json`. Migrate additively to a versioned per-Series
store, for example `series-workspace-bindings.v2.json`:

1. Read the old file if present.
2. Validate and canonicalize its path using the native validator.
3. Copy it into the new map under its stored `seriesId` only if valid.
4. Preserve the old file as a compatibility backup until the new state is
   durably written and reload-verified.
5. Never delete or move user footage as part of migration.
6. If migration fails, keep the old state readable and show a localized repair
   action.

The migration must be idempotent and safe across an interrupted write. Use
atomic temporary-file replacement and a version marker. A missing/invalid
legacy root does not block the app from opening or selecting another Series.

## Security and privacy

- Enforce tenant, owner/team sharing, Series access mode, binding revision, and
  worker permission scopes on the server as before.
- Treat all Series IDs, titles, folder names, and server fields as untrusted
  input at the native boundary.
- Do not expose absolute local paths in telemetry, server responses, error
  reports, screenshots, or audit metadata.
- Do not accept a server path as an instruction to read or create local files.
- Reject symlinks, traversal, reserved device names, and path escapes on both
  Windows and macOS.
- Use confirmation for bind, unbind, and folder creation; unbind is reversible
  for metadata but never destructive to files.
- Keep source footage local until the existing derived-output publication path
  passes QC and ownership checks.
- Locale content must not interpolate raw secrets, tokens, refresh tokens, or
  unsanitized provider errors.
- Permission/capability labels are derived from the server-issued capability
  snapshot; they are not editable client claims. A disabled button is only a
  UX guard and every server/native command must enforce the same scope again.

## Failure behavior

| Failure | Required behavior |
| --- | --- |
| Server unavailable | Keep local UI open, show stale-data warning, disable server-dependent actions |
| Series deleted/inaccessible after selection | Clear selection, discard only the view state, explain and refresh |
| Folder missing/moved | Show local validation failure; do not silently bind another folder |
| Folder permission denied | Show localized repair guidance; do not elevate privileges automatically |
| New-folder name conflict | Keep parent selection, ask for a new name, do not overwrite |
| Symlink/path escape | Reject before any file operation |
| Binding revision conflict | Reload server detail and require explicit retry |
| Worker scope revoked while app is open | Refresh capability snapshot, block new actions requiring the revoked scope, preserve safe read-only state, and show reconnect/manage-access guidance |
| Old local-state migration failure | Preserve old data, show repair path, allow new selection |
| Missing translation key | English fallback in production; test failure in CI |
| Native command unavailable | Disable the affected action and show runtime/permission diagnosis |

## Acceptance criteria

### Localization

- [ ] User can select Thai or English from Settings.
- [ ] The choice persists across restart.
- [ ] All Worker screens, empty states, errors, confirmations, statuses, and
      accessibility labels switch language without restart.
- [ ] No user-visible hardcoded Thai/English mixture remains in the supported
      surfaces.
- [ ] Locale key parity and fallback behavior are tested.
- [ ] The connected Worker displays its server-issued effective capabilities,
      including allowed and not-granted scopes, without displaying credentials.
- [ ] Revoking a scope on the server is reflected in the Worker capability
      view and blocks newly attempted actions requiring that scope.

### Navigation simplification

- [ ] Quick Actions bar is not rendered.
- [ ] Sidebar is the only primary navigation surface.
- [ ] Binding, AI Plan, Published, Video render, and Hermes legacy routes land
      in their canonical consolidated screens.
- [ ] No duplicate screen implementation remains for an alias route.
- [ ] Topbar contains context/status only.

### Folder and Series workflow

- [ ] Windows and macOS can browse and select a local folder through the native
      directory picker.
- [ ] Windows and macOS can create one new child folder from the Worker UI.
- [ ] One local binding can be maintained per Series on one Worker machine.
- [ ] Workspace directories are initialized idempotently without deleting or
      overwriting existing files.
- [ ] The local absolute path never crosses the server boundary.
- [ ] Selecting a Series shows its safe detail and current local/server binding
      state.
- [ ] Deleted Series never appear, including after refresh/cache transitions.
- [ ] Archived Series are excluded by the default server query and cannot be
      reintroduced by client filtering or cache state.

### Media and execution continuity

- [ ] Media actions remain accessible from Media workspace with the selected
      Series context.
- [ ] Existing manual and automated AI editing modes remain available.
- [ ] Queue, permission, binding, workflow, QC, publication, and MCP execution
      behavior remains backward compatible.
- [ ] ComfyUI MCP is still the local GPU workflow transport; the Worker ↔
      SmartAIHub control plane remains REST.

## Test strategy

### React/UI tests

- Locale switching and persistence
- Translation key parity and missing-key fallback
- Sidebar canonical routes and alias routing
- Quick Actions absence
- Series selection, refresh, deleted/inaccessible selection, and detail states
- Folder picker/new-folder command invocation and disabled/error states
- Bound/unbound/stale/missing local workspace states
- Media stage visibility and selected-Series context
- Responsive Sidebar behavior without a second horizontal action bar

### Rust/native tests

- Windows path normalization, reserved names, traversal, symlink, and root
  validation
- macOS path normalization, symlink, permission, and root validation
- Child-folder creation conflict and atomicity
- Workspace initialization idempotency and object-type conflicts
- Per-Series local state read/write, interruption recovery, and v1 migration
- Native command registration and structured error codes

### Contract/integration tests

- Server list excludes archived (the current soft-deleted state) at query
  boundary and covers the future `deletedAt IS NULL` predicate contract
- Series detail returns not-found for missing/archived/deleted/inaccessible
  Series
- Binding revision conflict and idempotency behavior
- Local root fields never appear in server projections or logs
- Existing worker permission and REST control-plane routes continue to work
- Existing local ComfyUI MCP workflow path remains unchanged

### Browser and packaged proof

- Run the Worker App UI at narrow, medium, and wide viewports.
- Run a packaged Windows build for native folder picker/new-folder proof.
- Run a packaged macOS build for native folder picker/new-folder proof.
- Verify one complete flow: select active Series → create/select folder →
  initialize → bind → scan → review → process → publish.
- Report browser/package/real ComfyUI/GPU/R2/vector checks separately when the
  environment does not provide them; unit tests alone do not claim packaged or
  production proof.

## Rollout and compatibility

1. Add locale/state contracts and tests.
2. Add canonical route registry and render consolidation while keeping aliases.
3. Add native folder commands and local-state migration behind a feature flag
   if required by the packaging pipeline.
4. Add server list/detail projection guarantees and contract tests.
5. Switch Series workspace to the new list/detail/binding flow.
6. Remove Quick Actions rendering after canonical screen actions are verified.
7. Run Windows/macOS packaged acceptance and release through the existing
   dashboard process.

No database destructive migration is required for the local binding-state
change. Any server projection adjustment must be additive and preserve old
clients. Existing server bindings and media assets must remain untouched.

## Audit record: five review rounds

### Round 1 — requirements coverage

Checked all six requested outcomes: language parity, Quick Actions removal,
native browse/new folder, deleted-Series filtering/detail, page deduplication,
and additional gap discovery. Added explicit acceptance criteria and kept the
one-folder-per-Series decision.

### Round 2 — architecture and ownership

Checked server versus native authority. Added safe Series list/detail
contracts, local-only absolute path rules, per-Series state model, REST/MCP
boundary preservation, and revision/idempotency requirements.

### Round 3 — cross-platform filesystem safety

Checked Windows/macOS picker, reserved names, symlinks, traversal, permissions,
atomic folder creation, initialization, and interrupted local-state migration.
Added explicit non-destructive behavior and native test requirements.

### Round 4 — UX and information architecture

Checked duplicate routes and action discoverability. Consolidated Binding,
AI Plan, Published, Video render, and Hermes into canonical owners while
retaining aliases. Removed the top action bar from the target shell and added
stage/context rules for Media workspace.

### Round 5 — failure, security, rollout, and proof

Checked stale/deleted Series, server outage, binding conflict, missing folder,
translation failure, permission errors, local path leakage, migration safety,
and the difference between tests and packaged/production proof. Added failure
matrix, security requirements, rollout order, and separate packaged proof.

## Implementation handoff

This document is the feature contract for a future implementation plan. The
implementation plan must identify exact files/symbols after a fresh codebase
impact scan, preserve unrelated dirty work, and include TDD tasks before code
changes. Do not treat this specification as proof that the packaged Windows or
macOS app has already been updated.
