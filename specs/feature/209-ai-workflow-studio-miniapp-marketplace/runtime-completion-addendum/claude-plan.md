# Spec 209 runtime completion implementation plan

## Outcome

Deliver a production-capable, governed Workflow Studio/Mini App runtime that
uses the existing Feature 195 Job control plane and Feature 207 economic plane.
The implementation will allow an authorized user to select an exact Workflow
Version, preflight access/dependencies/cost, submit a durable run, observe and
control it, recover from checkpoints, and inspect authorized outputs/artifacts.

The plan deliberately separates repository implementation from release proof:
the feature is not complete until the real Job executor, Runner/provider,
artifact and economic integration gates produce evidence in an environment that
supports them.

## Non-negotiable boundaries

- Do not add a workflow-specific queue, lease, retry, event, settlement or
  finality authority.
- Do not invoke providers, CLI tools, Agency, workpacks, OpenSandbox or the
  retired `/workflows` engine from the Web client or a new workflow service.
- Do not accept tenant, actor, worker, provider, cost, entitlement or Job IDs
  from the client as authorization facts.
- Do not mutate published Workflow Versions or make a public Marketplace card
  runnable without a server-side entitlement/dependency/economic check.
- Keep the attached 209 mockups as the visual source of truth.
- Retired systems must not be used or reintroduced: `/workflows`, Agency,
  workpacks and OpenSandbox remain out of scope.

## Dependency graph and delivery order

```text
01 foundation/run projection/schema
   └── 02 Library + Marketplace readiness/entitlement
          └── 03 compiler → canonical Job admission
                 ├── 04 modes + checkpoints
                 │      └── 05 approval/retry/cancel/resume
                 └── 06 output/artifact + trace/log/event projections
                        └── 07 UI state integration
                               └── 08 economics + release evidence
```

Section 02 starts after Section 01. Section 03 is the critical path. Sections
04 and 05 must not be implemented against a client-only run state. Section 06
can begin after Sections 01 and 03 contracts are stable. Section 06 lifecycle
integration completes after Section 05. Section 07 follows the server
contracts so the UI can render authoritative states rather than simulate them.
Section 06 lifecycle integration completes after Section 05.

## Section 01 — Durable workflow-run foundation and contracts

### Goal

Create the minimum durable Spec 209 projection that links a Workflow Version,
run intent, canonical Job/attempt IDs, checkpoint identity and input/economic
correlation without duplicating Feature 195 lifecycle truth.

### Implementation

- Add typed contracts for `WorkflowRun`, `WorkflowRunIntent`, `RunMode`,
  `WorkflowCheckpoint`, `DependencySnapshot`, `RunEntitlementDecision` and
  `WorkflowEventProjection`.
- Add additive Drizzle migration/schema for workflow run projection,
  checkpoint records, dependency/readiness snapshots and invocation/entitlement
  facts. Each record must carry tenant scope, exact definition/version identity,
  input fingerprint, idempotency key and revision/fencing information.
- Add foreign/key indexes for tenant+created time, canonical Job ID, version,
  status/revision and idempotency. Do not duplicate canonical Job status or
  attempt rows; store references and workflow-specific projection metadata.
- Add a repository/service boundary with transaction-safe create/replay,
  version/tenant checks and projection updates from canonical Job events.
- Define safe serialization/redaction for input, dependency, error and event
  payloads. Provider secrets and raw URLs must never be stored in projection
  responses.

### API contract

The foundation exposes internal service contracts, not public UI behavior yet:

- create/replay workflow run intent by tenant + idempotency key;
- get run projection by tenant + run ID;
- get checkpoint/readiness/event projection by authorized run/version;
- apply a canonical Job event idempotently using run revision and event key.

### TDD-first tests

- Migration and runtime-schema parity tests.
- Tenant isolation, exact version binding and idempotent replay tests.
- Reject stale version, mismatched input fingerprint, duplicate event and
  cross-tenant Job reference.
- Redaction tests for provider references, secrets and raw storage URLs.

### Acceptance

No run can exist without exact Workflow Version, authenticated tenant/actor,
idempotency key and canonical Job correlation. A workflow projection cannot
change canonical Job terminal state.

