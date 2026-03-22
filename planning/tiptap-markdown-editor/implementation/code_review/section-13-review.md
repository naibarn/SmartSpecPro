# Code Review: Section 13 - Hardening Tests

## What Was Implemented Correctly

- `serialization-guard.ts` with `checkSerializationIntegrity` and `countNodes` — well-structured, correct threshold logic, empty-document short-circuit
- `serialization-guard.test.ts` with all six test stubs plus two `countNodes` tests — mock-based round-trip loss test is sound
- `performance.test.ts` with `generateMarkdown` helper producing varied content and five benchmark tests (3 active, 2 skipped as designed)
- `hardening.test.tsx` with legacy content parsing (4 tests) and Thai IME compatibility (2 tests) — all passing
- ARIA attributes added to `TiptapEditor.tsx` `editorProps.attributes`
- `checkSerializationIntegrity` integrated into `UnifiedDocumentSurface` on document load with warning banner
- i18n keys added to both en.ts and th.ts locale files

## Gaps vs Plan

1. **Accessibility tests missing** — The plan specifies 4 accessibility tests (role="textbox", toolbar button labels, mode switcher keyboard navigation, slash command menu keyboard navigation). None were added to `hardening.test.tsx`.
2. **Error boundary component-mounting test missing** — Plan specifies testing that TiptapEditor renders error boundary fallback on extension crash. Current test only verifies mock serialize throws (smoke test level).
3. **Thai IME slash-command composition guard test missing** — Plan specifies testing that Thai text input does not trigger slash command menu. Not tested.
4. **ARIA label uses hardcoded English** — `"Document editor"` is hardcoded in `TiptapEditor.tsx` instead of using `t("editor.ariaLabel")`. The i18n key was added but not consumed.
5. **Serialization warning banner uses hardcoded text** — The warning message in `UnifiedDocumentSurface` comes from the guard function directly, not from i18n `editor.serializationWarning`.

## Code Quality

- Clean code, follows existing patterns well
- Performance test budgets were appropriately relaxed for CI stability
- `vi.spyOn` approach for the loss-trigger test is pragmatic and reliable

## Suggestions

1. Add the 4 accessibility tests from the plan
2. Use i18n `t("editor.ariaLabel")` in TiptapEditor instead of hardcoded English
3. Consider wrapping serialization warning in i18n
