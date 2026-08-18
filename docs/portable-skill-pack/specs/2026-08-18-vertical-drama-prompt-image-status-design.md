# Vertical Drama prompt + image status design

Date: 2026-08-18
Status: Draft for user review

## Problem

The one-click `สร้าง prompt + ภาพ` action has two asynchronous phases:

1. author the shot image prompt; and
2. submit and finalize the image-generation task.

The storyboard currently exposes only the final approved asset in the image
viewport. A user cannot reliably distinguish a provider task that is still
running, a completed prompt followed by a failed image task, a completed image
that failed to sync into the shot, or a browser-side media load failure. A
partial/blank-looking viewport therefore appears ambiguous even when the
prompt phase succeeded.

## Evidence and scope

- `VerticalDramaEpisodePage` already persists `frame.imageTask` and resumes
  polling after reload.
- The prompt job returns a prompt before the image mutation is admitted.
- The image poller resolves the result into `media_assets` and links it through
  `setApprovedStartFrameAsset`.
- `VerticalDramaStoryboardPanel` currently branches mainly on whether
  `approvedMediaAssetId` resolves to an asset, while
  `AuthenticatedMediaImage` has no visible loading state.
- In the result-URL sync catch path, the page currently shows an error and
  returns without persisting a terminal task state. The durable
  `pendingTaskId` can therefore remain visible as if the provider were still
  working even though prompt authoring and provider rendering have finished.

This change does not change prompt authoring, provider selection, reference
images, credit pricing, or provider payloads. It extends the existing JSONB
task-status shape; no database schema migration is required.

## Decision

Use a Vertical Drama-specific image viewport status layer. Keep the existing
protected media component and generation pipeline, but pass explicit status
information from the page to the storyboard panel and track the browser image
load result for the displayed asset.

This is preferred over changing every `AuthenticatedMediaImage` consumer or
adding server-side image probing. It fixes the reported workflow with a small
surface area and avoids unrelated layout changes.

## User-visible state contract

The shot image viewport has one authoritative display state, evaluated in this
order:

1. `generating`: a frame has `imageTask.pendingTaskId` or an active local poll.
   Show a spinner and `กำลังสร้างภาพ…` with the task phase when available. If
   the prompt phase has completed, also show `สร้าง prompt แล้ว — กำลังสร้างภาพ`.
2. `prompt_ready_image_failed`: the prompt was authored successfully, but the
   image submission/task is terminal `failed` or `expired`. This covers both a
   provider task failure and an admission failure before a provider task id
   exists. Show the persisted error (sanitized to a user-safe message) and
   actions:
   - `สร้างภาพใหม่` to reuse the saved prompt and submit a new image task;
   - `แก้/สร้าง prompt ใหม่` only when the user needs to change the prompt;
   - `เปิดประวัติการสร้างภาพ` when a task/result may still exist outside the
     shot link.
3. `sync_failed`: the provider returned a result URL but resolving/linking the
   media asset failed. Persist the terminal task as `failed` with an optional
   JSONB-safe `failureStage: "sync"` marker. Show `สร้างภาพเสร็จแล้ว แต่บันทึก
   เข้าช็อตไม่สำเร็จ` and `ลองเชื่อมภาพอีกครั้ง`/Media History guidance. Do not
   claim that the image was unavailable or silently start a paid retry.
4. `asset_loading`: an approved asset exists and its URL is being loaded by the
   browser. Show a loading overlay; the underlying image must not be mistaken
   for a completed display.
5. `asset_load_failed`: an approved asset exists but the browser receives an
   image error. Show `โหลดภาพไม่สำเร็จ` with retry/open-original actions.
6. `ready`: the image fires `onLoad`. Show the image normally with existing
   lightbox/download controls.
7. `no_image`: no prompt/image task/asset exists. Preserve the existing
   `ยังไม่มีภาพ` and stale-prompt messages.

The status copy must distinguish prompt success from image failure. A failed
image render never clears the saved prompt, so the user can retry the image
without paying for prompt authoring again.

Retry behavior is explicit:

- `สร้างภาพใหม่` calls the existing render-only path (`reauthor = false`) and
  reuses the saved prompt; it must not spend prompt-authoring credits again.
