<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-db-migration
section-02-priority-scoring-service
section-03-capability-aware-selector
section-04-skill-execution-policy-extension
section-05-update-model-priority-mutation
section-06-admin-ui-priority-editor
section-07-skill-settings-resolution-preview
section-08-zod-validation-and-frontmatter
END_MANIFEST -->

# Section Index — Feature 041: Intelligent Skill Model Selection

## Dependency Graph

| Section | Depends On | Parallelizable |
|---------|------------|----------------|
| section-01-db-migration | — | Yes (first) |
| section-02-priority-scoring-service | 01 | Yes (with 03, 05) |
| section-03-capability-aware-selector | 01 | Yes (with 02, 05) |
| section-04-skill-execution-policy-extension | 02, 03 | No |
| section-05-update-model-priority-mutation | 01 | Yes (with 02, 03) |
| section-06-admin-ui-priority-editor | 05 | Yes (with 07, 08) |
| section-07-skill-settings-resolution-preview | 04 | Yes (with 06, 08) |
| section-08-zod-validation-and-frontmatter | 03, 04 | Yes (with 06, 07) |

## Execution Order

1. **section-01** — DB migration (prerequisite for all)
2. **section-02**, **section-03**, **section-05** — parallel (all depend only on 01)
3. **section-04** — after 02 and 03
4. **section-06**, **section-07**, **section-08** — parallel (06 after 05, 07 after 04, 08 after 03+04)

## Section Summaries

### section-01-db-migration

Add `supportsVision: boolean DEFAULT false` and `priorityLocked: boolean DEFAULT false` columns to the `model_provider_map` table in `apps/web/drizzle/schema.ts`. Run `cd apps/web && pnpm db:push` to generate and apply migration. Verify columns exist. Also add a one-time backfill tRPC admin mutation placeholder (just the empty function stub — full implementation in section 05).

**Files:** `apps/web/drizzle/schema.ts`, migration SQL (generated)

### section-02-priority-scoring-service

Create `apps/web/server/services/intelligentModelSelector.ts` (first half). Export `computeModelPriority(model: ModelPriorityInput): number`. Balanced scoring: recency (0–40pts based on `createdAt` Unix timestamp), cheapness (0–30pts based on `pricingInput + pricingOutput`), capability count (0–30pts based on 8 boolean flags). Final: `Math.max(1, Math.round(100 - score))` → range 10–99. Pure function, fully unit-tested.

**Files:** `apps/web/server/services/intelligentModelSelector.ts` (new), `apps/web/server/services/intelligentModelSelector.test.ts` (new)

### section-03-capability-aware-selector

Two sub-steps: (A) Update `apps/web/server/services/enabledLlmModels.ts` to extend the SELECT to include all capability columns (`supportsVision`, `supportsFunctionTools`, `supportsStructuredOutputs`, `supportsWebSearch`, `supportsCodeExecution`, `supportsComputerUse`, `supportsBackground`, `supportsResponses`), plus `contextLength`, `priority`, `priorityLocked`. Update `EnabledLlmModelRow` type. (B) Add second half of `intelligentModelSelector.ts`: export `selectBestLlmModel(requirements, rows)` (AND-logic filter + priority sort) and `describeRequirementsMatch(requirements, row)`. Note: `disallowedModels` is explicitly out of scope for v1. Full unit tests.

**Files:** `apps/web/server/services/enabledLlmModels.ts`, `apps/web/server/services/intelligentModelSelector.ts`, `apps/web/server/services/intelligentModelSelector.test.ts`

### section-04-skill-execution-policy-extension

Extend `apps/web/server/services/skillExecutionPolicy.ts` to implement the new selection cascade. Read `skill.executionPolicy?.requirements`. Call `selectBestLlmModel()` when requirements are present. Implement mode semantics: `requirements` (requirements-first), `fixed` (existing cascade only), `hybrid` (try `fixedModel`, then requirements fallback), `undefined` (auto-detect: use requirements if declared). Auto-migrate: if skill has requirements AND llmModelId, requirements mode takes precedence. Emit enriched audit events with `modelSource: "requirements_match"` and `matchedCapabilities`. Update `SkillExecutionPolicyResult` type to add `matchedCapabilities`, `requirementsFallback`. Silent fallback + warning log when requirements find no match.

