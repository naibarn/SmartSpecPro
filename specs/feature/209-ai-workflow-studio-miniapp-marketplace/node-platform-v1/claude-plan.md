# Implementation Plan — Typed Workflow Node Platform v1

## 1. Scope and implementation outcome

Implement the complete node platform described by
`spec.md`/`claude-spec.md` as an amendment to Feature 209. The work is ordered
so that the same registry drives every layer:

`node contract → registry → data bindings/readiness → graph semantics → node
adapters → canonical runtime → mockup UI → AI compiler → Library/Marketplace →
browser and production gates`.

The implementer must not make one-off nodes that bypass the registry. A node is
not counted as implemented until its contract, form, validation, runtime
adapter, output projection, error behavior, tests, and UI readiness state exist.

The current partial Feature 209 files are a baseline to refactor and verify, not
proof of completion. Preserve unrelated worktree changes and keep all retired
system boundaries inactive.

## 2. Canonical architecture

### Shared contract layer

Create `apps/web/shared/workflowStudioNodeContracts.ts` as the serializable
contract for:

- `WorkflowNodeTypeId`, registry version, rendering family, category, and
  capability identifiers;
- typed values and ports (`string`, `number`, `boolean`, `object`, `array`,
  `file`, `image`, `audio`, `video`, `artifact`, `citation`, `run`, `any`);
- input/output cardinality, optionality, nullability, coercion, and branch
  handles;
- configuration field definitions and binding expressions;
- provider/permission/readiness/error/retry/timeout/cost metadata;
- node definition, graph edge, subflow contract, validation diagnostic,
  output-preview, artifact reference, and AI candidate-diff shapes;
- run mode, checkpoint, approval, and event payload contracts.
- cross-spec execution envelope: route/protocol, runtime target/profile,
  provider/capability requirements, workspace/resource policy,
  approval/economic/verification policy, retry and timeout policy;
- resolved cross-spec snapshot and lineage references for Capability/Runner,
  Container, A2A, browser/CUA, Orca, ACP/Gas City and Economic Control Plane.

Use Zod schemas with inferred TypeScript types, stable error codes, and explicit
versioning. Persist only safe references and normalized JSON; never persist raw
secret values.

The envelope is a request that the server resolves and pins at admission; it
is never a client-side authorization for a tenant, secret, Runner, browser
session, external provider, wallet or ledger. Transient provider/session IDs
remain run state and are not persisted into workflow definitions.

### Registry layer

Create `apps/web/server/services/workflowStudioNodeRegistry.ts`. It must expose
one immutable registry snapshot and lookup helpers for server and UI projections.
Each entry contains the complete contract fields in the spec, including:

`id`, `version`, localized labels/descriptions, `category`, `icon`, `kind`,
`inputs`, `outputs`, `configSchema`, `uiSchema`, `bindingSchema`, `capability`,
`adapterVersion`, `requiredPermissions`, `providerRequirements`, readiness
resolver, retry/timeout policy, preview/output projector, and fixture factory.

The registry must reject duplicate IDs/ports, missing adapters, invalid schemas,
and catalog entries with no test fixture. Expose filtered projections for
palette, inspector, AI compiler, validation, and Marketplace.

### Runtime boundaries

Node adapters are pure contract-aware units around existing capabilities. Long
work goes through `jobControlPlaneGateway` and `worker_jobs`/outbox. The
workflow executor coordinates steps, but provider-specific code remains in
existing skill/media/MCP/connector/LLM/runner adapters. The executor must never
call retired `/workflows`, Agency, workpacks, OpenSandbox, Docker, or
`sandbox_jobs`.

## 3. Delivery order

### Wave 0 — Contract freeze and inventory

Before behavior changes, inventory the current dirty Feature 209 files and
freeze the naming map. Confirm which current `kind` values are merely visual
families and map every current preset to a semantic `nodeType`. Create a catalog
coverage table that marks each spec node as `contract`, `form`, `adapter`,
`runtime`, `output`, `tests`, and `browser evidence`.

### Wave 1 — Registry and validation foundation

