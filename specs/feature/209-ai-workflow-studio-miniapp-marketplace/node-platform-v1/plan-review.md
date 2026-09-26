# Plan Review Record — Typed Workflow Node Platform v1

The plan was reviewed in ten distinct passes. Reviews were performed after all
12 section files existed; findings were fixed in the spec/plan before this
record was finalized.

## Round 1 — Catalog coverage

- Checked all table rows in `spec.md`: 84 node types, including the four
  existing browser session node types and six output/observability nodes.
- Cross-checked each ID against section files, `claude-plan.md`, and TDD plan.
- Finding: browser/computer use was present in the use-case matrix but absent
  from the catalog. Fixed by adding `browser_session_start`,
  `browser_session_instruction`, `browser_session_wait_for_user`, and
  `browser_session_review_gate`, aligned to the existing shared browser node
  constants.
- Result: pass.

## Round 2 — Input/output/settings completeness

- Verified every catalog table row has purpose, inputs, outputs, and required
  settings columns populated.
- Verified output/observability nodes are explicitly implemented as node
  contracts rather than only UI tabs.
- Finding: output/observability IDs were not explicit in the runtime section.
  Fixed by adding a Section 09 node-coverage block and certification row.
- Result: pass.

## Round 3 — Use-case mapping

- Checked document intelligence, RAG, content factory, automation/API,
  human-in-loop, data pipeline, multi-step agent, browser/computer use,
  reusable product, and scheduled/interruptible run.
- Confirmed each has node families, representative certification workflow, and
  a runtime path or readiness block.
- Result: pass.

## Round 4 — Data source and binding coverage

- Checked run form, upstream, workflow metadata, Library, project/media,
  chat/webhook/schedule, system services, runtime state, secrets, checkpoints,
  artifacts, and skill schemas.
- Confirmed tenant-aware resolution, typed binding, provenance, redaction, and
  readiness are owned by Section 02 and consumed by forms/runtime.
- Result: pass.

## Round 5 — Runtime authority and dependency order

- Traced plan from registry to adapters to canonical `worker_jobs`/outbox,
  reporter/external wait, projection, UI, and Marketplace.
- Confirmed no new queue or retired `/workflows`/Agency/OpenSandbox/Docker path
  is proposed; forbidden names appear only as explicit guardrails.
- Confirmed Section 09 owns durable admission/projection and the UI consumes
  persisted state rather than simulating success.
- Result: pass.

## Round 6 — Control flow and recovery

- Checked branches, switch/default, parallel, bounded loop/foreach, delay,
  retry, approval/input wait, checkpoint, error handler, subflow, run-until,
  run-node, run-from, cancel, and resume.
- Confirmed stale checkpoint/version/content hash and duplicate-control cases are
  required in tests.
- Result: pass.

## Round 7 — Outputs, artifacts, trace/log/events

- Checked Result View, Output Mapper, Trace Event, Log, Metric, Run Status,
  output previews, artifact references, downloads, retention, usage/cost,
  event idempotency and run projection.
- Confirmed binary payloads stay in managed storage and event payloads are safe.
- Result: pass.

## Round 8 — Mockup/UI/UX parity

- Checked Dashboard entry/return, language switch, Build/Test/Runs/Analytics,
  canvas grid, clear directional edges, branch labels, node movement/deletion/
  resize, edge add/delete, zoom +/-/fit, minimap, palette, inspector tabs,
  subflow breadcrumbs/open button, AI prompt, run/debug dock, outputs and
  artifacts.
- Checked UI contract headings in all 12 sections; checker passes with no
  warnings. Existing local patterns and reuse/diverge decisions are recorded.
- Result: pass.

## Round 9 — Security, tenancy, and migration

- Checked server-derived tenant/actor authority, secret references, SSRF,
  connector/MCP permissions, DB limits/tenant filters, browser allowlists,
  upload/response/prompt/loop limits, idempotency, immutable publish, revision
  and checkpoint safety, additive migration, feature flag, and rollback.
- Result: pass.

## Round 10 — Section ownership and proof boundary

- Checked section manifest/dependency order with `check-sections.py`: 12/12
  complete and valid.
- Checked UI coverage with `check-ui-contracts.py`: 12 UI-affecting sections,
  no missing contract fields/warnings.
- Checked section path duplication: no duplicated owned source path in the
  section files; shared router/page regions are explicitly ordered.
- Confirmed plan does not claim source implementation or external provider/
  authenticated browser proof; those remain deep-implement/certification gates.
- Result: pass.

## Final review result

The planning package is internally complete for deep-implement sequencing. The
source files currently present in the worktree still require implementation
alignment and re-verification; this document does not claim those partial edits
are production-complete.

## Supplemental cross-spec review rounds

The following ten rounds were run after adding
`cross-spec-node-coverage.md`. Each round checked the amendment against the
normative spec, section plan, TDD plan, and retired-system boundaries.

## Round 11 — Cross-spec catalog identity

- Checked all added workflow-facing IDs: Spec 200 capability/context/workspace/
  code/verification, Spec 207 economic, Spec 208 browser, and Spec 211 fleet/
  session nodes.
- Confirmed vendor/runtime functions that are not user-composable remain
  execution metadata, avoiding one node per provider.
