# Cinematic Video Create Prompt Hardening

## Summary
Upgrade `apps/web/skills/cinematic-video-createprompt` from a provider-centric prompt schema into a genuinely cinematic, user-friendly prompt builder for general users.

The improved skill should:
- feel like a cinematic video prompt director instead of an internal Seedance config editor
- expose clearer inputs with user-facing language
- convert as many suitable fields as possible into guided selects
- support optional `reference_images` with up to 4 images
- align `skill.md`, `input.schema.json`, `ui.schema.json`, and examples so the package feels complete

## Likely affected areas
- `apps/web/skills/cinematic-video-createprompt/skill.md`
- `apps/web/skills/cinematic-video-createprompt/SKILL.md`
- `apps/web/skills/cinematic-video-createprompt/schemas/input.schema.json`
- `apps/web/skills/cinematic-video-createprompt/schemas/ui.schema.json`
- `apps/web/skills/cinematic-video-createprompt/schemas/output.schema.json`
- `apps/web/skills/cinematic-video-createprompt/example.input.json`
- `apps/web/skills/cinematic-video-createprompt/example.output.json`

## Constraints
- Keep the skill compatible with the existing SmartSpecPro skill loading flow.
- Prefer user-first wording over provider-internal terminology.
- Keep the schema practical for both chat skill forms and programmatic payloads.
- Avoid changing unrelated files outside the skill folder and planning artifact.

## Assumptions
- This skill is still in a draft/imported state and can be re-shaped without preserving the old provider-specific contract.
- `reference_images` is the preferred image input convention in this codebase.
- A custom `ui.schema.json` with `sections` is needed for the app to render a rich form reliably.

## Non-goals
- Building a full media-generation executor for this skill.
- Adding backend validation code outside the skill package.
- Preserving every old `reference_directive` and `reference_asset` field shape from the imported bundle.
