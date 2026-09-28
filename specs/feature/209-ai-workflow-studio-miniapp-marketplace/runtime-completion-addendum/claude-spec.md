# Synthesized specification — Spec 209 runtime completion

## Objective

Turn the current Spec 209 foundation into a governed, durable Workflow Studio
and Mini App/Marketplace runtime while preserving the three attached mockups.
The completed system must let an authorized user discover or open a specific
immutable Workflow Version, preflight its dependencies and entitlement, submit
an approved run through the canonical Feature 195 Job control plane, observe
durable progress, handle approval/retry/cancel/resume, and receive authorized
schema-driven outputs and artifacts.

## Scope

The work covers:

1. Library and Marketplace detail, filtering, dependency/readiness and
   entitlement contracts.
2. Server-authoritative Workflow Version run-intent and canonical Job handoff.
3. Full, partial, run-from, run-until, node and subflow execution modes with
   immutable checkpoints.
4. Durable approval/user-input waits, retry, cancel, resume and stale-command
   fencing.
5. Output schema, artifact publication, preview and recovery states.
6. Trace, logs and activity projections over canonical Job events.
7. Mockup-led UI state completion, bilingual copy, responsive/accessibility
   behavior, browser proof and release gates.

## Out of scope

- A new workflow queue, lease, retry or settlement authority.
- Direct provider/CLI/Runner execution from the Web client.
- Reintroduction of `/workflows`, Agency, workpacks or OpenSandbox.
- Arbitrary Marketplace JavaScript execution.
- A duplicate Marketplace wallet or ledger.

## Authority model

Feature 195 owns Job/attempt/lease/outbox/event/finality state. Spec 207 owns
economic quote/authorization/reservation/capture/release/settlement. Spec
210/200/206 own external Runner/provider capability execution. Spec 209 owns
workflow semantic definitions, immutable versions, Mini App packaging,
dependency/readiness presentation, run intent normalization and workflow-level
projections.

## Product behavior

### Library and Marketplace

The Library exposes authorized drafts, published versions, saved views,
recent/pinned items and run history projections. Marketplace exposes published
public packages only, with exact version identity, tags, dependency manifest,
readiness, entitlement, creator/pricing disclosure and degraded/unavailable
states. Both surfaces support detail/open/preflight; Marketplace additionally
supports invoke after server rechecks.

### Run admission

The server accepts a run intent containing the exact definition/version, input,
run mode and idempotency key. It resolves tenant/actor, validates input,
checks access/entitlement/dependencies/policy/economics, compiles the workflow
to a compatible approved plan, and submits canonical Job definitions. Every
step must have a registered `jobType`/contract executor so the durable path can
continue from outbox to canonical consumer and approved Runner/provider
adapter. The client receives a durable workflow-run reference with Job/attempt
correlation.

### Execution modes and recovery

Full, run-until, run-from, node and subflow modes use version-bound input
fingerprints and checkpoint digests. Resume reuses valid upstream results by
default. Approval/user-input waits, retries, cancel and resume use canonical
Job commands and preserve all attempts/events. Browser refresh or disconnect
does not lose the run.

### Results and observability

Output schemas drive result rendering. Artifacts are published via validated
tenant/job storage references and support pending/partial/ready/expired,
failed and recovery-required states. Trace, logs and activity show ordered,
redacted canonical events and clearly distinguish admission, dispatch,
provider effect, completion and reconciliation-required states.

## UI/UX contract

- Target user: a creator who inspects and lightly corrects an AI-proposed
  workflow, runs it safely, reviews progress/artifacts and recovers from
  approval or failure states.
- Surfaces: Dashboard entry, Builder, Subflow/Binding, Library, Marketplace,
  Run/Mini App, approval/recovery panels and debug drawer.
- The Builder is an interactive graph editor: node movement and selection,
  typed edge creation/deletion, graph validation, schema-driven Properties and
  draft persistence are first-class behavior, not visual placeholders.
- Every visible action has a real command/result state or an explicit disabled
  reason. A static notice is not an implementation of Publish, Run, Open,
  Improve with AI, Canvas settings, tabs or debug actions.
- Visual source: the attached `01-main-builder-top-down.png`,
  `02-subflow-data-binding.png` and `03-run-debug-mini-app.png`; no replacement
  screen or visual language.
- State matrix: loading, empty, selected, focus, disabled, invalid, blocked,
  dependency unavailable, approval pending, running, partial, retrying,
  cancel pending, resumed, success, failed, expired and recovery required.
- Responsive: desktop canvas/inspector/drawer; tablet sheet or stacked
  inspector; mobile single column with persistent status/action access.
- Accessibility: keyboard navigation, semantic buttons/tabs/labels, focus
  rings, live status announcements, contrast, reduced-motion-safe transitions.
- Copy: all user-visible text has paired English/Thai keys; reasons for blocked,
  unavailable, denied and retryable states are explicit.
- Evidence: focused Vitest/router/service/migration tests and Playwright at
  390x844, 768x1024 and 1440x900, plus integration evidence for real Job,
  Runner/provider, artifacts and economics.
- Rollout evidence: additive migration, feature-flag canary, active-run
  drain/rollback behavior and rebuild/reconciliation evidence.

## Acceptance boundary

The feature is production-ready only when a real run can be admitted through
Feature 195, observed from durable events, recovered/cancelled/retried safely,
and produce authorized output/artifact/economic evidence. A UI-only or mocked
run is not acceptance evidence.
