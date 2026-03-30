# Section-11 Review — Settings Display Language Dropdown

**Spec**: `specs/feature/062-i18n-dual-language-system/sections/section-11-settings-language.md`
**Date**: 2026-03-25
**Reviewer**: CMD-8 (SmartSpecPro Reviewer Agent)

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | Settings.tsx:502, 617–625 | Dead `displayLanguage` state in `Settings()` parent: the parent declares its own `const [displayLanguage, setDisplayLanguage]` and sets it from `prefsData` in a `useEffect` (line 624), but `DisplayLanguageDropdown` is a module-level sub-component with its own isolated state. The parent's `setDisplayLanguage` call is orphaned — it updates state nobody reads. Worse, the `useEffect` sync (`setDisplayLanguage(prefsData.translationLanguage)`) does NOT propagate into `DisplayLanguageDropdown`, so the dropdown never reflects the user's saved preference after hydration. On first render the dropdown shows `i18next.language`, which may differ from `prefsData.translationLanguage`. | Remove the parent's `displayLanguage` state and its sync in the `useEffect`. `DisplayLanguageDropdown` must accept an `initialValue` prop (or read `prefsQuery` itself) so it can hydrate from the server preference. One approach: give it `defaultValue={prefsData?.translationLanguage ?? i18next.language}` at the call site `<DisplayLanguageDropdown defaultValue={...} />`. |
| HIGH | Settings.tsx:370 | Semantic mismatch — `DisplayLanguageDropdown` calls `updatePrefs({ translationLanguage: newLng })` to persist the UI display language. `translationLanguage` is the LLM translation target language, not the UI display language. Spec §3 step 4 says to call `updatePrefsMutation.mutate({ translationLanguage: newLng })` intentionally keeping them in sync, but the spec comment on this line says "Key detail: when Display Language changes, also update `translationLanguage` to keep them in sync." The sub-component's `updatePrefs` instance is a separate tRPC mutation instance from the parent's `updatePrefsMutation`. If the parent's "Save preferences" button is also pressed, it fires `updatePrefsMutation.mutate({ translationLanguage: translationLanguage })` using the parent's stale `translationLanguage` state — which was not updated when the `DisplayLanguageDropdown` changed it. The two mutation instances can write conflicting values. | Either (a) lift the save action so both the Display Language and Translation Language values are saved atomically via the parent's single `updatePrefsMutation`, or (b) keep them separate but ensure the parent's `translationLanguage` state is updated when `DisplayLanguageDropdown` fires. The sub-component should accept an `onLanguageChange` callback to notify the parent. |
| MEDIUM | Settings.tsx:358 | `DisplayLanguageDropdown` initialises `displayLanguage` from `i18next.language` synchronously. If i18next resolves to a region-tagged code like `"en-US"` (from the browser language detector before section-03's normalisation runs), `"en-US"` will not appear in `displayLanguages` (the filtered `SUPPORTED_LANGUAGES` list), so the `<select>` will render with no option selected and the controlled value will be out-of-sync with the DOM. The guard `if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(newLng)) return;` in `handleDisplayLangChange` correctly rejects unsupported codes on user action, but the initial controlled value itself can be invalid. | Normalise the initial value: `const init = SUPPORTED_LANGUAGES.find(l => i18next.language.startsWith(l)) ?? 'en'`. |
| MEDIUM | Settings.tsx:357–399 | `DisplayLanguageDropdown` calls `trpc.users.updatePreferences.useMutation()` at module sub-component level without error handling. The mutation in the parent (`updatePrefsMutation`) has `onSuccess` and `onError` toast handlers. The sub-component's mutation silently swallows errors — a network failure or validation error on persist is invisible to the user. | Add `onError: (err) => toast.error(err.message)` and optionally `onSuccess` to the mutation options inside `DisplayLanguageDropdown`. |
| MEDIUM | Settings.i18n.test.tsx:105–110 | Test 7 ("dropdown reflects current i18next.language on initial render") is missing from the test file. The spec lists 8 required tests; the file contains only 7 `it()` blocks. The missing test is: confirm the dropdown's `<select>` value equals `"en"` (the mocked `i18next.language`) on initial render without any user action. | Add the missing test: `it("dropdown reflects current i18next language on initial render", () => { render(<DisplayLanguageDropdown />); expect(screen.getByRole("combobox")).toHaveValue("en"); })`. |
| LOW | Settings.tsx:365–371 | `handleDisplayLangChange` calls `updatePrefs` (the sub-component's own mutation) unconditionally whenever the select changes. Because the sub-component has no `isLoading`/`isPending` guard, a fast user can fire multiple concurrent tRPC mutations before the first resolves. The parent's equivalent save button is disabled while `updatePrefsMutation.isPending`. | Destructure `isPending` from `useMutation()` and skip the call if `isPending` is true, or disable the `<select>` while pending. |
| LOW | Settings.tsx:383–394 | The `<select>` element has no `aria-label`. The parent `<label>` element (line 380–382) is a `<label>` tag but does not use `htmlFor` pointing to an `id` on the `<select>`. Screen readers will not associate the label text with the combobox, so `screen.getByRole("combobox")` works in tests only because no label association is required by that query. | Add `id="display-language-select"` to `<select>` and `htmlFor="display-language-select"` to `<label>`. |
| LOW | Settings.tsx:374–397 | The section heading "Display Language" (line 377) and description text (line 381) are hardcoded English strings, not wrapped in `t()`. The rest of the Preferences tab uses `t()` throughout. These strings will not translate when the user switches to Thai. | Wrap: `{t('settings.displayLanguage.title')}` and `{t('settings.displayLanguage.description')}`. Keys should be added to the locale files (section-08). |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| `SUPPORTED_LANGUAGES` filter `>= 50% coverage OR en` | PASS | Line 361–363 implements the filter correctly. |
| `LANGUAGE_LABELS[lng]` (native) + `LANGUAGE_LABELS_EN[lng]` (English) in parentheses | PASS | Lines 390–391 render both; parenthetical skipped for `en`. |
| `i18next.changeLanguage(newLng)` called on change | PASS | Line 367, wrapped with `void`. |
| `localStorage.setItem('smartspec_locale', newLng)` called on change | PASS | Line 368, wrapped in try/catch. |
| Input validated against `SUPPORTED_LANGUAGES` before `changeLanguage` | PASS | Line 366 allowlist guard present. |
| Dropdown placed above Translation block in Preferences tab | PASS | Line 1547, Translation block at 1549. |
| Hardcoded Translation `<option>` elements replaced with dynamic `SUPPORTED_LANGUAGES.map` | PASS | Lines 1566–1570 use `SUPPORTED_LANGUAGES.filter((lng) => lng !== 'en').map(...)`. |
| `DisplayLanguageDropdown` exported for test isolation | PASS | `export function DisplayLanguageDropdown()` at line 357. |
| Section-07 `z.enum(SUPPORTED_LANGUAGES)` server validation used by mutation | PASS | `updatePrefs` calls `users.updatePreferences` which is guarded by section-07 schema. |
| 8 spec-required tests present | FAIL | Only 7 tests found; missing "dropdown reflects current i18next.language on initial render". |
| State hydration from saved preferences | FAIL | Sub-component does not receive hydrated value from `prefsData` — see HIGH-1. |
| No duplicate `tRPC` mutation instances that can conflict | FAIL | Parent and sub-component each hold a separate `updatePreferences` mutation instance — see HIGH-2. |

---

### Summary

The core UI structure is well-executed: the filter logic, option rendering with native+English names, allowlist guard, localStorage try/catch, and Translation section dynamic replacement all satisfy the spec. However two HIGH-severity integration issues compromise correctness: the sub-component's display language state is never hydrated from the server preference (orphaned parent `useEffect`), and the sub-component's mutation fires against the same tRPC endpoint as the parent's Save button using stale parent state, creating a race-condition overwrite risk. One test is missing from the required 8, and the heading/description strings are not i18n-wrapped.