Implement section 01. The result must allow the server and client to enumerate
the same versioned catalog and validate a graph without executing it. Add
publish/readiness diagnostics rather than silently accepting generic nodes.

### Wave 2 — Sources, bindings, and graph semantics

Implement sections 02 and 03. The result must provide safe data sources,
human-readable mappings, typed handles, delete/connect/move/resize, branch
labels, main/subflow identity, nested navigation, cycle/port validation, and
round-trip persistence.

### Wave 3 — Core data and control nodes

Implement sections 04 and 05. The result must execute useful document/data
flows and support condition/switch/parallel/loop/foreach/retry/delay,
human-approval/input, checkpoint, error-handler, and partial run semantics.

### Wave 4 — AI, skills, tools, and media

Implement sections 06 and 07. The result must make LLM prompt/structured nodes,
skills, agents, HTTP/MCP/connectors/database/file/artifact nodes, and media
nodes materially different and connected to approved real capabilities.

### Wave 5 — Durable run projection and reuse surfaces

Implement sections 08 and 09. The result must persist and project real run
states, outputs, previews, artifacts, traces, logs, metrics, approvals,
retries, cancellation, resume, and Mini App/Library/Marketplace readiness.

### Wave 6 — Mockup-led UI and AI builder

Implement sections 10 and 11. The result must match the attached mockup’s
composition and make AI Draft/Edit produce reviewable typed graph changes.

### Wave 7 — Certification

Implement section 12. Run focused unit/component tests, security tests, build,
Playwright across the required viewport matrix, accessibility checks, and a
catalog/use-case certification report. Do not claim production readiness when
provider, deployment, or authenticated browser gates are unavailable.

### Wave 8 — Cross-spec capability and execution completion

Implement `cross-spec-node-coverage.md` as a normative amendment before
declaring the catalog complete. This wave is ordered after the registry and
binding contracts but before final certification:

1. Register the Spec 200 capability/context/workspace/code/verification nodes
   and map them to the canonical Capability Gateway, Asset/Library, workspace,
   Git and verification owners.
2. Add Spec 204 runtime-profile admission and resource/health evidence without
   exposing arbitrary container/image controls.
3. Add Spec 205 Runner capability snapshot, lease/fencing and authenticated
   execution metadata; keep Runner lifecycle commands outside the graph.
4. Add Spec 206 A2A Agent Card/conformance route policy, bounded fallback and
   ambiguous-dispatch reconciliation under the same worker job.
5. Add Spec 207 quote/budget/reserve/authorization/capture/release/status and
   settlement projections linked to workflow/run/attempt/effect/artifact IDs.
6. Add Spec 208 browser observe/action/file-transfer/verify/takeover nodes with
   typed target binding, approval, evidence and human takeover semantics.
7. Add Spec 210 Orca route evidence and Spec 211 ACP/Gas City/fleet/session
   lifecycle metadata under the External Agent node and managed-fleet nodes.
8. Add one acceptance workflow and focused contract tests per companion spec;
   a label, mock response, or generic pass-through does not satisfy coverage.

## 4. Section implementation plans

### Section 01 — Foundation contracts and registry

**Owned paths**

- `apps/web/shared/workflowStudioNodeContracts.ts`
- `apps/web/shared/workflowStudioNodeContracts.test.ts`
- `apps/web/server/services/workflowStudioNodeRegistry.ts`
- `apps/web/server/services/__tests__/workflowStudioNodeRegistry.test.ts`
- `apps/web/server/services/workflowStudioContracts.ts` (graph/publish validation
  integration only)
- `apps/web/server/services/__tests__/workflowStudioContracts.test.ts`

**Work**

1. Define the typed port/value/config/binding/subflow/run/event schemas.
2. Define schema-driven form metadata supporting strings, numbers, booleans,
   enums, text areas, JSON advanced mode, file/library selectors, secret
   references, repeatable arrays, conditional fields, and input mapping.
3. Register every node ID in the catalog in `spec.md`; no catch-all “analysis”
   behavior may substitute for a missing node.
4. Add adapter/readiness/permission metadata and fixture requirements.
5. Update graph validation to check registry membership, ports, handles, config,
   branch contracts, subflow boundaries, and publish readiness while preserving
   secret redaction and immutable published versions.