- Finding: the original registry contract had no execution envelope. Fixed by
  adding route, protocol, runtime, capability, workspace, approval, economic,
  verification, retry and timeout fields.
- Result: pass.

## Round 12 — Spec 200 capability and coding coverage

- Checked Agent/Skill/Capability Gateway search/describe/invoke/status/result,
  Asset preview, scoped context, workspace binding, Git and verification.
- Confirmed real schema/provenance/effect/postcondition requirements and no raw
  workspace path or credential in authored graph data.
- Result: pass.

## Round 13 — Spec 204 runtime profile coverage

- Checked media-utils, video-render, remotion-render, document, hermes,
  code-sandbox and cpu-ml profiles.
- Confirmed profiles are selected by Runtime Router with resource, health,
  stall, timeout, artifact and cleanup evidence; arbitrary containers are not
  exposed as node configuration.
- Result: pass.

## Round 14 — Spec 205 Runner coverage

- Checked capability snapshot, authenticated Runner target, workspace binding,
  lease/fencing, journal/control/reconnect and verification evidence.
- Confirmed lifecycle commands remain Runner service metadata and do not become
  a second workflow node/queue/registry.
- Result: pass.

## Round 15 — Spec 206 A2A coverage

- Checked `a2a_required`, `a2a_preferred`, `native_required`, Agent Card hash,
  interface/skill conformance, health, fallback and dispatch ambiguity.
- Confirmed A2A remains subordinate to `worker_jobs`; ambiguous dispatch must
  reconcile before native retry.
- Result: pass.

## Round 16 — Spec 207 economic coverage

- Checked quote, budget guard, reserve, authorization, capture, release/refund,
  status and settlement nodes with workflow/run/attempt/effect/artifact links.
- Confirmed no raw wallet credential, finance queue or duplicate ledger is
  introduced and unknown finality is explicitly handled.
- Result: pass.

## Round 17 — Spec 208 browser/CUA coverage

- Checked session start, observe, typed action, instruction, file transfer,
  wait, review gate, verify and human takeover.
- Confirmed typed target binding, allowlist, feature flag, evidence, fencing,
  finality and cleanup requirements, including the existing four shared node
  constants.
- Result: pass.

## Round 18 — Specs 210/211 external runtime coverage

- Checked Orca-preferred route, prompt submission proof, cancellation/
  reconciliation/cleanup and ACP/Gas City direct/session/fleet composition.
- Confirmed workflow definitions store logical requirements only; transient
  session/pane/worktree/bead IDs remain run state with child lineage.
- Result: pass.

## Round 19 — Cross-spec runtime/economic/security integration

- Traced admission from node policy through capability/runtime/Runner/browser/
  external route resolution into canonical jobs, outbox, events, verification,
  artifacts and economic facts.
- Checked duplicate-dispatch prevention, tenant authority, secret redaction,
  approval boundary, resource limits and truthful unavailable state.
- Finding: certification needed explicit cross-spec matrix columns. Fixed in
  Section 12 and the TDD plan.
- Result: pass.

## Round 20 — Plan ownership, acceptance and proof boundary

- Checked `spec.md`, synthesized spec, deep-plan, TDD plan, Sections 01/02/06/
  07/09/12, and this review record for consistent IDs and sequencing.
- Confirmed companion-spec functions have either a dedicated node contract or
  explicit execution metadata, an owning authority, a representative workflow,
  tests and a truthful external-proof boundary.
- Confirmed this remains a planning amendment: source runtime/UI is not claimed
  complete until deep-implement and browser/provider certification pass.
- Result: pass.

## Round 21 — Spec 204 exact runtime enums

- Rechecked runtime targets against the source contract: `CLOUD_SHARED`,
  `CLOUD_JOB_ISOLATED`, `CLOUD_SESSION_ISOLATED`, `SANDBOX`, `LOCAL`, and
  `EXTERNAL_PROVIDER_NO_CONTAINER`.
- Rechecked exact profile IDs: `media-utils-runtime`, `video-render-runtime`,
  `remotion-render-runtime`, `document-runtime`, `hermes-runtime`,
  `code-sandbox-runtime`, and `cpu-ml-runtime`.
- Finding: the first amendment used shortened profile names. Fixed them in the
  cross-spec contract, deep-plan, and TDD plan; clarified that approved
  `SANDBOX` is not retired OpenSandbox.
- Result: pass.

## Round 22 — Spec 208/210 route policy

- Rechecked browser route choices (WebMCP, DOM/deterministic, local Runner,
  cloud/native CUA), upgrade/fallback reason, takeover, and postcondition.
- Rechecked Orca `native_preferred` alongside `orca_preferred` and the full
  workspace/model/parallelism/reasoning/duration/cost/approval requirements.
- Finding: these route details were implicit. Fixed them in the cross-spec
  contract and implementation plan.
- Result: pass.

## Round 23 — Final cross-spec convergence

- Re-ran exact enum/function checks, catalog count/duplicate checks, local link
  and whitespace checks, `check-sections.py`, and `check-ui-contracts.py`.
- Result: 112 unique normative node rows, 28 cross-spec catalog rows, 12/12
  sections complete, no UI contract warnings, no local link or whitespace gap.
- Result: pass; source runtime implementation and external/browser proof remain
  deep-implement/certification work, not falsely marked complete here.
