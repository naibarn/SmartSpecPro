# Implementation plan

## Objective

Make `สร้าง prompt + ภาพ` truthful at every boundary: show prompt success,
image task progress, provider/admission/sync failure reasons, and browser image
load state. Preserve the saved prompt and give the user a safe image-only retry.

The implementation must not alter provider request payloads, credit pricing,
tenant/auth checks, or add a SQL migration. The checkout is heavily dirty, so
only the listed owned files and focused tests may be edited; unrelated changes
must remain untouched.

## Affected files

- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/shared/verticalDramaSeries/contracts.ts`
- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
- focused page, router, contract, and storyboard tests

## Approach

### 1. Durable terminal failure contract

Extend the shared `imageTask` view with optional `failureStage` and update the
`persistStartFrameImageTask` input. Keep task-id guards for provider/sync
terminal writes. Add a guarded no-task terminal write for image admission
failures: it may write only when the current frame has no pending task, so a
late failure from an older submission cannot erase a newer retry.

On result URL resolution/linking failure, persist `status: "failed"`,
`failureStage: "sync"`, the existing provider task id, and a bounded actionable
error before returning. On image mutation admission error after prompt success,
persist `status: "failed"`, `failureStage: "admission"`, no task id, and the
error. If that persistence request itself fails, retain a local per-shot
fallback error for the current page and tell the user that the task may still
be visible in Media History; never leave the button silently busy.

### 2. Page flow and retry actions

Keep prompt authoring and image rendering as separate phases. After prompt
success, image admission/polling errors must not discard the saved prompt.
`สร้างภาพใหม่` invokes `handleGeneratePromptAndImage` with `reauthor = false`
after the existing credit confirmation boundary. Sync retry rechecks the
stored `lastTaskId` through `media.getTask`, then reuses the existing
resolve/link mutations; only when the old result is unavailable does it offer
the paid image-only render retry.

Expose the derived per-shot status/error/action callbacks to
`VerticalDramaStoryboardPanel`. Keep active local polling and durable pending
markers unioned, and preserve reload resume behavior.

### 3. Storyboard viewport state

Add a small pure status resolver or equivalent local helper with this order:
generating, prompt-ready failed, sync failed, asset loading, asset load failed,
ready, and no image. The viewport shows an overlay/status block that cannot be
covered by the image, retains the existing image/lightbox/download controls when
ready, and provides clear Thai/English copy.

Track the displayed asset URL's load lifecycle. Reset load state when the asset
URL changes. Do not show `ready` until `onLoad`; on `onError`, show a retryable
browser-load state. Pending/failure overlays must include `aria-busy` or a live
status and stable test ids.

## Acceptance criteria

- A successful prompt followed by queued/processing image shows prompt-ready
  plus image progress, not a blank/no-image state.
- Provider failure shows the actual actionable reason and keeps the prompt.
- Admission failure before a provider task id is durable and cannot overwrite a
  newer pending retry.
- Result URL sync failure clears the pending state, explains that the image was
  generated but not linked, and offers sync/history guidance.
- Image-only retry does not invoke prompt authoring again.
- A partial/blank browser viewport is explicitly labeled loading or load
  failed; only an `onLoad` image is shown as ready.
- Existing stale-image, lightbox, download, reload-resume, and task-id guard
  behavior remains intact.

## Risks and mitigations

- JSONB input drift: update shared contract, router input, client view, and
  focused contract tests together.
- Race with newer task: use row-lock plus current pending-task/no-task guard.
- Duplicate charge: retry path uses existing saved prompt and existing normal
  image admission; no automatic retry is triggered by UI errors.
- Browser state reset: key load state by resolved asset URL and reset on URL
  changes.
- Dirty worktree: edit only explicit owned files and do not format the repo
  broadly.

## Verification

Run focused Vitest suites for the persistence/router, page flow, storyboard
viewport, and authenticated media behavior; run targeted TypeScript diagnostics
for changed files if available; run Prettier only on touched files and
`git diff --check`. Browser authenticated/provider generation is not run unless
credentials and a live task are already available; report it separately.