**Acceptance**

- Registry snapshot includes all catalog IDs and stable versions.
- Invalid port/config/readiness graphs return actionable diagnostics.
- Existing Feature 209 definitions can be migrated through an explicit legacy
  mapping without activating a retired engine.

### Section 02 — Data sources, bindings, and readiness

**Owned paths**

- `apps/web/server/services/workflowStudioDataSources.ts`
- `apps/web/server/services/workflowStudioBindings.ts`
- `apps/web/server/services/workflowStudioReadiness.ts`
- focused service tests and safe router projection tests.

**Work**

1. Define source namespaces: `run`, `upstream`, `workflow`, `library`,
   `project`, `media`, `user`, `tenant`, `config`, `secretRef`, `checkpoint`,
   `job`, and `artifact`.
2. Resolve bindings through tenant-aware, permission-aware functions. Return
   typed previews and redact sensitive values.
3. Add binding diagnostics for missing path, incompatible type, unavailable
   source, secret misuse, stale checkpoint, and provider not ready.
4. Project skill `input.json` and `ui.json` metadata into the same form/binding
   model, preserving defaults and required fields.
5. Add readiness states: `ready`, `configuration_required`, `provider_unavailable`,
   `permission_required`, `unsupported`, and `blocked_by_dependency`.

**Acceptance**

- A node can bind a value from a form, an upstream output, Library/project
  record, config value, or secret reference without arbitrary data access.
- Skill schema round-trip preserves input shape and UI-friendly labels.
- Readiness is visible in palette, node card, inspector, publish validation, and
  Marketplace detail.

### Section 03 — Graph engine, edges, branches, subflows, and layout

**Owned paths**

- `apps/web/client/src/pages/workflowStudioGraph.ts`
- `apps/web/server/services/workflowStudioGraphValidation.ts`
- graph tests on both sides.

**Work**

1. Normalize graph nodes to registry `nodeType` plus persisted layout data.
2. Implement explicit edge IDs, source/target handles, labels, branch role,
   and connection validation. Show clear directed edges with arrowheads and
   branch labels.
3. Support selecting, moving, deleting nodes; deleting edges; creating edges by
   dragging handles; duplicate/copy; undo/redo; resize with min/max dimensions;
   zoom plus/minus, fit, and persisted viewport.
4. Define Main flow and Subflow graph roots. Record `subflowParentNodeId`,
   input/output contract, breadcrumb, and navigation target. Double-click
   enters on desktop; an explicit `Open subflow` button is required on tablet.
5. Validate typed ports, fan-in/fan-out, branch reachability, loops only through
   allowed control nodes, and subflow input/output compatibility.
6. Preserve existing definitions with a versioned graph migration and deterministic
   node IDs.

**Acceptance**

- The attached main-flow and subflow mockups can be recreated using actual
  interactions, not static decoration.
- Edges remain legible at supported zoom levels and do not disappear behind
  cards; invalid connections are rejected with a reason.
- Layout survives save/reload and different viewport sizes.

### Section 04 — Core input, data, document, search, and system adapters

**Owned paths**

- `apps/web/server/services/workflowStudioNodeAdapters/core.ts`
- `.../document.ts`, `.../search.ts`, `.../system.ts`
- adapter tests and contract fixtures.

**Node coverage**

`manual-input`, `form-input`, `webhook-trigger`, `schedule-trigger`,
`chat-trigger`, `library-input`, `file-input`, `project-input`,
`previous-run-input`, `document-parser`, `ocr`, `document-extractor`,
`document-classifier`, `chunker`, `structured-parser`, `data-transform`,
`filter`, `map`, `reduce`, `join`, `split`, `merge`, `library-search`,
`vector-search`, `rerank`, `citation-builder`, `embedding`, `tenant-context`,
`user-context`, `project-context`, `config-value`, `secret-reference`.

**Work**

- Give every type its declared input/output and settings rather than returning
  generic passthrough output.
- Reuse existing parser/OCR/Library/vector/embedding services where present.
- Keep pure transforms deterministic and bounded; return typed records and
  provenance/citation metadata where applicable.
