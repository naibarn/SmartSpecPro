# TDD Plan

1. Add failing pure-helper tests for Thai brief, empty input, idempotence and changed-brief replacement.
2. Add failing router tests asserting the exact `generateImageAsync.prompt` for direct generation and approved prompt paths.
3. Add/update preview assertion proving the returned prompt contains the requirement block.
4. Add skill-content assertion that per-generation framing must affect `primary_portrait_prompt` and non-conflicting details cannot be dropped.
5. Implement the minimum helper and wire it at preview plus final submission.
6. Run focused router/service/skill tests, then `npm run check` from `apps/web`.
