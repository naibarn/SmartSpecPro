# TDD and Verification Plan

## Test-first sequence

### 1. Shared settings and policy

Add tests before implementation for:

- legacy effort settings normalize to the new quality profile;
- malformed/null settings normalize to safe defaults;
- image quality and LLM quality remain independent;
- profile/task mapping produces the expected target and ceiling;
- an explicit model pin is preserved;
- new episode creation copies the normalized series policy.

Expected initial failures: missing profile type, normalization behavior, and task-policy
registry.

### 2. Capability resolver

Use table-driven fixtures for:

- OpenRouter effort model with all requested efforts;
- OpenRouter model with a restricted effort list;
- model supporting `max_tokens` but not effort;
- reasoning-mandatory model;
- model with no reasoning support;
- provider name casing and missing catalog metadata;
- requested `maximum` resolving to the highest supported value;
- no simultaneous `effort` and `max_tokens`.

Assert the full effective result, including `applied`, `protocol`, and downgrade reason.

### 3. Provider adapter and transport

Mock `fetch` and provider resolution. Assert:

- OpenRouter chat body contains `reasoning.effort` and `exclude: true`;
- max-token models contain `reasoning.max_tokens` instead;
- non-OpenRouter candidates omit OpenRouter reasoning fields;
- responses/messages/gemini body shapes are provider-valid;
- fallback candidates receive a newly adapted body;
- a provider 400 for unsupported reasoning performs exactly one downgrade retry;
- raw payload observers receive redacted body metadata and no secrets.

### 4. Wrapper coverage

Mock the underlying planning/generic executor and assert every migrated skill passes:

- task class;
- settings source;
- model id;
- effective provider payload;
- observability metadata.

Add a manifest test that fails when a new in-scope Vertical Drama LLM service is added
without registration or an explicit deterministic exclusion.

### 5. Story Truth Package and quality gates

Test pure functions for:

- stable source/version construction;
- compact projection per task class;
- locked fact preservation;
- character/speaker membership;
- timeline ordering;
- continuity anchor consistency;
- stale artifact rejection;
- semantic issue severity and repair-required classification.

Mock a critic response and assert that blocking issues trigger targeted repair and that a
still-invalid artifact is not persisted as accepted.

### 6. UI and router

Update component tests for:

- one visible LLM quality selector;
- model capability text and disabled/fallback copy;
- separate image quality selector;
- saving quality with model selection;
- switching to an unsupported model resets only the LLM quality to safe auto/highest
  supported and does not change image settings;
- mutation error states and successful save state;
- Thai/English labels and accessible names.

Add router tests for authorization, tenant/owner scoping, normalization, and existing
episode image-setting preservation.

## Focused commands

Expected commands after implementation:

```bash
cd apps/web
pnpm exec vitest run \
  server/services/__tests__/verticalDramaEpisodeGenerationSettings.test.ts \
  server/services/__tests__/verticalDramaLlmReasoningPolicy.test.ts \
  server/services/llmRouter.test.ts \
  server/services/__tests__/verticalDramaLlmSkillCoverage.test.ts \
  shared/verticalDramaSeries/__tests__/generationSettings.test.ts
```

Then run the relevant Vertical Drama service/router tests and the repository's normal
typecheck. Treat repository-wide baseline TypeScript noise separately from errors in the
changed paths.

## Non-paid integration smoke

Use a mocked provider server or intercepted `fetch` to exercise:

1. Series Settings save.
2. New episode creation.
3. One skill from each task class.
4. Unsupported reasoning response and downgrade.
5. Provider fallback and audit metadata.

No real provider credit is required for this gate.

## Real-provider smoke gate

Only after code and deployment are verified:

- use one low-cost, known-supported OpenRouter model;
- use a tiny prompt and one skill;
- assert audit metadata and response shape;
- run one unsupported-model case only if it is free/non-billing or explicitly approved;
- confirm credit charge occurs once after accepted output.

## Browser evidence

For the Settings route, capture or manually verify:

- mobile `390x844`;
- tablet `768x1024`;
- desktop `1440x900`;
- extended `360x800`, `1024x768`, and `1280x800` because the page is dense.

Check no overflow, keyboard path, focus visibility, localized labels, loading/success/error
states, and that LLM and image controls remain visibly separate.