- Store trigger/auth context as safe references and enforce tenant scope.

### Section 05 — Control flow, human interaction, recovery, and partial run

**Owned paths**

- `apps/web/server/services/workflowStudioNodeAdapters/control.ts`
- `apps/web/server/services/workflowStudioControlRuntime.ts`
- control/runtime tests.

**Node coverage**

`condition`, `switch`, `parallel`, `loop`, `foreach`, `delay`, `retry`,
`human-approval`, `human-input`, `checkpoint`, `error-handler`, `subflow`,
`run-until`.

**Work**

- Define branch selection and output propagation by handle, including default
  branch and no-match behavior.
- Use canonical external-wait for approval/input and persist reviewer identity,
  decision, comment, deadline, and resume token safely.
- Define retry scopes (node/branch/run), bounded attempts, backoff, timeout,
  idempotency, and non-retryable errors.
- Define partial-run modes with exact predecessor/input requirements: full, run
  node, run from checkpoint, run until node, and run subflow.
- Persist checkpoint digest with definition/version/content hash and completed
  outputs; reject stale or cross-tenant resume.

### Section 06 — LLM, AI agent, skill, and external agent adapters

**Owned paths**

- `apps/web/server/services/workflowStudioNodeAdapters/ai.ts`
- `apps/web/server/services/workflowStudioAiBindings.ts`
- AI/skill adapter tests and schema fixtures.

**Node coverage**

`llm-prompt`, `llm-structured`, `classifier`, `summarizer`, `translator`,
`prompt-template`, `ai-agent`, `skill`, `external-agent`, `subflow-call`.
Cross-spec entries owned by this adapter boundary are
`external-agent-task`, `capability-search`, `capability-describe`,
`capability-invoke`, `capability-status`, `capability-result`, `asset-select`,
`asset-preview`, `context-package`, `workspace-bind`, `git-operation`,
`verification`, `code-task`, `managed-agent-fleet`, and
`agent-session-control`.

**Work**

- Provide prompt fields, upstream mappings, model selector, temperature,
  token/deadline/budget limits, response format, structured schema, fallback,
  and usage/cost outputs.
- Call `invokeLLM` through the existing policy/model boundary and canonical job
  admission for long work. Validate JSON/schema output before success.
- Resolve skills through existing skill registry/executor; render `input.json`
  and `ui.json` as real forms and send the resulting typed payload.
- Define agent tool allowlists, memory scope, maximum turns, and output schema.
- External-agent nodes must use an approved external worker/runtime contract and
  cannot silently fall back to a retired Agency path.
- Resolve logical external-agent requirements through Spec 200/206/210/211
  adapters. Support `native_preferred`, native/A2A/Orca/ACP/Gas City/Runner
  routes through the execution envelope, Agent Card/conformance and runtime
  snapshots; keep
  transient session IDs out of the graph definition.
- Capability/context/asset/workspace/Git/verification nodes must return typed
  manifests, provenance, authorization, child lineage, effect receipts and
  authoritative postconditions rather than generic JSON passthrough.

### Section 07 — Tools, integrations, artifacts, and media adapters

**Owned paths**

- `apps/web/server/services/workflowStudioNodeAdapters/tools.ts`
- `.../media.ts`
- adapter security/contract tests.

**Node coverage**

`http-request`, `mcp-tool`, `connector-action`, `database-query`,
`database-write`, `notification`, `file-transform`, `artifact-store`,
`artifact-publish`, `browser_session_start`, `browser_session_instruction`,
`browser_session_wait_for_user`, `browser_session_review_gate`,
`browser_observe`, `browser_action`, `browser_file_transfer`, `browser_verify`,
`browser_takeover`,
`image-generate`, `video-generate`, `audio-generate`,
`tts`, `transcription`, `storyboard`, `media-compose`, `media-qc`, `render`,
`preview`.

**Work**

- HTTP uses SSRF validation, method/header/body schema, allowlists, response
  limits, timeout, and safe output parsing.
- MCP/connectors use registered tool manifests, user/tenant permission scopes,
  approval requirements, and typed input/output schemas.
