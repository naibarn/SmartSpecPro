# TDD plan

1. Shared contracts: reject missing product/image/character identity, enforce
   exactly three cards, bounded fields, distinct variation IDs, and additive
   slot-request shape.
2. Skill fixtures: validate a good series-style review, a tie-in solution, an
   unsupported product claim, a DNA mismatch with a look request, and a missing
   scene with a scene request.
3. Server adapter/API: test tenant isolation, managed-reference-only input,
   output validation, retry variation, persistence, selection, and idempotent
   slot requests. Assert media rendering/credit reservation is not called.
4. Media regression: test Marketplace storage URL materialization, returned
   durable URL, existing Vertical Drama asset reuse, and missing-storage errors.
5. Model catalog: test 9:16/reference/dialogue/duration filtering, valid default
   resolution, unknown metadata behavior, and actionable empty-state payload.
6. UI tests: test three-card render, regenerate preserving earlier cards, card
   selection hydration, thumbnail preview/fullscreen close, model options, and
   Marketplace image selection.
7. Run focused Vitest suites first, then server/client production builds and
   targeted `git diff --check`. Do not treat full workspace typecheck as clean
   if baseline OOM/noise remains.
