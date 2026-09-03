# Vertical Drama Prop/Object Reference Design

## Goal

Allow ordinary storyboard shots to attach persistent prop/object reference images, such as a locked wooden box, without requiring a Product Tie-in. References can be uploaded from disk or selected/dropped from the existing media library/history panel. They must be available to image-prompt authoring, Start Frame image generation, and video generation so the same physical object can remain visually consistent across shots.

## Scope and behavior

- Every shot exposes one unified `Object Reference` surface using the existing
  wide Product tie-in card treatment. A Product tie-in is the commercial
  object variant in that card; a locked box, ring, jade, or weapon is the story
  prop variant. They must not render as two competing shot-level surfaces.
- The unified card keeps Product tie-in semantics (placement/disclosure and
  product-image selection) while adding optional story-object selection,
  upload, Library/History drop, and remove actions in the same layout.
- Missing references are advisory only: storyboard generation, prompt generation, and image generation remain available when the list is empty or an attachment fails.
- Attachments are per shot, ordered, removable, and persisted as tenant-owned media references.
- The UI accepts local image upload and drag/drop from the existing Library/History picker. Existing media ownership checks remain authoritative.
- Reference images are passed as multimodal inputs for image prompt authoring and Start Frame generation, and are included in the existing shot reference bundle for video generation.
- The legacy Product tie-in editor remains a compatibility adapter at the
  series level, but the creator-facing shot workflow has one Object Reference
  surface.

## Data flow

1. The client resolves an uploaded/library image to a managed `media_assets` record.
2. The client persists the ordered asset identifiers on the shot's start-frame plan in a dedicated prop/object field, preserving it across plan regeneration.
3. Prompt generation resolves those identifiers to authorized image URLs and labels them as prop/object references.
4. Start Frame generation merges prop/object references into the bounded reference-image set after character/location references, preserving existing provider limits.
5. Video generation receives the same shot-level reference bundle as an additional continuity reference.

## Safety and failure handling

- Only managed, tenant-owned, attachable media assets may be persisted or sent to providers.
- The existing reference-image count and payload limits remain in force.
- Expired or unavailable references are omitted with a non-blocking warning; the shot remains usable.
- Product reference behavior and existing generic video reference behavior remain backward compatible.

## Verification

- Unit tests cover ordinary-shot visibility, Product Tie-in separation, persistence, prompt input mapping, and non-blocking failures.
- Server tests cover URL resolution and generation request composition.
- Focused web tests, server tests, typecheck, and production build are run before handoff.
