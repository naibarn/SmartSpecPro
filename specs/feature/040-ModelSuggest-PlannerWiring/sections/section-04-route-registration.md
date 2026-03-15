# Section 04: Route Registration Verification

## Overview

Verify that `registerModelSuggestToolRoute(app)` is already wired into the Express server entry point. Based on the current codebase, the registration is already present — this section is primarily a verification step and TypeScript check.

**Dependencies:** Depends on Section 03 (handler audit and errors) being complete, because the handler must be fully implemented before this verification is meaningful.

## Files to Check

**`apps/web/server/_core/index.ts`** — read-only if already correct

## Expected Current State

Both the import and the call should already be present:

- **Import (around line 22-23):**
  ```typescript
  import { registerModelSuggestToolRoute } from "../routers/modelSuggestTool";
  ```

- **Call (around line 409-410, near `registerAutoDraftToolRoute`):**
  ```typescript
  registerAutoDraftToolRoute(app);
  registerModelSuggestToolRoute(app);
  ```

## Steps

### Step 1: Confirm Registration

Open `apps/web/server/_core/index.ts` and verify both lines exist. If both are present, no code changes are needed — proceed to Step 2.

### Step 2: Remediation (if missing)

This should not be the case, but if either line is absent:

**If import is missing** — add alongside the other internal tool imports:
```typescript
import { registerModelSuggestToolRoute } from "../routers/modelSuggestTool";
```

**If call is missing** — add immediately after `registerAutoDraftToolRoute(app)`:
```typescript
registerModelSuggestToolRoute(app);
```

The expected export signature from `modelSuggestTool.ts`:
```typescript
export function registerModelSuggestToolRoute(app: express.Express): void
```

### Step 3: TypeScript Check

```bash
cd apps/web && pnpm check
```

Confirm zero type errors. The most likely failure: if Section 01 changed the export signature of `registerModelSuggestToolRoute` (e.g., accidentally made async) the call site would error. Align if needed.

### Step 4: Run Tests

```bash
cd apps/web && pnpm vitest run server/routers/modelSuggestTool.test.ts
```

All tests from sections 01, 02, and 03 should pass.

## Tests

Per the TDD plan, no new tests are needed for this section. Route registration is already covered by the existing test suite (integration tests verify the handler responds to the registered path).

## Definition of Done

- [x] `registerModelSuggestToolRoute` import confirmed in `_core/index.ts` (line 23)
- [x] `registerModelSuggestToolRoute(app)` call confirmed in `_core/index.ts` (line 412)
- [x] No TypeScript errors in section-04 files (pre-existing errors in unrelated files only)
- [x] All 35 modelSuggestTool tests pass (3 todo)
- [x] No changes to `_core/index.ts` were needed — registration was already present

## Implementation Notes

Verification-only section. Both the import and call were already wired by an earlier commit. No code changes required.
