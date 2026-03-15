<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-suggest-model-function
section-02-verify-token-security
section-03-handler-audit-and-errors
section-04-route-registration
section-05-auto-draft-wiring
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-suggest-model-function | - | 03, 05 | Yes |
| section-02-verify-token-security | - | 03 | Yes |
| section-03-handler-audit-and-errors | 01, 02 | 04 | No |
| section-04-route-registration | 03 | - | No |
| section-05-auto-draft-wiring | 01 | - | No |

## Execution Order

1. **section-01** and **section-02** — parallel (no dependencies)
2. **section-03** — after both 01 and 02
3. **section-04** and **section-05** — parallel (04 after 03, 05 after 01)

## Section Summaries

### section-01-suggest-model-function

Extract ranking logic from the inline HTTP handler into an exported `suggestModel(purpose, quality_preference?)` async function. Includes `creditCostToTier()` (already exists, verify correct). Standardize `priority ?? 99` default. Add tests for all sorting variants, empty list, text purpose, and error handling.

**Files:** `apps/web/server/routers/modelSuggestTool.ts`, `apps/web/server/routers/modelSuggestTool.test.ts`

### section-02-verify-token-security

Fix `verifyInternalToken()` to use SHA-256 hashing before `timingSafeEqual()` to prevent length oracle attack. The existing implementation uses raw `Buffer.from()` which throws `RangeError` on length mismatch. Add tests for length-mismatch rejection, correct token, wrong token, missing token.

**Files:** `apps/web/server/routers/modelSuggestTool.ts`, `apps/web/server/routers/modelSuggestTool.test.ts`

### section-03-handler-audit-and-errors

Add audit logging (`model_suggest_response` event with traceId, userId, purpose, recommendedModelId) to the HTTP handler. Add try-catch around `await suggestModel()` in the handler with sanitized 500 error response. Add tests for audit event emission and error sanitization.

**Files:** `apps/web/server/routers/modelSuggestTool.ts`, `apps/web/server/routers/modelSuggestTool.test.ts`

### section-04-route-registration

Verify that `registerModelSuggestToolRoute(app)` is already registered in `_core/index.ts` (likely no-op). If missing, add the import and call. Run `pnpm check` to confirm TypeScript passes.

**Files:** `apps/web/server/_core/index.ts`

### section-05-auto-draft-wiring

Modify `autoDraftTool.ts` to: (1) import `suggestModel` from `./modelSuggestTool`, (2) call `await suggestModel("image", "balanced")` as fallback when `image_model_id` is absent, (3) use three-tier fallback (agent model → suggest → getDefaultModel), (4) emit `auto_draft.model_selected` audit event with `diverged` field. Add tests for all fallback paths and divergence scenarios.

**Files:** `apps/web/server/routers/autoDraftTool.ts`, `apps/web/server/routers/autoDraftTool.test.ts`
