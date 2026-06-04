# Section 09: Library, Media History, and Video Editor Finalize

## Goal

Finalize completed HyperFrames renders as normal user-owned video assets that work in Library, Media History, Media Panel, and Video Editor.

Preview-only artifacts should remain temporary and should not appear as durable Library items.

## In Scope

- Library finalize service.
- Final metadata and idempotency rules.
- Media History discovery/filtering.
- Media Panel result display.
- Video Editor open-as-video behavior.
- Preview artifact retention boundary.

## Files To Create

- `apps/web/server/services/hyperframesLibraryFinalizeService.ts`
- `apps/web/server/services/__tests__/hyperframesLibraryFinalizeService.test.ts`

## Existing Files To Touch

- `apps/web/server/services/mediaLibraryService.ts`
- `apps/web/server/routers/media.ts` if source filtering must be extended
- `apps/web/client/src/pages/MediaStudio.tsx`
- `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`
- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
- Video Editor entry/open helpers if present
- Media History/Library components if source labels or filters are required

## Test First

Add failing tests for:

- completed QA-ready HyperFrames render can be finalized to Library;
- duplicate finalize with the same idempotency key returns the existing Library item;
- required idempotency key is `hyperframes-library:{tenantId}:{runId}:{renderIntent}:{compositionInputHash}:{outputHash}`;
- duplicate finalize refreshes metadata only when composition input hash, composition HTML hash, output hash, template ref, platform preset, tenant/user/run ownership, and QA state match;
- stale input hash, failed QA, missing output checksum, or tenant mismatch is rejected;
- finalized media includes product/run/template/platform/render refs;
- finalized media is discoverable by source, product ID, run ID, and media kind;
- preview-only artifacts do not appear as playable Library cards after expiry;
- Video Editor can open the finalized MP4 as a normal video media item;
- Product Detail Media Panel can show finalized output links.

## Final Library Metadata

Store metadata fields for:

- source type: `marketplace_auto_review_hyperframes_render`;
- product ID;
- auto review run ID;
- render job ID;
- template ID/version;
- platform profile;
- composition input hash;
- staged manifest ref;
- output checksum;
- thumbnail ref;
- subtitle/transcript refs;
- QA status and issue summary;
- disclosure/compliance state;
- credit/idempotency refs;
- trace/correlation IDs.

Required idempotency key:

```text
hyperframes-library:{tenantId}:{runId}:{renderIntent}:{compositionInputHash}:{outputHash}
```

Duplicate behavior:

- if the key already exists, return the existing Library item ID with `created: false`;
- refresh metadata only when the new metadata has the same `compositionInputHash`, `compositionHtmlHash`, `outputHash`, template ref, platform preset, tenant/user/run ownership, and QA state;
- never create a second Library item for the same key;
- never overwrite a finalized item with stale input, different template version, different platform preset, different output hash, or lower QA status;
- include the idempotency key in Library metadata and audit events;
- never repeat credit/quota charge for the same finalized idempotency key.

## Finalize Rules

Finalize only when:

- render job is completed;
- final QA passed;
- output artifact exists;
- output checksum matches;
- tenant/user access is valid;
- Library save permission is valid;
- idempotency key is valid.

Do not finalize:

- preview-only snapshots;
- failed QA outputs;
- stale input hashes;
- unowned artifacts;
- cancelled jobs;
- transient worker artifacts.

## Media History and Library UI

Add labels/filters only where the existing UI already supports source labeling or filtering. Keep the finalized asset treated as a normal video item:

- playable card;
- title/thumbnail;
- product/run provenance;
- source badge;
- open in Video Editor;
- download/share actions if already supported.

## Video Editor Handoff

The Video Editor should not need special HyperFrames rendering logic. It should receive:

- media item ID;
- video URL or storage ref resolved through existing media APIs;
- thumbnail;
- title;
- metadata for provenance display if existing UI supports it.

## Acceptance Criteria

- Final output behaves like any other Library video.
- Duplicate saves do not duplicate Library items or charges.
- Preview artifacts remain temporary.
- Media History and Product Detail can surface completed outputs.
- Video Editor handoff works without a special editor-only adapter.

## Rollback Notes

Disable save-to-Library flag for new HyperFrames outputs. Existing finalized Library items remain durable and should not be deleted by rollback.

## UI/UX Contract

### Target User / JTBD

Users need completed HyperFrames renders to behave like normal video assets across Library, Media History, Media Panel, and Video Editor.

### Surface Inventory

| Surface | Impact |
|---|---|
| Library | finalized video card, source badge, playable media |
| Media History | source/product/run filtering |
| Product Detail Media Panel | completed output link/card |
| Video Editor | open finalized MP4 as normal video |

### Component Map

| Component | Metadata dependency |
|---|---|
| Library card | source, title, thumbnail, video ref |
| Media History filters | source/product/run metadata |
| Product Detail output | Library item projection |
| Video Editor opener | media item ID and video kind |

### State Matrix

| State | Expected UI behavior |
|---|---|
| preview-only | not shown as durable Library media |
| final QA passed | save action enabled |
| saving | pending state and duplicate prevention |
| saved | playable Library item |
| duplicate save | existing item returned |
| stale/failed QA | save disabled with safe reason |

### Responsive Matrix

| Viewport | Requirement |
|---|---|
| mobile | Library card labels do not overflow |
| tablet | filters remain reachable |
| desktop | source/product/run metadata can be inspected without clutter |

### Accessibility Acceptance

Playable video cards, source labels, save state, and Video Editor links must have accessible names and keyboard paths.

### Copy Contract

Use a consistent source label for HyperFrames Marketplace Auto Review renders. Do not expose raw artifact IDs as primary user copy.

### Browser Evidence Required

E2E must cover save, duplicate save, Library discovery, Media Panel display, and Video Editor open behavior.
