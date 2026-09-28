# VD Model Selection — Require Explicit Choice + Persist Per Function

## Problem statement

In the Vertical Drama workspace, image/video generation proceeds even when the user
has **not** explicitly selected an image/video model. The server silently substitutes
`DEFAULT_MODELS.image` / `DEFAULT_MODELS.video` (a **fail-open** fallback), so a render
"leaks through" using a model the user never chose. The user's requirements:

1. **Hard requirement**: a model MUST be explicitly selected before any image/video can
   be generated — enforced on the **server**, not only via client toast.
2. **Persist the choice forever, per function**: once the user picks a model for a given
   function (storyboard image, storyboard video, character image, location image), that
   choice is remembered across episodes/sessions and reused. It must not reset on a new episode.
3. **Each tab is independent**: storyboard / character / location may each use a different
   model; picking one does not force the others.

## Current state (verified)

- **Fail-open resolvers** (the bug): `resolveCharacterImageModelId` (`verticalDramaCharacters.ts:535`,
  reused by locations), `resolveEpisodeImageModelId` (`verticalDramaEpisodes.ts:2659`),
  `resolveEpisodeVideoModel` (`verticalDramaEpisodes.ts:2683`) all return `DEFAULT_MODELS.*`
  when no model is provided.
- Resolvers are called **only** by the 8 user-clicked procedures. No worker/batch path uses them.
- **Two internal video uses intentionally rely on the default** and must stay tolerant:
  `generateShotVideoPrompt` (capability metadata for a *text* prompt) and
  `regenerateClipDialogue` → `resolveEpisodeVideoModel(null)`.
- **Video pack auto-seeds** `selectedVideoModelId: DEFAULT_MODELS.video` at pack creation
  (`setEpisodeVideoPromptLanguage`, `verticalDramaEpisodes.ts:8918`) — so video appears
  "pre-selected" even when the user never chose. This is why video also "leaks through".
- **Persistence already implemented**: storyboard = per-episode DB (`startFramePlan.selectedImageModelId`,
  `motionPromptPack.selectedVideoModelId`) + per-series localStorage default
  (`smartspec_vd_series_{seriesId}_{kind}_model`); character = global localStorage
  `smartspec_vd_character_image_model`; location = global localStorage
  `smartspec_vd_location_image_model`. Client guards exist (`requireModelSelectedOrToast`,
  `requireModelSelected`) but are the *only* enforcement today.

## Approach — fail-closed at the user-facing seam, tolerant for internal defaults

### A. Server — reject when no explicit user selection (image)

1. **Character/Location image** (`verticalDramaCharacters.ts`, `verticalDramaLocations.ts`):
   - Make `selectedImageModelId` **required** in the Zod input (`z.string().trim().min(1)`),
     with a clear error message.
   - Make `resolveCharacterImageModelId` **throw `BAD_REQUEST`** ("กรุณาเลือกโมเดลภาพก่อนสร้าง /
     Select an image model before generating") instead of returning `DEFAULT_MODELS.image`.
     Safe: only 4 interactive callers, all now require the input.

2. **Episode start-frame image / angle variations / repair** (`verticalDramaEpisodes.ts`):
   - Make `resolveEpisodeImageModelId` **throw `BAD_REQUEST`** when the persisted
     `plan.selectedImageModelId` is empty. Safe: only the 3 interactive image procedures call it;
     the pipeline creates the plan but never calls these procedures.

### B. Server — reject when no explicit user selection (video), keep internal defaults

3. **Stop auto-seeding** the pack with `DEFAULT_MODELS.video` in `setEpisodeVideoPromptLanguage`
   (leave `selectedVideoModelId` empty until the user picks), so "selected" reflects a real choice.
4. **`generateVideoClip`** and the **video-prompt-pack generation** action (the user-clicked paid
   seams): throw `BAD_REQUEST` when `pack.selectedVideoModelId` is empty.
5. **Keep `resolveEpisodeVideoModel` tolerant** (returns `DEFAULT_MODELS.video`) so
   `generateShotVideoPrompt` (metadata only) and `regenerateClipDialogue(null)` do not break.
   Enforcement lives in the two paid procedures (#4), not the shared resolver.

### C. Client — better UX + confirm persistence

6. **Disable** the generate buttons (greyed, with tooltip "เลือกโมเดลก่อนสร้าง") when no model is
   selected, in all three tabs — instead of only a reactive toast. Keep the existing toast/guards
   as a backstop; catch the new server `BAD_REQUEST` and surface it cleanly (open picker).
7. **Verify + solidify persistence** end-to-end: storyboard image & video inherit the per-series
   localStorage default on a new episode; character & location reuse their global stored model.
   No functional rebuild expected — this is verification + any gap fix uncovered.

### D. Tests

8. Server: unit/router tests asserting each interactive procedure now **rejects** with no model,
   and still **succeeds** with an explicit model; `generateShotVideoPrompt` / `regenerateClipDialogue`
   still work with the tolerant resolver.
9. Client: tests asserting the generate buttons are disabled with no model and enabled once selected,
   for storyboard / character / location.

## Affected files

- `apps/web/server/routers/verticalDramaCharacters.ts` (resolver + 3 schemas)
- `apps/web/server/routers/verticalDramaLocations.ts` (schema)
- `apps/web/server/routers/verticalDramaEpisodes.ts` (`resolveEpisodeImageModelId`,
  pack seeding, `generateVideoClip`, video-prompt-pack proc)
- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx` (button disabled state, server-error handling)
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx` (disabled buttons)
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx` (disabled + schema call)
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaLocationStockPanel.tsx` (disabled + schema call)
- Corresponding `__tests__` files.

## Risk assessment

- **Low–medium.** No DB schema change; no migration. No worker/batch path uses the resolvers.
- Main behavioral change: users who previously relied on the silent default must now pick a model
  once (then it persists). This is the intended fix.
- Video seed removal (#3) is the most delicate change — validated that `generateShotVideoPrompt`
  and `regenerateClipDialogue` keep the tolerant resolver, so they are unaffected.

## Status: IMPLEMENTED (2026-07-15)

All steps A–D done. Server fails closed for image (character/location/episode resolvers throw
BAD_REQUEST; char/location schemas required) and video (pack no longer auto-seeds a default;
`generateVideoClip` guards an empty selection; `resolveEpisodeVideoModel` kept tolerant for
`generateShotVideoPrompt` + `regenerateClipDialogue(null)`). Client: storyboard/character/location
+ the embedded `VerticalDramaLocationsBibleCard` disable generate until a model is picked, always
send the required model, surface the server BAD_REQUEST and reopen the picker; a new episode
auto-hydrates the remembered per-series model so "pick once, use forever" holds. Server model tests
updated to fail-closed expectations and pass; touched files typecheck clean; only pre-existing
(other-session working-tree) failures remain (episodes.ts ShotCharacterRefEntry type errors;
location NOT_FOUND-mapping tests; storyboard native-audio/tie-in tests). NOT deployed — working tree
contains unrelated in-progress changes from other sessions, so build+restart is left to the user.

## Verification steps

1. `cd apps/web && pnpm check` (typecheck) + `pnpm test` for touched suites.
2. Manually drive: new series → open episode → confirm generate buttons disabled until a model is
   picked; pick model → generate succeeds → open a second episode → confirm the model is remembered.
3. Confirm character & location tabs each remember an independent model.
4. Confirm `generateShotVideoPrompt` (text prompt) and clip dialogue regeneration still work.
