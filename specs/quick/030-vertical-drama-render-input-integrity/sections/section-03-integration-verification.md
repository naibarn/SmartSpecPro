# Section 03 — Integration and verification

## Implementation status

Completed 2026-07-13. Both single-image and angle-grid mutations enforce the
same attachment contract. Native dialogue is protected at split, persistence,
and provider boundaries. Verification passed 238 targeted tests, TypeScript
`tsc --noEmit`, and scoped `git diff --check`.

## Ownership

- Image and video mutations in `apps/web/server/routers/verticalDramaEpisodes.ts`
- Targeted router tests
- Client page only if existing error propagation proves insufficient

## Dependencies

Sections 01 and 02 must be complete first.

## Work

1. Wire the shared image contract into single-image and angle-grid procedures.
2. Wire final dialogue validation before persistence and provider submission.
3. Assert zero credit/provider calls on every failed preflight.
4. Run scoped tests, typecheck, `git diff --check`, and inspect the final provider payload assertions.

## UI/UX Contract

- Target user/JTBD: a creator generating a shot should know exactly why generation cannot start and how to fix it.
- Surface: existing Vertical Drama shot card and existing toast system.
- Components: no new component expected; reuse mutation `onError` toast and loading cleanup.
- States:
  - ready: generation behaves normally;
  - missing portrait: blocking toast lists all missing characters;
  - stale/unknown key: blocking toast distinguishes invalid roster data;
  - capacity mismatch: blocking toast states required and supported counts;
  - success: existing polling flow remains unchanged.
- Responsive: toast behavior remains existing desktop/tablet/mobile behavior; no layout changes.
- Accessibility: error remains announced through the existing toast implementation; button loading state must clear after rejection.
- Copy: Thai primary copy is direct and actionable; existing English fallback conventions remain intact.
- Browser evidence: not required unless client code changes. If it changes, verify one missing-reference toast and cleared loading state at desktop and tablet width.

## Acceptance

- Persisted prompt and provider prompt satisfy the same contracts.
- No regressions in polling, retry/soften, location/product references, or model transport.
- All scoped tests pass; unrelated dirty-tree failures are reported separately.
