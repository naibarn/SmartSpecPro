# Section 07 — Code Review Interview Transcript

## Auto-Fixes Applied

### 1. `refetch()` → `invalidate()` (MEDIUM)
**Decision:** Auto-fix applied.
Changed `listQuery.refetch()` to `utils.userApiKeys.listKeys.invalidate()` via `trpc.useUtils()` in both `setKey` and `deleteKey` mutation `onSuccess` callbacks. This follows the TanStack Query / tRPC invalidation pattern used elsewhere in the codebase.

### 2. Visual separator in Settings.tsx (LOW)
**Decision:** Auto-fix applied.
Wrapped `<UserLlmKeysPanel />` in `<div className="border-t border-gray-200 pt-6 mt-6">` consistent with the Context7 section pattern below it.

### 3. Loading/error states (LOW)
**Decision:** Auto-fix applied.
Added `Skeleton` loading state (3 skeleton rows) and error state with `AlertCircle` icon when `listQuery.isError` is true.

## Items Let Go

### 4. Concurrent editing UX guard (MEDIUM)
**Decision:** Let go — current behavior of closing the previous provider's edit on new edit click is correct and expected. No user confusion risk since only one input is visible at a time.

### 5. `useState` vs `useRef` for key input (LOW)
**Decision:** Let go — `useState` with controlled input is standard React pattern. The value is cleared on success and on cancel/escape. No practical security difference from `useRef`.

## Items Deferred

### 6. Test file absent (HIGH)
**Decision:** Deferred to section-08 — the plan explicitly places all Phase 2 tests (including frontend component tests) in section-08, not section-07. This is by design, not an oversight.
