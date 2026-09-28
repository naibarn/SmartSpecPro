# Post-implementation gap review 8 — UI drop, selection, and capability limits

Date: 2026-08-31

Scope: Storyboard drag/drop from disk or Library, multiple mixed files,
image-only start/stop slots, previews, modality counts, limits, and user-facing
rejection behavior.

Findings and actions:

- MUST_FIX: the drop helper accepted only images and the input was not
  multi-select. It now accepts multiple image/video/audio files and preserves
  valid user order while reporting invalid input.
- MUST_FIX: the UI used image-only limits and rendering for a multimodal
  reference strip. It now reads the provider capability profile, shows per
  modality/total limits, and keeps start/stop separate from references.

Evidence: `ImageSourcePicker.test.ts`, the Storyboard panel implementation,
and feature-170 UI contract tests.

Result: no open MUST_FIX findings for this boundary.
