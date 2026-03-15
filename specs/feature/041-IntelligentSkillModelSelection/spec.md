# Feature 041: Intelligent Skill Model Selection

## Overview

Implement four interconnected improvements to the LLM/media model selection system so that skills automatically select the best available model at runtime rather than being hard-coded to a specific model.

## Problem Statement

Currently:
1. OpenRouter sync always assigns `priority = 0` to every synced model — models are unordered
2. Admin cannot edit model priority from the UI
3. `resolveSkillExecutionPolicy()` ignores capability requirements declared in `executionPolicyJson` — a skill needing vision may get a text-only model
4. Skills hard-code `llmModelId` in skill.md frontmatter — as better models are released, skills must be manually updated or they never benefit from improvements

## Goals

### 1. Priority Assignment in OpenRouter Sync

When `modelSyncService.ts` syncs models from OpenRouter, assign meaningful priority values (not always 0) based on:
- Model recency (newer models score higher)
- Pricing (cheaper models preferred at equal capability)
- Capability count (more capable models rank higher)
- Idempotent: re-syncing must NOT overwrite manually-set priorities; only assign priority to newly-synced models with priority=0 and no manual override flag

### 2. Admin UI Priority Editor

Expose the `priority` column as an editable field in `MultiProviderAdmin.tsx`:
- Integer input (0–999, lower = higher priority)
- Save via new tRPC mutation `multiProvider.updateModelPriority`
- Show tooltip: "Lower number = higher priority. Models are tried in priority order."
- Mark manually-edited priorities so they survive re-sync

### 3. Capability-Aware Filtering in Skill Execution

Extend `resolveSkillExecutionPolicy()` in `skillExecutionPolicy.ts` to:
- Read `executionPolicyJson.requirements` from the skill (if set)
- Filter the candidate model list to only include models that satisfy all declared requirements
- Requirements include: `vision`, `function_tools`, `structured_outputs`, `web_search`, `code_execution`, `computer_use`, `min_context_length`
- If no model satisfies requirements, fall back gracefully to unfiltered list (with warning log)
- Backward compatible: skills without requirements work exactly as before

### 4. Automatic LLM Model Suggestion for Skill Execution

Skills should declare what they **need** (capabilities, context size, cost preference) rather than **which model** to use. The system picks the best available model at runtime.

- Extend skill.md frontmatter to support `model_requirements` block
- At execution time, run a `selectBestLlmModel(requirements)` function that queries `model_provider_map`, filters by capabilities, and ranks by priority
- Skills that previously used `llmModelId` can migrate to `model_requirements`
- `llmModelId` still works as an explicit override (escape hatch for skills that truly need a specific model)
- As new models are added and given good priorities, all skills using requirements automatically benefit

**Key design goal**: A skill declaring `requires: [vision, function_tools]` should automatically use the best vision+tools model available today, and automatically switch to a better model next month when one is added — with zero changes to the skill definition.

## Existing Code to Build On

- `apps/web/server/services/skillExecutionPolicy.ts:47-93` — resolveSkillExecutionPolicy()
- `apps/web/server/services/modelSyncService.ts:356-375` — convertModel() (add priority here)
- `apps/web/server/routers/multiProvider.ts` — tRPC router for admin model management
- `apps/web/client/src/components/admin/MultiProviderAdmin.tsx` — Admin UI
- `apps/web/drizzle/schema.ts:640-700` — model_provider_map (priority field EXISTS at line 694)
- `apps/web/drizzle/schema.ts:2388-2556` — skills table (executionPolicyJson at line 2540)
- `apps/web/server/routers/modelSuggestTool.ts` — existing suggestModel() for media (parallel concept)

## Constraints

- Backward compatible — skills without requirements must still work (fallback to existing cascade)
- No schema migrations needed for `model_provider_map` (priority column already exists)
- Schema migration may be needed for skills table to store structured requirements
- OpenRouter priority assignment must be idempotent (re-syncing doesn't reset manually-set priorities)
- Admin manual priority overrides must survive re-sync
- No breaking changes to existing skill.md frontmatter fields

## Success Criteria

- All synced models get a non-zero priority score based on recency/cost/capabilities
- Admin can view and edit model priorities in the UI
- A skill with `requires: [vision]` never gets assigned a text-only model
- A new better model added to the system is automatically selected for relevant skills on next execution
- All existing skills without `model_requirements` continue to work unchanged
- Full test coverage for the new selection logic
