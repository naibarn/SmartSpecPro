# Section 05: Runtime Isolation And Regressions

## Goal

Lock the feature to editor-authoring surfaces only and prevent accidental note leakage into playback or export.

## Scope

- regression tests for play payloads, export payloads, and slide-render route
- verification that existing snapshot/version behavior still works with notes
- final guardrails for save-path completeness

## Implementation Steps

1. Add tests proving play/slideshow payloads remain note-free even when deck/slides contain notes
2. Add `slideRender` regression coverage ensuring rendered HTML contains slide content only
3. Re-check service/router tests for:
   - slide duplication preserving slide notes
   - slide snapshot/restore behavior staying intact
4. Re-check editor tests for save-path completeness so note edits cannot be silently dropped

## Constraints

- do not expand runtime schemas to include authoring notes
- keep regression coverage focused and schema-driven

## Done When

- notes remain absent from playback/export/runtime payloads
- note persistence works in authoring flows only
- regression tests guard against future accidental leakage