## Section 02 — Library, Marketplace, dependency and entitlement flow

### Goal

Make Library/Marketplace useful beyond listing: exact-version inspection,
readiness/dependency disclosure, entitlement decisions and a safe invoke
preflight.

### Implementation

- Extend `workflowStudio` router with protected Library detail/open and run
  history projections, plus public Marketplace detail/search/filter endpoints
  that return only published immutable versions.
- Add server-side dependency manifest normalization and readiness evaluation.
  The result must include a stable snapshot revision, reason codes, missing
  capability/setup instructions and whether the package is runnable now.
- Define the router contract explicitly: protected `libraryList` and
  `libraryGet`, public published-only `marketplaceList`/`marketplaceGet`, and
  protected `dependencyCheck`/`entitlement`. Each response includes exact
  version identity, decision revision, reason codes and a checked-at timestamp;
  no client card field is an authorization fact.
- Add entitlement evaluation that distinguishes public visibility, tenant
  access, consumer run permission, publisher/creator rights and clone/inspect
  rights. Re-evaluate at invocation time; a cached card decision is display
  only.
- Add creator/pricing/funding disclosure fields and a preflight response that
  includes economic policy status without authorizing capture.
- Add client query hooks and detail/preflight panels. Disabled invoke/open
  actions must explain whether the cause is access, dependency, budget,
  version, review or runtime readiness.

### Reuse decision

Reuse existing Marketplace card/filter patterns from
`apps/web/client/src/components/marketplace/MarketplaceFilters.tsx` and the
existing Marketplace page. Reuse the current `WorkflowStudioPage` shell for
Library/Marketplace so mockup navigation remains stable. Diverge only for
workflow-specific exact-version, dependency, entitlement and readiness panels;
these states do not exist in the generic Marketplace surface.

### TDD-first tests

- Published-only filtering, exact version selection and tenant-safe detail.
- Entitlement matrix: public run, tenant-only, private owner, denied,
  suspended, expired and inspect-without-run.
- Dependency states: ready, missing, stale snapshot, degraded and retryable
  probe failure.
- UI query loading/empty/error/degraded/disabled and detail navigation tests.

### Acceptance

Users can understand “why it can/cannot run” before invoking. No Marketplace
card can bypass entitlement or dependency checks by calling a client route.

## Section 03 — Workflow compiler and canonical Job admission

### Goal

Convert an exact Workflow Version plus validated run intent into a
server-approved Feature 195-compatible plan and durable canonical Job(s).

### Implementation

- Replace the current preview-only compiler boundary with a durable accepted
  candidate/version compilation path. The compiler must resolve every node to a
  registered capability/job contract and return setup-required reason codes for
  unresolved nodes.
- Validate schema, typed bindings, graph cycles, secret references, capability
  snapshot revision, policy constraints, timeout/retry budget and estimated
  cost before admission.
- Build a `PlanRevision` or equivalent approved canonical gateway definition
  with deterministic per-step idempotency keys, dependency step IDs, exact
  Workflow Version hash and run mode metadata.
- Register each supported workflow Job contract with the existing
  `jobExecutorRegistry`/executor boundary before admission. A missing or
  incompatible registration must produce setup-required/readiness failure and
  must not create a Job.
- Define the worker execution adapter explicitly. Each approved PlanStep owns a
  stable `jobType`, `contractVersion`, input/output contract and provider
  capability; startup registration in `defaultJobExecutorRegistry` must map it
  to an executor. The executor is consumed through
  `unifiedJobConsumer.ts`, reports lease-safe progress/results through the
  canonical reporter, and delegates external work only to approved
  Runner/provider adapters from Specs 210/200/206. Admission without this
  worker path is rejected as setup-required.
- Submit only through `orchestration/gateway.ts` or
  `jobControlPlaneGateway.ts`. Do not call `queueWorkerJobByRuntime` directly
  for a Spec 209 run.
- Add protected `workflowStudio.run`/`invoke` mutations. They must derive
  tenant/actor from context, lock the exact version, create/replay the run
  projection transactionally with admission metadata, then return JobRefs and
  the authoritative run projection.