- Browser session nodes reuse `workflowBrowserSessionNodeTypes.ts`, live browser
  session contracts, feature flags, and approved browser worker/MCP boundaries.
  Start, observe, action, instruction, user-wait, file-transfer, verify,
  takeover, and review-gate are distinct nodes with explicit browser-session/
  evidence ports. They require allowlists, typed target binding, session
  ownership, action policy, evidence retention, human fencing, finality checks
  and review before irreversible actions; they do not restore Agency UI or a
  retired workflow engine.
- Browser route policy must model WebMCP, DOM/deterministic, local Runner and
  cloud/native CUA adapter selection plus upgrade/fallback reason, takeover and
  postcondition verification.
- Database nodes use approved query templates/parameter binding and tenant
  filters; no arbitrary unbounded SQL from a user-facing node form.
- File/artifact nodes use managed storage references, MIME/size checks,
  provenance, preview generation, and download authorization.
- Media nodes map to existing provider/Runner/worker contracts and report
  pending/progress/provider errors honestly; no fake generated output.
- Spec 204 profiles (`media-utils-runtime`, `video-render-runtime`,
  `remotion-render-runtime`, `document-runtime`, `hermes-runtime`,
  `code-sandbox-runtime`, `cpu-ml-runtime`) are selected by runtime
  admission with resource/health/stall/cleanup evidence, never user-supplied
  container or host controls. Runtime targets are the approved
  `CLOUD_SHARED`, `CLOUD_JOB_ISOLATED`, `CLOUD_SESSION_ISOLATED`, `SANDBOX`,
  `LOCAL`, and `EXTERNAL_PROVIDER_NO_CONTAINER` classes; `SANDBOX` is not the
  retired OpenSandbox system.

### Section 08 — Library, Mini App, Marketplace, and reusable workflow contracts

**Owned paths**

- `apps/web/server/services/workflowStudioReuse.ts`
- `apps/web/server/services/workflowStudioMarketplace.ts`
- related tests and additive migration only if required.

**Work**

1. Generate reusable input/output contracts from registry nodes and graph roots.
2. Save workflows to Library as immutable version references with safe tags,
   permissions, readiness, and dependency manifests.
3. Allow Marketplace entries to expose only published versions whose nodes,
   providers, permissions, and artifacts are reviewable and ready.
4. Support instantiate/copy version, run from Marketplace, and open the source
   workflow without sharing tenant-private data or secrets.
5. Define compatibility checks when a registry or skill adapter version changes.

### Section 09 — Canonical execution, events, traces, outputs, and artifacts

**Owned paths**

- `apps/web/server/services/workflowStudioRuntime.ts`
- `apps/web/server/services/workflowStudioJobExecutor.ts`
- `apps/web/server/services/workflowStudioRunProjection.ts`
- `apps/web/server/routers/workflowStudio.ts` runtime procedure regions
- runtime tests.

**Node coverage**

`result-view`, `output-mapper`, `trace-event`, `log`, `metric`, and `run-status`.
These are real catalog nodes, not merely debug-panel tabs: Result View consumes
typed outputs/artifact refs, Output Mapper defines the public workflow contract,
Trace Event/Log/Metric emit safe durable evidence, and Run Status projects
authorized runtime state. Each has its own config, ports, validation, adapter
behavior, and tests.

Add economic nodes `economic-quote`, `budget-guard`, `economic-reserve`,
`economic-authorization`, `economic-capture`, `economic-release`,
`economic-status`, and `settlement-report`. They link Spec 207 facts to the
canonical workflow/run/attempt/effect/artifact lineage and never own a queue,
wallet credential, approval service, or ledger.

**Work**

- Build a registry-aware execution plan with stable step IDs, typed inputs,
  selected branch routes, adapter versions, dependency edges, and idempotency.
- Admit parent/step jobs through the canonical gateway; persist worker job refs
  on the run; use reporter events for progress, wait, completion, and failure.
- Project ordered run events for queued/running/waiting/retrying/completed/
  partial/failed/canceled/resumed states and per-node output previews.
- Store artifacts as authorized references and expose preview/download metadata;
  never put large binary payloads into run JSON.
