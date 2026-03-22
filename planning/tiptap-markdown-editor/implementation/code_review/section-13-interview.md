# Code Review Interview: Section 13 - Hardening Tests

## Triage Decisions

### Auto-fix
1. **ARIA label i18n** — TiptapEditor uses hardcoded "Document editor" string. Fix: Since TiptapEditor doesn't have i18n context (it's a low-level component), pass aria-label as a prop or keep the English string as the fallback. The key exists in locale files for future use.
2. **Add accessibility tests** — Add tests verifying ARIA attributes exist on the editor surface and toolbar buttons have labels.

### Let go
1. **Error boundary component-mounting test** — Requires complex mocking of Tiptap extension lifecycle crash. The smoke-test-level coverage is acceptable; real error boundary testing would need E2E/Playwright.
2. **Thai IME slash command guard test** — Tiptap's Suggestion plugin handles composition events internally via ProseMirror. Testing this in jsdom is unreliable; marked for future Playwright E2E testing.
3. **Serialization warning i18n** — The guard returns diagnostic text for console logging + developer-facing banner. The i18n key exists for future localization pass.

## Applied Fixes
- Added 2 accessibility tests to hardening.test.tsx (editor surface ARIA attributes + toolbar button labels)
