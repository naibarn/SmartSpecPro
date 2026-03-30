# Section 11 -- Settings Page Display Language Dropdown

## Overview

Add a "Display Language" dropdown to the existing user settings/profile page. The dropdown lists supported languages filtered by translation coverage, and on change: calls `i18next.changeLanguage()`, persists to the server via tRPC, and updates localStorage.

**Depends on**: section-01 (SUPPORTED_LANGUAGES, LANGUAGE_LABELS, LANGUAGE_COVERAGE), section-07 (server accepts z.enum)
**Blocks**: Nothing -- leaf node
**Parallelizable with**: sections 08, 09, 10

## Files to Modify

### `apps/web/client/src/pages/Settings.tsx`

**Location**: The Settings page has a Preferences tab. There is already a "Translation" subsection with a hardcoded `<select>` for `translationLanguage` and a model picker. The Display Language dropdown is added **above** the existing Translation subsection.

**Changes:**

1. **Add imports**:
   - `i18next` from `i18next` (for `changeLanguage()`)
   - `SUPPORTED_LANGUAGES`, `LANGUAGE_LABELS`, `LANGUAGE_LABELS_EN`, `LANGUAGE_COVERAGE` from `@shared/i18n`

2. **Add state**: `const [displayLanguage, setDisplayLanguage] = useState(i18next.language)` — sync from prefs query when available.

3. **Add "Display Language" section** in the Preferences tab, before the Translation block:
   - Heading with Globe icon + "Display Language" label
   - Description: "Choose the language used for the application interface"
   - `<select>` dropdown:
     - Options: `SUPPORTED_LANGUAGES.filter(lng => lng === 'en' || (LANGUAGE_COVERAGE[lng] ?? 0) >= 50)`
     - Each `<option>`: `LANGUAGE_LABELS[lng]` (native name) + `LANGUAGE_LABELS_EN[lng]` in parentheses when different
     - Value: language code string
   - On change handler:
     1. `i18next.changeLanguage(newLng)` — updates all `useTranslation()` consumers reactively
     2. `localStorage.setItem('smartspec_locale', newLng)` — fast detection on next page load
     3. `setDisplayLanguage(newLng)` — update local state
     4. `updatePrefsMutation.mutate({ translationLanguage: newLng })` — persist to DB
   - Info note: "English is always available as fallback"

4. **Replace hardcoded language options** in the existing Translation `<select>` (which has 19 hardcoded `<option>` elements) with a dynamic list from `SUPPORTED_LANGUAGES`.

**Key detail**: The `displayLanguage` state is distinct from the existing `translationLanguage` state. `translationLanguage` controls LLM translation target language. `displayLanguage` controls UI language via i18next. When Display Language changes, also update `translationLanguage` to keep them in sync.

## Tests

### Test file: `apps/web/client/src/pages/__tests__/Settings.i18n.test.tsx`

```
# Test: settings preferences tab shows Display Language dropdown
# Test: dropdown lists only languages with >= 50% coverage plus English
# Test: dropdown shows native name with English name for non-English options
# Test: changing language calls i18next.changeLanguage with selected code
# Test: changing language updates localStorage smartspec_locale
# Test: changing language fires tRPC updatePreferences mutation with { translationLanguage: newLng }
# Test: dropdown reflects current i18next language on initial render
# Test: English always appears as option even with 0% coverage
```

**Testing approach**:
- `@testing-library/react` with `render` and `screen`
- Mock `i18next`: `vi.mock('i18next', () => ({ default: { language: 'en', changeLanguage: vi.fn() } }))`
- Mock `react-i18next`: provide `useTranslation` returning mock `t` and `i18n`
- Mock `@shared/i18n` with controlled `SUPPORTED_LANGUAGES`, `LANGUAGE_LABELS`, `LANGUAGE_COVERAGE`
- Mock tRPC hooks (`users.getPreferences.useQuery`, `users.updatePreferences.useMutation`)
- Mock `useAuth` to return authenticated user
- Use `fireEvent.change()` to simulate dropdown selection

## Acceptance Criteria

1. "Display Language" dropdown appears in the Preferences tab
2. Only languages with >= 50% coverage shown (plus English always)
3. Each option shows native name + English name
4. Selecting a language immediately updates UI language via `i18next.changeLanguage`
5. Selection persists to localStorage and DB
6. Existing Translation subsection's hardcoded language list replaced with dynamic `SUPPORTED_LANGUAGES`
7. All 8 tests pass

## Implementation Notes (Actual)

**Files modified:**
- `apps/web/client/src/pages/Settings.tsx` — added `DisplayLanguageDropdown` export + integration; dynamic Translation options

**Files created:**
- `apps/web/client/src/pages/__tests__/Settings.i18n.test.tsx` (8 tests)

**Code review fixes:**
- HIGH: Added `defaultValue` + `onLanguageChange` props; removed orphaned parent state
- HIGH: Sub-component notifies parent via callback to keep translationLanguage in sync
- MEDIUM: Normalized initial value against SUPPORTED_LANGUAGES (guards "en-US")
- MEDIUM: Added mutation `onError` toast handler
- LOW: Added `htmlFor`/`id` for accessibility; `isPending` guard on select

## Dependencies from Prior Sections

- `SUPPORTED_LANGUAGES`, `LANGUAGE_LABELS`, `LANGUAGE_LABELS_EN`, `LANGUAGE_COVERAGE` from `@shared/i18n` (section-01)
- `i18next` instance initialized and `<I18nextProvider>` in tree (section-02, section-05)
- Server `z.enum(SUPPORTED_LANGUAGES)` validation (section-07) — ensures server accepts the language code
