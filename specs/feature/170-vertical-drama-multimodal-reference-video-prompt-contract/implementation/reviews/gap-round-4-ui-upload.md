# Post-implementation gap review 4 — UI, upload, and access boundary

Date: 2026-08-31

Scope: local/library drag and drop, image/video/audio acceptance, previews,
frame-slot separation, upload validation, and tenant-safe media links.

Checks:

- `ImageSourcePicker.test.ts`: passed with local audio and extensionless
  library-video drag cases.
- Focused UI/media tests with `--environment jsdom`: 28 tests passed;
  `git diff --check` passed on all owned paths.
- Read-through confirms Start/Stop controls remain image-only while the shot
  reference strip accepts `image/*,video/*,audio/*` and the server validates
  audio magic bytes and upload limits.

Findings and actions:

- MUST_FIX: the drop helper recognized only images and could reject library
  media with extensionless URLs. Added typed custom-drag handling for all three
  modalities.
- MUST_FIX: the reference strip rendered every item through an image path.
  Added video poster/icon and audio placeholder rendering while preserving
  remove/reorder/use-as-main behavior.
- NICE_TO_HAVE: full browser screenshot evidence is unavailable in this run;
  jsdom behavior is proven, but the spec does not claim a real-browser pass.

Result: no open MUST_FIX findings for this boundary.
