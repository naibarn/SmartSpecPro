## Purpose

Lock the sprint-1 execution defaults for the presentation design-system upgrade so implementation can start without reopening architecture debate.

These defaults are intentionally biased toward:
- reusing infrastructure already present in this repository
- minimizing rendering drift
- keeping retry and invalidation behavior deterministic

## 1. Storage Choice

### Default

Use the existing S3-compatible storage stack already supported by the product, with **Cloudflare R2 as the preferred canonical preview artifact store in this environment**.

Implementation default:
- canonical preview binaries live in object storage
- preview metadata/index rows live in Postgres
- the preview renderer stays stateless
- CDN/cache remains optional and non-canonical

### Why this fits the current repo

- The repo already has direct R2 support in Python via [r2_config.py](/home/dev/projects/SmartSpecPro/python-backend/app/core/r2_config.py) and [r2_storage.py](/home/dev/projects/SmartSpecPro/python-backend/app/services/generation/r2_storage.py).
- The web app already has active storage-provider management for `r2`/`s3` in [storageSettings.ts](/home/dev/projects/SmartSpecPro/apps/web/server/routers/storageSettings.ts).
- The product already proxies and serves files from S3/R2 in [index.ts](/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts).

### Default contract

- Source of truth:
  - object storage artifact bytes
  - database metadata row
- Preferred provider in this repo:
  - `providerType = "r2"`
- Compatibility posture:
  - keep the implementation S3-compatible so a deployment that already standardizes on S3 can still plug into the same interface later

### Object key default

Use:

```text
presentation-previews/tenant/<tenantId>/presentation/<presentationId>/slide/<slideId>/<previewHash>/<target>.<ext>
```

Where:
- `target` is one of `editor-thumb`, `library-card`, `share-image`, `export-thumb`
- `ext` defaults to `webp` for raster previews unless a fallback format is required

### Metadata row minimum

- `tenantId`
- `presentationId`
- `slideId`
- `previewHash`
- `target`
- `status`
- `artifactUri`
- `definitionRevision`
- `rendererVersion`
- `fontCatalogVersion`
- `themeVersion`
- `attemptCount`
- `lastError`
- `staleReason`
- `createdAt`
- `updatedAt`

## 2. Initial Font Catalog v1

### Default

Ship a **small deterministic allowlist** with four production-safe families:

- `Plus Jakarta Sans`
  - primary sans for general presentation UI and marketing-style slides
- `Sarabun`
  - Thai-capable general-purpose family for Thai and mixed Thai/Latin layouts
- `Merriweather`
  - serif family for editorial/document/title-oriented compositions
- `JetBrains Mono`
  - mono family for code, metrics, tables, and technical callouts

### Why these defaults

- `Plus Jakarta Sans` and `JetBrains Mono` are already loaded in [index.html](/home/dev/projects/SmartSpecPro/apps/web/client/index.html).
- `Sarabun` gives Thai coverage with a presentation-friendly feel.
- `Merriweather` adds a serif option without exploding catalog size.
- All four are well-suited to an allowlisted v1 where predictability matters more than variety.

### Explicit non-goal for v1

Do not include the decorative Google-font set already present in [index.html](/home/dev/projects/SmartSpecPro/apps/web/client/index.html) as freeform AI/editor defaults.

Examples to exclude from v1 packs:
- `Bangers`
- `Boogaloo`
- `Fredoka One`
- `Anton`
- `Paytone One`
- `Righteous`
- `Permanent Marker`
- `Bebas Neue`

Those can remain available for later poster/sticker packs, but they should not be part of the deterministic core typography system.

### Font pack defaults

Create these initial packs:

1. `modern_sans`
   - heading: `Plus Jakarta Sans`
   - body: `Plus Jakarta Sans`
   - accent: `Plus Jakarta Sans`
   - mono: `JetBrains Mono`

2. `thai_sans`
   - heading: `Sarabun`
   - body: `Sarabun`
   - accent: `Sarabun`
   - mono: `JetBrains Mono`

3. `editorial_serif`
   - heading: `Merriweather`
   - body: `Plus Jakarta Sans`
   - accent: `Merriweather`
   - mono: `JetBrains Mono`

### Versioning rule

- introduce `fontCatalogVersion = 1` from day one
- bump `fontCatalogVersion` whenever:
  - a font file changes
  - a fallback chain changes
  - a pack-to-family mapping changes
  - font metrics change enough to affect layout/render parity

## 3. Preview Status and Retry Contract

### Canonical preview lifecycle

Use these artifact states:

- `queued`
- `rendering`
- `ready`
- `failed`
- `stale`

This is intentionally preview-domain specific even though the repo already has adjacent job enums such as [libraryIndexJobStatusEnum](/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts#L1776) and retry fields like `attemptCount`, `nextRetryAt`, and `lastError`.

### Required fields

- `previewHash`
- `status`
- `attemptCount`
- `maxAttempts`
- `nextRetryAt`
- `lastError`
- `rendererVersion`
- `fontCatalogVersion`
- `definitionRevision`
- `createdAt`
- `updatedAt`
- `staleReason`

### Preview hash inputs

`previewHash` must include at minimum:

- canonical content hash
- `definitionRevision`
- `rendererVersion`
- `fontCatalogVersion`
- theme/token version
- target output

### Queue/retry default

Use this v1 policy:

- built-in previews:
  - pre-generated or generated in controlled maintenance flows, not on critical user request paths
- user-authored canonical previews:
  - generated asynchronously
- request-path behavior:
  - UI may show client-generated preview immediately
  - canonical server preview replaces it when `status = ready`

Retry defaults:
- `maxAttempts = 3`
- exponential backoff with short intervals:
  - attempt 1 retry after `10s`
  - attempt 2 retry after `30s`
  - attempt 3 retry after `90s`
- idempotency key:
  - `previewHash + target`
- duplicate rule:
  - if a `ready` artifact already exists for the same hash/target, do not enqueue a new render

### Timeout and failure defaults

- per render job timeout:
  - `30s` for thumbnail/card targets
  - `60s` for larger share-image targets
- if canonical rendering fails after max retries:
  - mark artifact `failed`
  - preserve `lastError`
  - allow UI to keep showing non-canonical client preview temporarily where available
  - visually mark that the preview is not canonical

### Staleness rule

Mark a preview `stale` when any of the following changes:

- canonical content hash
- `definitionRevision`
- `rendererVersion`
- `fontCatalogVersion`
- theme/token version
- output target contract

### Retention default

- keep the current `ready` artifact as canonical
- retain stale/older artifacts for `7 days`
- let object-storage lifecycle rules purge expired stale artifacts after that window

## 4. Sprint-1 Implications

These defaults imply:

- use the existing storage abstraction and prefer R2-backed configuration first
- add one preview metadata table or equivalent preview record model instead of storing binaries in SQL
- keep built-in preview generation off the main interactive request path
- add only the four font families above to the deterministic v1 catalog
- model preview lifecycle explicitly rather than piggybacking on generic library-index semantics

## 5. Open Items That Are No Longer Architecture Blockers

- exact storage bucket/container name in each deployment
- exact CDN strategy in front of preview artifacts
- whether built-in previews are generated at build time, migration time, or admin backfill time
- the precise file format mix for each target (`webp`, `png`, later maybe `svg`)
