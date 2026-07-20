# TDD Plan

## Red

Extend `python-backend/tests/unit/llm_proxy/test_kie_ai_provider_model_resolution.py`:

- explicit default + no references expects text-to-image;
- explicit default + reference list + opt-in variant expects image-to-image and
  `input_urls`;
- reference list without opt-in variant expects the original upstream model.

Add a focused seed/migration contract assertion that initially fails because the
seed still enables two GPT Image 2 rows.

## Green

Implement the scoped provider helper, update the seed records, and add migration
0212.

## Refactor

Keep key lookup compatible with snake_case and camelCase. Avoid GPT-specific name
matching in runtime code.

## Commands

- `cd python-backend && pytest -q tests/unit/llm_proxy/test_kie_ai_provider_model_resolution.py`
- `cd apps/web && pnpm vitest run scripts/__tests__/seed-media-models-kie-ai.test.ts`
  when a suitable existing test target is available; otherwise use a focused
  migration/seed contract test selected during implementation.
