---
name: Tiptap Editor Section 13 Hardening Tests Review
description: Review findings for Section 13 (Hardening Tests) of the Tiptap Markdown Editor — serialization guard, performance benchmarks, supplementary hardening tests
type: project
---

Verdict: APPROVE_WITH_FIXES (2026-03-21)

**Why:** Core deliverables (serialization guard, performance benchmarks, hardening test file) are correctly implemented. Several plan requirements are missing or weakened, and two out-of-scope test files were included.

**Key findings:**

- **HIGH — Accessibility tests entirely absent**: hardening.test.tsx contains 0 of the 4 plan-required accessibility tests (role="textbox" check, toolbar aria-label check, mode switcher keyboard nav, slash command menu aria-selected). The describe("Accessibility") block does not exist in the file.
- **HIGH — Thai IME composition guard test missing**: The plan required a test that simulates "/" typed during Thai IME composition (compositionstart) and asserts the slash command menu does NOT appear. This test is not in the file. The guard itself (event.isComposing / view.composing) is also not confirmed added to the slash command handler.
- **HIGH — Error boundary component test missing**: Only one error boundary test was written (a vacuous mock-catch-verify), and it does not actually mount any component. The plan required mounting TiptapEditor with a crashing extension and asserting the error boundary fallback UI renders. No error boundary component addition is visible in the diff.
- **MEDIUM — aria-label is hardcoded English in TiptapEditor.tsx**: `"aria-label": "Document editor"` is a string literal, not `t("editor.ariaLabel")`. The i18n key was added to both locale files but is never consumed.
- **MEDIUM — Serialization warning banner uses hardcoded English text**: `setSerializationWarning(result.warning)` sets a raw English string from the guard (not the `editor.serializationWarning` i18n key). The key is in both locale files but unused.
- **MEDIUM — Dismiss button in warning banner is not i18n'd and has no accessible label**.
- **MEDIUM — Performance budgets silently doubled from plan**: 5K doc budget raised from <500ms to <1000ms; 20K doc from <2000ms to <3000ms; serialization from <1000ms to <2000ms. The plan allowed `test.skipIf` as an alternative to raising the budget.
- **LOW — `countNodes` exported (implementation detail)**: The plan spec only exported `checkSerializationIntegrity`. Exporting `countNodes` is fine for test purposes but should be documented.
- **SCOPE CREEP — Two unrelated test files in diff**: `notificationPreferenceDelivery.test.ts` (Spec 049 / notification system) and `promptComposer.enhanced.test.ts` belong to different specs, not Section 13. They were bundled into this diff.

Review file: `planning/tiptap-markdown-editor/implementation/code_review/section-13-review.md`
