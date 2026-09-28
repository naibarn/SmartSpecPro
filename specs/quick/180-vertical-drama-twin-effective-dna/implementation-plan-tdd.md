# TDD Plan

## Tests first

1. Shared helper tests:
   - one-way and reverse twin resolution;
   - canonical shared face/age selection;
   - local hair/wardrobe/personality preservation;
   - provenance and revision output;
   - incompatible age-stage rejection.
2. Router tests:
   - symmetric DTO projection;
   - idempotent legacy repair for ids 192/193 fixture;
   - ambiguous pair refusal and tenant/series isolation;
   - no media/credit calls.
3. Pipeline/image tests:
   - fresh row reload at generation boundary;
   - hard twin face/age facts in prompt context;
   - missing canonical identity and mismatched variant fail before paid action.
4. Component tests:
   - both linked characters show twin badge/relationship section;
   - shared vs local DNA labels render;
   - episode character picker props/keys remain unchanged.

## Verification commands

- Focused Vitest files for the changed shared/server/client modules.
- Esbuild/TypeScript parse checks for pipeline, router, and UI entry points.
- `git diff --check`.
- No paid provider, image generation, or production DB mutation during tests.
