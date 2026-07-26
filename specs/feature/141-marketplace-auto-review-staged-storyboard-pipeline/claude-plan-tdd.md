# Feature 141 — TDD plan for the staged Marketplace Auto Review pipeline

Status: test-first companion to `claude-plan.md`
Framework: Vitest through `pnpm exec vitest` from `apps/web`
Rule: write the test stub/fixture contract before the corresponding production
change; provider live smoke is reserved for the rollout wave.

## 1. Outcome and non-negotiable product rule

Test stubs:

- prove that no image, video, separate audio/TTS, render, or library-finalize
  provider task can be created without its immediately preceding matching
  checkpoint approval;
- prove that text-only authoring may create a reviewable artifact without
  implicitly authorizing the next media stage;
- prove that approval is shot-local and that browser state cannot authorize work.

## 2. Current baseline and compatibility boundary

Test stubs:

- run the existing four-file legacy gate suite as a regression test;
- prove Feature 136, 3x3/start-stop, and legacy `awaiting_plan_review` runs keep
  their existing dispatch and projection;
- prove a persisted v2 run cannot silently switch to v1 when the current flag
  changes.

## 3. Target architecture and state contract

Test stubs:

- validate the canonical v2 metadata shape and reject unknown/malformed
  checkpoint states at the shared contract boundary;
- prove all state mutations preserve architecture/version and revision invariants;
- prove safe projections omit internal directives, provider IDs, storage keys,
  signed URLs, and raw provider errors.

### 3.1 Existing persistence surfaces to reuse

Test stubs:

- verify stage, attempt, lease, outbox, provider-event, and artifact references
  can be reconciled for one run and one shot;
- prove duplicate outbox keys do not create duplicate operations or provider
  tasks;
- prove lease expiry/recovery resumes the frozen architecture without skipping a
  checkpoint.

### 3.2 Canonical v2 metadata

Test stubs:

- assert `stagedSequentialStoryboard.storyPlanStatus` is authoritative for v2;
- assert `planReview` and `statusDetail.state` remain compatibility projections;
- prove legacy `sequentialStoryboard`/`finalQc` projections are never read as v2
  generation state.

### 3.3 Checkpoint record

Test stubs:

- validate each checkpoint kind, scope, revision, hash, actor, timestamp, cost,
  model, safety, and ordered-reference fields;
- prove edit/model/reference/cost/safety/retry changes supersede the old record;
- prove an approved record is consumed once and cannot authorize a second attempt.

### 3.4 Operation and API contract

Test stubs:

- query returns only the authorized run's typed safe projection;
- edit, approve, reject, accept-image, and retry mutations require expected
  revision/state digest and idempotency key;
- duplicate mutation returns the original operation ID;
- stale, wrong-owner, wrong-tenant, cancelled, wrong-architecture, and
  unauthorized requests fail without partial writes;
- every mutation returns a pollable operation envelope rather than provider data.

## 4. End-to-end gated workflow

Test stubs:

- story approval is required before image-prompt compilation;
- each of nine image prompts independently gates its image task;
- each accepted image independently gates Skill B/video-prompt work;
- each video prompt independently gates its video task;
- separate audio/TTS and final assembly each block their paid provider stage until
  approval;
- rejection returns only the affected shot/stage to correction and does not
  invalidate unrelated approved shots;
- bulk approval writes nine independent records and atomically fails on any stale
  item.

## 5. Implementation waves (TDD-first)

### Wave 0 — contract fixtures and regression harness

Test stubs:

- shared schema/property fixtures for exactly nine shots, ten seconds each, and
  90 seconds total;
- checkpoint transition fixtures for all states and no implicit bulk approval;
- forbidden-marker and safe-reason serialization fixtures;
- legacy four-file command remains green.

### Wave 1 — flags, architecture dispatch, and durable operation boundary

Test stubs:

- feature flags default off and allow only the intended architecture;
- start snapshots architecture/version once before authoring;
- v2 start/resume/redraft/retry/recovery never call the three Feature 136
  authoring functions;
