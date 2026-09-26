# TDD Plan — Typed Workflow Node Platform v1

Tests are written before implementation for each section and use the repository’s
Vitest/Playwright conventions. These are test stubs and acceptance targets, not
full test implementations.

## Section 01 — Foundation contracts and registry

- Registry contains every node ID listed in `spec.md` exactly once.
- Registry entries have valid version, category, render family, ports, config
  schema, UI schema, adapter, readiness resolver, and fixture metadata.
- Duplicate node/port IDs and invalid schemas fail registry construction.
- Valid and invalid typed port/config graphs return stable diagnostics.
- Secret-looking config values are redacted and published versions remain
  immutable.
- Legacy Feature 209 graph mapping produces deterministic semantic node types.
- Cross-spec manifest includes every ID in `cross-spec-node-coverage.md` once,
  records owning spec/authority, and rejects transient provider/session,
  Runner/browser/wallet/ledger IDs in authored definitions.
- Execution envelope validates route/protocol/runtime profile, capability
  requirements, workspace/resource, approval/economic/verification, retry and
  timeout policy with a deterministic resolved-snapshot shape.

## Section 02 — Data sources, bindings, and readiness

- Each source namespace resolves only allowed tenant/user/project data.
- Constant, upstream, run input, Library, config, secret reference, checkpoint,
  and artifact bindings produce the declared type.
- Missing paths, type mismatches, unavailable providers, missing permissions,
  and stale checkpoints return actionable diagnostics.
- Skill `input.json`/`ui.json` schemas produce a form model and round-trip values
  without losing required/default/enum metadata.
- Sensitive values are redacted from previews and logs.
- Capability/Agent Card/Runner/profile/workspace/browser/external-session and
  economic sources return freshness, provenance and safe readiness without
  exposing credentials or allowing client-side authority escalation.

## Section 03 — Graph engine, edges, branches, subflows, and layout

- Adding, moving, deleting, duplicating, resizing, and reconnecting nodes updates
  graph state and persists position/size/viewport.
- Creating/deleting edges updates source/target handles, labels, branch roles,
  and removes duplicate edges.
- Incompatible ports, invalid branch handles, illegal cycles, and broken subflow
  contracts are rejected with visible diagnostics.
- Main/Subflow breadcrumbs and parent-node relationships survive reload.
- Desktop double-click and tablet explicit button both open the intended subflow.

## Section 04 — Core input/data/document/search/system adapters

- Every core catalog node validates its required settings and returns its own
  declared output shape.
- Document parser/OCR/extractor/classifier preserve source/provenance metadata.
- Chunk/search/rerank/citation/embedding nodes preserve query and citation links.
- Map/filter/reduce/join/split/merge are deterministic for empty, null, and
  large-but-bounded collections.
- Trigger/context/config/secret nodes enforce scope and do not leak values.

## Section 05 — Control flow, human interaction, recovery, partial run

- Condition and switch select the correct labeled route including default/no-match.
- Parallel/loop/foreach enforce bounded execution and deterministic joins.
- Delay/retry honor deadline, attempts, backoff, idempotency, and error class.
- Approval/input enters durable external wait, records decision/reviewer, and
  resumes exactly once.
- Full, run-node, run-from-checkpoint, run-until, and run-subflow select the
  correct nodes and reject missing/stale/incompatible checkpoints.

## Section 06 — LLM, AI agent, skill, external agent

- Prompt templates resolve upstream values without accidental secret exposure.
- LLM nodes reject missing model/prompt and return text/structured output plus
  usage metadata; malformed structured output fails clearly.
- Classifier/summarizer/translator enforce their output contracts.
- Skill nodes use real schema-derived payloads and call the registered skill
  executor with tenant/user/run identity.
- Agent tool allowlists, turn limits, budgets, and external-worker permissions
  are enforced; no retired Agency fallback exists.
- Capability search/describe/invoke/status/result and context/asset/workspace/
  Git/verification nodes preserve typed schemas, provenance, child lineage and
  authoritative postconditions.
- A2A (`a2a_required`/`preferred`/`native_required`), Orca, ACP/Gas City,
  Runner and managed-fleet route/reconcile/session tests never create duplicate
  worker jobs or a second registry.

