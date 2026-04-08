# TDD Guidance

## First checks to run
- Parse every edited JSON file successfully.
- Confirm the custom `ui.schema.json` contains top-level `sections`.
- Confirm field IDs in `ui.schema.json` match properties in `input.schema.json`.
- Confirm `reference_images` exists in both schema layers and is capped at 4 items/images.

## Expected failing conditions before the fix
- The old `ui.schema.json` would not render as a sectioned custom form.
- The old contract would expose provider-centric complexity instead of a simple cinematic workflow.
- The old schema would not present first-class `reference_images` in the app-native form path.

## Regression checks
- `skill.md` and `SKILL.md` remain aligned.
- Example input and example output still match the schema vocabulary.
- Output schema terminology matches the new cinematic prompt framing.

## Implementation notes
- Prefer schema clarity and UX quality over backwards compatibility with the imported bundle.
- Keep number-like UI inputs as `number` when the custom select widget would force string values.
- Validate with lightweight file parsing instead of broad app test suites, since the change is isolated to a draft skill package.
