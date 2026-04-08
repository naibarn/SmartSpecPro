# Decision Log

## Depth
- Chosen depth: `standard`
- Reason: the task is bounded to one skill package, but it includes prompt design, input contract redesign, UI schema correction, example refresh, and output alignment.

## Key decisions
- Pivot from a provider-specific Seedance prompt builder to a model-agnostic cinematic video prompt builder.
- Use general-user fields and selects for style/camera/mood choices instead of nested provider directives.
- Add `reference_images` as the primary image input path, capped at 4 images, because that matches the app's existing multimodal pattern.
- Keep optional structured planning through simple `scene_beats` rather than a deeply nested shot schema.
- Ship a custom `ui.schema.json` with `sections` so the form renders as intended in SmartSpecPro.

## Review rounds
- Round 1: Identified that the old `ui.schema.json` would not be consumed by the skill router. `[AUTO-FIX]` Replace it with the app's custom section-based format.
- Round 2: Identified that imported provider terms (`Seedance`, `WaveSpeed`, directive handles) pushed the skill away from cinematic user intent. `[AUTO-FIX]` Rewrite the skill prompt around cinematic craft.
- Round 3: Identified missing first-class support for app-native image uploads. `[AUTO-FIX]` Add top-level `reference_images` and guidance notes.
- Round 4: Identified contract drift between docs/examples/output. `[AUTO-FIX]` Update examples and output schema together.
- Round 5: Checked scope fit and completeness across prompt text, form schema, and examples. No meaningful new gaps found.
- Round 6: Re-checked for contradictions between custom UI fields and JSON Schema fields. No meaningful new gaps found.

## Risks carried forward
- The skill still depends on the LLM following the prompt contract well; no backend schema-enforced transformation layer is added here.
- If future provider integrations need stricter API fields, they should be layered on top of this user-facing prompt builder rather than pushed back into the public form.
