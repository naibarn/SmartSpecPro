# TDD Plan

## Section 01: Skill and context contracts

Write failing tests first for:

- shared Character DNA schema accepts complete output and rejects invalid scores/ranges;
- context snapshots are allowlisted, exclude sensitive fields, distinguish same-person
  variants/twins, and report structured/partial/none source quality;
- recent archive loader enforces tenant+owner, excludes current series, and caps results;
- user prompt includes full story/cast/archive context and approved DNA when present;
- runtime output validation requires `character_design_dna`;
- skill content contains series DNA, role/age libraries, three directions, score thresholds,
  history truthfulness, family resemblance, recall stack, anti-clone, and precedence rules;
- all prior child, own-reference, face-source, sheet, custom-instruction, and prompt-field
  tests continue passing.

Expected first failure: missing schemas/context fields/skill instructions, not import errors.

## Section 02: Router and persistence

Write failing tests first for:

- preview loads context and returns a DNA snapshot without updating the character;
- direct portrait and direct sheet pass context and persist after successful submit;
- approved unchanged portrait snapshot persists without re-running the LLM;
- missing/edited/legacy approved snapshot renders without persistence;
- media submission failure prevents persistence;
- persistence failure returns task plus warning;
- atomic update preserves personality, speech profile, and ledger fields;
- archive failure is marked unavailable without crossing owner scope;
- current-cast failure blocks prompt generation.

Mock boundaries: DB select/update, `generateCharacterVisualPrompts`, and
`mediaGenerationService.generateImageAsync`. Assertions must use real route inputs and
verify no extra LLM call on approved-prompt confirmation.

## Section 03: Client handoff and integration

Write failing pure/helper or focused component tests first for:

- unchanged preview confirmation includes the approved DNA snapshot;
- edited preview confirmation omits it and chooses the bilingual identity-not-locked notice;
- cancellation clears pending DNA;
- Character Sheet continues calling its direct mutation without preview state.

Prefer extracting a small pure confirmation-payload helper over mounting the entire large
component if the existing test style does the same. Then run the combined server/skill/client
suite and typecheck.

## Regression setup

- Preserve current module mocks and exact safety marker assertions.
- Use the existing valid visual-bible output fixture as the base and add a complete DNA
  fixture shared within the relevant test file.
- Do not make tests depend on current wall-clock values; inject or assert ISO shape.
- Do not query a real production database or invoke paid providers.

