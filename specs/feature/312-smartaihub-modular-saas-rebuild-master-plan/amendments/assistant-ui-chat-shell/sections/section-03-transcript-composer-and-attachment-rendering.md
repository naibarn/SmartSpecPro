# Section 03 — transcript, composer and attachments

## Deliverable

Render the central transcript and composer using assistant-ui primitives or its supported interaction runtime, with custom Astryx-backed message and composer components. Preserve markdown/code safety, compact image previews, document attachments, full uncropped Lightbox, local draft, queue progress/errors, retry and model/usage/credit metadata. Accept up to 10 images and text files across repeated or multi-file selections. Keep thumbnails small, show portrait/square/landscape content without distortion, and use a full-image Lightbox for inspection.

## Owned paths

- `smartaihub-platform/modules/chat/src/ui/MessageTimeline.tsx`
- `smartaihub-platform/modules/chat/src/ui/Composer.tsx`
- `smartaihub-platform/modules/chat/src/ui/AttachmentGallery.tsx`
- `smartaihub-platform/modules/chat/src/ui/styles.css`
- New scoped presentation components under `modules/chat/src/ui/`

## Acceptance

- Existing attachment input/validation/upload/send/history behavior and limits continue to work.
- Images and `.txt`/`.md`/`.csv`/`.json` documents upload through Core; a single worker turn is dispatched with the authorized attachment IDs. Image Auto selection is limited to enabled image-capable models.
- Message metadata and safe formatting remain localized and accessible.
- No arbitrary HTML/JS from a model, tool or attachment is executed.
- Queue polling is not labeled as token streaming. Pending and error states are represented truthfully.
- Assistant-ui defaults do not replace Astryx tokens/themes.

## Prerequisites and gaps

Current Core provides final job results rather than token events. True streaming remains open and requires a separate versioned persisted event contract; do not simulate it with animated final text.
