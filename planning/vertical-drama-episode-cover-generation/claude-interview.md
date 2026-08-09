# Deep-Plan Interview Record

This record captures the completed design conversation. No additional business question remains unresolved for implementation.

## Q1. Where is the feature placed?

**User decision:** Add the cover-generation action to each episode card in the Series detail page's Episodes tab, alongside the existing episode thumbnail and open/delete actions.

**Planning consequence:** The list projection must carry a display-safe cover state, while the card must keep navigation to the episode page separate from cover actions.

## Q2. What exact content is sent to the image model?

**User decision:** Send only the current series title, current episode number/title, current synopsis, and current plot beats in the approved example format. Do not append style instructions, negative prompts, camera instructions, generated typography instructions, or extra creative text. Let the image model imagine the visual result.

**Planning consequence:** Prompt construction is a server-side deterministic formatter. Empty synopsis/beat sections are omitted rather than replaced with invented text. No text-overlay compositing is part of this feature.

## Q3. Which references are attached?

**User decision:** Select four Start Frame images that fit the episode story from the nine shots, using only the approved Start Frame images. If fewer than four approved images exist, attach the available number; the model creates the rest of the cover concept.

**Planning consequence:** The server selects at most four approved assets deterministically from the current `startFramePlan`. Selection should favor narrative relevance and visual diversity while remaining stable for retries/tests.

## Q4. How is the image model selected?

**User decision:** Let the user choose an image model once and remember that choice for the series so it does not need to be selected for every episode.

**Planning consequence:** Follow the existing per-series browser preference convention with a dedicated cover key, validate the stored model against the live image catalog, and allow a fresh selection when the stored model disappears or becomes unavailable.

## Q5. What happens while generation takes a long time?

**User decision:** Generation must be asynchronous. The user should be able to leave/reload the page and still see the generating state; the final image replaces the episode card cover when ready.

**Planning consequence:** Persist `pendingTaskId` and a status in `coverImage`, return immediately from submit, poll an existing task-status endpoint on the client, and reconcile completion server-side. Duplicate submissions must not reserve credits or create provider tasks twice.

## Q6. What manual image controls are required?

**User decision:** The finished cover must support fullscreen viewing and download. The user can drag an image from the hard disk onto the card to replace the cover.

**Planning consequence:** Reuse `ImageLightbox` and `WebAssetResolver`; add an ownership/type-checked mutation to attach the uploaded image, and make a manual upload authoritative over a stale generation task.

## Auto-decisions recorded for implementation

- Durable state is a new nullable `vertical_drama_episodes.coverImage` JSONB column, not a reuse of `startFramePlan` or `assemblyManifest`.
- The generation and status procedures are placed in `verticalDramaEpisodes.ts` because the state and episode ownership are episode-scoped; the series `get` procedure owns the list projection.
- The existing media generation service, model registry, transport resolver, credit service, and media asset import path are reused.
- The prompt and four-reference selection are tested as pure shared/server helpers before router wiring.
- The first implementation is single-episode generation per click. Batch generation, scheduling, provider-specific prompt extras, and cross-device preference persistence are out of scope.
