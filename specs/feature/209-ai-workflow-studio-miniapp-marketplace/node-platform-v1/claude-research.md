# Research — Typed Workflow Node Platform v1

## Research auto-decision

- Codebase research: **yes**. This is an existing TypeScript/Vite/React/Drizzle
  repository with an in-progress Feature 209 implementation.
- SocratiCode: attempted as the preferred discovery layer, but the MCP transport
  was unavailable in this session. Findings below use targeted `rg`, bounded file
  reads, existing tests, and the Feature 209 migration as fallback evidence.
- Web research: **not required for this planning pass**. The request is a
  repository-specific product contract, and the relevant runtime, UI, security,
  and provider boundaries already exist in the codebase. No external API contract
  is being selected here.

## Existing architecture and boundaries

### Current Feature 209 surfaces

- `apps/web/client/src/pages/WorkflowStudioPage.tsx` is the current route-level
  React Flow builder, inspector, palette, AI draft/edit controls, run/debug
  surface, Library/Marketplace views, and i18n entry point.
- `apps/web/client/src/pages/workflowStudioGraph.ts` contains the current graph
  state, React Flow rendering families, ports, presets, initial graph, and graph
  connection helpers. The current file has started adding semantic `nodeType`,
  but the catalog is not yet a registry-backed platform contract.
- `apps/web/server/routers/workflowStudio.ts` owns draft, save, publish, run,
  run control, run detail, Library, Marketplace, generate-draft, and edit-draft
  tRPC procedures.
- `apps/web/server/services/workflowStudioContracts.ts` currently validates a
  small graph shape, redacts secret-looking keys, hashes definitions, and guards
  published-version immutability.
- `apps/web/server/services/workflowStudioRuntime.ts` currently normalizes full,
  run-until, run-from, run-node, and run-subflow requests and builds a topological
  execution plan. This is useful foundation but does not yet define typed ports,
  branch semantics, loops, subflow contracts, or per-node schemas.
- `apps/web/server/services/workflowStudioJobExecutor.ts` currently has a partial
  generic executor for pass-through, condition/switch, LLM, HTTP, skill, and
  human-approval capabilities. It must be replaced/aligned with a registry and
  capability-adapter contract before the catalog is considered implemented.

### Durable runtime authority

- `apps/web/server/services/jobControlPlane.ts` owns canonical `worker_jobs`
  lifecycle, lease, retry, cancel, resume-review-gated job, external wait,
  event, and outbox behavior.
- `apps/web/server/services/jobControlPlaneGateway.ts` provides the request-side
  durable admission boundary. `jobReporter.ts` exposes heartbeat/progress,
  `waitForExternal`, completion, failure, and active-lease checks.
- `apps/web/server/services/skillJobExecutor.ts` and `skillExecutor.ts` are the
  existing skill execution path. The workflow node platform must call this
  capability through its canonical job contract rather than inventing a second
  skill or queue engine.
- `apps/web/server/_core/llm.ts` provides the existing LLM invocation boundary.
  LLM nodes should validate model/prompt/structured-output contracts before
  admission and preserve usage/cost metadata.
- `apps/web/server/services/ssrfValidator.ts` is the existing outbound URL safety
  boundary for HTTP-like integrations.

### Persistence already present

`apps/web/drizzle/0341_feature_209_workflow_studio.sql` and the matching schema
define additive tables for:

- `workflow_studio_definitions` and `workflow_studio_versions`;
- per-user canvas views;
- Mini Apps/Marketplace records;
- runs, ordered run events, and checkpoints.

The existing schema supports a useful immutable version and run projection, but
the next plan must add/normalize registry version references, binding snapshots,
typed input/output contracts, artifact references, approval state, and event
projections only where the existing JSON contracts cannot safely represent them.
It must not create a parallel execution authority.

## Existing UI patterns to reuse

The UI must follow the attached mockup as the product reference while reusing
working local interaction patterns:

- `apps/web/client/src/components/videoeditor/ui/EditorMobileSheet.tsx` for
  tablet/mobile inspector behavior and explicit open/close affordances.
- `apps/web/client/src/components/videoeditor/RenderProgressDialog.tsx` and
  `ReviewWorkspacePanel.tsx` for progress, review, artifact, and output states.
- `apps/web/client/src/components/media/DynamicSkillForm.tsx` for schema-driven
  human-readable forms from skill metadata.
- `apps/web/client/src/components/automation/AutomationChatModal.tsx` for
  natural-language workflow interaction patterns.
- `apps/web/client/src/components/presentation/AIDraftModal.tsx` for AI draft
  prompt, generated proposal, and review/apply UX.
