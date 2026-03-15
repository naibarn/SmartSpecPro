# Opus Plan Review — Feature 041

## Summary

Well-structured plan with clear dependency ordering and sound architecture. Critical issue: `loadEnabledLlmModelRows()` only returns 4 fields and doesn't include capability columns or priority — this function must be updated for the feature to work at all. Two other HIGH issues and several MEDIUM concerns addressed below.

## HIGH Issues

**H1**: `loadEnabledLlmModelRows()` in `enabledLlmModels.ts` only selects providerName, modelId, providerModelId, defaultModel — no capability columns, no priority, no contextLength. The plan must explicitly address updating this function.

**H2**: `supportsVision` is not in the existing `SkillExecutionPolicyConfig.requirements` type in `packages/skills/src/types.ts`. Adding it to Zod without updating the shared type creates a type mismatch. Must update the package.

**H3**: `preferredStrategy` ("cheapest", "fastest", "best") is in the Zod schema but never wired in selectBestLlmModel(). Shipping a field with no effect is a footgun.

## MEDIUM Issues

**M2**: Admin can set priority=0 via `updateModelPriority`, but the plan says "0 is sentinel for uninitialized." Contradiction — either allow 1-999 only, or drop the sentinel convention.

**M3**: `disallowedModels` from SkillExecutionPolicyConfig never filtered — silently ignored. Should be explicitly out-of-scope.

**M4**: `mode: "hybrid"` — behavior unspecified. Define or explicitly exclude.

**M5**: `bulkSetAdminModelCatalogEnabled` needs createdAt from `llmProviders.availableModels` JSON. For many models/providers this is N lookups. Pre-load all providers' JSON first.

**M6**: `contextLength: null` silently fails the filter. Document behavior.

## LOW Issues

**L1**: No backfill for existing model_provider_map rows (all at priority=0). Add a one-time SQL snippet.

**L3**: Auto-refresh previewModelResolution on requirements change should be debounced (300-500ms).

**L4**: Lock emoji → use Lucide icon component instead.

## Suggestions

1. Modify `loadEnabledLlmModelRows()` as a named sub-step in Section 03
2. Add `packages/skills/src/types.ts` to files list
3. Drop `preferredStrategy` from v1 Zod schema
4. Allow priority 1-999 (drop 0 as sentinel)
5. Add backfill SQL in Section 01 migration notes
6. Define hybrid mode: "try fixedModel first, then requirements if unavailable"
