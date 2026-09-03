# Section 01 — Canonical multimodal bundle, asset resolver, and persistence

## Objective

Establish the server-owned `VideoShotMediaBundle` foundation. Start and stop are
nullable image-only temporal frames. `references[]` is an ordered zero-to-many
list of image/video/audio assets. The server resolves every ID through managed
tenant-scoped media and never trusts client media kind or URL.

## Files and boundaries

- Extend `apps/web/shared/verticalDramaSeries/contracts.ts` with shared bundle,
  frame, reference, revision, and fingerprint types.
- Add a focused shared/server bundle normalizer/fingerprint module following
  existing project placement and naming conventions.
- Extend `apps/web/server/services/verticalDramaShotReferences.ts` to project
  media kind, preserve existing source/role values, validate links, and manage
  ordering/revision.
- Reuse `resolveMediaAssetUrlsByIds` in
  `apps/web/server/routers/verticalDramaEpisodes.ts`; do not create a second
  authorization resolver.
- Add only the required Drizzle schema/migration/index changes for typed media
  projection and optional segment child rows.
- Version `apps/web/shared/verticalDramaMedia/contracts.ts` with a backward-
  compatible typed reference array.

## Required behavior

Implement schemas equivalent to `ShotFrameAsset`, `ShotReference`, and
`VideoShotMediaBundle` in `spec.md`. Generate `referenceId` server-side and
labels from an immutable prompt snapshot. Preserve one global order across
modalities. Include `grid_cut` and `reference_frame` legacy sources.

Reject missing, pending, expired, revoked, wrong-kind, wrong-tenant,
unreadable, invalid-segment, and prompt-only frame/reference inputs. Start and
stop accept only image media. Use `VD_MAX_REFERENCE_ITEMS_PER_SHOT` with a
default of 50; block over-limit by default and require explicit subset selection
to create a new revision.

Increment `bundleRevision` on every attachment/frame/order/role/segment change.
Fingerprint canonical identity/checksum, roles, order, and segment, excluding
expiring signed URLs. Add compare-and-swap semantics so stale prompt/render
requests cannot save or dispatch against another revision.

Legacy `start_frame` rows map to `startFrame`; `reference` and
`barrier_reference` rows map to typed `references[]`; existing episodes load
without regeneration. Segment rows must not become B-roll timeline rows.

## TDD-first tests

Write tests before production changes for legacy/new parsing, frame media-kind
rejection, actual asset existence/authorization, mixed ordering and fingerprint,
revision mutation/stale CAS, over-limit/subset behavior, segment validation,
legacy row projection, and old/new worker pack compatibility.

## Exit criteria

Focused shared/service/router/migration tests pass. No unrelated schema or
worktree changes are staged.

## UI/UX Contract

### Target User / JTBD
N/A — backend contract foundation; user-facing behavior is specified in section 05.

### Existing Pattern Reference
N/A — no new UI surface; section 05 reuses existing storyboard/media patterns.

### Surface Inventory
N/A — no browser surface is changed by this section.

### Component Map
N/A — no browser components are owned here.

### State Matrix
N/A — API error/status codes are covered by backend tests; UI mapping is section 05.

### Responsive Matrix
N/A — no layout is changed here.

### Accessibility Acceptance
N/A — accessibility acceptance is in section 05.

### Copy Contract
N/A — this section defines machine-readable error codes, not UI copy.

### Browser Evidence Required
N/A — browser evidence is required in section 05.

### Implementation status

Implemented in `apps/web/shared/verticalDramaShotMedia.ts`,
`apps/web/shared/verticalDramaMedia/contracts.ts`, and
`apps/web/server/services/verticalDramaShotReferences.ts`. Actual canonical
assets are required; start/stop remain image-only and references are ordered,
typed, mixed-modality, fingerprinted, and capped by
`VD_MAX_REFERENCE_ITEMS_PER_SHOT` (default 50). Focused contract tests pass.