- Integrate the Feature 207 quote/reserve authorization before paid admission;
  failed admission releases/voids the reservation through the existing
  economic service.

### TDD-first tests

- Compile valid and invalid node graphs, missing capability, stale snapshot,
  secret/cycle/type errors and cost/budget denial.
- Verify canonical gateway invocation, dependency Job IDs, contract version,
  tenant/actor derivation and per-step idempotency.
- Replay same run intent returns the same run/JobRefs; altered input/version
  with same key is rejected.
- Verify no direct workflow queue/provider call is made.
- Verify an admitted workflow Job is consumable by the unified canonical
  envelope path and reaches the registered executor/approved provider adapter;
  an unregistered node contract is rejected before an outbox row is written.
- Verify quote/reserve failure leaves no admitted run or orphaned reservation.

### Acceptance

A valid Workflow Version can create a real canonical Job reference. An invalid,
unready, unauthorized or unaffordable workflow remains a non-runnable draft or
preflight response and cannot create runtime work.

## Section 04 — Full/partial/run-from/run-until and checkpoints

### Goal

Support all Spec 209 execution modes while preserving exact-version and
checkpoint safety.

### Implementation

- Define mode validation and node/subflow selection against the compiled graph.
- Write checkpoint metadata only after canonical Job evidence proves a node's
  output is complete and authorized. Include version hash, graph revision,
  input fingerprint, completed node set, artifact/result refs and digest.
- For `run_from`/resume, validate checkpoint tenant/version/fingerprint,
  dependency readiness and stale run revision. Reuse valid upstream outputs by
  default; explicit rerun must be policy- and user-visible.
- For `run_until`, stop at the target node with a non-terminal partial state
  that can be resumed, not a fake success.
- For node/subflow mode, compile a bounded plan that preserves parent run,
  nested scope, typed bindings and dependency Job relationships.
- Use existing canonical `recover_checkpoint` semantics where applicable and
  project workflow-friendly status without creating a second lifecycle.

### TDD-first tests

- Full, run-until, run-from, single-node and subflow plan generation.
- Checkpoint digest/version/input mismatch rejection.
- Valid upstream reuse and explicit rerun behavior.
- Stale revision, missing target, cycle and cross-tenant checkpoint denial.
- Browser refresh/resume projection tests.

### Acceptance

Partial runs are durable and resumable. A resumed run cannot silently execute a
different Workflow Version or rerun paid upstream work without an explicit
decision.

## Section 05 — Approval, retry, cancel and resume lifecycle

### Goal

Expose safe workflow-level controls over existing canonical Job lifecycle.

### Implementation

- Add durable approval/user-input wait projection with requested actor,
  allowed decision scope, expiry, input schema, run revision and idempotency.
- Add protected approve/reject/submit-input mutations that verify tenant,
  actor, state, expiry, version and revision before emitting the canonical
  continuation/rejection command.
- Define protected `approve`, `reject`, `submitInput`, `retry`, `requestCancel`
  and `resume` contracts. Every command accepts an idempotency key and expected
  run revision, returns the durable operation projection, and maps to one
  canonical Job command/event; no mutation returns an optimistic terminal
  state.
- Adapt existing retry semantics: only retry classified retryable failures,
  preserve failed attempt evidence, create a new attempt through the canonical
  control plane and project retry-scheduled/running state.
- Adapt existing cancel/request-cancel/finalize-cancel flow and expose
  cancellation-pending when finality is unknown.
- Add resume after external wait, approval and browser reconnect with stale
  command/fencing checks. Reuse the existing `resumeExternal` and checkpoint
  recovery paths where their contract matches.
- Add safe recovery/error reason codes and operator-review-required states.

### TDD-first tests

- Approval happy path, rejection, expiry, wrong actor, duplicate decision and
  stale revision.
- Retryable vs permanent failure, max attempts, idempotent retry and preserved
  attempt history.
- Cancel queued/running/waiting states, duplicate cancel and unknown finality.
- Resume external/checkpoint/approval, stale fence and reconnect replay.

### Acceptance

