# Implementation brief — Feature 326

Implement the proposed Vertical Drama Book Studio end to end. Authors can select/reorder episodes and authorized cover/shot artwork, compose an editable provenance-linked illustrated novel, approve immutable revisions, then independently export valid EPUB 3.3 and selectable-text PDF artifacts. Preserve tenant isolation, canonical worker_jobs + outbox execution, private storage, credit controls, and all existing series workflows.

The current spec is authoritative. Do not silently narrow the all-shot-image mode: every selected storyboard shot must map to an authorized existing image, remain in source order, and appear once beside editable prose. EPUB and PDF both include cover, text and selected chapter illustrations. No new image generation, arbitrary HTML, external network fetch, or second job queue.

## Existing implementation facts

- Series and episode source is in `apps/web/drizzle/schema.ts`; episode script, storyboard, start-frame plan and cover image are JSON data. There is no confirmed immutable episode revision table, so pin canonical source snapshots and hashes in Book revisions.
- `media_assets` stores tenant-owned media and storage keys/checksums; use existing media authorization/storage functions to resolve bytes and never trust a user-supplied URL.
- Vertical Drama long work is admitted through `createFeature186VerticalDramaJobRef()` into `worker_jobs` + outbox. Register executors in `jobExecutorRegistry.ts` and job types in `feature186JobTypes.ts`.
- Existing authoring surface is `VerticalDramaSeriesDetailPage.tsx`; reuse its tabs, shell, episode and asset patterns.
- Keep all book records separate from series/episode mutable data. Use transactional ownership predicates on every read/write/download.

## Runtime decision

Use repository-owned EPUB ZIP/XML generation and the existing Playwright dependency for PDF, behind renderer interfaces. First prove the deployed Node worker has Chromium and Thai fonts. If not, preserve PDF as explicitly unavailable with a precise runtime capability signal while completing EPUB and all other independent slices; do not add a browser binary or font package blindly. EPUB availability requires EPUBCheck; use an existing executable/container/runtime if present, otherwise make validation fail closed and document the exact missing capability.
