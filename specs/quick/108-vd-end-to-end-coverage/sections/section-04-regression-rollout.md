# Section 04 — Regression and rollout proof

## Ownership

Prove the mode matrix end-to-end, repair stale async-router fixtures, and stage production rollout with observable gates.

## Target files

- New focused tests listed in `implementation-plan-tdd.md`
- `apps/web/server/routers/__tests__/verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts`
- Existing Wizard/lineage/special-edition tests
- Optional browser evidence under the project’s existing verification convention

## TDD

Run focused red/green tests first, then the complete Vertical Drama regression subset. Keep structural fallback warnings separate from assertion failures.

## Acceptance

- All input modes reach persisted story, episode, provider-bound references, QC, and assembly eligibility.
- Negative cases fail at the correct boundary with stable error codes.
- Browser evidence covers loading, blocked, repair, pass, and success states.
- Browser evidence covers shell-created/queued story generation separately from story-ready/QC-ready.
- Rollout can be enabled per tenant and rolled back without data deletion.

## Risks

Do not broad-stage or clean the dirty worktree. Keep unrelated baseline failures explicitly separated from this feature’s proof.
