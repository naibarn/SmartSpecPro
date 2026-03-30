# Section 02: LLM Provider Registration and Model Mapping

## Purpose

Register KNPLabs as a chat-completions provider in the web backend and seed the model mapping data that drives LLM routing.

This section should reuse the existing DB-backed provider flow, not invent a parallel LLM registry.

## Files

- `apps/web/drizzle/seed.ts`
- `apps/web/scripts/seed-multi-provider.ts`
- `apps/web/scripts/seed-knplabai-provider.ts`
- `apps/web/server/seed.test.ts`
- `apps/web/server/services/multiProvider.ts`
- `apps/web/server/services/llmRouter.ts`
- `apps/web/client/src/pages/AdminLLMProviders.tsx`
- `apps/web/client/src/components/admin/MultiProviderAdmin.tsx`

## Implementation Notes

1. Add a `seedKnplabaiProvider()` helper in the drizzle seed module.
2. Seed the provider row with:
   - `providerName = knplabai`
   - `displayName = KNPLabs AI`
   - `baseUrl = https://api.knplabai.com/ai/v1`
   - `isEnabled = false`
3. Seed all KNPLabs LLM mappings into `modelProviderMap`.
4. Use `apiStyle = chat-completions` for the KNPLabs catalog.
5. Store pricing in the same DB format already used by the multi-provider catalog.
6. Update admin LLM provider views so KNPLabs appears in the provider cards, provider selectors, and icon mapping.
7. If the multi-provider router needs a provider-specific default style branch, add `knplabai` to that mapping.

## Acceptance Criteria

- KNPLabs appears in the provider admin UI.
- LLM routing can resolve a KNPLabs mapping through the existing flow.
- Seed scripts are idempotent.

