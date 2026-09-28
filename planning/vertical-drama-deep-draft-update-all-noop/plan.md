# Fix: "อัปเดตเนื้อเรื่องละเอียดทุกตอนย่อย" is a silent no-op for large series

## Problem statement

Clicking **"อัปเดตเนื้อเรื่องละเอียดทุกตอนย่อย (9 ช็อต + บทพูด)"** on a large series
(`targetEpisodeCount > 20`, e.g. series 17 = 30 episodes) appears to "stop
silently" and never finishes drafting all sub-episodes. Two clicks both did
nothing visible.

## Root cause (confirmed from Redis + DB, not guessed)

The background job **completes in ~60ms doing zero LLM work** — which looks
identical to "stopped" in the UI.

1. `targetEpisodeCount = 30 > VD_DEEP_DRAFT_HORIZON_ALL_THRESHOLD (20)`, so
   `resolveDeepDraftHorizon(undefined, 30)` returns the large-series default
   `VD_DEEP_DRAFT_DEFAULT_HORIZON_FOR_LARGE_SERIES = 3` — **not "all 30"**.
2. The primary CTA calls `generateStoryBibleDeep` **without `horizonEpisodes`**,
   so the effective horizon is only episodes 1–3.
3. Episodes 1–3 already have valid 9-shot drafts. The resilient-resume skip
   logic (`resolveDeepDraftResumeState`, source #2) correctly marks them
   "already drafted" and skips them.
4. Horizon = {1,2,3}, all already drafted → **0 episodes to draft** →
   `generateStoryBibleDeep` makes **0 calls**, returns `draftedItems: []`.
5. Job record proves it: `callsMade: 0`, `chunkSizes: []`, `creditsUsed: 0`,
   succeeded in 62 ms. Client `onSucceeded` fires a "generated 0 sub-episodes"
   toast → reads as "stopped".

**Why it never finishes:** for any series > 20 episodes, once the default
3-episode horizon is drafted, this button is *permanently* a silent no-op. Only
the separate "ขยายร่างอีก 5 ตอนย่อย" button drafts eps 4–30. The primary
button's label ("ทุกตอนย่อย") does not match its capped-at-3 behavior.

**Secondary defect (data regression):** the no-op run still appended a NEW
breakdown version and stamped `deepDraft.horizonEndEpisode = 0` (because
`result.draftedItems.reduce(Math.max, 0) = 0` over an empty list). That is why
the UI shows "ถึงตอนย่อยที่ **0**" even though 3 episodes are still drafted. Each
click also creates a junk version.

## Decision (user-approved 2026-07-14)

1. For large series the primary CTA must **draft all remaining episodes** and
   continue-to-completion — re-clicking drafts the un-drafted ones (already-drafted
   are skipped, credit-safe) until every episode is drafted.
2. **Repair series 17 data**: restore `horizonEndEpisode` 0 → 3 (with backup).

## Fixes

### A. Client — `apps/web/client/src/components/verticalDramaSeries/VerticalDramaDeepStoryDraftsPanel.tsx`
- `runDeepDraftOnly` + `runChain`: pass `horizonEpisodes: totalEpisodes` in the
  `generateMutation.mutateAsync({...})` call (only when `totalEpisodes > 0`), so
  the primary CTA targets ALL episodes. (`extendStoryDraftHorizon` unchanged.)
- `computeDeepDraftDisplayHorizon`: return `safeTotalEpisodes` always (drop the
  3-cap) so the confirm-dialog estimate reflects the true "all" scope.
- Handle the new `alreadyComplete` response (see B): when the mutation returns
  `{ jobId: null, alreadyComplete: true }`, show an info toast
  ("ทุกตอนย่อยร่างครบแล้ว…") + `invalidateSeries()`, and do NOT poll.

### B. Server mutation — `apps/web/server/routers/verticalDramaSeries.ts` `generateStoryBibleDeep`
- After computing `episodesToDraft`, compute
  `remainingToDraft = episodesToDraft.filter(i => readItemShotDrafts(i) === null)`.
- If `remainingToDraft.length === 0` → return
  `{ jobId: null, deduped: false, alreadyComplete: true }` WITHOUT enqueuing and
  WITHOUT charging credits (prevents the doomed no-op job entirely).
- Otherwise estimate credits on `remainingToDraft.length` (not
  `episodesToDraft.length`) so a user with credits for the remaining episodes is
  not falsely blocked by already-drafted ones.

### C. Server executor — `runGenerateStoryBibleDeepJob` (same file)
- Fix `horizonEndEpisode` (currently line ~1525) to compute over the **merged**
  drafted state so it never regresses:
  `mergedItems.reduce((m,i)=> readItemShotDrafts(i)!==null ? Math.max(m,i.episodeNumber) : m, 0)`.
- If `result.draftedItems.length === 0 && !ledgerPlan`: skip the
  `appendBreakdownVersion` + bible write (no junk version, no regression) and
  return the current state with the corrected horizon. Defense-in-depth for the
  enqueue-then-state-changed race.

### D. Data repair — series 17
- Backup `vertical_drama_series` row (Database Safety Protocol), then set the
  active version's `deepDraft.horizonEndEpisode` 0 → 3.

## Affected files
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaDeepStoryDraftsPanel.tsx`
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaCopy.ts` (new "already complete" copy)
- `apps/web/server/routers/verticalDramaSeries.ts`
- Tests: `verticalDramaSeries.deepStoryDrafts.test.ts`, panel/action tests
- DB: series 17 row (data repair)

## Risk assessment
- Behavior change: primary CTA now drafts ALL episodes at premium → higher
  per-run credit/time cost. Mitigated by (a) resilient-resume already shipped
  (long runs survive restarts), (b) already-drafted episodes skipped, (c) credit
  precheck now scoped to remaining episodes.
- `computeDeepDraftDisplayHorizon` change may break unit tests asserting the old
  3-cap — update them.
- Mutation return shape gains nullable `jobId` + `alreadyComplete` — client poll
  path must guard against `null` jobId.

## Verification
- Unit: `pnpm vitest run` for deepStoryDrafts server tests + panel tests.
- `pnpm check` typecheck.
- Manual: on series 17, click "update all" → drafts eps 4–30 (in chunks); a
  second click after completion → "already complete" info toast, horizon stays
  at 30, no junk version, no regression to 0.
