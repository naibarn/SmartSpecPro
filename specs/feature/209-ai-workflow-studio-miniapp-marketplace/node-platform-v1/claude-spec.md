# Synthesized Spec — Typed Workflow Node Platform v1

This document synthesizes the user request, supplied mockups, current Feature
209 implementation, and `spec.md` in this directory. `spec.md` remains the
normative detailed catalog; this file is the implementer-facing requirement
summary.

## Outcome

Build a real, extensible Workflow Studio and Mini App/Marketplace platform. A
workflow is not a collection of visually identical cards. Every node type must
have a distinct semantic purpose, typed inputs/outputs, human-readable
configuration, a readiness state, and a runtime adapter or an explicit
not-ready explanation.

The user journey is:

`Dashboard → Workflow Studio → choose/create workflow → drag node → configure
form → connect typed ports → enter Subflow → AI Draft/Edit (optional) → validate
and publish → Run/Test → inspect live step status/output/trace/logs/artifacts →
approve/retry/cancel/resume → reuse as Library/Mini App/Marketplace item`.

## Non-negotiable product principles

1. The supplied mockup governs composition and visual hierarchy. Do not invent a
   different page layout.
2. `nodeType` is semantic; `kind` is only a rendering family; `capability` is a
   runtime adapter. Names and rendering families must not make all nodes behave
   the same.
3. One versioned registry is the source of truth for palette, node card,
   inspector, validation, AI compiler, runtime, Library metadata, and
   Marketplace readiness.
4. JSON remains the persisted interchange format, but ordinary users configure
   nodes using forms, fields, selectors, mappings, and previews. Advanced users
   may inspect/edit JSON with parse/validation feedback and safe round-trip.
5. Durable execution uses existing `worker_jobs` and its outbox/control-plane
   contracts. No retired workflow engine, Agency, workpacks, OpenSandbox,
   Docker, or `sandbox_jobs` may be introduced or restored.
6. AI may propose a typed graph and explain it. It may not silently mutate a
   published version or run an unvalidated draft.
7. Cross-spec coverage is normative in
   [`cross-spec-node-coverage.md`](./cross-spec-node-coverage.md). It maps the
   workflow-facing parts of Specs 200, 204, 205, 206, 207, 208, 210, and 211
   without duplicating their registries, queues, approval service, browser
   control plane, runtime, or economic ledger.

## Required node contract

Every registry entry includes:

- stable `nodeType`, registry `version`, localized label/description, category,
  icon, and rendering family;
- typed input and output ports, cardinality, optionality, nullability, and
  accepted coercions;
- `configSchema` and `uiSchema`, with field labels, help, defaults, required
  state, validation, sensitive/reference fields, and mapping controls;
- runtime capability, adapter version, provider/worker requirements, readiness,
  permission scopes, retry/timeout policy, and cost class;
- binding rules for constants, upstream ports, run inputs, system data,
  secrets, Library/project records, and previous run/checkpoint values;
- preview contract, output/artifact projection, error categories, and test
  fixture factory.

## Catalog scope

The v1 catalog is the complete catalog in `spec.md`, organized as follows. The
implementation must not stop after the first visible palette entries.

### Trigger/input

`manual-input`, `form-input`, `webhook-trigger`, `schedule-trigger`,
`chat-trigger`, `library-input`, `file-input`, `project-input`,
`previous-run-input`.

### Data/document

`document-parser`, `ocr`, `document-extractor`, `document-classifier`, `chunker`,
`structured-parser`, `data-transform`, `filter`, `map`, `reduce`, `join`,
`split`, `merge`.

### Search/memory/system

`library-search`, `vector-search`, `rerank`, `citation-builder`, `embedding`,
`tenant-context`, `user-context`, `project-context`, `config-value`,
`secret-reference`.

### AI/agent

`llm-prompt`, `llm-structured`, `classifier`, `summarizer`, `translator`,
`prompt-template`, `ai-agent`, `skill`, `external-agent`, `subflow-call`.

### Tools/integrations and browser/computer use

`http-request`, `mcp-tool`, `connector-action`, `database-query`,
`database-write`, `notification`, `file-transform`, `artifact-store`,
`artifact-publish`, `browser_session_start`, `browser_session_instruction`,
`browser_session_wait_for_user`, `browser_session_review_gate`.

### Media/production

`image-generate`, `video-generate`, `audio-generate`, `tts`, `transcription`,
`storyboard`, `media-compose`, `media-qc`, `render`, `preview`.

### Control/human

`condition`, `switch`, `parallel`, `loop`, `foreach`, `delay`, `retry`,
`human-approval`, `human-input`, `checkpoint`, `error-handler`, `subflow`,
`run-until`.

### Output/observability

`result-view`, `output-mapper`, `trace-event`, `log`, `metric`, `run-status`.

### Cross-spec capability, browser, economics, and external-runtime nodes

