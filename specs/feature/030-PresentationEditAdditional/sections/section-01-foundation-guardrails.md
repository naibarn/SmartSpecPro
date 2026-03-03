# Section 01: Foundation Guardrails

## Objective
Create cross-stream guardrails so implementation can proceed safely across TypeScript (web/server) and Python (worker) without contract drift.

## Scope
- Freeze baseline fixtures and quality metrics.
- Define warning contract compatibility rules and mixed-version deployment gate.
- Establish deterministic replay baseline and shared test command matrix.
- Confirm security and tenant-isolation regression gates are release-blocking.

## Dependencies
- None. This section must complete first.

## Target Files
- `specs/feature/030-PresentationEditAdditional/implementation-plan.md`
- `specs/feature/030-PresentationEditAdditional/implementation-plan-tdd.md`
- `apps/web/server/services/presentationPlaybackExport.test.ts`
- `apps/web/server/routes/slideRender.test.ts`
- `python-backend/tests/test_presentation_render_task.py`

## TDD First (Stubs)
- Stub: deterministic replay harness for identical deck + seed.
- Stub: mixed-version matrix gate (`old reader/new writer`, `new reader/old writer`).
- Stub: security regression gate for internal render auth/token/tenant checks.
- Stub: baseline metric capture for success rate, timeout rate, placeholder rate, p95 latency.

## Implementation Tasks
1. Create baseline test fixture set for dense-media, SVG, and video-motion decks.
2. Add shared release-gate checklist in feature docs for compatibility/security thresholds.
3. Document and enforce tolerant-reader-first deployment order.
4. Add test execution matrix (web unit/integration + python worker tests) as mandatory pre-merge gate.

## Validation
- Baseline fixtures are versioned and reproducible.
- Compatibility matrix tests fail if either direction is missing.
- Security tests remain green with no skipped negative-path cases.

## Risks and Rollback
- Risk: early guardrails too weak cause rework in later streams.
- Rollback: tighten gates before enabling any canary promotion.

## Done Criteria
- All section prerequisites for streams 02-07 are documented and test-gated.
- Compatibility/security gates are explicit and executable.

## As-Built (2026-03-03)

### Actual Files Changed
- `specs/feature/030-PresentationEditAdditional/implementation-decision-log.md`
- `specs/feature/030-PresentationEditAdditional/implementation-progress.md`
- `specs/feature/030-PresentationEditAdditional/implementation-blocked-tasks.md`
- `specs/feature/030-PresentationEditAdditional/reviews/section-01-review.md`
- `specs/feature/030-PresentationEditAdditional/sections/section-01-foundation-guardrails.md`

### Deviations from Plan
- Test command adapted from pnpm to npm due local runtime policy.
- `slideRender` route tests required elevated execution to allow local port binding in this environment.

### Tests Added/Updated
- No new tests added in this section run.
- Executed baseline guardrail suites:
  - `server/services/__tests__/aiPresentationService.test.ts`
  - `server/routes/slideRender.test.ts`
  - `server/services/presentationPlaybackExport.test.ts`
  - `python-backend/tests/test_presentation_render_task.py`

### Known Follow-ups
- None.
