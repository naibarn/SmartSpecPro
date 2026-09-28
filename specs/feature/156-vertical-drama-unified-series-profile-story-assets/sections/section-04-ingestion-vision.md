# Section 04 — Ingestion and Vision Evidence

## Objective

Implement source ingestion for known places, coordinates, product snapshots,
uploaded images, uploaded video shots, and generated references, with bounded
vision descriptions and evidence claims usable by drafting and B-roll.

## Target Files

- `apps/web/server/services/verticalDramaSeries/sourceIngestionService.ts`
- `apps/web/server/services/verticalDramaSeries/sourceVisionService.ts`
- `apps/web/server/services/verticalDramaSeries/sourceEvidenceService.ts`
- `apps/web/server/services/verticalDramaSeries/managedSourceMedia.ts`
- `apps/web/server/services/verticalDramaSeries/*.test.ts`

## Tests First

1. Validate MIME/content sniffing, size/quota limits, owner/tenant media scope,
   and SSRF rejection for remote references.
2. Test known-place metadata and product description snapshots as provenance,
   not verified facts.
3. Test image/video analysis retries, truncation, stale analysis, and bounded
   output; preserve source media across JSON retries.
4. Test slot coverage and evidence adapters for each review profile.

## Implementation

- Route uploads through managed media storage and store media asset IDs. Never
  use a provider URL as durable media authority.
- Normalize each source into a slot with title, narrative purpose, source kind,
  provenance, description, claims, confidence, rights/disclosure, and optional
  shot duration/trim metadata.
- Provide generate-description as an explicit paid/idempotent operation that
  reads product descriptions and source media; user text remains authoritative.
- Build profile-specific evidence requirements: exterior/interior/counter/
  kitchen for restaurant, place context/route for location, product angles and
  usage for product, interface/workflow proof for software, and interview/archive
  slots for documentary. Users can add unlimited logical slots within quotas.
- Return analysis status and allow stale results to be regenerated without
  deleting the source or silently changing the user's description.

## Acceptance

- Image and video slots can be referenced by draft and B-roll safely.
- Generated descriptions are labelled AI suggestions until accepted.
- Rights pending blocks production but does not erase text context.

## UI/UX Contract

### Target User / JTBD

Add source media and explain what viewers should learn from each item.

### Surface Inventory

Upload/dropzone, slot editor, media preview, analysis result, and rights disclosure.

### Component Map

SourceDropzone, SlotEditor, MediaPreview, VisionSuggestion, RightsBadge.

### State Matrix

Empty, uploading, analyzing, suggested, accepted, failed, stale, and rights-pending.

### Responsive Matrix

Media cards become a list on narrow screens; preview controls remain touch-sized.

### Accessibility Acceptance

Keyboard upload, labelled previews, captions for video, and error text linked to fields.

### Copy Contract

Differentiate user-provided facts, imported metadata, and AI suggestions visibly.

### Browser Evidence Required

Show image upload, video slot, generated description acceptance, and failed retry.
