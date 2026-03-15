# Implementation Decision Log

## 2026-03-12 Preflight

- section or step: repo state / commit strategy
- options considered:
  - stop until the worktree is clean enough for section commits
  - continue with narrowly scoped additive changes and record the missing commit traceability
- decision taken: continue without section commits
- mode used: auto (`smart_auto`)
- rationale: the user explicitly invoked `deep-implement`, the feature work was already partially in flight, and the overlapping dirty worktree made mixed section commits unsafe.

## 2026-03-12 Section 01

- section or step: shared Browser Session contract location
- options considered:
  - keep copy and summary logic embedded per surface
  - add one shared browser-session contract in the web shared layer
- decision taken: add the shared contract in `apps/web/shared/browserSession.ts`
- mode used: auto (`smart_auto`)
- rationale: Chat, Agency, Workflow, and Automation needed one status, CTA, and summary source of truth to avoid immediate copy drift.

## 2026-03-12 Section 02

- section or step: origin return contract
- options considered:
  - keep per-surface return logic with `/dashboard` fallback
  - standardize launch and return metadata around the existing full-page Browser Session route
- decision taken: use shared launch and return context helpers plus origin-aware route construction
- mode used: auto (`smart_auto`)
- rationale: every surface now needs the same resume behavior, and a single routing contract is lower-risk than per-surface state handling.

## 2026-03-12 Section 03

- section or step: Chat Browser Session rendering model
- options considered:
  - inject free-text status messages into the thread
  - persist a structured Browser Session artifact and summary card in Chat
- decision taken: persist a structured artifact and render a resumable summary card
- mode used: auto (`smart_auto`)
- rationale: Chat needs reopen behavior and stable state rendering, not status text that has to be reparsed later.

## 2026-03-12 Sections 04 And 05

- section or step: Agency integration shape
- options considered:
  - overload generic tool execution or skill-call primitives
  - add a dedicated `browser_session` primitive plus a structured Agency Chat rail
- decision taken: add a dedicated Agency builder primitive and Agency Chat summary rail
- mode used: auto (`smart_auto`)
- rationale: browser collaboration is a first-class product concept here, and the UI needed to reflect that instead of hiding it under generic automation labels.

## 2026-03-12 Section 06

- section or step: Workflow Browser Session semantics
- options considered:
  - replace `web_automation`
  - add additive browser-session node types while preserving legacy execution
- decision taken: add additive workflow nodes and keep legacy `web_automation`
- mode used: auto (`smart_auto`)
- rationale: existing saved workflows must keep running, while new collaborative flows need explicit start, instruction, wait, and review semantics.

- section or step: workflow rollout enforcement
- options considered:
  - limit rollout control to editor-side node visibility
  - enforce `workflowBrowserSessionNodes` on node-registry responses and workflow save, compile, and execute paths
- decision taken: enforce the rollout flag end to end in the Node layer
- mode used: auto (`smart_auto`)
- rationale: editor-only filtering would not satisfy rollback expectations once browser-session nodes existed in saved workflow payloads.

## 2026-03-12 Section 07

- section or step: analytics and telemetry strategy
- options considered:
  - add a feature-specific telemetry stack
  - reuse the existing client analytics helpers and Python observability conventions
- decision taken: reuse the existing analytics and observability patterns
- mode used: auto (`smart_auto`)
- rationale: the feature needed low-cardinality rollout signals quickly, and the repository already had established patterns for both client and server instrumentation.

## 2026-03-12 Section 08

- section or step: agency runtime Browser Session execution path
- options considered:
  - keep Browser Session support limited to Agency builder and manual Chat UI entrypoints
  - execute `browser_session` nodes directly inside the Agency runtime and emit structured stream artifacts
- decision taken: execute `browser_session` nodes in the orchestrator and stream Browser Session artifacts back to Agency Chat
- mode used: auto (`smart_auto`)
- rationale: the user requirement explicitly includes `Agency Swarm -> open browser`, which cannot be satisfied by builder-only wiring or toolbar-only fallbacks.

## 2026-03-12 Section 09

