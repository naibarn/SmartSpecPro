# Implementation plan

## Objective

Make every Vertical Drama LLM stage produce a durable, complete result or a clear resumable failure, and make every real call auditable on the Credits page with exact skill/model/round metadata.

## Workstreams

### 1. Shared call billing and effective-model propagation

Create a small helper around `deductCreditsForModel` that accepts owner, skill slug, stage, round, retry index, scope, job/run id, provider call id, actual model, token usage, and a stable attempt key. It must fail closed when `skillSlug` is absent, preserve idempotency, and return the charged amount. Use it immediately after each successful provider response, before schema/quality acceptance. Keep billing errors durable/visible and never pretend a call was free.

Update Vertical Drama planning callers to use the `model` returned by `executeJsonPlanningCallWithRetry` (and provider-reported model/cost where available), not the initial requested model. Apply this to story plan, deep standard and premium calls, continuity repair, ledger planning, prompt expansion, and script repair.

### 2. Canonical completion predicate and durable auto-repair

Add a shared server predicate for a planned episode: required episode number exists, expected shot structure is present, each shot is valid, and the episode has at least one usable spoken line. Treat empty/malformed deep drafts as incomplete even if `shotDrafts` exists.

Extend the existing story job payload/checkpoint/result with completion stage, target episode numbers, missing episode numbers, repair round, and per-call billing references. After plan/deep generation and after every repair, load the canonical active bible, compute the predicate, and process only missing episode numbers. Each repair round calls the real deep-draft skill with a new attempt key, charges it, persists the successful subset, and rechecks the predicate. Bound repair rounds; on exhaustion, mark the job failed/needs action with exact diagnostics.

The primary deep-draft “update all episodes” action must start this completion loop automatically, so a user does not need to click update again merely because the first result was partial. Existing complete episodes are skipped; incomplete episodes are repaired.

### 3. Prompt expansion completion

Use the same validation/repair contract for prompt expansion. The first real response is billed even when it fails output validation. A schema/quality repair is a distinct billed attempt and uses a distinct key. Persist the accepted preview only after validation; persist failure diagnostics and transaction references when bounded repair is exhausted. Keep the 5,000-character input lock and visible counter.

### 4. QC per-call billing and automatic repair loop

Refactor QC evaluation/revision call sites so each actual evaluate/revise call writes its own `skillSlug=vertical-drama-draft-quality-controller` usage transaction with model, phase, round, attempt, draft fingerprint, and job id. Retain preflight reservation only as an availability guard; do not let one reservation/refund obscure individual calls. A failed QC result automatically invokes the existing repair skill and then a new QC evaluation until pass or bounded exhaustion. Persist all history and transaction references for refresh.

### 5. Full-story/script repair boundary

Keep story plan/deep draft completion in the story worker. For the explicit full-script repair skill, automatically apply only when the existing immutable/staleness gates pass; otherwise keep the review confirmation boundary. Add a post-generation completeness check that detects absent dialogue before showing success; route missing deep-draft dialogue to the deep-draft repair stage, not to a synopsis-only update.

### 6. Credits page and API

Ensure `getTransactionHistory` returns all call rows with stable ordering and exact skill joins. Add normalized display metadata for stage/round/episode/job/model when present, while retaining backward-compatible descriptions. Add focused UI/API tests proving prompt expansion, plan, deep primary, deep repair, QC evaluate, QC revise, and script repair each appear as separate rows with exact slug and actual model.

## Acceptance criteria

- A 50-episode request never reports success while any target episode lacks a valid deep draft or usable dialogue.
- A partial provider response triggers bounded automatic repair without a second user click.
- Every successful provider response produces exactly one usage transaction for its logical physical attempt; redelivery of the same attempt is idempotent; a new repair/re-run charges again.
- Every transaction has a non-null exact `skillSlug`; model metadata equals the model that actually answered; stage/round/scope/job correlation is present.
- A schema-invalid response is not displayed or persisted as accepted output, but its real provider usage is still charged and visible.
- Refresh restores the active job, canonical prompt/draft/QC state, and all prior rounds.
- Provider/network failure is surfaced as resumable failure; no generated fallback prose/dialogue is inserted.
- Existing unrelated flows and media generation are unchanged.

## Rollout and safety

- Add tests before implementation changes.
- Use feature flags only for rollout if an existing flag is already available; do not make production silently degrade.
- Run focused server/client tests, changed-file diagnostics, `git diff --check`, and migration checks if schema changes are needed.
- Browser/provider/deployment proof is separate and must be reported as unperformed unless actually executed.