- Implement `run`, `getRun`, `controlRun`, retry failed step, cancel, pause,
  resume, and partial run with idempotent mutations and tenant checks.
- Keep execution behavior adapter-driven; generic pass-through is allowed only
  for explicitly declared no-op/test nodes, never as a substitute for catalog
  semantics.
- Resolve and pin the complete cross-spec envelope at admission. Reconcile
  ambiguous A2A/external dispatch before fallback, prevent duplicate effects,
  preserve runtime/browser/external-session lineage, and expose redacted
  economic/verification evidence in the run projection.

### Section 10 — Mockup-led Workflow Studio UI/UX

**Owned paths**

- `apps/web/client/src/pages/WorkflowStudioPage.tsx`
- new focused components under
  `apps/web/client/src/components/workflowStudio/`
- `apps/web/client/src/pages/__tests__/WorkflowStudioPage*.test.*`
- workflow locale files under `apps/web/client/src/locales/{en,th}/`.

**Work**

- Extract page regions into owned components: top bar, flow breadcrumbs/tabs,
  canvas shell, node card, port/edge layer, palette, inspector, AI draft panel,
  run/debug panel, artifact preview, and responsive inspector sheet.
- Use the attached mockup’s hierarchy, spacing, card treatment, toolbar/palette,
  and right inspector. Preserve existing product tokens/primitives.
- Render cards from registry metadata; specialize icon, status, ports, fields,
  branch badges, subflow badge, output preview, and readiness per node type.
- Make node deletion, edge creation/deletion, move, resize, zoom, fit,
  minimap, duplicate, undo/redo, and keyboard shortcuts functional.
- Inspector fields are schema-driven forms with friendly labels, descriptions,
  mappings, validation, output tabs, and JSON advanced mode with parse/convert
  feedback. Skill forms use actual `input.json`/`ui.json` projections.
- Add Dashboard return and Thai/English switch. Ensure tablet uses explicit
  buttons where desktop uses double-click/drag.
- Add mockup-led Build/Test/Runs/Analytics or equivalent tabs and bottom debug
  tabs for Output/Data/Trace/Logs/Artifacts/Cost/Errors.

## UI/UX Contract

### Target User / JTBD

- Role: product/content/automation user and workflow builder.
- Goal: construct and operate a real typed workflow without editing raw JSON.
- Entry point: Dashboard workflow link or `/studio/workflow`.
- Success outcome: publish/run/recover a workflow and understand every node’s
  inputs, outputs, state, and artifacts.

### Existing Pattern Reference

- Search evidence: targeted `rg` across `client/src/components` and pages for
  `Resizable`, `ReactFlow`, `DynamicSkillForm`, `EditorMobileSheet`,
  `RenderProgressDialog`, `AIDraftModal`, Dashboard primitives, and i18n.
- Found: the components listed in `claude-research.md`.
- Decision: reuse existing primitives and state patterns; diverge only for
  graph-specific handles/edges and nested canvas navigation.

### Surface inventory

| Surface | Route/file | Change |
|---|---|---|
| Dashboard entry | Dashboard / navigation | open workflow and return path |
| Builder | `/studio/workflow` / `WorkflowStudioPage.tsx` | functional canvas and inspector |
| Subflow | nested builder state | breadcrumb, parent context, open/return |
| AI Draft/Edit | builder dialog/panel | prompt, candidate, diff, apply/reject |
| Run/Test | builder tabs and debug dock | input form, live run, controls |
| Library/Marketplace | existing Feature 209 surfaces | readiness, instantiate, run |

### Component map

| Component | Ownership | Consumes |
|---|---|---|
| `WorkflowStudioCanvas` | section 10 | graph state, registry, layout handlers |
| `WorkflowNodeCard` | section 10 | node definition, readiness, output preview |
| `WorkflowInspector` | section 10 | config/ui schema, bindings, validation |
| `NodePalette` | section 10 | registry projections and search |
| `SubflowBreadcrumbs` | section 10 | flow identity and parent node |
| `WorkflowRunDock` | section 10 | run events, outputs, artifacts, controls |
| `WorkflowAiDraftPanel` | section 10/11 | typed candidate diff and diagnostics |

