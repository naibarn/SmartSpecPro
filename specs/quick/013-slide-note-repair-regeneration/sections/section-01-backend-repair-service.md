## Goal

Create a backend repair path that regenerates one slide from its saved slide note and replaces the slide in deck storage.

## Tasks

- Add `repairSlideFromSavedNote()` in `aiPresentationService.ts`.
- Reuse note parsing, slide normalization, component-recipe assignment, image prompt derivation, image generation, and layout compilation helpers.
- Add router mutation `presentation.ai.repairSlideFromNote`.
- Return updated slide plus warnings.

## Tests

- Service test for note-driven single-slide repair.
- Router test for mutation wiring.