`external-agent-task`, `capability-search`, `capability-describe`,
`capability-invoke`, `capability-status`, `capability-result`, `asset-select`,
`asset-preview`, `context-package`, `workspace-bind`, `git-operation`,
`verification`, `code-task`, `economic-quote`, `budget-guard`,
`economic-reserve`, `economic-authorization`, `economic-capture`,
`economic-release`, `economic-status`, `settlement-report`, `browser_observe`,
`browser_action`, `browser_file_transfer`, `browser_verify`,
`browser_takeover`, `managed-agent-fleet`, and `agent-session-control`.

Spec 204 runtime profiles (`media-utils`, `video-render`,
`remotion-render`, `document`, `hermes`, `code-sandbox`, and `cpu-ml`), Spec
205 Runner discovery/lease/fencing, Spec 206 A2A route/conformance, Spec 210
Orca route, and Spec 211 ACP/Gas City session runtime are execution metadata
selected by these nodes, not vendor-specific duplicate node types.

For each type, `spec.md` defines purpose, input contract, output contract, and
required settings. Implementers must use those definitions rather than infer
behavior from labels.

## Data sources exposed to nodes

The binding system must expose, with tenant/permission checks:

- run form/manual inputs, webhook payloads, chat messages, schedule metadata;
- upstream node outputs, node output previews, prior-step values, checkpoints;
- workflow/version/run metadata and selected node metadata;
- Library items, chunks, embeddings, search results, citations, and approved
  knowledge sources;
- project, document, file, media, storyboard, render, and artifact records;
- user/tenant/project/config context and approved secret references;
- capability/Agent Card and Runner snapshots, runtime profile health, workspace
  bindings, browser target/evidence policy, and external-agent route health;
- economic quote, budget/mandate, reservation, authorization, capture/release,
  usage, ledger/settlement projections;
- canonical job/run status, progress, trace, logs, usage/cost, and provider
  readiness.

Bindings must be explicit and inspectable. A node cannot read arbitrary database
rows, tenant data, filesystem paths, or secret values merely because a user
typed a path in JSON.

## Runtime requirements

- Validate draft and publish contracts before execution: registry versions,
  ports, mappings, required config, permissions, provider readiness, cycles,
  branch reachability, subflow contracts, and artifact/output declarations.
- Execute deterministic control flow with explicit branch handles and stable
  step IDs. Support full run, run node, run from checkpoint, run until node,
  and run subflow.
- Support retry, cancel, pause/wait-for-external, human approval/input, resume,
  and failure recovery with idempotent events and durable checkpoints.
- Produce real node outputs, artifacts/previews, trace/log/metric events, usage,
  error classifications, and run projections. No placeholder success states.
- Enforce SSRF, connector/MCP permissions, secret references, tenant isolation,
  payload limits, timeout/deadline, cost budget, and provider allowlists.
- Resolve a shared execution envelope (`routePolicy`, protocol, runtime
  profile, capability, workspace, resource, approval, economic, verification,
  retry and timeout policy) at server admission. Pin the snapshot to the run,
  preserve all external lineage under the canonical job, and reconcile
  ambiguous A2A/external dispatch before retry.

## UI/UX requirements

The screen remains the mockup-led editor:

- Dashboard return, language switch, Build/Test/Runs/Analytics or equivalent
  route tabs, workflow title/version/status, Run and Publish actions;
- visible main-flow canvas with grid, clear orthogonal/smoothstep directed edges,
  labeled branch outputs, typed source/target handles, selectable/deletable/
  movable/resizable nodes, zoom +/- and fit controls, minimap, and undo/redo;
- bottom node palette grouped by category with search, readiness badges, and
  drag/drop or tablet add buttons;
- right resizable inspector with Configure/Settings/Notes, form-driven config,
  input/output mapping, schema preview, output preview, validation errors, and
  JSON advanced mode;
- clear Main flow/Subflow identity, parent-node relationship, breadcrumbs,
  double-click desktop entry and explicit tablet button entry;
- AI Draft/Edit prompt input, candidate graph, explanation, diff, warnings,
  apply/reject controls, and no direct mutation of published versions;
- bottom Run/Debug panel with live status, node outputs, Data, Trace, Logs,
  Artifacts, Cost, error detail, approval controls, retry/cancel/resume, and
  previews/download links.

UI states and browser evidence must cover loading, empty, not-ready, validation
error, success, partial run, approval waiting, retrying, canceled, and resumed
states across 390x844, 768x1024, and 1440x900, with extended canvas checks at
360x800, 1024x768, and 1280x800.

## Delivery definition

The implementation is complete only when the registry catalog, graph behavior,
forms and bindings, adapters, canonical execution, AI draft/edit, Library /
Marketplace / Subflow reuse, and mockup-led UI are all connected and verified.
Passing a page render or a list of buttons is not sufficient.
