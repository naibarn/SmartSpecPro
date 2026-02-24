# Section-08 Code Review Interview Transcript

**Date:** 2026-02-24
**Section:** section-08-export-dialog
**Verdict after fixes:** APPROVED

---

## Auto-Fixes Applied (No User Input Required)

All issues in this section were auto-fixable — clear spec violations, quality improvements, or accessibility fixes. No user decisions were required.

### H1: outputBytes/file size not displayed in Done phase (auto-fix)

- Added `outputBytes` extraction from `statusData` alongside existing fields.
- `renderDone()` now computes `fileSizeMb = (outputBytes / 1024 / 1024).toFixed(1)` and renders a `<p className="text-xs text-muted-foreground">{fileSizeMb} MB</p>` beneath the "Your export is ready." line.
- `makeQueryMock` in test file updated to include `outputBytes: data.outputBytes ?? null` in the returned data object (M3 co-fix).

### H2: Download uses `<a href>` instead of `window.open` (auto-fix)

- Replaced the `<a href={downloadUrl}><Button asChild>` pattern with `<Button onClick={() => window.open(downloadUrl, "_blank", "noopener")} data-testid="download-link">`.
- Eliminates the invalid `<a>` wrapping a `<button>` DOM nesting (hydration warning, accessibility violation).
- Test 14 updated: replaced `getAttribute("href")` assertion with `window.open` spy (`vi.spyOn(window, "open")`) that asserts `openSpy` was called with `(url, "_blank", "noopener")`.

### H3: `useEffect` missing `dialogPhase` in deps (auto-fix)

- Added `dialogPhase` to the `useEffect` dependency array.
- Added guard `if (dialogPhase !== "exporting") return;` at the top of the effect so stale query data after "Try Again" cannot re-trigger a phase transition.

### M1: idempotencyKey not reset on dialog reopen (auto-fix)

- Added a second `useEffect` keyed on `[open]`:
  ```typescript
  useEffect(() => {
    if (open) {
      idempotencyKeyRef.current = crypto.randomUUID();
      setExportId(null);
      setDialogPhase("selecting");
    }
  }, [open]);
  ```
- Ensures a fresh idempotency key and clean state on each open, preventing a reopened dialog from reusing the previous job's key.

### M2: No test for `onError` toast (auto-fix)

- Added test 17: `"shows an error toast when triggerExport mutation fails"`.
- Captures `onError` callback from `useMutation` mock, fires it with `{ message: "Quota exceeded" }`, asserts `toast.error` was called with `"Export failed to start: Quota exceeded"`.
- Added `toast` import from `"sonner"` and `afterEach` to the test file imports.

### M3: `outputBytes` missing from `makeQueryMock` return (auto-fix)

- Co-fixed with H1: added `outputBytes: data.outputBytes ?? null` to the returned `data` shape in `makeQueryMock`.

### M4: Quality picker options missing `data-testid` (auto-fix)

- Added `data-testid={\`quality-option-${opt.value}\`}` to each quality option `<div>`.
- Enables `screen.getByTestId("quality-option-draft")` etc. in future tests.

### M5: Unknown stage renders raw string instead of "Processing..." (auto-fix)

- Changed `{STAGE_LABELS[stage] ?? stage}` to `{STAGE_LABELS[stage] ?? "Processing..."}`.
- Unknown stage values now show a user-friendly fallback instead of exposing internal stage identifiers.

### L3: No `DialogDescription` causes Radix console warning (auto-fix)

- Added `<DialogDescription className="sr-only">` with descriptive text beneath `<DialogTitle>`.
- Suppresses the Radix UI a11y warning: "Missing `Description` or `aria-describedby={undefined}`".
- Added `DialogDescription` to the dialog component import.

---

## Items Noted But Not Fixed

### L1: `handleExport` should be memoized with `useCallback`

- Low priority style improvement. Component re-renders are bounded — only called on button click.
- Not fixed; acceptable as-is.

### L2: `aria-valuenow` explicitly forwarded (kept as-is)

- The `Progress` component from `packages/ui` does not forward `value` to `ProgressPrimitive.Root`, so Radix cannot set `aria-valuenow` internally. Explicit `aria-valuenow={progressPct}` is the correct workaround.
- Kept as-is; fixing the `Progress` component upstream is out of scope for this section.

### L4: `formatBytes` utility should live in a shared module

- Inline `(outputBytes / 1024 / 1024).toFixed(1)` is fine for one use case.
- Extraction to a shared utility is a future improvement, not required here.

---

## Final Test Count

- **17 tests** in `apps/web/client/src/components/presentation/ExportDialog.test.tsx`
- **17/17 passing**
- Tests cover: format picker (all 4 options), quality picker conditional visibility (mp4/jpg show, png/pdf hide), triggerExport called with correct args + non-empty idempotencyKey, progress bar visible + aria-valuenow correct, stage labels (rendering/encoding/uploading), polling stops on done/error, download button calls window.open, errorMessage rendered, Try Again resets phase, onError toast fires