- section or step: live Browser Session rendering strategy
- options considered:
  - keep the workspace as a summary shell until the transport stack is fully finished
  - add a renderer abstraction now and surface an explicit degraded state when embed transport is unavailable
- decision taken: add the renderer abstraction now with explicit degrade and token-refresh behavior
- mode used: auto (`smart_auto`)
- rationale: the product requirement is to visibly show the browser for login, captcha, and checkout handoff steps, but the UI still needs a safe fallback when transport configuration is missing.

## 2026-03-12 Section 10

- section or step: conversational Browser Session invocation
- options considered:
  - wait for assistant-emitted structured tool actions before adding any in-thread launch affordance
  - derive a structured suggestion from user intent heuristics and require explicit confirmation before launch
- decision taken: derive a structured suggestion from conversational intent and gate launch behind a confirmation card
- mode used: auto (`smart_auto`)
- rationale: this keeps the first release additive, preserves toolbar shortcuts, and delivers chat-native launch flow without depending on a new assistant action contract.

## 2026-03-12 Section 11

- section or step: comparison contract placement
- options considered:
  - invent a new transport just for compare-heavy booking or research artifacts
  - reuse the existing agency `structured_result` and preview artifact pipeline with a normalized comparison schema
- decision taken: reuse the existing preview artifact pipeline and add a shared comparison contract on top
- mode used: auto (`smart_auto`)
- rationale: section 11 needed reviewable compare output quickly, and the preview pipeline already had persistence, audit, and fetch-by-run semantics.

- section or step: comparison payload normalization
- options considered:
  - require a single strict casing and provider-specific field spelling from every agent prompt
  - normalize both `snake_case` and `camelCase` compare payloads into one stable UI contract
- decision taken: normalize both casing styles and coerce price, currency, availability, refundability, and evidence fields into a single contract
- mode used: auto (`smart_auto`)
- rationale: browse-heavy comparison output is likely to come from mixed Python, workflow, and prompt templates, so a brittle one-shape-only contract would regress too easily.

- section or step: first reviewable surface for comparison output
- options considered:
  - stop at backend normalization and defer UI until a later wave
  - consume `preview_ready` in Agency Chat and fetch the rendered comparison preview over the existing `getRunPreview` path
- decision taken: consume `preview_ready` in Agency Chat and render a reusable comparison preview card immediately
- mode used: auto (`smart_auto`)
- rationale: the user requirement is explicitly about compare-and-decide tasks such as hotel and ticket review, so section 11 was not complete without an in-chat review surface.

## 2026-03-12 Section 12

- section or step: durable browser barrier contract
- options considered:
  - add new database columns for every barrier field immediately
  - persist a structured `activeBarrier` object inside existing session policy context and expose a typed `barrierType` in serialized session contracts
- decision taken: persist `activeBarrier` in policy context and serialize a typed `barrierType`
- mode used: auto (`smart_auto`)
- rationale: this makes login, captcha, payment, and booking barriers durable without introducing a migration in the middle of the already-dirty live-browser worktree.

- section or step: handling login and captcha barriers
- options considered:
  - allow generic assist resolution to resume AI after any human response
  - treat login and captcha as takeover-first barriers that cannot auto-resume from a lightweight assist response
- decision taken: keep login and captcha blocked until a human takes control and returns it explicitly
- mode used: auto (`smart_auto`)
- rationale: captcha must always block autonomous continuation, and login flows are the same class of high-friction auth barrier in this product slice.

- section or step: payment and booking commitment gates
- options considered:
  - keep generic approval copy and generic approve/reject affordances
  - surface commitment-specific copy and action labels for payment and booking
- decision taken: use barrier-specific review copy and approval labels for payment and booking gates
- mode used: auto (`smart_auto`)
- rationale: irreversible actions need explicit product language so the user understands why AI paused and what approval they are giving.

## 2026-03-12 Section 13

- section or step: advanced rollout gating strategy
- options considered:
  - add another dedicated feature flag layer for every advanced Browser Session slice
  - keep the existing rollout flags and rely on separable transport, preview, and barrier paths plus scenario tests as rollback evidence
