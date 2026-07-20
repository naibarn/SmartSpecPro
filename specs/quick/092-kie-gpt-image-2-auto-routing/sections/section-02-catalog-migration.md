# Section 02 - Catalog And Migration

## Ownership

- `apps/web/scripts/seed-media-models-kie-ai.ts`
- `apps/web/drizzle/0212_kie_gpt_image_2_auto_routing.sql`

## Work

Update the canonical seed row, disable the legacy row, and add an idempotent
migration that merges aliases/config without deleting either row.

## UI/UX Contract

### Target User / JTBD
- Role: any Media Studio or downstream image-generation user
- Goal: select GPT Image 2 once and optionally attach images
- Entry point: existing image-model selector
- Success outcome: one selection works in both modes

### Existing Pattern Reference
- Searched: Media Studio model config and reference input support
- Found: existing optional reference-image fields in `MediaStudio.tsx` and
  `mediaModelInputs.ts`
- Decision: reuse

### Surface Inventory
- Existing model selector: one enabled catalog row instead of two
- Existing reference upload: no component change

### Component Map
- No component source changes; behavior is catalog-driven.

### State Matrix
- No image: selected model remains GPT Image 2
- One to four images: same selected model; existing thumbnails/upload state
- More than four: existing model limit validation
- Error/loading/success: existing Media Studio behavior

### Responsive Matrix
- Mobile, tablet, desktop: no layout change

### Accessibility Acceptance
- Existing selector and upload semantics remain unchanged.

### Copy Contract
- Display name: `GPT Image 2`
- Existing localized reference-image copy remains unchanged.

### Browser Evidence Required
- Targeted selector inspection is sufficient; no layout change.

## Acceptance

- seed and migration converge on one enabled row;
- old IDs remain aliases;
- no row is deleted;
- pricing remains 70 credits.
