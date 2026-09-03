# Vertical Drama Omni Flash 1.1 Enhanced Readiness

## Goal

Make `gemini-omni-flash-1-1` usable by the Enhanced Video Prompt flow while
preserving the existing Legacy prompt and render paths byte-for-byte.

## Design

- Treat the database-backed `media_models` row as the runtime authority.
- Add the same declarative capability profile already present in the static
  registry: separate `first_frame_url`/`last_frame_url`, up to seven
  `image_urls`, one video reference, and up to three audio references.
- Add a stable provider profile identifier so Enhanced provenance and readiness
  can bind to the exact Kie model.
- Keep the migration additive and idempotent; update only the two Gemini Omni
  model rows and preserve all unrelated admin-maintained configuration keys.
- Keep Omni in the existing provider-neutral prompt dialect for now, but make
  the model-family badge identify it explicitly rather than displaying `Other`.

## Safety and compatibility

The Enhanced gate remains fail-closed when a model has no valid profile. Legacy
continues using its existing model resolver and prompt projection. No episode
JSON, prompt text, credits, or media assets are changed by the migration.

## Verification

Test the profile parser and reference limits, family resolution, migration
presence, then apply the migration locally, refresh the model cache, restart
the Node API, and verify Episode 289 readiness without submitting a paid media
generation request.
