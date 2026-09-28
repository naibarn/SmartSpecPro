# Deep Plan Interview

## Q1. Should AI assign the canonical narrative role automatically, and may the user edit it later?

Yes. AI should assign the role from the first character-definition flow, and the user must
be able to edit and confirm it in the UI. The canonical role must then be passed into the
Visual Bible skill accurately.

## Auto-Decisions

- Use additive canonical fields and a V2 normalizer to protect existing projects.
- Keep occupation/status separate from narrative role and show both in the UI.
- Use `skill.md` as the SmartSpec runtime source, with uppercase `SKILL.md` as a generated
  parity mirror; load `system.prompt.md` as a separate mandatory layer.
- Keep creativity inside the skill; server code may normalize facts and validate semantics,
  but may not append creative prompt text.
- Use existing Drizzle, Zod, Vitest, React, and tRPC conventions.
- Use bounded same-skill redesign retries instead of a second external prompt composer.
