# Section 09 — Canonical execution, events, traces, outputs, and artifacts

## Goal

Turn the validated graph into a real durable run whose status and evidence can
be rendered by the UI and recovered after refresh/restart.

## Owned paths

- `apps/web/server/services/workflowStudioRuntime.ts`
- `apps/web/server/services/workflowStudioJobExecutor.ts`
- `apps/web/server/services/workflowStudioRunProjection.ts`
- runtime procedure regions in `apps/web/server/routers/workflowStudio.ts`
- focused runtime/router tests.

## Node coverage

`result-view`, `output-mapper`, `trace-event`, `log`, `metric`, and `run-status`.
These are executable/declared catalog nodes with their own config, ports,
validation, output/evidence projection, and tests; they are not placeholders for
the debug panel tabs.

Cross-spec execution also covers `economic-quote`, `budget-guard`,
`economic-reserve`, `economic-authorization`, `economic-capture`,
`economic-release`, `economic-status`, and `settlement-report`. These nodes
call the Spec 207 Economic Control Plane and link immutable economic facts to
workflow/run/attempt/effect/artifact IDs; they never receive raw wallet
credentials or create a finance-owned queue/ledger. The execution envelope
also carries Spec 204 runtime profile, Spec 205 Runner, Spec 206 A2A, Spec 208
browser, Spec 210 Orca, and Spec 211 ACP/Gas City resolution snapshots.

## Execution plan

Build a registry-aware plan containing definition/version/content hash, registry
and adapter snapshots, stable workflow step IDs, typed resolved inputs,
dependencies, selected branch routes, retry/timeout policy, capability
requirements, execution route/protocol/runtime/workspace/resource/approval/
economic/verification policy, and idempotency. Validate again at admission to
protect against stale drafts or provider changes. Persist resolved Agent Card,
Runner/profile, browser target/evidence, external-session and economic
references as redacted run metadata; never as authored node authority.

Admit parent and step work through `jobControlPlaneGateway` and the existing
`worker_jobs` plus outbox control plane. Use reporter heartbeat/progress,
external wait, completion, failure, and active-lease checks. Never create a
second workflow queue or call retired systems.

## Projection and evidence

Project ordered idempotent events for run and node state: admitted, queued,
running, waiting approval/input, retrying, completed, partial, failed,
canceled, resumed, and published output. Include node ID, attempt, timing,
selected route, redacted inputs summary, output preview, error class, provider,
usage/cost, and correlation IDs.

Persist large outputs as authorized artifact references. Store output schemas,
preview metadata, MIME/size, retention, and download/preview permission rather
than binary data in run JSON. Trace/log/metric records must be tenant-scoped and
redact secrets.

## Procedures and controls

Implement/reconcile `run`, `getRun`, and `controlRun` for full/run-node/
run-from/run-until/run-subflow, retry failed step, approve/reject, cancel,
pause/wait, and resume. Mutations must be idempotent and race-safe; resume must
check checkpoint digest/version/content hash.

## TDD-first checks

- Plan contains stable step IDs, adapter snapshots, typed inputs, selected routes,
  and idempotency.
- Parent/step jobs/outbox intents are created once and linked to the run.
- Event sequences are ordered/idempotent and project all lifecycle states.
- Output/preview/artifact/trace/log/cost/error data is persisted and authorized.
- Retry/cancel/approve/reject/resume handle duplicate and concurrent requests.
- Cross-spec tests prove canonical worker linkage, no duplicate A2A/external
  dispatch after ambiguous outcomes, economic reserve/capture/release linkage,
  runtime resource evidence, browser action finality/takeover, and external
  session/fleet child lineage.

## Exit criteria

The run/debug UI can be built entirely from persisted run projections and real
worker events; a page reload does not lose state or manufacture completion.

## UI/UX Contract

### Target User / JTBD

N/A for direct UI; this section provides durable projections consumed by the run dock.

### Existing Pattern Reference

Reuse existing run monitor/progress/review/artifact patterns; rendering is owned by section 10.

### Surface Inventory

N/A — server runtime/projection only.

### Component Map

N/A — section 10 owns the run/debug components.

### State Matrix

All lifecycle states are persisted here and must be renderable by section 10: admitted, queued, running, waiting, retrying, completed, partial, failed, canceled, resumed.

### Responsive Matrix

N/A — section 10 owns dock/sheet behavior.

### Accessibility Acceptance

N/A — section 10 verifies live status, tabs, and controls.

### Copy Contract

Emit localized event/error keys and safe redacted summaries.

### Browser Evidence Required

N/A for direct browser behavior; section 12 validates run projection through Playwright.