### State matrix

| State | Required behavior |
|---|---|
| loading | skeleton canvas/inspector, no misleading enabled actions |
| empty | guided palette and AI prompt, clear first-node action |
| not ready | node/palette/inspector reason and dependency action |
| validation error | field/port/edge diagnostics, publish/run disabled |
| success | saved/published/run status visible with timestamp/version |
| partial | completed outputs/checkpoint and resume/run-from controls |
| waiting approval | reviewer/action/comment/deadline and resume state |
| retrying | attempt/backoff/error class and cancel option |
| canceled | immutable reason and restart/resume choices |
| focus/hover/selected | visible focus ring, selected edge/node, no hidden controls |

### Responsive matrix

| Viewport | Required behavior |
|---|---|
| mobile 390x844 | stack/run sheet; inspector and debug dock as sheets; no clipped actions |
| tablet 768x1024 | canvas plus collapsible inspector; explicit open-subflow/add/connect controls |
| desktop 1440x900 | mockup three-region builder with resizable inspector and dock |
| small-mobile 360x800 | extended density/overflow check |
| laptop 1024x768 | canvas/inspector boundary and bottom dock check |
| wide-desktop 1280x800 | dense graph, palette, and inspector check |

### Accessibility acceptance

- Keyboard can navigate toolbar, palette, nodes, handles, inspector fields,
  tabs, run controls, and dialogs; Delete has confirmation for destructive graph
  changes where needed.
- Every icon-only action has an accessible name; node cards expose role/name,
  selected state, readiness, and open-subflow action.
- Focus is visible; branch colors are not the only status signal; contrast and
  reduced-motion behavior follow existing product tokens.

### Copy contract

- Thai is the default visible language in the supplied product; English is a
  first-class switch/fallback.
- Labels use plain verbs: เพิ่ม Node, เชื่อมต่อ, ลบ, ตั้งค่า, เปิด Subflow,
  สร้าง Draft ด้วย AI, ตรวจสอบ, เผยแพร่, เริ่ม Run, หยุด, ลองใหม่, ดำเนินการต่อ.
- Errors identify action and cause, for example “ยังตั้งค่า Model ไม่ครบ” or
  “พอร์ต output เป็นชนิด file แต่ input รับเฉพาะ string”.
- Loading/empty/success copy must state what is happening and avoid fake
  “พร้อมใช้งาน” when the adapter is not ready.

### Browser evidence required

Use `ui-browser-verification.md` and record evidence under
`node-platform-v1/implementation/ui-browser-evidence.md` for mobile, tablet,
desktop, small-mobile, laptop, and wide-desktop. Capture builder, nested
subflow, AI draft, run waiting approval, run output/artifact, and error states.

### Design token extraction

- Sources: current Workflow Studio page, Dashboard primitives, video editor
  sheets/progress panels, DynamicSkillForm, supplied mockups, and existing theme
  tokens.
- Preserve the product’s light neutral surfaces, blue primary action, semantic
  green/orange/red status colors, existing card/input radii, focus rings, and
  balanced operational density. Use semantic tokens and existing primitives;
  introduce a token only if the current system cannot express graph status or
  edge contrast.
- Do not globally add an Astryx reset or replace the product shell.

### Section 11 — AI Draft/Edit compiler and safe graph mutation

**Owned paths**

- `apps/web/server/services/workflowBuilderCompiler.ts`
- `apps/web/server/services/workflowStudioAiDraft.ts`
- `apps/web/server/routers/workflowStudio.ts` AI procedure regions
- compiler/service tests and page AI panel tests.

**Work**

- Accept a natural-language goal, optional selected node/flow context, and
  existing graph snapshot.
- Produce a typed candidate graph using only registry IDs, valid configs,
  ports, bindings, and explicit unresolved questions/assumptions.
- Return explanation, node/edge changes, readiness diagnostics, and a stable
  diff. `editDraft` targets the selected node/flow when requested.
- Validate and normalize AI output deterministically; reject invented node IDs,
  hidden secrets, invalid connections, unsupported provider capabilities, and
  unbounded control flow.
