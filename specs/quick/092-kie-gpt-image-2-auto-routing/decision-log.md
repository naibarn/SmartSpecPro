# Decision Log

## Planning Depth

Depth: standard

Reason: the implementation is small but crosses catalog seed data, a migration,
the Kie provider boundary, and focused tests.

## Decisions

1. Keep `gpt-image-2-text-to-image` as the canonical SmartSpecPro ID.
2. Disable the separate image-to-image row instead of deleting it.
3. Put the conditional upstream ID in explicit `apiConfig` metadata.
4. Resolve the variant only in Kie image generation.
5. Reuse existing Media Studio reference UI; no page/component change.

## Risks

- A reseed could undo the migration unless the seed script is updated.
- A legacy exact image-to-image ID must alias to the enabled canonical row.
- Generic provider behavior must remain unchanged for models without the new key.

## Review Rounds

1. Completeness: fixed seed/migration convergence so reseeding cannot recreate a
   second selectable GPT Image 2 entry.
2. Compatibility: added the legacy image-to-image ID as an alias and verified
   disabled exact-ID requests resolve to the canonical row.
3. Runtime contract: verified nested catalog `apiConfig` metadata is flattened
   into the Python request and added provider tests for both routing branches.
4. Security/correctness: clean; routing is opt-in, reference URLs reuse the
   existing payload path, and no credentials or authorization surfaces changed.
5. Contradictions/obvious gaps: clean; one enabled row, no destructive delete,
   and no shared model resolver change.
