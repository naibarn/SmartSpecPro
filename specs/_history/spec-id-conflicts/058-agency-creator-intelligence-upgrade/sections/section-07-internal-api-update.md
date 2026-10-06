# Section 07: Internal API Update

## Goal
**CRITICAL**: The internal create endpoint `/api/internal/agency/create` silently strips `objective`, `sharedInstructions`, and `modelRequirements` via Zod — every created agency has empty fields. This section fixes the Zod schema AND the INSERT logic.

## File
`apps/web/server/_core/index.ts`, lines 954-990 (request schema) and lines 1064-1130 (insert logic)

## Actual Implementation

### 1. Updated request Zod schema (lines 954-990)
Added to the request body schema:
- `objective: z.string().max(2000).optional()` (line 957)
- `sharedInstructions: z.string().max(10000).optional()` (line 958)
- `modelRequirements` object with full capability fields on each agent (lines 973-982)

### 2. Updated agencies INSERT (lines 1064-1080)
Pass `objective` and `sharedInstructions` when inserting:
- Uses `null` (not `""`) for missing optional fields — consistent with `description` column pattern
- Length enforcement via `.slice(0, 2000)` and `.slice(0, 10000)`

### 3. Updated agent data mapping (line 1051)
`modelRequirements: a.modelRequirements` — passed through directly from validated Zod input.

### 4. Security fixes (F05, F08)
**F05**: Replaced `console.error` with `debugError("internal_agency_create", ...)` using truncated error: `{ message: String(err?.message ?? "").slice(0, 200) }`.
- Also sanitized the HTTP error response to return generic `"Internal server error"` instead of raw `err.message`.

**F08**: Length enforcement applied at insert point with `.slice()`.

### Deviations from Plan
1. **`null` instead of `""`**: Plan used `(body.objective || "").slice(...)` defaulting to empty string. Changed to `objective ? objective.slice(0, 2000) : null` for consistency with existing patterns (review finding).
2. **Error truncation at call site**: Instead of modifying the global `debugError` function, truncation is applied at the call site by wrapping err in `{ message: ... }`.

## Tests
File: `apps/web/server/__tests__/internalAgencyCreate.test.ts` (12 tests)

- Schema validation: objective, sharedInstructions, modelRequirements accepted
- Schema rejection: oversized fields rejected by Zod
- modelRequirements: valid values accepted, invalid enum rejected
- Insert mapping: truncation logic, null default convention
- Error sanitization: generic error message returned