**Files:** `apps/web/server/services/skillExecutionPolicy.ts`, tests

### section-05-update-model-priority-mutation

Add to `apps/web/server/routers/multiProvider.ts`:
(1) `updateModelPriority({ mappingId, priority: 0–999 })` — sets priority, sets `priorityLocked = true`, admin-only.
(2) `backfillModelPriorities()` — iterates all `model_provider_map` rows where `priorityLocked = false`, computes priority via `computeModelPriority()`, updates.
(3) Modify `bulkSetAdminModelCatalogEnabled`: pre-load all providers' `availableModels` JSON in one query, build Map<modelId, SyncedModel>, compute priority for new entries. Preserve locked priorities.
(4) Modify `upsertModelMapping`: if priority explicitly provided → use it + set `priorityLocked = true`; if not provided → compute it.

**Files:** `apps/web/server/routers/multiProvider.ts`, `apps/web/server/routers/multiProvider.test.ts`

### section-06-admin-ui-priority-editor

Modify `apps/web/client/src/components/admin/MultiProviderAdmin.tsx`: add inline priority number input (min=0, max=999) per mapping row. On blur: call `trpc.multiProvider.updateModelPriority.useMutation()` if value changed. Optimistic update. Show `<Lock size={14} />` when `priorityLocked=true` (tooltip: "Manually set. Re-import won't change this."), `<Info size={14} />` when false.
Modify `apps/web/client/src/components/admin/multiProviderAdminModelMappings.ts`: add priority as secondary sort in `filterAdminModelCatalogRows()`.
Add tRPC hook with cache invalidation of `listModelMappings` + `listAdminModelCatalog`.

**Files:** `apps/web/client/src/components/admin/MultiProviderAdmin.tsx`, `apps/web/client/src/components/admin/multiProviderAdminModelMappings.ts`

### section-07-skill-settings-resolution-preview

Add `skills.previewModelResolution({ skillId: number, conversationModel?: string })` tRPC query to `apps/web/server/routers/skills.ts` — admin-only, calls `resolveSkillExecutionPolicy()`, returns `{ modelId, modelSource, matchedCapabilities, requirementsFallback, availableModelCount }`.
Modify `apps/web/client/src/components/chat/settings/SkillSettings.tsx`: add "Model Preview" collapsible panel showing resolved model. Debounce auto-refresh 400ms on requirements change. Show distinct UI for fixed mode ("Fixed: model-name") vs requirements mode ("Best match: model-name (vision, tools)") vs fallback ("⚠ No match — system default").

**Files:** `apps/web/server/routers/skills.ts`, `apps/web/client/src/components/chat/settings/SkillSettings.tsx`

### section-08-zod-validation-and-frontmatter

(A) Update `packages/skills/src/types.ts`: add `supportsVision?: boolean` to `SkillExecutionPolicyConfig.requirements` interface.
(B) Extend `skills.update` Zod schema in `apps/web/server/routers/skills.ts`: add `requirements` object with all 9 capability fields + `contextLength`. Add `mode` enum, `allowConversationOverride`. Note `preferredStrategy` as reserved for v2 (comment only, not in schema). Merge into `executionPolicyJson`.
(C) Parse `model_requirements` (and `modelRequirements`) frontmatter key in `apps/web/server/services/skillRegistry.ts`. Map to `executionPolicyJson.requirements`. Add `isSkillRequirements(obj)` type guard to filter unknown keys with a warning log.

**Files:** `packages/skills/src/types.ts`, `apps/web/server/routers/skills.ts`, `apps/web/server/services/skillRegistry.ts`
