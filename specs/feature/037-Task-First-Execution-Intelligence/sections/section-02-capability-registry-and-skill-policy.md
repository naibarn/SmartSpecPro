# Section 02 — Capability Registry and Skill Policy

## Objective

Create the metadata foundation required for intelligent execution planning.

## Scope

1. extend model metadata with normalized capability fields
2. expose planner-visible enabled-model capability data
3. extend skill metadata with capability-first `execution_policy`

## Primary files

- `apps/web/drizzle/schema.ts`
- `apps/web/server/routers/llmProviders.ts`
- `apps/web/server/services/llmRouter.ts`
- `packages/skills/src/types.ts`
- `packages/skills/src/parser.ts`

## Capability design

At minimum support:

- `supportsResponses`
- `supportsStructuredOutputs`
- `supportsWebSearch`
- `supportsFunctionTools`
- `supportsCodeExecution`
- `supportsComputerUse`
- `supportsBackground`
- `contextLength`

## Skill policy design

Support three modes:

- `requirements`
- `fixed`
- `hybrid`

And a minimal first-wave config:

- `allowConversationOverride`
- `preferredStrategy`
- `requirements`
- `preferredProfiles`
- `allowedFallbackProfiles`
- `disallowedModels`
- `budgetClass`
- `overrideableByTenant`
- `fallbackPolicy`
- optional `fixedModel`

## Acceptance criteria

1. enabled-model catalog contains capability fields needed for planning
2. skill parser and registry support new policy metadata without breaking old skills
3. requirements can be resolved into different allowed models across tenants without changing the skill
4. capability filtering can be tested independently from provider routing
