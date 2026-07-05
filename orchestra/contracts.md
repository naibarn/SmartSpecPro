# Wave 1 Contract (parallel: backend pipeline wiring + frontend navigation)

## Shared interface
`trpc.verticalDramaEpisodes.getEpisodeDetail` gains a new field:
```ts
storyboardReviewId: string | null   // episode's mediaStudioStoryboardReviews id, once created
```
(alongside the already-existing `dialogueAudioPlan` and `storyboard` fields added in a
prior session.)

Behavior contract: running the `create_storyboard_review_project` stage via
`runStage({ stage: "create_storyboard_review_project", mode: "full" })` must, on success,
result in `episode.storyboardReviewId` being non-null on the NEXT `getEpisodeDetail` fetch
(after the existing `invalidateRuns()` → `getEpisodeDetail.invalidate()` call already wired
in `VerticalDramaEpisodePage.tsx`).

## Ownership boundaries
- **Agent A1 (backend, ssp-backend)** owns:
  - `apps/web/server/services/verticalDramaEpisodePipeline.ts`
  - `apps/web/server/routers/verticalDramaEpisodes.ts`
- **Agent A2 (frontend, ssp-frontend)** owns:
  - `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx`
  - `apps/web/client/src/components/verticalDramaSeries/VerticalDramaEpisodeWorkspace.tsx`
  - `apps/web/client/src/components/verticalDramaSeries/verticalDramaWorkspaceCopy.ts` (new
    label only, e.g. "Open Storyboard Review" / "เปิด Storyboard Review")

No file overlap between A1 and A2 — safe to run fully in parallel.

## Test boundary
- A1 tests: typecheck clean; if a pipeline test file exists for this stage, extend it,
  otherwise a manual `pnpm check` pass is sufficient (no pipeline-level test file exists
  today per the prior session's backlog note — do not build a new test harness from
  scratch for this bounded change, just don't regress existing coverage).
- A2 tests: typecheck clean; manual reasoning about the click → mutate → invalidate →
  refetch → navigate sequence (no dedicated component test required for this bounded UI
  change).

## Impact boundary
- IN SCOPE: making `create_storyboard_review_project` real (calls
  `createVerticalDramaStoryboardHandoff`), exposing the resulting id, and adding a
  navigation affordance in the episode workspace.
- OUT OF SCOPE for Wave 1 (belongs to Wave 2, sequential, single agent, after this
  contract is fulfilled): `StoryboardReviewPage.tsx` changes (wiring
  `VerticalDramaStoryboardReviewPanel`'s `onEditVideoPrompt`/`onRepair`, and prompt-
  optimizer integration into the single-shot generate-video path).
- OUT OF SCOPE entirely this round: append-only prompt-edit-history persistence, sub-shot
  editing UI, breadcrumb nav, "prompts used" read-only historical view — these are
  legitimate section-06 acceptance items not required to satisfy the user's immediate ask;
  flagged to backlog.
