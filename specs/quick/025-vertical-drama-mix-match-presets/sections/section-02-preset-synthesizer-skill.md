# section-02-preset-synthesizer-skill

## Goal

Create `apps/web/skills/vertical-drama-preset-synthesizer/`, a dedicated LLM-only skill that blends multiple selected preset/category flavors into one coherent editable preset draft.

## Ownership Boundaries

Owns:

- `apps/web/skills/vertical-drama-preset-synthesizer/**`

May update only if needed:

- skill metadata tests that enumerate built-in skills.

Does not own:

- tRPC mutation implementation.
- Create wizard UI.

## Required Package Shape

Follow the existing Vertical Drama skill package shape:

- `SKILL.md`
- `skill.md`
- `skill.json`
- `prompts/system.prompt.md`
- `schemas/input.schema.json`
- `schemas/output.schema.json`
- `schemas/ui.schema.json`
- `references/input_contract.md`
- `references/output_contract.md`
- `references/maintenance.md`
- `fixtures/pass.input.json`
- `fixtures/pass.output.json`
- `fixtures/fail.output.json`
- `examples/example.input.th.json`
- `examples/example.output.sample.json`
- `tests/tests.json`
- `scripts/verify.sh`
- `help/help.th.md`
- `help/help.en.md`

## Skill Metadata

Use pinned defaults:

```yaml
category: video_prompt_generation
execution_mode: llm-only
auto_trigger: false
enabled_by_default: false
credit_multiplier: 1
strict_provider_pin: false
contract_version: 1
```

## Prompt Contract

The skill must:

- synthesize, not concatenate;
- choose one primary story spine;
- use supporting flavors as situation/tone/texture;
- produce one main location or recurring service ecosystem;
- keep the story grounded in Thai everyday life when locale is Thai;
- include product tie-in guidance only when provided;
- avoid regulated claims and unrealistic product-as-miracle-solution patterns;
- return JSON only.

## Output Contract

Required top-level fields:

- `title`
- `category`
- `logline`
- `mainPlot`
- `seasonArc`
- `tone`
- `cliffhangerStyle`
- `characters`
- `visualBible`
- `mixRecipe`
- `warnings`
- `contract_version`

## TDD Expectations

- `scripts/verify.sh` validates schemas and fixtures without provider credentials.
- Pass fixture validates.
- Fail fixture violates at least one required field or contract literal.
- Metadata tests confirm `auto_trigger: false` and `enabled_by_default: false`.

## Acceptance Checks

- Skill registry can discover the package.
- Help files explain the skill in Thai/English.
- Output is directly usable by the wizard without extra text parsing.

## Risks

- If the prompt is too permissive, generated drafts may become a collage. Keep primary/supporting flavor instructions strong.
- If schema is too rigid, useful draft nuance may be lost. Allow `warnings` and `mixRecipe.rationale` for explanation while keeping preset fields strict.
