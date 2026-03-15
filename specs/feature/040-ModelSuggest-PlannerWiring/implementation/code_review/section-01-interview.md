# Section 01 Code Review Interview

## Auto-fixes Applied

### Fix 1: Add logging to catch block
**Finding:** Empty `catch {}` with no logging means silent production failures.
**Action:** Added `import { debugError }` and `debugError("[suggestModel] model registry lookup failed", err)` in the catch.
**Rationale:** Plan stated "log internally" — this satisfies that requirement.

### Fix 2: Fix vacuous priority test
**Finding:** `priority ?? 99` test used `if (noPriorityIndex !== -1)` which could pass vacuously if no-priority model wasn't in top-4.
**Action:** Replaced with a 2-model fixture guaranteeing the no-priority model appears in alternatives, with explicit assertions.
**Rationale:** Test now meaningfully verifies the `?? 99` default behavior.

## Let Go

### Finding: HTTP 200 instead of 500 when registry throws
**Decision:** By design per plan — Section 03 adds handler-level try-catch with proper error responses. This is the correct split of concerns.

### Finding: `ModelEntry`/`SuggestResult` not exported
**Decision:** Plan says local to file. Section 05 callers can use `Awaited<ReturnType<typeof suggestModel>>`. No change needed.

### Finding: `creditCost` null guard in `toEntry()`
**Decision:** Not needed — registry type defines `creditCost: number` (required, not optional).

### Finding: balanced vs quality test only checks `recommended`
**Decision:** Low-risk, acceptable for MVP.
