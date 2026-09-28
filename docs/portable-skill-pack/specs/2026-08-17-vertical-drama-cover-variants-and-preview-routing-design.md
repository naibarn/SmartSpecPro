# Vertical Drama Cover Variants and Preview Cover Routing

## Goal

Add four independently generated episode-cover slots and route cover variants
into the four episode-preview slots. Each cover slot is generated on demand,
using a different server-selected reference-image strategy. Fix the current
preview failure where a Remotion worker fetches protected storage URLs without a
session and receives HTTP 404.

## Confirmed user behavior

- The episode screen displays four cover slots in order.
- Each slot has its own generate/retry and upload actions.
- A user may generate any slot independently; one slot must not block or replace
  another slot.
- Each generation selects a different reference-image strategy. The baseline
  strategies are one scene image, two scene images, three scene images, and a
  fourth seeded random 1–3 scene-image strategy.
- Configured title/channel logos remain optional references and consume model
  reference capacity. Scene-reference counts are capped by the selected model's
  actual capacity after logo references are reserved.
- When creating a preview, the server assigns a ready cover variant to the
  preview slot. It prefers an unused ready variant, then randomly reuses one of
  the ready variants when fewer covers exist than preview slots.
- The selected cover variant is persisted with the preview state so polling,
  reloads, and worker reconciliation do not silently change the cover.

## Current failure evidence

Episode `140` has ready uploaded video assets and `motionPromptPack` clip URLs
under `media-jobs/assets/...`. The web process can read these objects through
the server storage adapter, but preview submission currently writes absolute
protected `/api/storage/files/...` URLs into the Remotion template and asset
manifest. The Lane-B worker fetches those URLs without browser/session
authorization and fails with:

```text
asset_stage_failed: Asset fetch failed (404) for video source:
https://smartaihub.app/api/storage/files/media-jobs/assets/...
```

The fix must preserve server-side staging while replacing worker-facing
protected references with short-lived tenant/user-scoped broker URLs.

## Design

### Cover state

Extend the existing `coverImage` JSONB contract with a backward-compatible
`variants` collection containing four slot states. Keep legacy single-cover
records readable as slot 1 and keep the existing projected `coverImage` field
for consumers that still need the active/default cover. Each variant retains
the existing task, asset, source-shot, error, and idempotency fields plus the
selected reference strategy/count.

No new table is required for the first version. This avoids a migration and
keeps existing episode rows and list projections recoverable. Shared helpers
will be the only code allowed to interpret legacy versus variant state.

### Cover generation

Add an optional `coverSlotId` to the generation and upload mutations, defaulting
to slot 1 for backward compatibility. Generation state and polling are scoped
to the requested slot, so concurrent slots can be submitted and polled
independently.

Reference selection stays server-side. A seeded pseudo-random selection uses
the episode, slot, and idempotency key; retries with a new idempotency key can
produce another combination, while duplicate submissions of the same key are
stable. The selected source-shot IDs and strategy are persisted for audit and
retry visibility.

### Preview cover routing

Extend the preview state with an optional `coverSlotId`. During preview
creation, read ready variants, choose an unused ready slot when possible, and
otherwise choose a ready slot from the available set using a seeded random
choice. Persist the choice before the render job is reconciled. Existing
previews without this field continue using the active/default cover.

### Protected asset delivery

Before the Remotion worker job is queued, resolve all protected clip and cover
references used by the preview template and asset manifest through the existing
tenant-scoped managed-media broker. The worker receives broker URLs with the
required filename extension; the web process continues to stage/probe through
the server storage adapter. This fixes the 404 without weakening the protected
storage route or exposing session cookies.

### UI

Replace the single cover surface with a responsive four-slot grid. Each slot
shows its own image/status/error, model selection remains shared, and logo
checkboxes remain shared. The slot action is disabled only for that slot while
its own task is pending. Preview cards may show the assigned cover slot for
transparency, while the user continues selecting only source shots.

## Failure handling

- A failed cover slot remains retryable and does not clear other ready slots.
- A missing or expired cover variant causes preview creation to select another
  ready variant rather than submit a broken worker job.
- If no ready cover exists, preview creation returns the existing clear
  precondition message.
- If a broker URL cannot be issued, preview submission fails before queueing and
  does not create a stuck render job.
- Existing legacy `coverImage` rows remain readable and migrate in memory to
  slot 1; no destructive data rewrite is needed.

## Verification

- Shared cover-state tests cover legacy state, four slots, slot-specific
  generation state, deterministic seeded reference selection, and capacity
  capping with logos.
- Preview-state tests cover persisted `coverSlotId`, unique assignment when
  four ready covers exist, reuse when fewer exist, and legacy fallback.
- Remotion tests cover broker URLs in both template layers and asset-manifest
  sources, including protected `media-jobs/assets` references.
- Focused router/service/UI tests, TypeScript/esbuild checks, and `git diff
  --check` run before deployment.
- A live preview retry must confirm that the worker no longer reports
  `asset_stage_failed` for the same protected storage URL.

## Alternatives considered

1. **Four variants inside existing JSONB (recommended):** no migration, small
   deployment surface, preserves legacy data; requires careful shared parsing.
2. **Separate `episode_cover_variants` table:** cleaner querying and future
   history, but requires migration, more joins, and broader compatibility work.
3. **Keep only one cover and choose variants ephemerally per preview:** smallest
   change, but does not meet the user's requirement for four visible reusable
   cover slots and makes preview results non-reproducible.

