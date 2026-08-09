# Vertical Drama Episode Cover Generation

## Goal

Add an episode-cover workflow to the Series detail page's `episodes` tab. A user
can select one image-generation model for the series, ask the system to create a
cover for any Sub-episode, and later replace that cover with a local upload. The
cover generation is asynchronous and survives page reloads.

The feature must use the episode's current series title, episode title,
synopsis, and plot beats as the generation prompt, plus up to four relevant
approved Start Frame images from the episode's existing nine-shot storyboard.
The model is responsible for all other visual composition decisions.

## Scope

### In scope

- A cover-generation control on every Sub-episode card in the Series detail
  page's `episodes` tab.
- One remembered image-model selection per series, validated against the live
  image-model catalog before reuse.
- A prompt built from current server-side episode data in the exact shape below.
- Selection and attachment of up to four approved Start Frame images.
- Async submit, persisted task status, reload/resume polling, retry, and failure
  messaging.
- Cover image display with the cover taking precedence over the existing
  Start Frame-derived thumbnail.
- Fullscreen/lightbox viewing and download.
- Drag-and-drop or file-picker replacement of the cover image.
- Ownership, model-capability, rate-limit, and credit checks consistent with
  existing Vertical Drama image generation.

### Out of scope

- Text overlay or post-processing of episode title/summary onto the generated
  image.
- Changes to any Start Frame, storyboard, video clip, or compiled-video asset.
- A new LLM call solely to rewrite the prompt or select the references.
- Batch generation for every episode in one action.
- Cover generation for Production Episode groups or the series-level trailer.
- A new media provider or new upload protocol.

## Current code context

- `VerticalDramaSeriesDetailPage.tsx` owns the `EpisodesTab` cards and currently
  renders `episode.thumbnailUrl`, which is derived from the first available
  approved Start Frame.
- `verticalDramaSeries.get` intentionally returns a light episode projection;
  it does not expose raw episode `script`, `storyboard`, or `startFramePlan`.
- `VerticalDramaEpisodePage.tsx` already has the authoritative per-episode model
  selection, Start Frame asset resolution, async media-task polling, and model
  validation patterns.
- `mediaGenerationService.generateImageAsync` is the existing async provider
  boundary. `ImageLightbox` and `WebAssetResolver` already provide the desired
  fullscreen/download and upload behavior.
- The working tree is intentionally dirty with unrelated Vertical Drama,
  Video Studio, extension, runtime, and release changes. Implementation must
  keep the patch limited to this feature's files and migration.

## Chosen design

### 1. Separate durable episode-cover state

Add a nullable `coverImage` JSONB column to `vertical_drama_episodes`. It is
separate from `startFramePlan`, `assemblyManifest`, and `thumbnailUrl` so a
cover never changes the Start Frame or video pipeline contract.

The persisted internal shape is:

```ts
type VerticalDramaEpisodeCoverState = {
  status: "generating" | "ready" | "failed";
  pendingTaskId?: string;
  mediaAssetId?: string;
  modelId?: string;
  sourceShotNumbers?: number[];
  prompt?: string;
  generatedAt?: string;
  source?: "generated" | "upload";
  error?: string;
};
```

Provider URLs are not the durable source of truth. Completed generated and
uploaded covers are registered as `media_assets` and stored by asset id. The
read projection resolves the current asset URL for the browser.

The migration is additive and nullable. Existing episodes remain unchanged and
continue to use their Start Frame-derived thumbnail until a cover exists.

### 2. Exact prompt contract

The server builds the prompt from the current episode row and current series
row at submit time. The feature prompt contains no style instructions,
negative prompt, title-overlay instruction, or additional creative guidance.

The canonical format is:

```text
ช่วยหน้าปก ซีรีย์

{series.title}

**ตอนย่อยที่ {episode.episodeNumber}  · {episode.title}**

**เรื่องย่อ**

{current synopsis}

**จุดดำเนินเรื่อง**

{current plot beats, one per line}
```

The prompt builder must tolerate legacy episode shapes. It should read the
current persisted synopsis and beats from the episode script, with the existing
episode title and episode number as the stable header. Empty sections are
omitted rather than filled with invented text. The server persists the exact
prompt snapshot in `coverImage.prompt` for audit/debugging and retry
reproducibility.

The image request may set non-prompt transport fields such as the series aspect
ratio (`9:16` by default) and output count `1`; these do not add text to the
feature prompt.

### 3. Reference-frame selection

Selection is deterministic and does not call another model:

1. Read the episode's current `startFramePlan.frames` in shot order.
2. Keep only frames with a valid approved Start Frame media asset id and a
   resolvable owned `media_assets` row.
3. Score each candidate against the current synopsis, title, and plot-beat
   terms using the existing shot's visual description, action, character, and
   location fields.
