I now have all the information needed. Let me produce the section.

# Section 9 -- Welcome Language Picker

## Section ID
`section-09-welcome-picker`

## Dependencies
- **section-05-app-integration** -- `I18nextProvider` must be mounted in `App.tsx`; `i18nReady` Promise must resolve before this component renders.
- **section-07-server-allowlist** -- tRPC mutation `users.updatePreferences` must accept `z.enum(SUPPORTED_LANGUAGES)` so the language choice persists to the database.
- **section-01-shared-config** -- `SUPPORTED_LANGUAGES`, `LANGUAGE_LABELS`, `LANGUAGE_COVERAGE` from `apps/web/shared/i18n.ts`.
- **section-02-i18n-core** -- `i18next` instance and `i18n/config.ts` exports (`DEFAULT_LANGUAGE`).

## Overview

Create a `WelcomeLanguagePicker` component that displays a one-time Radix Dialog modal to authenticated users who have not yet chosen a display language. The picker filters languages by translation coverage, calls `i18next.changeLanguage()` on selection, persists the choice to both localStorage and the user profile via tRPC, and sets a dismissal flag so it never reappears.

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/client/src/components/WelcomeLanguagePicker.tsx` | Modal component |
| `apps/web/client/src/components/__tests__/WelcomeLanguagePicker.test.tsx` | Tests |

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/client/src/App.tsx` | Render `<WelcomeLanguagePicker />` inside the authenticated section of the provider tree (after `AuthProvider` resolves, inside `I18nextProvider`) |

---

## Tests (TDD -- Write First)

**Test file**: `apps/web/client/src/components/__tests__/WelcomeLanguagePicker.test.tsx`

All tests use `@testing-library/react` with a wrapper providing a mocked `I18nextProvider`. The `trpc` client, `i18next`, and `localStorage` are mocked.

### Test List

```
# Visibility logic
Test: renders modal when user has no language preference and localStorage lacks smartspec_locale_chosen
Test: does not render when user already has translationLanguage set in preferences
Test: does not render when localStorage has smartspec_locale_chosen='true'
Test: does not render when user is not authenticated (no user context)

# Language filtering
Test: shows only languages with LANGUAGE_COVERAGE >= 50
Test: always shows "Continue with English" option regardless of coverage
Test: does not show languages with coverage below 50

# Selection behavior
Test: selecting Thai calls i18next.changeLanguage('th')
Test: selecting Thai writes 'th' to localStorage key smartspec_locale
Test: selecting Thai fires tRPC users.updatePreferences mutation with { translationLanguage: 'th' }
Test: sets localStorage smartspec_locale_chosen to 'true' after selection

# Dismissal
Test: dismissing modal (clicking close / pressing Escape) defaults to English
Test: dismissing modal sets smartspec_locale_chosen to 'true'

# Display
Test: each language option shows native name from LANGUAGE_LABELS
Test: each language option shows coverage percentage
```

### Test Setup Pattern

```typescript
// Pseudo-structure -- not full implementation
// Mock i18next
vi.mock('i18next', () => ({
  default: {
    changeLanguage: vi.fn().mockResolvedValue(undefined),
    language: 'en',
  },
}));

// Mock tRPC
const mockMutate = vi.fn();
vi.mock('@/lib/trpc', () => ({
  trpc: {
    users: {
      updatePreferences: {
        useMutation: () => ({ mutate: mockMutate }),
      },
      getPreferences: {
        useQuery: () => ({ data: { translationLanguage: '' } }),
      },
    },
  },
}));

// Mock localStorage
const localStorageMock = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
Object.defineProperty(window, 'localStorage', { value: localStorageMock });
```

The render helper should wrap the component in `I18nextProvider` with the mocked `i18next` instance.

---

## Implementation Guidance

### Component: `WelcomeLanguagePicker.tsx`

**Location**: `apps/web/client/src/components/WelcomeLanguagePicker.tsx`

