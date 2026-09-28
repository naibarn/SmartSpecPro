# Feature 157 — TDD Implementation Plan

This document mirrors `claude-plan.md`. Tests are written before implementation
for each section, using existing Vitest, Playwright, and pytest conventions.
These are test stubs and acceptance descriptions, not implementations.

## Section 01 — Assurance contracts, context snapshot, and runtime mapping

### Type/schema tests

- Snapshot canonicalization is order-independent and fingerprint changes for
  every authoritative profile/source/canon/claim/coverage/binding change.
- Optional fiction source and required non-fiction source policies parse with
  correct null/readiness behavior.
- All thirteen registry profiles resolve profile/fact/visual/B-roll policy.
- All Vertical Drama task kinds map to a valid `OrchestraTaskKind` and manifest.
- Unsupported runtime version, tenant mismatch, invalid evidence/status/role,
  missing context, and invalid side-effect policy return stable codes.
- Legacy wrapped request remains parseable and preserves original fields.

### Pure function stubs

- `buildProductionContextSnapshot` emits deterministic identity/revision/hash.
- `mapVerticalDramaTaskToRuntimeCapability` rejects unmapped tasks.
- `buildAssuranceUiProjection` derives only server-owned actions.

## Section 02 — Durable attempts, state machine, events, and reconciliation

### Repository/transaction tests

- Duplicate admission with the same tenant/task/source/idempotency tuple returns
  one attempt and no duplicate event.
- Concurrent admission and final CAS cannot activate two candidates.
- Lease renewal/fence loss prevents stale worker event append and activation.
- Ordered event replay produces the same durable projection after Redis expiry.
- Newer active version causes stale/retryable result without overwriting it.
- Reconciliation is repeat-safe for unknown provider/credit outcomes.
- Legacy Feature 151/152 records project safely without fabricated ownership or
  score; additive records are dual-readable.

### Migration tests

- Existing Feature 152 assurance rows migrate/read without blocking draft save.
- New nullable/versioned fields work before and after flag activation.
- Proven-only backfill leaves ambiguous records unchanged and auditable.

## Section 03 — Credit, retry, provider authorization, and final gate

### Billing tests

- Deterministic no-op creates no reservation or deduction.
- Reservation/draw/refund is idempotent under duplicate worker delivery.
- Known model usage is charged exactly once on valid, malformed, and timeout
  responses.
- Unknown usage is pending reconciliation, not silently charged/refunded twice.
- Shadow comparison has platform-owned/fixture cost and zero user charge.
- Fallback call is bounded and records separate provider call IDs.

### Provider/final-gate tests

- One authorization token cannot be replayed or used with another output hash.
- Provider acceptance uncertainty blocks duplicate submission and auto-refund.
- Required mode, rights/disclosure, current fingerprint, credit state, and
  provider capability are all required before paid readiness.

## Section 04 — Draft QC recovery and repair integration

### Regression tests

- Valid baseline followed by immutable `storyContract` mutation projects as
  recovered with a current exact result and preserved history.
- Repair using that current recovered result succeeds without the observed
  “completed, current QC result” precondition error.
- Missing, stale, wrong-fingerprint, wrong-contract, and already-running repair
  paths return distinct error codes and actions.
- Invalid repair preserves the valid baseline and never activates a candidate.
- Newer user edit wins over concurrent repair through CAS.
- Cancellation, worker restart, Redis expiry, and refresh restore safe state.
- Zero improvement rounds is evaluate-only; normal policy remains bounded and
  nonzero unless explicitly selected.

### Router/UI tests

- Existing procedures and legacy fields remain compatible.
- Projection drives repair/retry/cancel/continue actions without client inference.
- No raw `TRPCClientError` is the only visible message.

## Section 05 — Profile/source/visual context and cross-stage admission

### Profile/source tests

- Each of thirteen profiles passes its required/optional source policy.
- Non-fiction facts/claims/freshness/rights/disclosure/coverage checks are
  profile-specific and do not upgrade illustrative media to evidence.
- Snapshot source/segment/visual-canon drift marks only affected descendants
  stale and prevents mixed fingerprints.
