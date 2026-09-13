# Section 02 — Skill registry and model capabilities

## Goal

Expose a validated, tenant-safe adapter for storyboard-compatible character prompt skills and the existing image/video model catalog.

## Files and ownership

- Add `apps/web/server/services/storyboardSkillRegistry.ts` and focused tests.
- Add focused integration to `skills.ts` only where needed for nested schema resolution.
- Reuse `skillCatalog`, `skillRegistry`, category metadata, and `media.getModels`; do not create another provider catalog.

## Registry rules

Only enabled/visible skills in `character_prompt_generation` with `prompt_only`, canonical output, references, and 9:16 support are selectable. Normalize hyphen slug and underscore execution ID; snapshot package/version/schema hash. Resolve root and `imported/schemas` bundles deterministically and reject identity/version mismatch or malformed schemas. Dynamic field metadata is allowlisted and never executes skill-provided component code. Parent-owned fields are returned separately so the UI does not render duplicate idea/reference/aspect fields.

Cute Child must normalize to `cute_child_image_generator`, version `3.0.0`, while retaining `cute-child-image-generator` as display/package alias. Its invocation preserves the guide's input and response shape.

## Model capabilities

Adapt enabled model rows and `configJson.inputFields` into image/video choices. Quality appears only for the selected model and only allowlisted values are accepted. Unknown model, quality, provider, reference count, or aspect ratio fails closed; no implicit fallback.

## Tests

Cover aliases, nested schemas, mismatch/missing capability, schema hash changes, parent field exclusion, Cute Child fixture, quality hidden/shown, and unsupported model/quality rejection. Tests must not call real providers.

## UI/UX Contract

### Target User / JTBD
Creator can choose a compatible skill and understand available fields and quality options.

### Surface Inventory
Skill picker, schema fields, image/video model pickers, and conditional quality control.

### Component Map
Registry returns safe metadata; renderers execute no skill-provided browser code.

### State Matrix
Support loading, empty, selected, schema error, unsupported model, and quality unavailable.

### Responsive Matrix
Metadata remains usable at 320px, tablet, and desktop widths.

### Accessibility Acceptance
Options and quality controls have labels, keyboard selection, and associated errors.

### Copy Contract
Localize skill name/version, capability errors, and quality availability.

### Browser Evidence Required
Show Cute Child selected, malformed skill rejected, and quality hidden/shown.