Every control action is durable, auditable, idempotent and constrained by the
canonical Job state. The UI never converts a pending or unknown operation into
success.

## Section 06 — Output, artifacts, preview, trace, logs and events

### Goal

Turn canonical Job outcomes into safe workflow result and observability views.

### Implementation

- Add version-bound output schema normalization and result projection. Support
  pending, partial, ready, expired, failed and recovery-required results.
- Define a durable output manifest that maps schema field → artifact/result
  reference, node ID, producing attempt, content type, checksum and safe-serving
  policy. The manifest must remain bound to the exact Workflow Version and run.
- After Job completion, validate artifact storage prefix, checksum, size and
  content type through `workerArtifactService.ts`; publish via the existing
  Library path and store only safe artifact metadata in the workflow projection.
- Add authorized artifact/preview queries with tenant, run and version checks.
  Preview must return a safe unavailable state when publication is incomplete;
  serve through the existing authorized storage/proxy path and never expose a
  raw provider URL or unrestricted storage key.
- Add event projector from `worker_job_events`/attempts/Job state to workflow
  activity, trace, logs, cost and errors. Preserve sequence/idempotency and
  redact payloads. Persist a durable projection cursor, quarantine unknown
  event types for operator review, and support bounded replay/rebuild from the
  canonical event source.
- Distinguish admitted, dispatched, started, progress, waiting approval,
  effect verified, completed, failed, cancelled and reconciliation-required.
- Add polling/realtime invalidation using existing platform mechanisms; browser
  refresh must rebuild state from durable records.

### TDD-first tests

- Output schema validation and partial/expired/failure rendering data.
- Tenant/job storage prefix, checksum, unsafe content type and duplicate
  artifact publication tests.
- Duplicate, out-of-order, stale and unknown event projection tests.
- Trace/log redaction and terminal-state mapping tests.
- Browser assertions for live activity, artifact preview, recovery and empty
  states.

### Acceptance

Users see only authorized durable results. The Debug Drawer is backed by
canonical evidence and never fabricates a receipt, cost, artifact or event.

## Section 07 — Mockup-led UI state integration

### Goal

Replace the current static mockup shell with a real interactive editor while
preserving the supplied Builder/Subflow/Run composition. The current page is
not an implementation baseline for editor behavior: it uses static node arrays,
an ordered HTML list, dashed border connectors, read-only node labels and
disabled/no-op actions. Section 07 is incomplete until those behaviors are
implemented and persisted.

### Editor interaction implementation

- Reuse the already installed `@xyflow/react` and established repository
  patterns from `KnowledgeCanvasPanel.tsx` and `ProductionFlowCanvas.tsx`; do
  not add another graph library or invent a new screen layout.
- Normalize the server Workflow Definition into `ReactFlow` nodes/edges with
  stable node IDs, persisted `{x,y}` positions, viewport, selected node/edge,
  dirty state, graph revision and exact Workflow Version identity.
- Implement node interactions: select, drag and drag-stop persistence,
  multi-select, keyboard nudge, add from the existing node palette, duplicate,
  delete with confirmation/undo, and fit/reset viewport. Dragging must update
  the graph model, not only the browser pixels.
- Implement edge interactions with typed source/target handles, visible arrow
  markers, selected-edge styling, connection preview, relink/delete and
  keyboard deletion. Reject incompatible types, self-links and cycles before
  mutating state; show the reason at the connection point.
- Implement a schema-driven Properties inspector for every node kind. Fields
  include label, capability/type, input/output ports, bindings, configuration,
  timeout/retry policy, approval policy and output mapping as applicable. Forms
  must validate locally, show server validation errors, support cancel/reset and
  persist edits through the draft save contract.
- Add explicit `saveDraft`/`updateDraft` behavior with tenant authorization,
  expected revision, conflict response and bounded debounce. Show dirty,
  saving, saved, conflict and save-error states; reload must reconstruct the
  same graph and properties.
- Map every existing visible action to a real contract: Builder/Subflow
  switch, Build/Test/Runs/Analytics/Versions tabs, Library/Marketplace search,
  card open, Publish, Run, Add note, Canvas settings, Improve with AI, drawer
  tabs, file remove and Run controls. If its backend contract is not available,
  keep it disabled with an explicit reason instead of rendering a clickable
  no-op or setup notice.
