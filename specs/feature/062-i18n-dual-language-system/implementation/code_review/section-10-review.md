# Section 10 — Locale Toggle Update: Review Report

**Date:** 2026-03-25
**Spec:** `specs/feature/062-i18n-dual-language-system/sections/section-10-locale-toggle.md`
**Files reviewed:**
- `apps/web/client/src/components/LocaleToggle.tsx`
- `apps/web/client/src/components/__tests__/LocaleToggle.i18n.test.tsx`
- `specs/feature/062-i18n-dual-language-system/implementation/code_review/section-10-diff.md`

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| MEDIUM | `LocaleToggle.tsx:14` | `i18n.language` can return a BCP-47 subtag like `"zh-Hans"` or a region-qualified code like `"en-US"`. The equality check `currentLang === "en"` is safe for `"en"` only, but if i18next ever normalises or resolves to `"en-US"` (e.g. user browser locale is `en-US` and the language detector adopted it without clamping), the component renders two buttons (`["en", "en-US"]`) and `LANGUAGE_LABELS["en-US"]` falls back to the raw code string — no label crash, but the single-button expectation breaks visually. | Normalise `currentLang` against `SUPPORTED_LANGUAGES` before deriving `visibleLocales`. A one-liner guard: `const lang = (SUPPORTED_LANGUAGES as readonly string[]).includes(currentLang) ? currentLang : DEFAULT_LANGUAGE;` then use `lang` everywhere. |
| MEDIUM | `LocaleToggle.i18n.test.tsx:50` | The English-button finder uses a hard-coded Thai text exclusion: `buttons.find((b) => (b.textContent || "") !== "ภาษาไทย")`. The production component actually renders `LANGUAGE_LABELS["th"]` which is `"ไทย"` (not `"ภาษาไทย"`). The comparison will never match either button's text content, so the `||  buttons[0]` fallback silently rescues the test — the find logic is dead. If button order or labelling ever changes, the test will still pass but verify the wrong button. | Find the English button by its `title` attribute or by text `"English"`: `buttons.find((b) => b.getAttribute("title") === "English")`. This matches the actual rendered content and makes the intent explicit. |
| MEDIUM | `LocaleToggle.i18n.test.tsx` | No test covers a BCP-47 region-tagged language (e.g. `mockLanguage = "zh-Hans"`). `LANGUAGE_LABELS["zh-Hans"]` exists in the map (`"简体中文"`), so rendering is safe for that specific value — but `zh-Hans` contains a hyphen and `LANGUAGE_LABELS[loc as keyof typeof LANGUAGE_LABELS] ?? loc` is the only guard. No test asserts the label is correct rather than the raw fallback string. | Add a test: `mockLanguage = "zh-Hans"` → renders `"简体中文"` button text and `"English"` button text; only two buttons visible. |
| LOW | `LocaleToggle.tsx:37,39` | The `as keyof typeof LANGUAGE_LABELS` cast is a type lie. `LANGUAGE_LABELS` is typed `Record<SupportedLanguage, string>`. A `string` from `visibleLocales` is not assignable without the cast, and TypeScript does not catch an unsupported code slipping through at runtime. The `?? loc` fallback is the correct runtime guard, but the cast suppresses any compile-time hint that the input is unvalidated. | Pre-validate `visibleLocales` entries against `SUPPORTED_LANGUAGES` (see MEDIUM fix above); then the cast becomes unnecessary and the type is sound. |
| LOW | `LocaleToggle.i18n.test.tsx:81-87` | The `"inactive language button has aria-pressed=false"` test only asserts that some button has `aria-pressed="false"` — it does not assert which button or that the active button is a different one. The `aria-pressed=true` and `aria-pressed=false` tests are structurally identical and could both pass even if both buttons had the wrong state (as long as any one matched each assertion). | Combine into a single test that renders with `mockLanguage = "th"`, then asserts the `"en"`-titled button has `aria-pressed="false"` and the `"ไทย"`-titled button has `aria-pressed="true"`. |
| LOW | `LocaleToggle.tsx` | Spec §Styling Notes lists the active button class as `"bg-primary text-primary-foreground"`. The implementation matches. The spec also lists the inactive class as `"text-muted-foreground hover:bg-muted hover:text-foreground"`. The implementation adds `"transition-colors"` to the base class, which is not in the spec but is benign. No test asserts the styling classes. | Add a test for active/inactive styling to prevent regression if class names drift during design-token migration. The spec section §Test cases (line 104) lists this as a required test case but it is absent from the test file. |

### Contract Compliance

| Requirement | Status | Notes |
|---|---|---|
| No imports from `@/lib/i18n` | PASS | File imports only `react-i18next`, `@shared/i18n`, `@/lib/utils`. Legacy import fully removed. |
| `useTranslation()` from `react-i18next` | PASS | `const { i18n } = useTranslation()` at line 10. |
| `LANGUAGE_LABELS` from `@shared/i18n` | PASS | Correct import; map covers all 19 `SUPPORTED_LANGUAGES` including `zh-Hans`, `zh-Hant`, `pt-BR`. |
| `i18n.changeLanguage(loc)` on click | PASS | Line 29. |
| Two-button pill: `['en', currentLang]` when non-English | PASS | Line 14. |
| Single-button when language is `'en'` | PASS | Line 14. |
| `role="group"` preserved | PASS | Line 22. |
| `aria-label="Language switcher"` preserved | PASS | Line 23. |
| `aria-pressed` preserved | PASS | Line 36, expression `currentLang === loc`. |
| `className` passthrough preserved | PASS | Line 18 via `cn()`. |
| Props interface unchanged `{ className?: string }` | PASS | Lines 5-7. |
| Consumer impact — Dashboard.tsx (3 usages) | PASS | Props unchanged; Dashboard.test.tsx mocks entire module, no test breakage. |
| Consumer impact — Teams.tsx (2 usages) | PASS | Props unchanged. Teams.tsx still imports legacy `useI18n` for its own use, but that is unrelated to this component. |
| Spec-required test: styling classes (active/inactive) | FAIL | Test listed in spec §Test cases line 104 is not present in the test file. |
| Spec-required test: non-English language renders | PASS | Covered by test line 28. |
| Spec-required test: changeLanguage called on click | PASS | Covered by tests lines 45 and 55. |
| Spec-required test: ARIA attributes | PASS | Covered by tests lines 65 and 72. |
| Spec-required test: single button when `'en'` | PASS | Covered by test line 38. |
| Spec-required test: `className` passthrough | PASS | Covered by test line 89. |

### Summary

The migration is complete and correct: all legacy `@/lib/i18n` imports are removed, the component wires cleanly to `react-i18next`, and all ARIA attributes are preserved. The two principal risks are (1) `i18n.language` returning a language code that is not in `SUPPORTED_LANGUAGES` (e.g. a browser-resolved `"en-US"`) which would silently break the single-button invariant and render the raw code as button text, and (2) a test that uses an incorrect Thai string literal (`"ภาษาไทย"` vs the actual `"ไทย"`) making the English-button finder dead code masked by a fallback. The missing styling-classes test is a spec gap. All three issues are straightforward to fix before merge.
