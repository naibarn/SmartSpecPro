# Interview Notes

## Q1. Confirm launch scope, data model, conflict policy, limits, and compatibility rules

### Answer

- launch_scope
  - must_have:
    - Single-user create/edit deck flows.
    - Slide CRUD: add, delete, duplicate, reorder.
    - Basic WYSIWYG canvas editing: text box, image, basic shape (rectangle/line), background color.
    - Image asset upload and reuse.
    - Slideshow playback: next/previous, fullscreen, presenter-time display.
    - Basic export: PNG per slide and MP4 slideshow with only `cut`/`fade` transitions.
    - Autosave and manual save.
    - PPTX import (best effort) and view support.
  - deferred:
    - Real-time multi-user co-editing and presence.
    - Comments/mentions.
    - Per-element animation timeline.
    - Advanced transitions.
    - Audio narration/voiceover sync.
    - Video embeds and trim.
    - Charts/tables/smartart.
    - Advanced master slides/themes/style system.
    - Legacy `.ppt` import.
    - High-fidelity round trip with PowerPoint/Google Slides.
    - Offline mode.
    - Granular permissions/sharing.
    - Cross-session history/undo.
    - Full text search/indexing.

- model_choice
  - `hybrid_json`.
  - Use normalized tables for presentations/slides/assets/relations.
  - Keep `slide_content` JSON per slide for element/layout data.
  - Optional `deck_settings` JSON.
  - Keep derived query/sort fields in columns (`title`, `slide_count`, `updated_at`).

- conflict_policy
  - `optimistic_version_error`.
  - Maintain per-presentation and per-slide version.
  - Client sends `If-Match`/`expected_version` on save.
  - On mismatch server returns `409` with latest version and payload.
  - MVP: no auto-merge; client prompts `Reload / Overwrite / Copy as new deck`.
  - Background autosave may use constrained last-write-wins only for non-critical fields if needed, but default must not fail silently.

- limits
  - `max_slides_per_deck = 200` (hard).
  - `max_assets_per_slide = 50` (hard).
  - `max_total_assets_per_deck = 1000` (hard).
  - `max_single_asset_upload = 25MB` (image).
  - `target_deck_size = 200MB` total uploaded assets; warning at `150MB`.
  - export_defaults:
    - PNG: `1920x1080`
    - MP4: `1920x1080 @ 30fps`
    - transition: `cut` default, `fade` optional
    - default slide duration for auto-advance export: `5s`
  - Enforce server-side with friendly error codes.

- compatibility
  - Existing `ppt/pptx` library items open read-only immediately.
  - `Edit on canvas` performs one-time import/convert into internal deck.
  - Preserve original source file as `source_attachment` and keep mapping (`slide_index -> source_id`).
  - Unsupported imported elements should be rasterized to background image plus best-effort extracted text with `partial fidelity` flag.
  - In MVP, prevent opening wrong editor type (`document` vs `presentation`); show redirect/error state with CTA.
  - For `document -> presentation`, only offer `Create new presentation (blank)` in MVP.
  - Legacy `ppt` marked unsupported with guidance to convert to `pptx` first.
