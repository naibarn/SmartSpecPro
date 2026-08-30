# Section 01 — catalog and shared contract

## Ownership

Own the new model ID, shared Gemini Omni predicate/validation, static registry, media fallback catalog, and DB seed definition. Do not change the database schema.

## Targets

- `apps/web/shared/geminiOmni.ts`
- `apps/web/server/services/modelRegistry.ts`
- `apps/web/server/services/mediaGenerationService.ts`
- `apps/web/scripts/seed-media-models-kie-ai.ts`
- focused shared/registry tests

## TDD expectations

Write failing assertions for exact IDs, first/last-frame constraints, supported resolution values, and catalog parity before implementation.

## Acceptance checks

- new row is separate from `gemini-omni-video`;
- provider ID is exactly `google/gemini-omni-flash-1-1`;
- old row has no accidental field/pricing changes;
- first/last-frame and multimodal reference combinations fail closed;
- shared predicate is the only reusable model-family check.

## UI/UX contract

- Target user/JTBD: Media Studio user selects the new model and submits a valid video request without seeing provider field names unless advanced mode exposes them.
- Surface inventory: model selector, dynamic input defaults, validation toast, generation/retry state.
- State matrix: loading catalog, selected/ready, invalid frame/reference combination, provider failure, completed result.
- Responsive matrix: existing selector and validation surfaces remain unchanged at desktop/mobile widths.
- Accessibility: preserve existing labels, focus order, and text-based validation messages; no icon-only new control.
- Copy: use existing Thai/English Gemini Omni validation wording, with model display name `Gemini Omni 1.1 Flash`; no raw provider JSON in normal UI.
- Browser evidence: code-level selector/retry coverage is required; authenticated browser replay is optional and must be reported separately.
