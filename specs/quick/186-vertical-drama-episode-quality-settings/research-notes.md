# Research Notes

## Repository evidence

- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx` already hydrates per-series image/video model defaults and persists episode model selections through `setEpisodeModelSelection`.
- `apps/web/server/routers/verticalDramaEpisodes.ts` centralizes all normal episode insertion in `insertEpisodeWithSafeNumber`, used by `createEpisode` and continuation/materialization paths.
- `apps/web/drizzle/schema.ts` has nullable JSONB policy/artifact columns on both series and episode tables, matching an additive settings column pattern.
- `apps/web/server/services/mediaGenerationService.ts` merges explicit `extraParams` with opt-in model defaults and sends them as provider `extra_params`.
- `apps/web/server/services/mediaProviderUtils.ts` and GPT Image 2.5 seeds expose `thinkingModes` and a `quality` input field.
- `apps/web/server/services/enabledLlmModels.ts` exposes `supportsThinking`; `apps/web/server/services/llmProviderCatalog.ts` declares OpenRouter `reasoning` passthrough fields.
- `apps/web/server/_core/llmRoutes.ts` allows `reasoning` in the OpenAI Responses body and preserves configured passthrough fields.

## External research

OpenRouter's official reasoning guide says the unified request uses `reasoning.effort` or `reasoning.max_tokens`, not both; model metadata may expose `supported_efforts`, `default_effort`, `supports_max_tokens`, and `mandatory`. The implementation therefore uses effort-only UI values, filters by capability, and omits an override for Auto.

## Discovery limitation

SocratiCode `codebase_*` MCP tools were not exposed in this session. Discovery used targeted `rg` and bounded file reads instead.

## Existing-pattern decision

Reuse the existing episode model picker, Radix Select primitives, dynamic model `inputFields`, tRPC mutation patterns, and `getEpisodeDetail` projection. Divergence is limited to a dedicated quality-settings section so Image and LLM settings cannot be confused.
