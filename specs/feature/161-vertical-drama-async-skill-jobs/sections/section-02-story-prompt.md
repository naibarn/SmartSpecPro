# Section 02 — Story plan and prompt expansion

## Scope

Move direct story bible/planning LLM work from `verticalDramaSeries.generateStoryBible` into the existing story queue as a typed plan job. Move prompt expansion preview from inline execution into a background job while preserving `vertical_drama_prompt_expansion_runs` and DB-only apply semantics.

## Boundaries

Router validates input and enqueues. Worker invokes existing real services, runs reconciliation, persists output and only then marks success. The dependent deep-draft enqueue occurs only after plan success.

## Client

Adapt `VerticalDramaDeepStoryDraftsPanel` and `VerticalDramaPromptExpansionDialog` to submit/poll, resume active jobs after refresh, disable duplicate submit, and distinguish polling expiry from terminal failure.

## Tests

Cover selected-model passthrough, durable result recovery, plan failure stopping the chain, prompt preview persistence, and direct-call regression.
