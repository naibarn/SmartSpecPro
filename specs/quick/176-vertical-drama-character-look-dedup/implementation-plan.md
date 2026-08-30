# Implementation plan

1. Add a pure shared helper that resolves the canonical intent of a catalog
   look from structured age-stage data, variant label, description, and
   wardrobe rules. Keep it conservative and require matching variant type.
2. Add a pure candidate-ranking helper that prefers an approved portrait,
   system-suggested provenance, and then the earliest stable row order.
3. Update `resolvePipelineCharacterLooks` to use the stable semantic key and
   legacy label/intent fallback before generating a new character key. Keep
   metadata updates restricted to system-suggested rows. Align the designer
   semantic-key utility and legacy backfill writer with the same stable key.
4. Add regression tests for the helper and selector-level reuse behavior. Add a
   pipeline-focused source/contract assertion if the private persistence
   function cannot be exercised without the full DB harness.
5. Run focused tests, Prettier/diff checks, and inspect the final diff to ensure
   unrelated pipeline changes remain intact.

## Acceptance criteria

- Same parent/type/intent across different scenes reuses one row.
- Existing user-created equivalent labels are reused even without generated
  semantic metadata.
- Existing rows with a different variant type are not reused.
- A portrait-bearing candidate wins over a portrait-less duplicate.
- Manual overrides and tenant scoping are unchanged.
