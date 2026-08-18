# Research notes

## Current flow

- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx`
  - `handleGeneratePromptAndImage` waits for
    `submitAndWaitForShotStartFramePrompt` before image admission.
  - prompt success is persisted by `generateShotStartFramePrompt`; the image
    phase then calls `generateStartFrameImage` or the angle-grid mutation.
  - `pollStartFrameTask` polls `media.getTask`, resolves a completed result URL
    into a media asset, and calls `setApprovedStartFrameAsset`.
  - provider failure persists `imageTask.status = "failed"`.
  - result URL resolve/link failure currently shows a toast and returns before
    persisting a terminal state, leaving the prior pending marker possible.
  - image mutation `onError` currently only toasts and releases local locks; a
    prompt can therefore be ready while the image admission failure is not
    durable or visible in the shot card.
  - the existing render-only path calls
    `handleGeneratePromptAndImage(..., reauthor = false)` and must remain the
    retry path for image-only retries.

- `apps/web/server/routers/verticalDramaEpisodes.ts`
  - `persistStartFrameImageTask` writes the JSONB frame under an owner-scoped
    transaction with a row lock.
  - terminal updates are guarded by the current pending task id, preventing a
    late old task from overwriting a newer task.
  - its input currently requires `taskId`; the approved design allows a
    no-task terminal `admission` failure only when no newer pending task exists.

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
  - the start-frame viewport branches on resolved approved asset versus no
    asset; it does not show task phase, prompt-ready-without-image, or browser
    image loading/error state.
  - the viewport uses `AuthenticatedMediaImage` with `loading="lazy"` and
    `object-cover`; the shared component exposes native image callbacks but has
    no visible loading state.

- `apps/web/shared/verticalDramaSeries/contracts.ts`
  - `startFramePlan.frames[].imageTask` is optional JSONB and already supports
    pending, terminal status, timestamps, and error text. Extending it with an
    optional failure stage needs no SQL migration.

## Existing focused proof

The current focused suites pass before implementation:

```text
npm run test --workspace @smartspec/web -- \
  client/src/components/media/AuthenticatedMediaImage.test.tsx \
  client/src/pages/__tests__/VerticalDramaEpisodePage.promptAndImageFlow.test.ts \
  client/src/components/verticalDramaSeries/__tests__/VerticalDramaStoryboardPanel.sceneContinuityUi.test.tsx --run
3 files / 23 tests passed
```

## Risk and boundaries

- No auth, tenant boundary, provider payload, credit calculation, or migration
  change is intended.
- The new no-task failure write must not overwrite a newer pending task.
- UI status must not claim `ready` until the browser image fires `onLoad`.
- Existing angle-grid and video-safe task paths are out of scope except that
  shared types must remain compatible.
