# Section 01: Policy and Provider Adapter

## Ownership boundary

Own the normalized quality profile, task policy registry, model capability projection,
provider adapter contract, and exact request-body construction. Do not migrate individual
skills in this section.

## Target files/modules

- `apps/web/shared/verticalDramaSeries/generationSettings.ts`
- `apps/web/server/services/verticalDramaEpisodeGenerationSettings.ts` or a focused sibling
- `apps/web/server/services/llmRouter.ts`
- enabled model/catalog types and fixtures as required
- new focused unit tests under `apps/web/server/services/__tests__/`

## Implementation contract

- Preserve current JSON compatibility.
- Expose one semantic profile to callers, not raw provider fields.
- Return both effective policy and diagnostics.
- Never emit both `reasoning.effort` and `reasoning.max_tokens`.
- Re-adapt for the actual provider candidate.
- Unsupported reasoning must return a valid empty/downgraded plan.

## TDD expectations

Implement the table-driven policy and adapter tests in `implementation-plan-tdd.md` before
changing production code. Include model metadata with restricted efforts and missing
metadata; do not assume every catalog row is complete.

## Acceptance checks

- OpenRouter request shape matches the documented unified reasoning field.
- Non-OpenRouter request shape does not contain OpenRouter-only reasoning fields.
- Capability downgrade is deterministic and observable.
- Existing image quality behavior is unchanged.
- No provider credentials or reasoning content are logged.

## Risks

- Catalog metadata may not exactly match provider behavior; keep a bounded unsupported-
  parameter downgrade retry.
- Existing callers may rely on `{}` rather than `undefined`; preserve object shape.
- The router is shared by non-Drama features; keep adapter changes backward compatible.
