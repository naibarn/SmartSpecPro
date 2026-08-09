# Output Contract — Vertical Drama Shot Image Action Composer

Every output must validate against `schemas/output.schema.json` before it is used
for real generation. Required top-level fields: `contract_version`, `prompt`,
`negative_prompt`.

- `prompt` MUST be at or below the caller-supplied `prompt_max_chars` budget (see
  skill.md's "Prompt length limit" section). Kie.ai image models may use up to
  20,000 characters; when no larger budget is supplied, use the legacy 3,800-
  character fallback. A caller-side QC pass may still refine an over-limit
  prompt, but a well-written prompt should not rely on it.
- `negative_prompt` must preserve `shot.current_negative_prompt`'s content and add
  only the new terms this action's instructions require (see skill.md).
- The prompt is sent to the image render provider close to verbatim — this skill
  is the sole author of any instructional/creative text in it. The calling code
  never appends its own wrapper sentences afterward.
