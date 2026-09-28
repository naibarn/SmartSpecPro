# TDD Plan

## Red tests first

1. Settings schema accepts legacy/null values as Auto, rejects malformed effort/quality records, and preserves model binding.
2. Image resolver returns catalog quality options and suppresses quality for unsupported/stale model bindings.
3. OpenRouter reasoning builder emits `{ reasoning: { effort, exclude: true } }` only for explicit supported effort (`minimal` through `max`) and never emits `max_tokens` simultaneously.
4. Episode settings mutation rejects cross-tenant/cross-user rows and unsupported values.
5. Episode settings mutation updates current episode and series default atomically.
6. New episode insertion snapshots the current series default; an older episode remains unchanged after a later save.
7. UI renders two independent controls and handles unsupported/loading/error states.

## Implementation order

- Write shared tests and helpers.
- Write router tests and migration/schema changes.
- Wire runtime and make runtime tests pass.
- Wire UI and make component tests pass.
- Run regression suites and static gates.

## Regression checks

- Existing `setEpisodeModelSelection` behavior and model hydration remain unchanged.
- Existing skill-level thinking defaults still apply when episode reasoning is Auto.
- Existing image `defaultInputParams` behavior remains unchanged when episode image quality is Auto.
- Existing generated artifacts are not mutated by settings save.
