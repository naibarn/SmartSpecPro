# Review: Spec 040 — Model-Suggest Endpoint + Auto-Draft Planner Wiring

## Summary

This plan implements two things: (1) a `POST /api/internal/tools/model-suggest` endpoint that recommends the best media model for a given purpose, and (2) wiring that suggestion logic into `autoDraftTool.ts` as a fallback when the Python agent omits an image model ID. The plan is well-structured, clearly scoped, and largely correct. However, the existing codebase already has a partial implementation that the plan does not acknowledge, creating a significant gap between what the plan describes and what an implementer will encounter. There are also a few security concerns and missing test cases.

## Strengths

1. Clean separation of concerns — exporting `suggestModel()` as a standalone pure function alongside the HTTP wrapper enables direct import from `autoDraftTool.ts` without HTTP overhead.
2. Robust fallback chain — three-tier fallback (agent model → suggestModel → getDefaultModel) with try-catch ensures auto-draft never blocks.
3. Divergence audit logging — `auto_draft.model_selected` event with `diverged` boolean enables future analysis without DB migrations.
4. No unnecessary infrastructure — reuses existing model registry, content automation gate, audit logger.
5. Cost tier abstraction — never exposes raw `creditCost` in responses.

## Issues

### HIGH Severity

**H1: Plan does not account for existing partial implementation.**

The file `apps/web/server/routers/modelSuggestTool.ts` already exists (~103 lines) with a working `modelSuggestHandler`, `creditCostToTier`, `verifyInternalToken`, and `registerModelSuggestToolRoute`. The route is already registered in `_core/index.ts`. A test file also exists with ~196 lines.

What is actually **missing** from the existing implementation:
- No exported `suggestModel()` standalone function — ranking logic is inline in the handler
- No audit logging (`model_suggest_response` event) in the handler
- The auto-draft wiring (Section 3) is entirely unimplemented
- No tests for `quality_preference` sorting variants

The plan must be revised to describe modifications to the existing file, not creation from scratch.

**H2: `timingSafeEqual` with raw `Buffer.from()` is vulnerable to length oracle.**

The existing implementation does:
```typescript
return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
```
If `token` and `expected` have different byte lengths, `timingSafeEqual` throws a `RangeError` caught silently as `false`. An attacker can probe the token length. The plan's SHA-256 approach is correct — hash both sides before comparison. The plan should explicitly call out that `verifyInternalToken` must be updated.

**H3: `suggestModel()` is async but plan pseudocode calls it without `await`.**

The spec file (`claude-spec.md` line 118) shows `const suggestion = suggestModel("image", "balanced")` without `await`. The plan file (Section 3b) also omits `await`. An implementer copying this pseudocode will get a Promise object instead of a result.

### MEDIUM Severity

**M1: "balanced" and "quality" produce identical sorting.**

Both sort by `priority ASC`. This may be intentional for MVP, but should be documented as a known limitation.

**M2: No validation that `userId`/`tenantId` exist in DB.**

Read-only endpoint, low risk, but audit logs will contain potentially fake user IDs.

**M3: Missing try-catch around `getModelsByTypeAsync` in HTTP handler.**

If DB query fails, error propagates as unhandled rejection with potentially unsanitized error message.

**M4: `priority` default value inconsistency.**

Existing `modelSuggestTool.ts` uses `priority ?? 0` (top of sort), `modelRegistry.ts` getDefaultModel uses `priority || 99` (bottom), plan spec pseudocode uses `priority ?? 99`. Three different defaults — causes inconsistent "best model" results. Standardize to `99`.

**M5: Test cases for `quality_preference` sorting are missing from existing test file.**

Since the test file already exists, the plan should clarify these are additions to the existing file.

### LOW Severity

**L1:** `purpose as MediaType` cast is unchecked — use type guard instead.
**L2:** No rate limiting consideration — endpoint hits DB on every call.
**L3:** `description: string` in `ModelEntry` interface but `ModelDefinition.description` could be undefined — use `description ?? ""` fallback.
**L4:** Plan says "No Python backend changes" but doesn't confirm whether Python agent needs updates to call the new endpoint.

## Recommendations

1. Rewrite Section 1 as modifications to existing file, not creation from scratch
2. Fix `verifyInternalToken` to hash both sides with SHA-256 before `timingSafeEqual`
3. Add `await` to all `suggestModel()` calls in plan pseudocode
4. Standardize `priority` default to `99` everywhere
5. Add try-catch around `getModelsByTypeAsync` in HTTP handler
6. Add missing test cases to existing test file (not a new file)
7. Document "balanced" = "quality" as known limitation

## Overall Assessment

The plan is architecturally sound and the scope is appropriate. The core design is well thought out. The main problems are: plan was written as if starting from zero (H1), a security issue with `timingSafeEqual` (H2, plan already calls for the correct approach but existing code doesn't implement it), and the missing `await` is a runtime bug trap (H3).

**Verdict: Approve with required changes — H1, H2, H3 must be addressed before implementation.**