- `apps/web/client/src/components/dashboard/dashboardPrimitives.tsx` and
  `DashboardLayout.tsx` for product surface tokens, navigation, and dashboard
  return behavior.

Decision: reuse the existing primitives and state patterns; diverge only for the
React Flow canvas interaction itself because the mockup requires graph-specific
handles, minimap, zoom controls, edge labels, nested subflow navigation, and a
resizable inspector.

## Testing and verification conventions

- Unit/component tests use Vitest with `apps/web/vitest.config.ts`.
- Route-level UI tests live beside pages under
  `apps/web/client/src/pages/__tests__` and use the configured jsdom environment.
- Server service/router tests live under `apps/web/server/**/__tests__` or nearby
  `*.test.ts` files.
- Browser tests use Playwright under `apps/web/tests/e2e`; Feature 209 already has
  a focused `workflow-studio-browser.spec.ts`.
- Existing focused verification for the prior Feature 209 baseline covered graph,
  page wiring, router, runtime, and schema parity. Those tests must be rerun after
  the current partial source edits; their earlier pass is not proof of the new
  registry platform.
- Repository rule: do not run `npm run typecheck` or equivalent full typecheck
  unless explicitly requested. Use focused Vitest, build, and Playwright checks;
  report the typecheck boundary explicitly.

## Gaps that drive the plan

1. `kind` is a rendering family, not a semantic node type. The new platform needs
   a versioned registry with schema, ports, UI form metadata, binding rules,
   capability adapter, readiness, permissions, and preview contracts.
2. The current graph validation only checks node IDs, missing edge endpoints, and
   cycles. It does not validate port compatibility, branch handles, loops,
   subflow contracts, required inputs, secret references, or publish readiness.
3. The current executor has several hard-coded capabilities. This does not scale
   to the catalog in the spec and makes nodes with different names behave alike.
4. Existing skills expose `input.json`/`ui.json` information, but the workflow
   editor must project those schemas into forms and bind values to upstream ports.
5. The UI needs a clear distinction between Main flow and nested Subflow, with
   double-click and tablet-safe buttons, deletion/edge editing, resize, zoom,
   readable typography, output previews, and AI draft/edit review.
6. Run/partial-run/approval/retry/cancel/resume/artifact/trace behavior must be
   projected from canonical jobs and durable events, not simulated in the page.

## Planning decisions

- One registry and one normalized node definition format are the source of truth
  for palette, canvas card, inspector, validation, compiler, runtime, and
  Marketplace metadata.
- Each node has `nodeType` (semantic), `kind` (rendering family), and `capability`
  (runtime adapter). These fields may differ intentionally.
- The execution engine is a typed DAG with explicit control-flow exceptions for
  branches, loops, waits, and subflows. It never routes through retired legacy
  `/workflows`, Agency, workpacks, OpenSandbox, Docker, or `sandbox_jobs`.
- AI Draft/Edit produces a typed candidate graph plus explanation and validation
  diagnostics. It never directly mutates a published version or executes an
  unreviewed graph.
- Provider integrations are adapters behind existing job/outbox boundaries. A
  node is only runnable when its adapter, permission, provider, and schema are
  ready; otherwise the UI shows a truthful not-ready state.

## Cross-spec source audit

The companion source specs were checked and their workflow-facing coverage is
captured in `cross-spec-node-coverage.md`:

- Spec 200 contributes Capability Gateway, Skill/Agent, Asset/Context,
  workspace/Git and verification requests.
- Spec 204 contributes approved Container runtime profiles and resource/health/
  stall/cost evidence, not user-created containers.
- Spec 205 contributes authenticated Runner capability, lease/fencing and
  workspace execution metadata, not graph-authored Runner lifecycle commands.
- Spec 206 contributes A2A Agent Card/conformance, route policy, bounded
  fallback and ambiguous-dispatch reconciliation under `worker_jobs`.
- Spec 207 contributes quote, budget, reservation, authorization, capture,
  release/refund, status and settlement projections owned by its economic plane.
- Spec 208 contributes browser session/action/evidence/takeover requests with
  typed targets, approval and finality verification.
- Spec 210 contributes Orca route/probe/submission/reconcile/cleanup evidence.
- Spec 211 contributes ACP/Gas City session providers, lifecycle, child lineage,
  managed fleet and aggregate policy.

The audit result is intentionally split into workflow nodes versus execution
metadata so the plan covers the capability without creating duplicate queues,
registries, runtimes, browser control, approval services or ledgers.
