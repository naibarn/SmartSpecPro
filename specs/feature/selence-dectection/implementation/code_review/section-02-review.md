# Section 02 Code Review: Dialog Layout

## Critical Issues

### 1. DOUBLE PORTAL / DOUBLE OVERLAY (HIGH)
**File:** SilenceDetectionDialog.tsx, lines 104-107
The implementation wraps with explicit `<DialogPortal>` and `<DialogOverlay>`, but the shared `DialogContent` from `@/components/ui/dialog` already renders its own portal and overlay internally. Result: two portals, two overlays, z-index conflicts. Fix: either remove explicit portal/overlay or use `DialogPrimitive.Content` directly.

### 2. MISSING ACCESSIBILITY: No DialogDescription (MEDIUM)
**File:** SilenceDetectionDialog.tsx
Has `DialogTitle` but no `DialogDescription` or `aria-describedby={undefined}`. Radix emits console warnings (seen in test output). WCAG violation.

### 3. Math.random() in Render Path (MEDIUM)
**File:** SilenceDetectionDialog.tsx, line 317
`Math.random()` called during render for skeleton bar heights. Causes visual flicker on re-renders and non-deterministic tests. Should use `useMemo`.

### 4. useEffect Missing Dependency: `project` (MEDIUM)
**File:** SilenceDetectionDialog.tsx, line 92
Effect reads `project` but has empty deps array `[]`. Stale closure risk if project changes while dialog is open.

### 5. No Abort Controller for Async Effect (MEDIUM)
**File:** SilenceDetectionDialog.tsx, lines 78-91
Async fetch has no cleanup. Component unmount during fetch causes state updates on unmounted component.

## Plan Compliance Issues

### 6. MISSING 5 of 10 Planned Tests (HIGH)
Missing tests: ESC-to-close, disabled-when-no-regions, and entire waveform describe block (4 tests).

### 7. Dead Code: `handleCutAndCombine` (LOW)
**File:** VideoEditorPhase3.tsx, line 771
No longer used after panel rewrite. Dead code.

### 8. `(asset as any)` Type Casts (LOW)
**File:** SilenceDetectionDialog.tsx, lines 71-73, 88
Four `as any` casts defeat TypeScript safety.

### 9. Inline `<style>` Tag Pollution (LOW)
**File:** SilenceDetectionDialog.tsx, lines 110-275
165-line global unscoped CSS. Generic `pulse` keyframes name will collide with Tailwind's `animate-pulse`.

### 10. Global Vitest Setup Affects ALL Tests (MEDIUM)
**File:** test-setup.ts + vitest.config.ts
Module._resolveFilename hook runs for all tests including server-side. afterEach cleanup may break in non-React tests. Fragile Node.js internal API dependency.

### 11. test.environment Config Inconsistency (LOW)
Global `test.environment: "node"` but React tests use per-file jsdom comments. Should use `environmentMatchGlobs`.

### 12. package-lock.json Unrelated Changes (LOW)
Contains stripe dep changes unrelated to silence detection.