- Use clear orthogonal/bezier React Flow edges with arrowheads, contrasting
  stroke/selection states, adequate hit areas and z-index above the grid. Keep
  the mockup's top-down hierarchy, inspector and bottom drawer unchanged.
- Add stable `data-testid`/accessible names for node, edge, property field,
  save state and every action so browser tests can prove behavior rather than
  only screenshot presence.

### Interaction acceptance matrix

| Interaction | Required result | Failure behavior |
|---|---|---|
| Drag node | Position changes and persists after reload | Revert and show save/conflict reason |
| Connect nodes | Typed valid edge appears with arrow and is persisted | Reject cycle/type/self-link with inline reason |
| Select/delete edge | Edge is visibly selected and removed through a guarded command | Keep edge and show error if revision is stale |
| Edit Properties | Field changes update graph draft and validation state | Keep invalid field focused; do not save invalid graph |
| Add/duplicate/delete node | Graph and inspector update with undo/dirty state | No orphan edges or silent deletion |
| Publish | Valid draft publishes immutable version and updates status | Block with validation/readiness reasons |
| Run | Opens preflight then canonical run mutation | Never claim running from local state |
| Open Library/Marketplace card | Loads exact definition/version detail | Show authorized not-found/degraded state |
| Debug drawer tabs | Query durable output/data/trace/log/artifact/cost/error state | Show empty/loading/error, never placeholder success |

## UI/UX Contract

### Target User / JTBD

- Role: authenticated creator/operator.
- Goal: discover an exact workflow version, understand readiness/cost, run it,
  approve/recover it and inspect results without opening implementation details
  unnecessarily.
- Entry point: Dashboard → Workflow Studio.
- Success outcome: authoritative run state and safe output are understandable
  at every step, including blocked and recovery states.

### Existing Pattern Reference

- Search performed with targeted `rg` across `apps/web/client/src/components`
  and `apps/web/client/src/pages`.
- Reuse `WorkflowStudioPage.tsx` shell, existing shadcn/Radix Tabs/Button/Input
  primitives, Marketplace filter/card patterns, and Worker Jobs timeline/status
  patterns.
- Diverge only for workflow-specific exact-version, readiness, checkpoint,
  approval and artifact panels because the generic Marketplace/Worker Jobs
  surfaces do not combine these states.

### Surface Inventory

| Surface | Route/file | Change |
|---|---|---|
| Dashboard entry | `/dashboard`, `Dashboard.tsx` | Keep existing authenticated entry |
| Builder | `/studio/workflow`, `WorkflowStudioPage.tsx` | Add server-backed save/compile/readiness and authoritative status |
| Subflow | `/studio/workflow`, same page mode | Add checkpoint/binding/run-from affordances |
| Library | same route surface | Add detail, recent/pinned and run projection states |
| Marketplace | same route surface | Add detail, dependency, entitlement, quote and invoke preflight |
| Run/Mini App | `/studio/workflow/run` | Add durable run status, approval, controls, artifacts and preview |
| Debug drawer | Builder/Run | Back Output/Data/Trace/Logs/Artifacts/Cost/Errors with canonical data |

### Component Map