- Scene anchor/reference/still B-roll/footage B-roll roles remain distinct.

### Media tests

- Missing managed object, invalid segment trim, duration overflow, audio
  collision, crop/safe-zone error, and stale rights are actionable without
  deleting the source or silently regenerating it.
- Every enabled downstream entry point rejects missing context admission.

## Section 06 — Agent Runtime orchestration and graceful degradation

### Node/Python contract tests

- Canonical assurance hash and attempt echo match across Node and Python.
- Shared task mapping, capability manifest, version range, side-effect token,
  and tenant scope are validated on both sides.
- Runtime completion with `provider_ready` still fails Node final gate when
  domain `requiredMode`/source/rights/credit/currentness is not satisfied.

### Runtime-mode tests

- Legacy executes existing helper and deterministic validation.
- Shadow runs comparison without user credit/domain side effect.
- Active returns structured proposal and post-validation result.
- Manifest missing, timeout, gateway error, recursion ceiling, tool denial, and
  checkpoint interruption use the correct fallback or final-boundary state.
- Trace payload redaction and stable correlation IDs survive errors.

## Section 07 — Story, prompt, video, B-roll, and season adapters

### Cross-stage contract tests

- Premise/architecture/full story carry profile/context/source/claim references.
- Full story emits shot contracts sufficient for downstream derivation.
- Start frame requires scene anchor; reference prompt cannot overwrite it.
- Video prompt preserves approved frame/reference manifest, speaker, cast,
  position, dialogue, action, timing, and provider limits.
- B-roll preserves immutable segment, rights/disclosure, trim, audio, crop, and
  context fingerprint.
- Provider-limit compression never reports lossy truncation as provider-ready.
- Incomplete story/season candidates remain out of active production.

### Profile matrix tests

- All thirteen profiles traverse context → story → frame/reference → video →
  B-roll/assembly → post-QC with expected blockers/repair actions.

## Section 08 — API projection, UI continuity, and accessibility

### Component/interaction tests

- Queued/running state preserves edit/save/inspect and exposes cancellation.
- Recovered/awaiting/stale/reconciliation states expose only server-authorized
  actions and preserve the editable baseline.
- Refresh/reconnect reconstructs projection and does not duplicate mutations.
- Existing wizard step IDs/routes and panel props/legacy fields remain stable.
- Thai/English copy maps every stable error code and has fallback behavior.
- Keyboard order, focus restoration, accessible names, semantic live status,
  contrast, and reduced-motion behavior pass.

### Browser tests/evidence

- Authenticated wizard/QC flow passes at 390x844, 768x1024, and 1440x900.
- Extended dense-layout viewports 360x800, 1024x768, and 1280x800 are checked
  where supported.
- Console, overflow, loading/error/success, focus, labels, and primary action
  reachability are recorded in `implementation/ui-browser-evidence.md`.

## Section 09 — Security, observability, migration, rollout, and runbook

### Security tests

- Cross-tenant source, attempt, trace, repair, and reconciliation access fails
  closed without leaking existence/details.
- Retrieved prompt-injection text, arbitrary URL/internal address, oversized
  evidence/media, and resource exhaustion are bounded/rejected.
- Agent tools/manifests cannot perform unauthorized DB/credit/provider/storage
  side effects.

### Operations/migration tests

- Metrics contain no private prompt/story/media URL/token payloads and correlate
  attempt/provider/trace/event IDs.
- Feature flags shadow/active/kill-switch/rollback preserve accepted data and
  the legacy path.
- Migration upgrade, dual-write/read, proven backfill, rollback, and worker
  restart do not block authoring or duplicate effects.
- Runbook queries identify source/context/candidate/provider/credit evidence.

## Section 10 — Cross-section integration, production proof, and closeout

### Full matrix

- Focused web and Python suites pass for all changed seams.
- Replay fixtures cover every mandatory acceptance scenario in spec §13.6.
- Cross-section exports/imports, flags, schemas, migration order, and action
  projections are consistent.
- Authenticated browser matrix and UI evidence are recorded honestly.
- Staging/provider/canary/deployment/migration evidence is separated from local
  test claims.
- `git diff --check` and dirty-worktree ownership checks pass.