4. Select the highest-scoring candidates while preferring distinct shot
   numbers and preserving story order.
5. If scores tie or there is insufficient textual overlap, use evenly spaced
   candidates from the available approved frames so the references do not all
   come from one moment.
6. Attach at most four selected URLs, subject to the selected model's declared
   reference-image capability. Persist the selected shot numbers so the UI and
   support logs can explain which images were used.

If fewer than four approved Start Frames exist, use all available approved
frames. The generation remains allowed with zero references only when the
selected model supports text-to-image without references; otherwise the server
returns a clear precondition error before reserving credits.

### 4. Async generation lifecycle

The client calls a new owner-scoped `verticalDramaEpisodes.generateEpisodeCover`
mutation with `seriesId`, `episodeId`, selected image model id, optional transport
connection identifiers, and an idempotency key.

The mutation:

1. Loads and validates the owned series and episode.
2. Rebuilds the prompt and references from fresh server data; it never trusts a
   client-supplied prompt or arbitrary reference URL.
3. Rejects a duplicate request while the current cover has a pending task. If
   the same idempotency key is retried after a lost response, it returns the
   already-persisted task instead of reserving credits or submitting a second
   provider task.
4. Validates that the selected catalog model is enabled and supports image
   generation and the requested reference shape.
5. Resolves the existing Vertical Drama media transport decision and performs
   the existing rate-limit, credit-price, and credit-reservation checks.
6. Submits through `mediaGenerationService.generateImageAsync` (or the existing
   Hermes/MCP transport branch when the selected model requires it).
7. Persists `status: "generating"`, `pendingTaskId`, model id, selected shot
   numbers, and prompt snapshot before returning the task id.

Add a matching `getEpisodeCoverStatus` query. While a task is pending, it reads
  the provider task using the existing media-task service. On completion it
  registers the result URL as a media asset, stores `status: "ready"` plus the
  asset id, and clears `pendingTaskId`. On failure it stores `status: "failed"`
  and a bounded user-facing error. Non-terminal reads do not mutate the cover.

The client polls only while the episode cover state has a pending task. It
resumes polling on page load, so a slow provider or a closed browser does not
leave an orphaned task from the user's perspective. A retry submits a new task
and replaces the previous failed state; it does not touch Start Frames.

Generated covers use the existing paid media-generation lifecycle. Submit
failure refunds a reserved platform-credit amount according to existing image
generation conventions. Hermes jobs follow the existing no-platform-credit
transport policy.

### 5. Model memory

The model picker is shown once in the Episodes tab toolbar and is keyed by
series id using the existing safe per-series browser preference pattern:

```text
smartspec_vd_series_{seriesId}_cover_model
```

The value is reused for every episode in that series and is validated against
the current `mediaModels.list({ type: "image", verticalDramaReady: true })`
catalog before being used. A missing, disabled, or no-longer-supported model is
cleared and the user is asked to choose again. The selected model id is also
stored in each cover state at generation time so completed covers retain their
provenance even if the remembered default changes later.

This is intentionally a browser preference, matching the existing Vertical
Drama model-memory convention. It is not a new account-level or cross-device
model policy in this iteration.

### 6. Episodes-tab UX

Each card keeps the existing episode navigation and delete action. The cover
area is a separate interactive surface so clicking actions never navigates to
the episode workspace.

States:

- No cover: show the existing Start Frame thumbnail and `สร้างหน้าปก` action.
- Generating: show a cover placeholder, spinner, selected model label, and
  `กำลังสร้างหน้าปก…`; disable duplicate generation for that episode.
- Ready: show the generated/uploaded cover, `ดูเต็มจอ`, `ดาวน์โหลด`, and a
  replacement drop zone/file picker.
- Failed: retain the previous cover/thumbnail if one exists, show the failure
  state inline, and expose `ลองอีกครั้ง`.
- Read-only series: display the cover and download/fullscreen controls but hide
  generation and replacement controls.

The cover image uses the existing `ImageLightbox` for fullscreen and download,
with an accessible alt label based on the episode number/title. A drag-over
state is visible on the cover drop zone. Only supported image types are
accepted; upload errors are shown without altering the current cover.

The layout remains the existing responsive two-column episode-card grid and
collapses naturally to one column on small screens. The implementation reuses
existing shadcn/Tailwind tokens and controls; no global visual reset or new
dependency is introduced.

### 7. Upload replacement lifecycle

The client accepts an OS file drop or file-picker selection, validates it using
the existing image-drop constraints, uploads it through `WebAssetResolver`, and
resolves the returned URI to a canonical media asset using the existing
Vertical Drama import path. A new owner-scoped `setEpisodeCoverAsset` mutation
then persists `status: "ready"`, `source: "upload"`, and the media asset id.