| Component | Ownership | Consumes |
|---|---|---|
| `WorkflowStudioPage` | routing/surface composition | tRPC queries/mutations, locale keys |
| `WorkflowBuilderCanvas` | graph selection/layout/view state | exact definition/version, readiness |
| `WorkflowInspector` | node/version/policy/binding details | server schemas and binding decisions |
| `WorkflowCatalog` | Library/Marketplace cards and filters | list/detail/readiness/entitlement |
| `WorkflowRunPanel` | input, mode, quote, invoke and status | run intent/result projection |
| `WorkflowApprovalPanel` | approval/user input actions | approval projection and mutation |
| `WorkflowArtifactPreview` | safe result/artifact states | authorized artifact query |
| `WorkflowDebugDrawer` | event/trace/log/cost views | canonical event projection |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| Loading | skeleton/spinner with preserved shell | component/browser test |
| Empty | explanatory Library/Marketplace/Run empty state | component test |
| Error | retryable error with reason and retry action | component/browser test |
| Blocked | dependency/access/budget/setup reason and disabled invoke | router/UI test |
| Approval | pending decision/input panel with expiry and actor | service/browser test |
| Running | canonical status, progress, node/attempt and cancel | browser/control test |
| Partial | checkpoint and resume/run-from options | service/browser test |
| Retry | retryable reason, attempt history and retry action | service/UI test |
| Success | schema-driven output and authorized artifact preview | service/browser test |
| Failed | safe error, preserved trace and recovery action | service/browser test |
| Focus/hover/selected | visible focus and node/row selection | accessibility/browser test |
| Dirty/saving/saved/conflict | persistent save indicator and recovery action | mutation/browser test |
| Edge-validating/invalid | connection preview, typed ports and inline reason | graph/component test |
| Property-invalid | field-level validation and blocked Publish/Run | form/router test |

### Responsive Matrix

| Viewport | Expected behavior |
|---|---|
| mobile 390x844 | single-column Run; horizontal catalog/nav; status/approval actions remain visible |
| tablet 768x1024 | stacked canvas/inspector or sheet; drawer remains reachable without page overflow |
| laptop 1024x768 | compact three-panel builder with collapsible inspector/drawer |
| desktop 1440x900 | canvas + inspector + bottom drawer match mockup |
| small-mobile 360x800 | verify dense controls wrap and primary action remains reachable |
| wide-desktop 1280x800 | verify graph and inspector do not overlap or clip |

### Accessibility Acceptance

- Keyboard path reaches catalog card, preflight, invoke, run mode, approval,
  retry/cancel/resume, artifact and drawer controls in logical order.
- Keyboard can focus a node, nudge it, focus a port/edge and delete through an
  announced command; drag-only behavior is not the sole editing path.
- All icon-only controls have accessible names; tabs, alerts, progress and
  status use semantic roles.
- Focus rings remain visible on graph nodes, cards, inputs and destructive or
  recovery actions.
- Live status changes announce state without excessive repeated announcements.
- Contrast remains readable for blocked, warning, success and disabled states.
- Reduced-motion users receive no essential information only through animation.

### Visual Direction and Design Token Extraction

Sources: existing `WorkflowStudioPage.tsx`, `AppPage`, shadcn/Radix UI
primitives, Marketplace components and the three supplied mockups.

- Color: semantic `bg-card`, `bg-muted`, `border`, `text-muted-foreground`,
  primary, destructive and status tokens; no new raw hex palette.
- Typography: existing product heading/body/caption scale and uppercase eyebrow
  labels from the mockup-aligned page.
- Spacing/radius/elevation: existing Tailwind semantic classes, rounded cards,
  thin borders and restrained shadows; preserve current density.
- Motion: short state transitions only; honor reduced motion.
- Do not change: left navigation, top-down graph hierarchy, right inspector,
  bottom debug drawer, separate Run surface or mockup copy hierarchy.

### Copy Contract

- Tone: concise, operational, honest and actionable.
- Languages: every new key in `locales/en/workflow.json` must have a Thai pair.
- Required copy: readiness reason, access denied, dependency missing/stale,
  approval pending/expired, retryable/permanent failure, cancel pending,
  checkpoint resume, artifact unavailable and reconciliation required.
- Never use “running”, “completed”, “charged”, “artifact ready” or “verified”
  unless backed by the canonical projection.
- Fallback: missing translation uses existing namespace fallback and logs a
  parity test failure; no hard-coded English in new UI paths.

### Browser Evidence Required

Follow `ui-browser-verification.md`. Required route flow is Dashboard → Builder
→ Subflow → Library/Marketplace → Run, with mocked contract fixtures for local
UI tests and real environment evidence for release. Capture mobile 390x844,
tablet 768x1024, desktop 1440x900 and extended dense-layout viewports where
needed. Check console errors, overflow, keyboard path, labels, loading/empty/
error/disabled states and light/dark readability.

### TDD-first tests