**Imports needed**:
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` from `@/components/ui/dialog`
- `Button` from `@/components/ui/button`
- `i18next` from `i18next`
- `trpc` from `@/lib/trpc`
- `SUPPORTED_LANGUAGES`, `LANGUAGE_LABELS`, `LANGUAGE_COVERAGE` from `@shared/i18n`
- `DEFAULT_LANGUAGE` from `@/i18n/config`
- `useState`, `useEffect`, `useCallback` from `react`

**Constants**:
- `LOCALE_CHOSEN_KEY = 'smartspec_locale_chosen'` -- localStorage key to track dismissal
- `LOCALE_KEY = 'smartspec_locale'` -- localStorage key for current language (matches existing `context.tsx`)
- `MIN_COVERAGE = 50` -- minimum percentage for a language to appear in the picker

**State logic**:
- `open: boolean` -- controlled Dialog state
- On mount, determine visibility:
  1. Read `localStorage.getItem(LOCALE_CHOSEN_KEY)` -- if `'true'`, do not show
  2. Query `trpc.users.getPreferences.useQuery()` -- if `data.translationLanguage` is a non-empty string, do not show
  3. Otherwise, set `open = true`

**Language list**:
- Filter `SUPPORTED_LANGUAGES` to entries where `LANGUAGE_COVERAGE[lang] >= MIN_COVERAGE`
- Exclude `'en'` from the grid (English is always the "continue" fallback button)
- Each entry displays: native name from `LANGUAGE_LABELS[lang]`, language code, coverage percentage badge

**Selection handler** (`handleSelect(lang: string)`):
0. **Defense-in-depth guard**: `if (!SUPPORTED_LANGUAGES.includes(lang as any)) return;` — prevents UI manipulation from sending invalid values
1. Call `i18next.changeLanguage(lang)` (returns Promise, fire-and-forget for UI)
2. `localStorage.setItem(LOCALE_KEY, lang)`
3. `localStorage.setItem(LOCALE_CHOSEN_KEY, 'true')`
4. Fire tRPC mutation: `updatePreferences.mutate({ translationLanguage: lang })`
5. Set `open = false`

**Dismiss handler** (`handleDismiss`):
1. `localStorage.setItem(LOCALE_CHOSEN_KEY, 'true')` -- prevent re-showing
2. Language stays as `'en'` (no `changeLanguage` call needed)
3. Set `open = false`

**Dialog structure** (pseudo-JSX):
```
<Dialog open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
  <DialogContent showCloseButton={true}>
    <DialogHeader>
      <DialogTitle>"Choose Your Language"</DialogTitle>
      <DialogDescription>"Select your preferred display language. English is always available as a fallback."</DialogDescription>
    </DialogHeader>
    <div className="grid grid-cols-2 gap-3 my-4">
      {filteredLanguages.map(lang => (
        <button key={lang} onClick={() => handleSelect(lang)}
          className="... rounded-lg border p-3 text-left hover:bg-accent">
          <span className="font-medium">{LANGUAGE_LABELS[lang]}</span>
          <span className="text-muted-foreground text-xs">{lang}</span>
          <Badge variant="secondary">{LANGUAGE_COVERAGE[lang]}%</Badge>
        </button>
      ))}
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={handleDismiss}>
        Continue with English
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Accessibility**:
- Dialog has `DialogTitle` and `DialogDescription` for screen readers
- Each language button should have `aria-label` with both native and English name
- "Continue with English" button is always focusable and keyboard-navigable
- Close button (`showCloseButton={true}`) already has `sr-only` "Close" label from the ui/dialog component

**Edge cases**:
- If `trpc.users.getPreferences` query is still loading, do not show the modal yet (wait for `isSuccess || isError`)
- If the query errors, treat as "no preference set" and show the modal
- If `localStorage` is unavailable (private browsing), catch errors and still allow selection (just skip localStorage writes in a try/catch)

### App.tsx Integration

Place `<WelcomeLanguagePicker />` inside the authenticated area of the component tree, after `AuthProvider` and inside `I18nextProvider`. It should be a sibling of the Router, not inside route matching. It renders its own Dialog portal so position in the tree only matters for context access.

Suggested location: immediately before or after the `<Router>` component, inside the same authenticated wrapper.

```tsx
// Inside the authenticated section of App.tsx
<WelcomeLanguagePicker />
```

The component self-manages its visibility -- no props needed from App.tsx.

---

## Behavioral Notes

- The picker is intentionally simple -- no language search, no grouping by region. For Phase 1, only `en` and `th` will have coverage >= 50%, so the grid will contain just Thai. More languages appear automatically as translations reach the threshold.
- The `smartspec_locale_chosen` flag is separate from `smartspec_locale` to distinguish "user actively chose English" from "user never saw the picker".
- The tRPC mutation fires fire-and-forget. If it fails (network error), the localStorage value still persists, so the user's choice survives. The DB will sync on the next successful mutation (e.g., from Settings page).
- The component does NOT call `i18next.changeLanguage('en')` on dismiss because English is already the default/fallback. Calling it would trigger an unnecessary namespace reload.

## Implementation Notes (Actual)

**Files created:**
- `apps/web/client/src/components/WelcomeLanguagePicker.tsx`
- `apps/web/client/src/components/__tests__/WelcomeLanguagePicker.test.tsx` (16 tests)

**Files modified:**
- `apps/web/client/src/App.tsx` — added `<WelcomeLanguagePicker />` before `<Router />`

**Code review fixes applied:**
- HIGH: Added `useAuth()` guard — returns null for unauthenticated users
- HIGH: Moved `safeLocalStorage` to module-level singleton with per-call try/catch
- MEDIUM: Fixed translationLanguage check to `typeof === "string" && !== ""`
- MEDIUM: Added "More languages are coming soon" message when grid is empty
- LOW: Added `LANGUAGE_LABELS_EN` to button aria-labels
- Tests expanded from 10 → 16 (added auth guard, selection behavior, dismiss no-changeLanguage)