The mutation must use a fresh row check, verify that the media asset belongs to
the caller's tenant/user and is an image, and should not allow an older
generation task to overwrite a manual upload. The status query also checks the
current persisted state before finalizing a provider task; if the current cover
is a manual upload or a newer generation has replaced the pending task, the
old completion is ignored and its reserved generation state is reconciled
without changing the manual cover.

## API/data boundaries

The existing `verticalDramaSeries.get` response gains only a display-safe
episode projection:

```ts
coverImage?: {
  status: "generating" | "ready" | "failed";
  url?: string | null;
  modelId?: string | null;
  sourceShotNumbers?: number[];
  error?: string | null;
  pendingTaskId?: string | null;
};
```

Raw prompt, provider task metadata, and internal asset ownership fields do not
leave the server through the list projection. The `pendingTaskId` is exposed
only as the minimum client resume handle and is owner-scoped.

The new procedures must enforce the same tenant + user + series + episode
ownership predicates used by existing episode mutations. Input strings are
bounded, model ids are catalog-validated, and uploaded media is resolved only
through the existing authenticated upload/import path.

## Failure modes and recovery

- Catalog unavailable: keep the picker in a retryable loading/error state; do
  not silently fall back to a default model.
- Model disabled or reference-capability mismatch: fail before credit reserve
  with an actionable message.
- Provider submission failure: refund the reservation and persist a failed state.
- Provider task remains pending: keep the task id durable and show a resumable
  generating state; do not report success based on submission alone.
- Provider completes without a result URL: mark failed and retain the task id in
  diagnostics only, without publishing a broken cover URL.
- Asset import/finalization fails: keep the generation result available in media
  history, mark cover finalization failed, and allow retry/fallback replacement.
- Upload fails or is rejected: keep the existing cover untouched.
- Concurrent generate/upload/complete actions: use the persisted task id and
  source precedence to prevent stale generation from overwriting a newer cover.
- Duplicate clicks or retried network responses: return the existing pending
  task by idempotency key and never charge or submit twice.

## Verification plan

### Pure/unit tests

- Prompt builder emits the exact requested text and no extra instruction.
- Legacy/missing synopsis or beat shapes do not create invented content.
- Reference selection returns at most four approved assets, preserves story
  order, prefers relevant shots, and falls back evenly when scores tie.
- Model preference validation rejects stale/disabled catalog ids.

### Router/service tests

- Ownership checks for series and episode.
- Idempotent duplicate submission does not reserve credits or create a second
  provider task.
- Model validation, reference-capability validation, and rate-limit/credit
  behavior.
- Submit persists a pending cover state and does not alter Start Frame fields.
- Status query finalizes completion exactly once, handles failed tasks, and
  ignores stale task completion after a manual upload/new generation.
- Upload replacement persists an owned media asset and is not overwritten by an
  older pending generation.
- Upload replacement rejects foreign/non-image media assets.

### UI tests

- Episodes-tab model selection is remembered per series and stale values are
  cleared.
- No-cover, generating, ready, failed, read-only, and loading/error states.
- Generate/retry actions send the episode id and selected model and disable
  duplicate submits.
- Cover takes precedence over the old thumbnail without changing navigation.
- Fullscreen/download actions use the cover URL.
- File drop and file picker replacement preserve the current cover on failure.

### Focused commands

- `pnpm --dir apps/web exec vitest run <cover/router/UI test files>`
- `pnpm --dir apps/web exec tsc --noEmit` or the repository's focused check
  command, with unrelated dirty-worktree baseline errors reported separately.
- `git diff --check`

## Rollout and migration

The migration is additive and safe for existing rows. The UI should tolerate a
server response without `coverImage` so the client can be deployed before the
database migration in staged environments. The server should not expose cover
generation controls until the new column/procedures are present in the same
release.

No provider, worker-app, runtime-pack, or production deployment change is
required. Live provider generation is not part of local verification because it
spends credits; the test suite must mock submission and task completion.

## Acceptance criteria

1. From the `episodes` tab, a user can choose an image model once for a series
   and generate a cover for any episode.
2. The submitted prompt exactly follows the user's supplied structure and uses
   current episode data at submit time.
3. Up to four relevant approved Start Frame images from the episode are attached
   without modifying any Start Frame data.
4. A slow generation remains visible as pending, resumes after reload, and ends
   in a durable ready or failed state.
5. A ready cover replaces the episode card thumbnail and can be viewed full
   screen, downloaded, or replaced by an OS image drop.
6. Ownership, model validation, rate limits, credits, upload constraints, and
   stale-task protection are covered by focused tests.
7. Existing episode navigation, delete, Start Frame, video, and compiled-video
   behavior remains unchanged.