- Extend page tests for all state matrix rows and server mutation success/error.
- Test the real graph model: node drag/keyboard nudge/selection, add/duplicate/
  delete, typed edge create/relink/delete, cycle/type rejection and orphan-edge
  cleanup.
- Test every Properties field edits the correct node, validates locally and
  persists through save/update with dirty/saving/conflict/error states.
- Test every visible CTA has a command or an explicit disabled reason; fail the
  test if an enabled control only changes a notice/local placeholder.
- Add locale parity and route namespace tests for new copy.
- Add Playwright Dashboard-to-run flow with mocked readiness, approval,
  partial, success, failed and artifact fixtures.
- Add Playwright editor flow that drags a node, creates/deletes an edge, edits
  Properties, saves/reloads, opens Library/Marketplace, publishes when valid
  and invokes Run. Capture screenshots with stable artifact names and no new
  console errors.

### Acceptance

UI state is a projection of server state. Refreshing or opening the same run in
another tab does not reset status or create duplicate work. No visible enabled
button is a no-op, node movement/edge edits are persisted, and each node kind
has an actionable Properties form.

## Section 08 — Economics, release gates and production evidence

### Goal

Connect workflow invocation to the existing economic control plane and prove
the complete path without claiming local tests as production certification.

### Implementation

- Add workflow-run economic correlation for estimate, authorization,
  reservation, capture, release and reconciliation-required outcomes.
- Ensure Marketplace creator/funder/provider/platform allocation facts are
  emitted to Spec 207, not booked in a new Spec 209 ledger.
- Add audit/observability fields linking run, Job, attempt, event, artifact and
  economic effect/receipt IDs.
- Add release gate checks for migrations, contract versions, feature flags,
  i18n, browser evidence, readiness probes and rollback behavior.
- Use additive expand/migrate/contract rollout: deploy schema and projector
  compatibility first, canary the run flag, drain or fence active runs before
  rollback, and define recovery/rebuild steps for each projection. A migration
  rollback must not delete data referenced by an active canonical Job.
- Run failure-injection drills for duplicate invoke, provider ambiguous result,
  artifact publication failure, approval expiry, cancel race, retry budget and
  settlement mismatch.
- Synchronize the parent Spec 209 package after implementation: update its
  completion addendum, release gate, acceptance checklist and manifest only for
  files intentionally included by the package convention. Record the real
  integration evidence and keep unresolved external gates explicit.

### TDD-first tests

- Economic replay/idempotency and reservation release/capture tests.
- No creator fee on failed/unverified effect; reconciliation-required on
  ambiguous receipt.
- Cross-tenant redaction/audit correlation tests.
- Release-gate script, migration and browser evidence checks.

### Acceptance

Production release can show an end-to-end evidence chain from exact published
Workflow Version → run intent → canonical Job/attempt → event/effect →
artifact/output → economic receipt/settlement, or clearly stops in a durable
reconciliation-required state.

## File ownership summary

Likely owned paths, subject to impact review before editing:

- `apps/web/drizzle/schema.ts` and additive `apps/web/drizzle/migrations/*`
- `apps/web/server/routers/workflowStudio.ts`
- `apps/web/server/services/workflowStudio*`, new workflow run/checkpoint/
  projection services and focused tests
- `apps/web/server/services/orchestration/contracts.ts`,
  `apps/web/server/services/orchestration/gateway.ts` and the
  Spec-209-scoped executor adapter/registration used by
  `jobExecutorRegistry.ts`/`unifiedJobConsumer.ts`
- `apps/web/server/services/workerArtifactService.ts` only through a focused
  adapter/query boundary; do not broaden its storage authorization contract
- `apps/web/client/src/pages/WorkflowStudioPage.tsx`
- `apps/web/client/src/components/workflowStudio/*` if decomposition is needed
- `apps/web/client/src/locales/en/workflow.json`
  and `apps/web/client/src/locales/th/workflow.json`
- `apps/web/tests/e2e/workflow-studio*.spec.ts`
- Spec 209 release-gate/completion evidence files

Before changing shared Job, artifact or economics services, perform an impact
review and keep the change adapter-scoped to Spec 209.