- duplicate starts/mutations enqueue once;
- authorization, cancellation, stale revision, and wrong architecture fail
  transactionally.

### Wave 2 — checkpoint state machine and provider spend guard

Test stubs:

- approve/reject/edit/consume behavior for every checkpoint kind;
- each hash, revision, model, ordered-reference, safety, and cost mismatch blocks
  before reservation/submission;
- worker retry/reload creates zero media tasks before approval;
- shot 1 approval cannot release shot 2;
- credit ledger and provider-task fixtures prove the no-spend invariant.

### Wave 3 — Story Arc Planner skill bundle

Test stubs:

- `skill.md` and `SKILL.md` parity, manifest, lock, schema, and verification
  fixtures;
- valid, malformed, oversized, missing-shot, unsafe-claim, speech-overrun, and
  continuity inputs;
- structured-output capability fallback and one-repair limit;
- text credit/idempotency trace;
- valid output enters story review and cannot advance without story approval.

### Wave 4 — deterministic image compiler and per-shot prompt review

Test stubs:

- golden prompt snapshots for the supported image adapters;
- byte-for-byte approved story-summary preservation and product clause rules;
- reference ordering/hash, attachment, model, cost, and safety drift fixtures;
- nine prompt checkpoints are visible and none is auto-approved;
- approving one prompt releases only that shot's image work.

### Wave 5 — image generation, QA, and per-shot image-result approval

Test stubs:

- no image task before prompt approval;
- hard product mismatch cannot be overridden;
- allowed-warning acceptance records evidence and releases only that shot;
- rejection/regeneration is shot-local;
- Skill B receives the exact accepted image hash and is not called before
  image-result approval;
- continuity dependency and bounded active-attempt limits hold under retries.

### Wave 6 — Shot Video Director and video-prompt approval

Test stubs:

- no Skill B before accepted-image approval;
- Skill B input preserves image hash, dialogue, duration, safety, and shot scope;
- schema repair is bounded and has distinct finish reasons;
- no video task before exact video-prompt approval;
- stale approval, changed prompt, and per-shot retry fail closed without affecting
  other shots.

### Wave 7 — audio/TTS and final assembly approval gates

Test stubs:

- separate TTS task is absent before audio-plan approval;
- native video audio does not create a duplicate TTS checkpoint/charge;
- final assembly projection hash includes ordered shots, selected media, audio,
  overlays, warnings, and cost;
- render/library-finalize task is absent before final approval;
- hash drift, missing media, render-probe failure, and missing final QA prevent
  completion while legacy finalization remains green.

### Cross-cutting external dependency failure and backpressure contract

Test stubs:

- structured-output failure, media timeout/rejection, QA failure, TTS failure,
  callback replay, and render failure all produce safe durable reason codes;
- provider retries are bounded, idempotent, and lease-aware;
- invalidated approval cancels queued work before submission;
- per-run/per-shot concurrency limits and queue-age/retry-exhaustion metrics are
  observable;
- no failure path charges the next stage's credits.

### Wave 8 — UI, safe projections, and responsive checkpoint workflow

Test stubs:

- component projections contain no forbidden internal markers or raw errors;
- story, prompt, image-result, video-prompt, audio, and final-assembly cards show
  correct waiting/approved/rejected/stale/pending/error states;
- only the relevant action is disabled while an operation is pending;
- reload/timeout recovers persisted state without auto-approval or duplication;
- bulk approval is atomic and focus/keyboard behavior is accessible;
- browser checks cover 390x844, 768x1024, 1440x900 plus extended risk viewports.

### Wave 9 — diagnostics, credits, observability, and operational runbook

Test stubs:

- every paid call has stage/shot/checkpoint/credit/provider references;
- trace artifacts are hash-unique and sanitized;
- alerts fire for pre-approval spend, legacy fallback, architecture drift,
  replay mismatch, lease expiry, and reconciliation failure;
