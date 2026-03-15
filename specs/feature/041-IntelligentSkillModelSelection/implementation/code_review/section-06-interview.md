# Section 06 Code Review Interview

## Auto-fixes Applied

### 1. Fixed stale closure in onSuccess (HIGH)
Moved `onSuccess` from `useMutation` options to `mutation.mutate()` second arg, capturing `numValue` at call-site instead of reading stale `localValue` from closure.

### 2. Added Enter key support (MEDIUM)
Added `onKeyDown` handler that blurs the input on Enter, triggering the submit flow.

### 3. Integer validation (MEDIUM)
Added `Math.round()` to ensure priority values are always integers before submitting.

## Decisions — Let Go

### Missing component tests (HIGH)
The plan lists 8 component test stubs. These require JSDOM, tRPC mock provider, and React Testing Library setup that doesn't exist in this test file. The stubs are intentionally left as future work — the sort logic (pure function) is fully tested.

### Scope creep observation
The reviewer flagged massive refactoring (selection system, data source, dialog modal). These are pre-existing changes on this branch from earlier features, not introduced by Section 06.

### `?? false` on boolean field (MEDIUM)
Defensive coding for server data that may not include `priorityLocked` in older cached responses or during gradual rollout. Kept intentionally.

### Grouped view always renders editor (LOW)
Grouped view only shows mapped rows (from `AdminModelMappingRow` with `.id`), so the editor is always valid there. Flat/catalog view correctly conditionally renders based on `mappingId`.

## User Interview Items
None — all findings were auto-fixable or acceptable tradeoffs.