- decision taken: keep the existing rollout flags and document scenario-level rollback boundaries instead of adding more flag surface area
- mode used: auto (`smart_auto`)
- rationale: the risky behavior is already isolated by path, and another flag layer would add operator complexity without materially improving rollback precision for this wave.

- section or step: advanced scenario evidence
- options considered:
  - treat the existing unit tests as sufficient
  - add explicit scenario tests for suggested launch persistence, renderer reconnect after token refresh, barrier-specific workflow summaries, and comparison stability
- decision taken: add explicit scenario tests across web and Python boundaries
- mode used: auto (`smart_auto`)
- rationale: section 13 is about canary confidence, so the repository needed a small set of high-signal scenario proofs rather than only capability-level unit coverage.

## 2026-03-12 Finalization

- section or step: post-implementation hardening action
- options considered:
  - `fix_now`
  - `plan_now`
  - `defer`
- decision taken: `defer`
- mode used: auto (`smart_auto`)
- rationale: the implementation slice is green across the targeted web and Python coverage, and the remaining gap is worktree hygiene for section-traceable commits rather than an in-scope runtime or security defect.

## 2026-03-12 Workflow Surface Completion

- section or step: workflow Browser Session UI wiring
- options considered:
  - add a workflow-only Browser Session workspace and custom output viewer
  - reuse the existing Browser Session route and shared summary card, hydrating workflow node outputs into the same artifact shape used by Chat and Agency
- decision taken: reuse the shared Browser Session artifact contract and route
- mode used: auto (`smart_auto`)
- rationale: the product gap was missing workflow UI wiring, not missing Browser Session primitives, so reusing the shared card and route closes the surface inconsistency with the smallest behavioral diff.

- section or step: workflow comparison rendering
- options considered:
  - leave comparison-shaped workflow outputs as raw JSON in execution logs
  - normalize workflow outputs into the same comparison preview card already used by Agency Chat
- decision taken: normalize workflow outputs and render them through the shared comparison preview card
- mode used: auto (`smart_auto`)
- rationale: research and booking workflows need the same review affordance as Agency Chat, and the shared comparison card already matches the structured result contract from section 11.

- section or step: workflow return-path persistence
- options considered:
  - only show Browser Session cards inside execution logs from the original run
  - also persist the latest workflow Browser Session artifact in session storage and restore it when returning from `/automation/live/:id`
- decision taken: persist and restore the latest artifact in session storage
- mode used: auto (`smart_auto`)
- rationale: returning from login, captcha, or review work should not require rerunning the workflow or digging through previous logs to reopen the same Browser Session.

## 2026-03-12 Workflow And Chat Completion

- section or step: workflow runtime Browser Session payload shape
- options considered:
  - keep emitting only `browserSessionId` plus a partial summary and let the client fetch the full session every time
  - emit a render-ready `browserSessionArtifact` from the workflow executor while keeping the legacy summary fields for compatibility
- decision taken: emit `browserSessionArtifact` alongside the legacy fields
- mode used: auto (`smart_auto`)
- rationale: this removes the extra round-trip from normal workflow node-complete rendering without breaking older consumers that still read `browserSessionSummary`.

- section or step: Chat comparison review surface
- options considered:
  - keep comparison previews exclusive to Agency and Workflow
  - teach Chat message rendering to consume structured comparison-preview artifacts using the same reusable card
- decision taken: add comparison-preview artifact support to ChatView
- mode used: auto (`smart_auto`)
- rationale: compare-and-decide tasks can start from plain Chat, so the message surface should understand the same review artifact family instead of forcing a surface change for presentation only.

- section or step: workflow console coverage
- options considered:
  - keep the console limited to explicit console nodes and variable writes
  - derive lightweight browser/comparison summary lines from execution logs so operators can monitor runs without expanding the rich log panel
- decision taken: derive browser and comparison summaries inside the console
- mode used: auto (`smart_auto`)
- rationale: this closes the last obvious operator UX gap in the workflow surface with additive summaries rather than a second state channel.