- raw provider errors and signed URLs remain restricted;
- runbook evidence identifies queue ownership, thresholds, and recovery steps.

### Wave 10 — rollout, live smoke, and rollback proof

Test stubs:

- evaluation corpus covers product/reference/audio/safety edge cases;
- capped live smoke exercises every checkpoint and verifies no-spend evidence;
- internal/percentage rollout gates require all focused suites and cost checks;
- rollback disables new routing without rewriting existing v2 metadata;
- one new legacy run and one resumable frozen-architecture v2 run are proven.

## 6. UI/UX contract

Test stubs:

- component and browser tests cover the target user journey from story review to
  final assembly approval;
- existing Marketplace/Storyboard patterns remain visually compatible;
- Thai-first labels expose checkpoint kind, shot number, cost, state, and safe
  reason;
- semantic headings, live status announcements, focus return, contrast, and
  reduced-motion behavior are verified.

### Target User / JTBD

Test stubs:

- a user can inspect the exact next paid artifact and identify which credit stage
  is still locked;
- a user can approve/reject one shot without changing another shot.

### Existing Pattern Reference

Test stubs:

- regression snapshots/component tests prove reused plan-review and sequential
  review patterns still render legacy flows unchanged;
- v2-only checkpoint controls are present only for the v2 architecture.

### Surface Inventory

Test stubs:

- product detail, plan panel, sequential review, Storyboard Review, and final
  assembly handoff each receive the correct safe projection and mutation state.

### Component Map

Test stubs:

- router/service/worker ownership is exercised through integration contracts;
- component mutations use operation IDs and persisted state, not local approval
  booleans.

### State Matrix

Test stubs:

- loading, awaiting, partial, stale, error, disabled, selected, and focus states
  have explicit assertions and accessible copy.

### Responsive Matrix

Test stubs:

- prompt/reference regions do not overflow at mobile, tablet, laptop, and wide
  desktop viewports;
- primary approval controls remain reachable without hiding cost or state.

### Accessibility Acceptance

Test stubs:

- keyboard-only approval path, focus trap/return, accessible names, live regions,
  semantic table/card headings, contrast, and reduced motion.

### Visual Direction and Design Token Extraction

Test stubs:

- visual regression confirms existing semantic tokens and legacy 3x3/start-stop
  layout are not changed by v2 checkpoint additions.

### Copy Contract

Test stubs:

- required Thai-first labels appear for every checkpoint;
- safe reason-code fallback is used instead of raw provider response text;
- waiting copy does not claim that a provider task is already approved.

### Browser Evidence Required

Test stubs/evidence:

- capture canonical and extended viewports with no console errors or unintended
  overflow;
- record skipped browser checks explicitly when tooling is unavailable.

## 7. Acceptance and verification matrix

Test stubs:

- map each approval/no-spend requirement to a named unit or integration suite;
- run the existing four-file, 130-test legacy baseline before and after v2 work;
- require provider-contract, cost-regression, live-smoke, safe-projection,
  finalization, and rollback evidence before flag enablement.

## 8. Rollout and rollback

Test stubs:

- flags off means no v2 routing;
- existing v2 runs remain frozen and resumable after disabling the flag;
- rollback preserves artifacts, credit references, provider events, and legacy
  compatibility;
- staged percentage rollout cannot proceed when any no-spend or reconciliation
  gate fails.

## 9. File inventory and dependency order

Test stubs:

- contract tests fail if a later wave is imported before its prerequisite;
- each implementation file has an owning test file and no two waves claim the
  same state transition without an explicit integration test;
- final inventory matches the section index and implementation order.

## Test execution notes

Run focused suites from `/home/dev/projects/SmartSpecPro/apps/web` with
`pnpm exec vitest run <paths>`. Keep live provider smoke separate from unit and
component tests. Record the baseline result (4 files, 130 tests) and all new
checkpoint no-spend/legacy-isolation results in the Feature 141 evidence area.
