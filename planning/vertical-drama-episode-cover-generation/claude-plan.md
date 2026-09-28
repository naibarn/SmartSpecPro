# Implementation Plan: Vertical Drama Episode Cover Generation

## 1. Outcome and invariants

Implement a single-episode cover workflow on the Series detail `episodes` tab.
The workflow must preserve the following invariants:

- The current episode story data is read on the server at submit time. The browser never supplies the authoritative prompt, synopsis, plot beats, Start Frame URLs, or selected shot references.
- The prompt is exactly the approved Thai template and contains no extra creative instruction or text-overlay request.
- Only approved Start Frame assets belonging to the episode may be attached, with a maximum of four and deterministic selection.
- Cover state is separate from `startFramePlan`, `storyboard`, `assemblyManifest`, and compiled-video state.
- A provider task is durable and asynchronous. Duplicate requests, retries, page reloads, stale completion, and manual replacement must not create duplicate paid work or overwrite a newer cover.
- Every new read/mutation is scoped to tenant, authenticated user, series, and episode ownership.
- A generated or uploaded cover is resolved through canonical `media_assets`; provider URLs are not the durable source of truth.
- Existing episode navigation, delete, Start Frame, video, and compiled-video behavior remains unchanged.

## 2. Current code fit and design boundaries

The implementation will extend the existing Vertical Drama path rather than create a parallel media subsystem:

- `apps/web/drizzle/schema.ts` is the single schema writer for the new nullable `coverImage` JSONB field.
- `apps/web/drizzle/manual_vertical_drama_episode_cover_image.sql` is the additive idempotent migration because this table lineage uses hand-authored manual migrations.
- `apps/web/shared/verticalDramaSeries/episodeCover.ts` will own the JSONB contract, defensive readers, exact prompt formatter, and deterministic reference-selection helpers. This keeps pure rules independently testable and prevents router/UI copies from drifting.
- `apps/web/server/services/verticalDramaEpisodeCover.ts` will own server-only orchestration helpers: loading current narrative data, resolving approved asset URLs, building the provider request, and projecting safe cover state. It must not introduce a second provider/credit implementation.
- `apps/web/server/routers/verticalDramaEpisodes.ts` will add owner-scoped `generateEpisodeCover`, `getEpisodeCoverStatus`, and `setEpisodeCoverAsset` procedures beside the existing episode image-generation and asset-linking procedures. The router already owns episode model/transport/credit behavior.
- `apps/web/server/routers/verticalDramaSeries.ts` will add `coverImage` only to the existing `get` episode-list projection, using a display-safe helper and never returning raw episode JSONB.
- `apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx` will add the Episodes-tab model picker, per-card cover state/actions, polling, lightbox, and drop/upload behavior while preserving the existing card link boundary.

If the repository's existing router import graph makes a new service import unsafe, keep the pure helpers in the shared module and place only the smallest server-only functions in `verticalDramaEpisodes.ts`; do not pull heavy provider/router chains into the series router.

## 3. Data contract and migration

### 3.1 Shared contract