- `ลองเชื่อมภาพอีกครั้ง` rechecks the stored provider task/result through the
  existing Media History/task path before offering a new paid render.
- `สร้าง prompt ใหม่` is the only action that re-authorizes the prompt and is
  used when the user decides the prompt itself needs correction.

## Data flow

1. `handleGeneratePromptAndImage` submits the prompt job and waits for its
   terminal success before calling the image mutation.
2. On prompt success, the page keeps the returned prompt in the episode frame
   and sets the normal image-task pending state. The panel receives a derived
   `promptReady`/task-status view rather than inferring it from an asset alone.
3. On image task failure, the poller persists the terminal error and stops the
   busy state. The panel renders the failure action set without losing the
   prompt.
4. On result URL plus sync failure, the page persists the task as terminal
   `failed` with `failureStage: "sync"` and the actionable error. It does not
   leave `pendingTaskId` active and does not mark the shot as ready.
5. If image admission fails before a provider task id is returned, the page
   persists a terminal `failed` image-task state with
   `failureStage: "admission"`, no task id, and the actionable error. The
   server must only accept this no-task terminal write when no newer pending
   task exists for the same shot.
6. On successful asset linking, the page invalidates episode detail. The panel
   mounts the image with an explicit loading state and changes to `ready` only
   after `onLoad`.

No optimistic `approvedMediaAssetId` is written before the asset has been
resolved and linked. Existing task-id guards remain authoritative for late
provider completions.

The existing JSONB `imageTask` contract is extended with optional
`failureStage: "provider" | "sync" | "admission"`. The persisted task id is
optional only for an `admission` failure; provider and sync failures retain the
provider task id in `lastTaskId`. Provider polling failures use `provider` (or
omit it for legacy rows), the result-URL/linking catch path uses `sync`, and a
mutation error before task submission uses `admission`.

## Failure message policy

Provider/raw errors are normalized into short user-facing messages while
retaining the original task id and full diagnostic in Media History/server
logging. Known categories should include:

- provider rejection/content policy;
- insufficient credits or model admission failure;
- provider timeout/expired task;
- completed task without result URL;
- media resolve/storage authorization failure; and
- browser image load failure.

The UI must not show a generic success toast after a terminal image failure.
Prompt success may be shown separately, for example:
`สร้าง prompt สำเร็จแล้ว แต่สร้างภาพไม่สำเร็จ: <reason>`.

## Implementation boundary

Expected focused files:

- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx` for derived task
  status, prompt-ready/error propagation, sync-failure persistence, and retry
  action wiring;
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
  for the viewport overlay and explicit image load states;
- `apps/web/server/routers/verticalDramaEpisodes.ts` for the guarded terminal
  persistence input and failure-stage handling;
- `apps/web/shared/verticalDramaSeries/contracts.ts` and the existing
  `persistStartFrameImageTask` input projection for the optional failure-stage
  field and no-task admission failure;
- the existing focused page/storyboard tests, plus a small pure status helper
  test if the branching becomes non-trivial.

No migration, new dependency, provider call, or broad media-component rewrite
is planned.

## Verification

Focused tests must cover:

- prompt job succeeds, image task is still pending;
- prompt succeeds and image task fails with a concrete reason;
- prompt succeeds but image admission fails before a provider task id exists;
- completed result URL but shot sync fails;
- approved asset loading, loaded, and browser error states;
- retry reuses the existing saved prompt and does not invoke prompt authoring;
- a late task completion cannot overwrite a newer task/error; and
- a no-task admission failure cannot overwrite a newer pending submission;
- existing no-image, stale-image, lightbox, and download behavior remains.

Run the affected Vitest suites, targeted TypeScript diagnostics, Prettier/
`git diff --check`, and report authenticated browser/provider verification
separately if it is unavailable.

## Non-goals and trade-offs

- This does not prove the visual content inside a successfully loaded image is
  semantically complete; that requires a separate image-quality/QC flow.
- The browser can still fail to display a provider result for network or
  protected-media reasons, but the user will now see which boundary failed.
- Keeping status logic in Vertical Drama avoids changing unrelated media
  consumers, at the cost of not automatically improving every other image
  surface.
