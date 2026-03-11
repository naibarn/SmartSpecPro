# Section 02 — Capability Registry and Skill Policy

## Objective

Create the metadata foundation required for intelligent execution planning.

## Scope

1. extend model metadata with normalized capability fields
2. expose planner-visible enabled-model capability data
3. extend skill metadata with capability-first `execution_policy`

## Primary files

- `apps/web/drizzle/schema.ts` — Modified: added 7 boolean capability columns to `modelProviderMap`; added `executionPolicyJson` to `skills`
- `apps/web/drizzle/0062_warm_johnny_storm.sql` — **NEW**: migration adding capability columns + executionPolicyJson
- `apps/web/server/services/capabilityRegistry.ts` — **NEW**: capability filtering and policy resolution
- `apps/web/server/services/capabilityRegistry.test.ts` — **NEW**: 13 tests
- `packages/skills/src/types.ts` — Modified: added `SkillExecutionPolicyConfig` interface + `executionPolicy` field on `SkillDefinition` + frontmatter fields on `SkillMetadata`
- `apps/web/server/services/skillRegistry.ts` — Modified: `dbSkillToDefinition` maps `executionPolicyJson`; auto-sync stores policy from frontmatter

### Files NOT modified (with rationale)

- `packages/skills/src/parser.ts` — YAML parser is permissive by design; passes unknown keys through. Validation at parse time is nice-to-have.
- `apps/web/server/routers/llmProviders.ts` — No router changes needed; capability data accessed via `capabilityRegistry.ts` service layer.
- `apps/web/server/services/llmRouter.ts` — Already extended in section-01 with `ProviderHints`.

## Capability design

7 boolean capability columns added to `modelProviderMap` (all default `false`):

- `supportsResponses`
- `supportsStructuredOutputs`
- `supportsWebSearch`
- `supportsFunctionTools`
- `supportsCodeExecution`
- `supportsComputerUse`
- `supportsBackground`

`contextLength` was already present in `modelProviderMap` before this section — migration only adds the 7 new booleans.

## Skill policy design

`SkillExecutionPolicyConfig` interface in `packages/skills/src/types.ts` supports three modes:

- `requirements` — resolve from capability requirements (default)
- `fixed` — use a specific model only
- `hybrid` — prefer fixed model, fall back to requirements-based

Full config fields:

- `mode`, `requirements`, `fixedModel`, `allowConversationOverride`
- `preferredStrategy` ("cheapest" | "fastest" | "best")
- `preferredProfiles`, `allowedFallbackProfiles`, `disallowedModels`
- `budgetClass` ("economy" | "standard" | "premium")
- `overrideableByTenant`, `fallbackPolicy` ("error" | "use_default")

## Implementation notes

- **Single source of truth**: `SkillExecutionPolicyConfig` lives in `@smartspec/skills` (types.ts). `capabilityRegistry.ts` re-exports it as `SkillExecutionPolicy` — no duplicate definitions.
- **DB integration**: `loadEnabledModelsWithCapabilities()` selects all 7 capability columns + contextLength from `model_provider_map`, returns `EnabledModelWithCapabilities[]`.
- **Filtering**: `filterModelsByCapabilities()` uses AND-logic — a model must satisfy ALL requested capabilities.
- **Policy resolution**: `resolveModelsForPolicy()` handles disallowed models, requirements filtering, hybrid mode (fixed model checked against requirements), and preferred ordering.
- **Sort stability**: V8 sort is stable since Node 12 — no custom tie-breaking needed.
- **No Zod runtime validation**: `.$type<...>()` provides compile-time safety for `executionPolicyJson`. Runtime validation deferred to when skills start using the field.
- **Hybrid edge case**: Test confirms hybrid mode drops `fixedModel` that fails capability requirements.

## Acceptance criteria

1. ✅ enabled-model catalog contains capability fields needed for planning (7 booleans + contextLength in `modelProviderMap`)
2. ✅ skill parser and registry support new policy metadata without breaking old skills (permissive YAML pass-through + `executionPolicyJson` column)
3. ✅ requirements can be resolved into different allowed models across tenants without changing the skill (`resolveModelsForPolicy` filters against tenant-specific enabled models)
4. ✅ capability filtering can be tested independently from provider routing (13 unit tests with in-memory model arrays, no DB or provider dependencies)