Define and export the following state shape in `episodeCover.ts`:

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
  /** Internal-only replay/supersession bookkeeping; never in the client DTO. */
  idempotencyKey?: string;
};
```

Add defensive parsing that treats malformed/unknown JSONB as no usable cover rather than crashing the episode list. Add a display DTO type with only `status`, `url`, `modelId`, `sourceShotNumbers`, `error`, and `pendingTaskId`.

The prompt formatter accepts the normalized current series title, episode number/title, synopsis, and ordered plot beats. It emits the exact approved template, omits empty sections, trims each value, and never adds style, negative, camera, typography, or overlay instructions.

The reference selector accepts ordered shot candidates containing shot number, approved asset id, visual/action/character/location text, and current episode narrative terms. It scores textual overlap without an LLM, deduplicates by shot number, favors relevance and diversity, preserves story order in the final output, and uses an evenly-spaced fallback for ties. Its output is capped at four and records selected shot numbers.

### 3.2 Schema and migration

Add `coverImage: jsonb("coverImage")` to `verticalDramaEpisodes` near the other episode-level JSONB plans, with a comment documenting the nullable/manual-migration convention and the internal state contract.

Add `apps/web/drizzle/manual_vertical_drama_episode_cover_image.sql`:

- Begin a transaction.
- `ALTER TABLE vertical_drama_episodes ADD COLUMN IF NOT EXISTS "coverImage" jsonb;`
- Commit.
- Document that existing rows remain null and that the file is intentionally hand-authored because of the known drizzle meta-journal collision.

Do not add an index: list projection is already episode-scoped and the JSONB is not queried by a search predicate.

## 4. Server data and prompt/reference assembly

### 4.1 Current narrative source

Implement a server helper that loads the owned series and episode, then resolves the active episode breakdown item using the same current-data path as `loadEpisodeSynopsisEditTarget`. Normalize the current title, logline/synopsis, and key beats from the active breakdown item. If a materialized episode draft exists, use it only as the repository's existing compatibility fallback; never let a stale client projection override the active server source.

The helper also reads the current `startFramePlan.frames`, keeps only approved asset ids, verifies the asset rows are owned by the caller and are image assets, resolves reference URLs using existing media-asset URL helpers, and returns an immutable generation input snapshot.

### 4.2 Model validation and transport

Use the live image model catalog and the existing Vertical Drama capability resolver. Validate:

- model id is present, enabled, image-capable, and allowed for Vertical Drama;
- the model can accept the number/type of attached references;
- zero references is accepted only for a model that supports text-only image generation;
- any transport connection id required by an MCP/Hermes model is valid before credits are reserved.

Reuse `resolveMediaModelTransportConfig`, `resolveMediaTransport`, existing model-resolution helpers, `calculateCreditCost`, `hasEnoughCredits`, `deductCredits`, and `refundCredits`. The cover feature must not create a second pricing or provider dispatch path.

### 4.3 Generation submission procedure

`verticalDramaEpisodes.generateEpisodeCover` input:

```ts
{
  seriesId: string;
  episodeId: string;
  modelId: string;
  idempotencyKey: string;
  mcpConnectionId?: string;
}
```

Procedure behavior:

1. Validate feature flag, tenant, user, numeric ids, bounded model/idempotency strings, and ownership.
2. Read the current cover state. If it is generating, return the existing task for the same request identity and reject a different duplicate while pending. Replays after a lost response must be no-ops.
3. Build the fresh prompt and approved references on the server.
4. Validate model capability and transport before any paid reservation.
5. Calculate and reserve credits using the established idempotency-aware service calls. Respect no-platform-credit transport policies already used by the selected transport.
6. Submit the image task through `mediaGenerationService.generateImageAsync` with the exact prompt, selected reference URLs, output count one, and the normal vertical aspect ratio/request options. Keep provider-specific fields out of the prompt.
7. Persist `coverImage` as `generating` with `pendingTaskId`, model id, selected shot numbers, and prompt snapshot. Persist only after a provider task id exists; if persistence fails, follow the existing submission-failure compensation path and do not claim a ready cover.
8. Return `{ status: "generating", taskId, modelId, sourceShotNumbers }`.

Persist the request identity as an internal `idempotencyKey` inside the cover JSONB state, but strip it from every display projection. A replay with the same key returns the existing persisted task/state; a different key is rejected while a task is pending. This closes the lost-response window between provider submission and a later retry and guarantees that a replay never reserves credits or submits a second provider task.

### 4.4 Status reconciliation procedure

`verticalDramaEpisodes.getEpisodeCoverStatus` input is `{ seriesId: string; episodeId: string }`.

It loads the owned row and returns the current safe projection. When a pending task exists, it checks the existing media task service:

- pending/processing: return `generating` without changing the row;
- completed with a result URL: first re-read the row, then finalize only if the same `pendingTaskId` is still current and the current source is not `upload`; register the result URL as an owned canonical media asset, persist `ready`, `source: "generated"`, asset id, generated timestamp, and clear the task id;
- failed/cancelled/expired or missing result URL: persist `failed` with a bounded user-facing error and clear active pending state;
- stale task after manual upload or a newer generation: do not overwrite the newer state. Reconcile/refund stale generation bookkeeping using the existing convention, and return the newer state.

Finalization must be idempotent: repeated status calls after completion see `ready` and do not import/link a second cover asset or charge/refund twice.

### 4.5 Upload replacement procedure

`verticalDramaEpisodes.setEpisodeCoverAsset` input:

```ts
{
  seriesId: string;
  episodeId: string;
  mediaAssetId: string;
}
```

The mutation loads the owned episode and the uploaded asset in one ownership-scoped check, verifies tenant/user ownership and image media type, and then writes `ready`, `source: "upload"`, the asset id, and no generated prompt. If an older generation task is pending, retain its task id in the internal superseded-task cleanup slot (or an equivalent private field) until one status reconciliation observes its terminal state; do not expose it as a generating cover. This ensures reserved generation bookkeeping is eventually reconciled even though the manual upload is already authoritative. The old completion path must fail its same-task/source guard and cannot overwrite the upload. It must reject foreign assets, non-image assets, and invalid ids.

## 5. Series list projection

Extend the select in `verticalDramaSeries.get` with `coverImage` and resolve the asset URL only for a valid, owned current asset. Return:

```ts
coverImage: {
  status: "generating" | "ready" | "failed";
  url: string | null;
  modelId: string | null;
  sourceShotNumbers: number[];
  error: string | null;
  pendingTaskId: string | null;
} | null;
```

Keep `thumbnailUrl` as the existing Start Frame-derived fallback. The client chooses `coverImage.url` when present and falls back to `thumbnailUrl` otherwise. Do not project `prompt`, raw `mediaAssetId`, provider task payload, raw `startFramePlan`, or raw `script`.

If the URL resolver requires a batch lookup, add a focused helper beside `resolveEpisodeThumbnailUrls` that preserves the existing owner predicates and returns null for missing assets. Do not broaden the `get` query to expose episode internals.

## 6. Episodes-tab UI implementation

### 6.1 Component boundaries

Keep `VerticalDramaSeriesDetailPage.tsx` as the route-level owner, but extract local components when the card state would otherwise become difficult to test:

- `EpisodeCoverModelPicker`: loads `mediaModels.list({ type: "image", verticalDramaReady: true })`, displays the selected model, persists the per-series preference through `safeLocalStorage`, validates stale ids, and exposes loading/error/empty states.
- `EpisodeCoverCardSurface`: renders the cover/thumbnail, generation state, lightbox trigger, download trigger, retry/generate action, and upload drop zone without wrapping those controls in the episode navigation `Link`.
- `EpisodeCoverUploadDropZone`: owns drag-over state, file input, accepted image types, upload progress/error, and calls the authenticated upload/import/mutation sequence.

Use existing shadcn controls, `ImageLightbox`, `WebAssetResolver`, icons, and semantic Tailwind tokens. Do not add a dependency or global style reset.

### 6.2 State and query behavior

The Episodes tab uses the series `get` query as the initial source of truth. For any episode with `coverImage.pendingTaskId`, start a bounded polling loop using `getEpisodeCoverStatus`; invalidate/refetch the series `get` query after each terminal result. Stop polling on ready/failed, unmount, or when the pending id changes. Avoid polling episodes without a task.

The model picker stores only the selected model id under `smartspec_vd_series_${seriesId}_cover_model`. On load, compare it with the live catalog; remove stale values and require selection rather than silently choosing an arbitrary model. While the catalog is loading or failed, generation is disabled with a retryable message.

The generation mutation sends the selected model id, episode id, series id, and a fresh idempotency key per new user request. Disable only the current episode's generate/retry button while its task is pending; other episode cards remain usable.

### 6.3 State matrix

| State | Cover surface | Actions |
|---|---|---|
| No cover | Existing thumbnail or placeholder | Generate, drag/drop, file picker |
| Generating | Placeholder/previous image with spinner and model label | Status text; generation disabled; no duplicate click |
| Ready/generated | Cover image | Fullscreen, download, replace, open episode |
| Ready/uploaded | Uploaded cover image | Fullscreen, download, replace, open episode |
| Failed | Previous image/thumbnail retained when possible plus inline error | Retry, replace, open episode |
| Read-only | Cover/thumbnail | Fullscreen, download, open episode; no generate/upload |
| Catalog error | Existing cover/thumbnail | Retry model catalog; generation disabled |
| Upload error | Existing cover unchanged | Dismiss/retry upload |

### 6.4 Accessibility and responsive contract

- Every image has an episode-specific Thai/English alt label depending on current UI language.
- Every icon-only control has an accessible label and visible tooltip/title where the existing UI convention supports it.
- Drag/drop is an enhancement, not the only upload route: a keyboard-accessible file input/button is always present.
- Buttons use disabled and busy states with `aria-busy`/status text where appropriate; status updates are announced through a concise live region without excessive polling chatter.
- The cover action surface is not nested inside a button or link. Card navigation remains keyboard reachable independently.
- Existing two-column grid remains at medium widths and collapses to one column on small screens. Cover controls wrap rather than overflow horizontally; the model picker remains usable on narrow screens.
- Respect reduced-motion conventions already used by the page; no new persistent animation is required beyond the existing spinner treatment.

### 6.5 Visual evidence

Before final handoff, run the focused page/unit tests and, if the existing browser harness can mount the Episodes tab, capture a browser pass for: no-cover card, generating state, ready card with lightbox/download, drag-over state, failed/retry state, and narrow viewport layout. If browser execution is unavailable, record that explicitly and provide the focused test evidence instead.

## 7. Test-driven implementation order

Implement and verify in the following order:

1. **Shared contracts and pure functions**
   - Add `episodeCover.ts` and tests for state parsing, exact prompt output, empty/legacy fields, reference cap/order/relevance/fallback, and display projection.
2. **Schema/migration**
   - Add the schema field and manual migration. Run SQL/schema formatting checks available in the package without applying a production migration.
3. **Server generation lifecycle**
   - Add service helpers and router procedures. Extend/add focused tests for ownership, model/reference capability, idempotency, credit behavior, persisted pending state, completion/failure, stale-task protection, and upload ownership/type checks.
4. **Series list projection**
   - Project safe cover state and ensure Start Frame thumbnail fallback remains unchanged. Add regression assertions to the series router projection tests.
5. **UI**
   - Add model memory, card states, polling, lightbox/download, file drop/picker, and read-only behavior. Add a focused component/page test if the existing harness permits; otherwise verify through typecheck and browser/manual evidence.
6. **Focused validation**
   - Run new/changed Vitest files, `git diff --check`, and the relevant TypeScript check. Report unrelated baseline failures separately.

## 8. File manifest

### New files

- `apps/web/drizzle/manual_vertical_drama_episode_cover_image.sql`
- `apps/web/shared/verticalDramaSeries/episodeCover.ts`
- `apps/web/shared/verticalDramaSeries/episodeCover.test.ts`
- `apps/web/server/services/verticalDramaEpisodeCover.ts`
- `apps/web/server/services/__tests__/verticalDramaEpisodeCover.test.ts`
- `apps/web/server/routers/__tests__/verticalDramaEpisodes.episodeCover.test.ts`
- Optional only if the page test harness has an established fixture: `apps/web/client/src/pages/__tests__/VerticalDramaSeriesDetailPage.episodeCover.test.tsx`

### Modified files

- `apps/web/drizzle/schema.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/server/routers/verticalDramaSeries.ts`
- `apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx`

Do not modify worker-app, runtime-pack, provider seed, unrelated extension, Video Studio, or release files.

## 9. Security and correctness gates

Before handoff, inspect the final diff for:

- missing tenant/user/series/episode predicates;
- raw prompt, provider metadata, or unowned asset URLs leaking through the list projection;
- client-controlled arbitrary reference URLs;
- foreign/non-image upload attachment;
- duplicate credit reservation/provider task creation;
- stale generation overwriting upload/new generation;
- accidental mutation of `startFramePlan` or compiled-video fields;
- polling that continues after terminal state or unmount;
- nested interactive controls violating keyboard semantics.

Because this adds authenticated media mutations and file-to-asset attachment, run the focused security review as part of implementation even though no new upload protocol is introduced.

## 10. Rollout and acceptance proof

The release is additive: old episodes with null cover state continue showing the existing Start Frame thumbnail. Deploy the migration and server/UI changes together; the UI remains null-tolerant for staged rollout. Do not perform live paid generation in tests.

Acceptance proof must show:

- exact prompt and max-four approved reference selection in pure tests;
- one persisted pending task and no duplicate provider/credit call on replay;
- completion/failure/retry and stale upload protection in router/service tests;
- safe cover projection with Start Frame fallback;
- UI generation/model memory/fullscreen/download/drop states, or documented browser-harness limitation;
- focused changed-file validation and a separate note for any repo-wide dirty/baseline failures.