- Apply only to a draft after explicit user action, with revision conflict
  protection and undo/revert. Never mutate published versions or execute from
  the AI response directly.

### Section 12 — Certification, regression, and rollout

**Owned paths**

- focused tests under existing Feature 209 test locations;
- `apps/web/tests/e2e/workflow-studio-browser.spec.ts`;
- `node-platform-v1/implementation/ui-browser-evidence.md`;
- `node-platform-v1/implementation/catalog-certification.md`.

**Work**

- Test every catalog entry for registry presence, schema/form, valid/invalid
  config, adapter selection, output projection, and readiness.
- Use representative end-to-end workflows: document extraction, RAG/citation,
  prompt/structured LLM, skill with input/ui JSON, condition/switch, approval
  resume, HTTP safety rejection, media render artifact, subflow, Marketplace
  run, partial run/checkpoint, retry/cancel.
- Add a cross-spec certification row for Specs 200, 204, 205, 206, 207, 208,
  210, and 211. Each row must name the source authority, registry node or
  execution metadata, adapter/runtime evidence, permission/approval boundary,
  economic linkage where required, output/evidence projection, failure/retry/
  recovery behavior, and browser proof.
- Run these representative cross-spec flows: coding with workspace/Git/
  verification; media with runtime profile evidence; A2A Agent Card discovery
  and safe fallback; paid capability quote-to-settlement; browser typed action
  with verify/takeover; and Orca/ACP/Gas City managed-fleet lifecycle.
- Run focused Vitest and browser tests, build, security tests, migration parity,
  accessibility and responsive checks. Do not run forbidden full typecheck.
- Perform at least 10 plan self-review passes and at least 20 implementation/UI
  audit passes in the implementation phase; each pass must record what was
  checked and any fix, not merely increment a counter.
- Gate rollout by registry coverage, no new console errors, authenticated
  browser evidence, runtime/provider readiness, tenant/security checks, and
  rollback compatibility for existing Feature 209 records.

## 5. API and persistence strategy

Keep Feature 209 tRPC procedures but make their payloads registry-aware:

- catalog/readiness and data-source projections;
- draft save/validate/publish with revision and diagnostics;
- generate/edit AI candidate and apply diff;
- run full/partial/subflow and get run projection;
- control run (approve/reject/retry/cancel/resume);
- Library/Marketplace detail, instantiate, and run.

Use additive migrations only for invariants that cannot safely remain in existing
JSON. Candidate additions include registry snapshot/version, node binding
metadata, output/artifact index, approval decision, and event projection fields.
Backfill existing records through a deterministic legacy mapping and leave an
explicit not-ready diagnostic where a capability cannot be proven.

## 6. Risk controls and rollback

- Feature-flag the registry-driven runtime/UI while retaining read-only access to
  existing draft data.
- Publish immutable versions with content hash and registry/adapter snapshot.
- Reject stale revision, stale checkpoint, cross-tenant reference, and changed
  provider contract.
- Roll back by disabling new execution admission and serving existing published
  versions; do not delete graph data or revert migrations destructively.
- Treat missing browser/provider/deployment evidence as residual risk, not as a
  passing result.

## 7. Definition of done

The feature is done only when every catalog row has all required implementation
artifacts, every listed use case has a real executable path or a truthful
permission/provider readiness block, the UI matches the mockup interaction model,
and the certification report records focused tests plus browser evidence. A
static node palette, generic pass-through executor, or page-only button wiring is
not completion.

## 8. Plan self-review log

The plan is intended to be reviewed in at least ten passes before implementation:

1. catalog coverage and node contract completeness;
2. input/output/config setting completeness;
3. use-case-to-node mapping;
4. data source and tenant boundary coverage;
5. runtime/worker/outbox authority;
6. control flow, partial run, approval, retry, cancel, resume;
7. output/artifact/trace/log/event coverage;
8. mockup/UI/UX/responsive/accessibility coverage;
9. section ownership/dependency consistency;
10. security, migration, rollback, and proof boundaries.

Any gap found in these passes must be fixed in this plan or the referenced spec
before deep-implement starts.
