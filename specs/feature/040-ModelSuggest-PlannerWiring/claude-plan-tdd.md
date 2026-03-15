# TDD Plan: Spec 040 — Model-Suggest Endpoint + Auto-Draft Planner Wiring

Testing framework: **Vitest** with `vi.mock`, `vi.fn`, `beforeEach(() => vi.clearAllMocks())`
Test files: add to existing `modelSuggestTool.test.ts` and `autoDraftTool.test.ts`
Run command: `cd apps/web && pnpm test`

---

## Section 1: Modify `modelSuggestTool.ts`

Write these tests BEFORE modifying the file.

### 1a. `suggestModel()` standalone function

```
# Test: returns recommended model for purpose="image" using priority sort (balanced)
# Test: returns recommended model for purpose="video"
# Test: returns recommended model for purpose="audio"
# Test: returns null recommended with message when purpose="text" (no DB call)
# Test: returns null recommended with empty alternatives when model list is empty
# Test: alternatives array has at most 3 items even with 5+ models available
# Test: response never contains raw creditCost field
# Test: quality_preference="speed" sorts by creditCost ascending
# Test: quality_preference="quality" sorts by priority ascending
# Test: quality_preference="balanced" produces same order as "quality"
# Test: quality_preference defaults to "balanced" when omitted
# Test: model with undefined priority is sorted after models with explicit priority (uses ?? 99)
# Test: getModelsByTypeAsync throwing returns { recommended: null, alternatives: [] } without re-throwing
```

### 1b. `verifyInternalToken()` security fix

```
# Test: returns true when token matches expected value
# Test: returns false when token is wrong
# Test: returns false when token header is missing
# Test: tokens of different lengths are rejected without throwing RangeError
# Test: returns false when ENV.webGatewayToken is empty string
```

### 1c. HTTP handler audit logging

```
# Test: emits "model_suggest_response" audit event on successful response
# Test: audit event includes traceId, userId, purpose, recommendedModelId
# Test: audit event recommendedModelId is null when no models available
```

### 1d. HTTP handler error handling

```
# Test: returns 500 with sanitized message when getModelsByTypeAsync throws
# Test: 500 error message does not contain connection strings or URLs
```

### 1e. Priority default

```
# Test: model without priority field is sorted last (priority ?? 99 behavior)
```

---

## Section 2: Route Registration

```
# Verify: no new tests needed — route already registered and tested
# Check: existing integration test still passes after any import reordering
```

---

## Section 3: Auto-Draft Wiring

Write these tests BEFORE modifying `autoDraftTool.ts`.

### 3b. Fallback logic

```
# Test: when image_model_id is absent, suggestModel("image", "balanced") is called
# Test: when image_model_id is absent, recommended model_id from suggestModel is used in generateAIDraft
# Test: when image_model_id is present, suggestModel is NOT called
# Test: when image_model_id is present, agent's model is passed to generateAIDraft unchanged
# Test: when suggestModel throws, auto-draft still completes (no error thrown to caller)
# Test: when suggestModel throws, getDefaultModel("image") fallback is used
# Test: when suggestModel returns null recommended, getDefaultModel("image") fallback is used
```

### 3c. Divergence audit log

```
# Test: "auto_draft.model_selected" event emitted when agent omits image_model_id
# Test: diverged=false when agent omits image_model_id (we made the choice)
# Test: "auto_draft.model_selected" event emitted when agent provides image_model_id
# Test: diverged=true when agent's model differs from recommendedModel
# Test: diverged=false when agent's model matches recommendedModel
# Test: audit event contains { agentModel, recommendedModel, imageModelUsed, diverged }
# Test: audit event agentModel is null when agent omits image_model_id
```

---

## Section 4: Tests (verification)

```
# Verify: pnpm test passes with no regressions in existing test suite
# Verify: pnpm check (TypeScript) passes with no type errors
# Verify: test coverage for new code paths ≥80%
```
