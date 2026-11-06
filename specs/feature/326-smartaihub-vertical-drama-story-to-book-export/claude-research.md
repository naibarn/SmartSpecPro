# Feature 326 implementation research

## Repository surfaces

| Concern | Existing surface | Implementation choice |
|---|---|---|
| Source records | `verticalDramaSeries`, `verticalDramaEpisodes`, `mediaAssets` in `apps/web/drizzle/schema.ts` | New Book workspace/revision/export tables; snapshot source JSON and media identities/checksums so edits cannot mutate an approved revision |
| Durable execution | `feature186VerticalDramaJobAdapter.ts`, `feature186JobTypes.ts`, `jobExecutorRegistry.ts`, `postgresNodeJobWorker.ts` | Add compose and per-format export job types to canonical worker control plane |
| Storage | `apps/web/server/storage.ts`; `storagePut`, `storageGet` | Private tenant/job-scoped object keys; checksum and read-back before artifact availability |
| UI | `VerticalDramaSeriesDetailPage.tsx`, `VerticalDramaEpisodeWorkspace`, `VerticalDramaAssetsTab`, `VerticalDramaShell` | Add Book Studio tab and reuse established responsive/tab/query patterns |
| PDF runtime | `@playwright/test` dependency exists | Resolve a supported server browser/runtime at worker execution; validate Thai text extraction and page output |
| EPUB runtime | No EPUB library found in package manifest search; `adm-zip` exists | Generate deterministic EPUB container/XML using ZIP support; validate with EPUBCheck executable/runtime |

## Important data boundary

The source spec expects pinned episode revisions and asset versions. `vertical_drama_episode_revisions` exists for repair candidates, but does not cover the full episode/media state. A Book source revision must retain exact canonical source payload snapshots plus fingerprints, reference the candidate revision ID when applicable, and pin asset version/checksum where present. A URL alone is never provenance or authorization. Shot image coverage must be derived from existing managed image references and media rows, not guessed from shot counts or arbitrary JSON URLs.

## UI pattern search

Searched `apps/web/client/src/components/verticalDramaSeries/` and `apps/web/client/src/pages/` for series tabs, episode workspace, storyboard, assets, covers, generation progress, and review. Existing detail-page tabs and asset/cover surfaces are the closest fit. Reuse those patterns; do not invent a separate route shell. The user is an authorized series author; success means a reviewed revision can be downloaded in either/both formats with visible progress and errors.

## Risks to prove during implementation

1. Exact shot image locator and media authorization shape across storyboard/start-frame artifacts.
2. Whether PDF worker has Chromium plus a licensed Thai font, and whether output text extracts correctly.
3. Whether EPUBCheck is available in the production-like worker image.
4. Appropriate migration/journal path and current development DB target.
5. Credit quote/reservation/refund APIs for bounded chapter composition.

## Fallback strategy

Use narrow repository searches and existing service/test patterns when a code index is not configured. Fail closed on inaccessible or stale media, unavailable renderer runtimes, or failed validation; report capability state and keep independently successful formats/artifacts intact.
