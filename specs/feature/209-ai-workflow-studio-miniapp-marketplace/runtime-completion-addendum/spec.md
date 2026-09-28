# Spec 209 runtime-completion addendum

## Purpose

Complete the missing runtime and product flows for Spec 209 without creating a
second workflow queue or execution authority. This addendum extends the
existing Spec 209 contract and keeps the attached builder, subflow and Run
mockups as the UI source of truth.

## Authority boundaries

- Feature 195 owns durable Job, attempt, lease, retry, outbox, event and final
  execution state.
- Spec 207 owns quote, authorization, reservation, capture, release,
  settlement and reconciliation facts.
- Spec 210/200/206 own external Runner/provider selection and authenticated
  capability execution.
- Spec 209 owns workflow definition/versioning, Mini App packaging,
  dependency/readiness presentation, run intent normalization and workflow
  projections.
- The retired `/workflows` engine, Agency/workpacks and OpenSandbox must not be
  used or reintroduced.
- Retired systems must not be used or reintroduced.

## Completion goals

1. Library and Marketplace can load, filter, inspect, preflight and select a
   workflow/Mini App with server-authoritative access and readiness.
2. A saved Workflow Version can produce a canonical Feature 195 Job plan and
   create a durable workflow run without client-side execution authority.
3. Marketplace invocation rechecks entitlement, dependency readiness, version
   immutability, budget and economic policy at run time.
4. Full, partial, run-from and run-until modes use checkpoints and the same
   canonical Job/run contracts.
5. Human approval, retry, cancel and resume are durable, idempotent and
   recoverable across browser refresh or disconnect.
6. Outputs, artifacts and previews are schema-driven, tenant-safe and served
   only from authorized durable references.
7. Trace, logs and events are reconstructible from canonical Job events and
   distinguish transport acknowledgement from effect completion.

## Required behavior

### Library and Marketplace

- Add authenticated Library list/detail/open actions for drafts, versions,
  pinned/recent workflows and run history projections.
- Add public Marketplace browse/detail/filter/search with published-only
  visibility, immutable version identity, tags, dependency manifest,
  readiness state, entitlement state and creator/pricing disclosure.
- Add server-authoritative `get`, `dependencyCheck`, `entitlement` and
  `invoke` contracts. The UI must render loading, empty, degraded, denied,
  unavailable and retryable-error states.
- `libraryList`/`libraryGet` are tenant-protected; Marketplace detail may be
  public only for published package metadata. `dependencyCheck` and
  `entitlement` return decision revision/reason codes, and `invoke` accepts
  only an exact version plus server-validated run intent.
- Opening a card must load the exact Workflow Version; it must not infer
  runtime behavior from a client card or slug alone.

### Real workflow run

- Add a protected run-intent mutation that resolves tenant, actor, exact
  Workflow Version, input schema, dependency snapshot, policy decision and
  idempotency key on the server.
- Compile the version into an approved Feature 195-compatible plan and submit
  it through the canonical orchestration/job gateway.
- Every compiled step must resolve to a registered `jobType` and contract
  version. The durable path is outbox → canonical job envelope → unified
  consumer → registered executor → approved Runner/provider adapter; a Job
  admitted without a registered worker execution path is not runnable.
- Persist a workflow-run projection keyed to canonical Job/attempt IDs; do not
  create a competing queue, lease, retry or finality table.
- Return an authoritative run reference and status projection. The UI must
  never report running/completed from local state alone.

### Partial and checkpoint runs

- Support `full`, `run_until`, `run_from`, `run_node` and `run_subflow` using
  immutable checkpoint snapshots tied to the exact Workflow Version and input
  fingerprint.
- Validate checkpoint freshness, dependency completion, node eligibility,
  tenant access and stale-run fencing before creating Jobs.
- Default resume must reuse valid upstream results and must not rerun them
  unless explicitly overridden by policy.

### Human approval, retry, cancel and resume