## Section 07 — Tools, integrations, artifacts, media

- HTTP rejects SSRF/private targets, overlarge responses, invalid methods, and
  exceeded timeouts; successful response shape is typed.
- MCP/connector/database nodes enforce registered manifests, scopes, parameters,
  tenant filters, and approval requirements.
- Browser observe/action/file-transfer/verify/takeover tests enforce typed target
  binding, feature flag, allowlist, stale-target handling, evidence, approval,
  human fencing, upload/download finality and cleanup.
- File/artifact nodes create authorized managed references, previews, and MIME/
  size metadata rather than inline binaries.
- Media nodes admit through the existing provider/Runner job contracts and expose
  pending/progress/failure states without fake success.
- Every Spec 204 profile (`media-utils-runtime`, `video-render-runtime`,
  `remotion-render-runtime`, `document-runtime`, `hermes-runtime`,
  `code-sandbox-runtime`, `cpu-ml-runtime`) records image/version, resource,
  health, progress, timeout/OOM/stall, artifact postcondition and cleanup
  evidence, across the approved runtime-target enum.

## Section 08 — Library, Mini App, Marketplace, reusable contracts

- Only published immutable versions can become runnable Marketplace entries.
- Input/output/dependency manifests are deterministic and omit secrets/private
  data.
- Instantiate/copy/run preserves version/content hash and tenant isolation.
- Registry/adapter incompatibility produces a not-ready result and explains the
  missing dependency.

## Section 09 — Canonical execution and run projection

- `result-view`, `output-mapper`, `trace-event`, `log`, `metric`, and `run-status`
  each validate their own config/ports and project the declared output/evidence.
- Execution plans include stable step IDs, registry/adapter snapshots, typed
  inputs, selected routes, dependencies, retries, and idempotency.
- Parent/step jobs and outbox intents are admitted once through the canonical
  control plane.
- Events are ordered/idempotent and project queued/running/waiting/retrying/
  completed/partial/failed/canceled/resumed states.
- Outputs, previews, artifacts, trace, logs, cost, and errors are persisted and
  tenant-authorized.
- Retry/cancel/approve/reject/resume mutations are idempotent and race-safe.
- Economic quote/budget/reserve/authorization/capture/release/status/settlement
  nodes link immutable facts to workflow/run/attempt/effect/artifact IDs and
  handle unknown finality without double capture or refund.
- Ambiguous external/A2A dispatch reconciles before fallback; resolved
  cross-spec snapshots are replayable and transient control IDs remain run state.

## Section 10 — Mockup-led UI/UX

- Page renders the mockup-led regions with registry-derived palette/cards/forms.
- Node cards differ by type and show ports, labels, readiness, subflow, and output.
- Mouse/touch/keyboard interactions cover move, edge create/delete, delete node,
  resize, zoom controls, fit, minimap, duplicate, undo/redo.
- Inspector form fields map to typed config and advanced JSON round-trips.
- Dashboard return, language switch, responsive sheets, tabs, and focus labels
  work at all required viewports.
- Loading, empty, error, not-ready, approval, retry, partial, canceled, and
  success states are visible and truthful.

## Section 11 — AI Draft/Edit

- Natural-language goal creates only known registry node IDs and valid edges.
- Candidate includes explanation, assumptions, diff, diagnostics, and readiness.
- Invalid/secret/unbounded/incompatible AI output is rejected deterministically.
- Apply requires explicit action, draft revision match, and preserves undo/revert.
- Published definitions cannot be changed or executed by an AI response directly.
- Drafted cross-spec nodes include explicit route, capability, runtime,
  workspace, approval, economic and verification requirements; AI cannot invent
  provider/session/credential IDs.

## Section 12 — Certification and rollout

- Catalog coverage test reports every node’s contract/form/adapter/runtime/output
  and test status.
- Representative use-case workflows pass server and browser tests.
- Security, tenant, migration, and retired-system scans pass for changed paths.
- Playwright evidence covers required viewports and run states; skipped browser
  evidence is recorded as skipped, never as pass.
- Build passes; forbidden full typecheck is not run unless separately requested.
- Cross-spec certification has one passing or truthfully blocked row for each
  of Specs 200, 204, 205, 206, 207, 208, 210 and 211.