- Model approval/user-input waits as canonical run projections over Feature 195
  state, with actor/tenant/expiry/idempotency checks.
- Retry only retryable failures and create a new canonical attempt; preserve
  the failed attempt and its evidence.
- Cancel through the canonical Job control plane. If finality is unknown, show
  cancellation-pending rather than success or failure.
- Resume after refresh/reconnect from durable run/checkpoint state and reject
  stale commands using run revision/fencing tokens.

### Output, Artifact and Preview

- Define output schemas per Workflow Version and render result UI from schema,
  not from arbitrary client fields.
- Persist artifact metadata and authorized managed storage references through
  the existing artifact publication path; never expose raw provider URLs or
  cross-tenant keys.
- Support pending, partial, ready, expired, failed and recovery-required
  artifact states. Preview must be derived from an authorized artifact or an
  explicit unavailable state.

### Trace, Logs and Events

- Project canonical Job/attempt/event records into workflow-friendly trace,
  logs and activity views without duplicating execution truth.
- Rebuild projections from a durable cursor and quarantine unknown event types;
  do not silently discard events needed for audit or reconciliation.
- Preserve event sequence, run revision, node ID, attempt ID, actor, provider,
  cost/economic reference and redacted payload metadata.
- Handle duplicate, stale, out-of-order and unknown events idempotently.
- Separate admitted/acknowledged, started, effect-verified, completed,
  failed, canceled and reconciliation-required states.

## UI contract

- Keep the supplied mockup hierarchy: Dashboard → Builder → Subflow/Binding →
  Run/Mini App, with Library/Marketplace using the same SmartAIHub shell.
- The Builder must be a real editor, not a static mock: nodes can be selected,
  dragged, added, duplicated, deleted and keyboard-nudged; edges can be created,
  selected, validated, relinked and deleted; and every selected node exposes an
  editable, schema-driven Properties inspector.
- Every visible CTA must either execute a real client/server command with a
  pending/success/error state or be disabled with an explicit capability reason.
  No enabled button may be a no-op, show a setup notice in place of its command,
  or claim readiness without persisted state.
- Draft graph edits must persist through a tenant-authorized save/update
  contract with revision conflict handling. Reloading, switching Builder/
  Subflow, opening Library/Marketplace and returning to Run must preserve the
  exact graph/version state.
- Builder and Run surfaces must show server-derived loading, blocked, approval,
  retry, running, partial, success, failed and recovery states.
- Desktop: canvas + inspector + drawer; tablet: inspector/drawer sheet or
  stacked layout; mobile: single-column flow with persistent access to status,
  approval and recovery actions.
- All actions need keyboard focus, accessible labels, live status announcements,
  disabled/blocked reasons, Thai/English keys and reduced-motion-safe states.

## Non-functional and security requirements

- Tenant, actor, entitlement, dependency and economic authority are derived on
  the server for every read and mutation.
- Every mutation is idempotent and has bounded retry behavior.
- Published Workflow Versions and Marketplace package identities are immutable.
- No raw secrets, provider URLs, arbitrary marketplace JavaScript or direct CLI
  execution may cross the Spec 209 boundary.
- Add focused unit/router/service tests, migration tests, contract tests,
  browser tests at 390x844/768x1024/1440x900, and release evidence for real
  Job/Runner/provider/economic integration.
- Roll out schema and runtime changes additively behind a feature flag with
  canary enablement, active-run drain/rollback rules and an explicit expand /
  migrate / contract step; no destructive rollback may strand a live run.

## Delivery order

1. Canonical contracts, run projection, event/checkpoint schemas and migration.
2. Library/Marketplace detail, dependency and entitlement APIs.
3. Real run-intent → compiler → Feature 195 Job handoff.
4. Checkpoint and partial-run modes.
5. Approval/retry/cancel/resume lifecycle.
6. Artifact/output/preview publication and recovery.
7. Trace/log/activity projections and complete UI state matrix.
8. Economics integration, browser proof, failure/recovery drills and release
   gate.
