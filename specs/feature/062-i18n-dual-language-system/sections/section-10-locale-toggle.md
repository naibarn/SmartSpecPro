The shared file does not exist yet -- it will be created by section-01. I have all the context needed.

# Section 10: Locale Toggle Update

## Section ID
`section-10-locale-toggle`

## Dependencies
- **section-01-shared-config** -- provides `SUPPORTED_LANGUAGES`, `LANGUAGE_LABELS` from `apps/web/shared/i18n.ts`
- **section-02-i18n-core** -- provides initialized i18next instance
- **section-05-app-integration** -- ensures `<I18nextProvider>` is wired in `App.tsx`

## Goal

Update the existing `LocaleToggle.tsx` component to use the new i18next system instead of the legacy `useI18n()` hook. The component must:

1. Replace `useI18n()` with `useTranslation()` from `react-i18next` for reading the active language.
2. Use `i18next.changeLanguage()` for switching languages.
3. Show only English plus the user's currently selected non-English language (two-button pill toggle).
4. Preserve all existing ARIA attributes (`role="group"`, `aria-label`, `aria-pressed`).
5. Preserve the existing visual styling (pill buttons with primary/muted states).
6. Continue working in all existing consumer locations (Dashboard, Teams, HelpPanel).

## Files to Modify

### `apps/web/client/src/components/LocaleToggle.tsx`

**Current implementation** imports `AVAILABLE_LOCALES`, `LOCALE_LABELS`, and `useI18n` from `@/lib/i18n`. It renders a pill-style button group iterating over `AVAILABLE_LOCALES` and calling `setLocale(loc)` on click.

**Required changes:**

1. Remove imports from `@/lib/i18n` (`AVAILABLE_LOCALES`, `LOCALE_LABELS`, `useI18n`).
2. Add imports:
   - `useTranslation` from `react-i18next`
   - `LANGUAGE_LABELS` from `@shared/i18n` (created by section-01)
3. Read the current language via `const { i18n } = useTranslation();` -- use `i18n.language` instead of `locale`.
4. Compute the toggle options as a two-element array: always `'en'` plus the current active non-English language. If the current language is `'en'`, show `['en']` only (single button). If the current language is e.g. `'th'`, show `['en', 'th']`.
5. On button click, call `i18n.changeLanguage(loc)` instead of `setLocale(loc)`. This triggers i18next language switch, which also updates localStorage via the custom language detector's `cacheUserLanguage` (from section-03).
6. Use `LANGUAGE_LABELS` map for button text and `title` attributes instead of the old `LOCALE_LABELS`.
7. Keep all existing ARIA attributes unchanged: `role="group"`, `aria-label="Language switcher"`, `aria-pressed={...}`.
8. Keep the existing `className` prop passthrough and `cn()` utility usage.

**Interface contract** -- the component's public API does not change:

```typescript
interface LocaleToggleProps {
  className?: string;
}
export function LocaleToggle({ className }: LocaleToggleProps): JSX.Element;
```

**Key implementation detail** -- deriving the visible locales:

The component should compute visible locales like this (pseudocode, not full implementation):

```
const currentLang = i18n.language;
const visibleLocales = currentLang === 'en'
  ? ['en']
  : ['en', currentLang];
```

This ensures only the paired English + active language are shown, matching the dual-language architecture described in the spec.

**No tRPC mutation here** -- the LocaleToggle is a lightweight UI control. Persisting the preference to the DB is handled by the Settings page (section-11) and the Welcome picker (section-09). The toggle only changes the runtime language and localStorage cache.

## Files to Create

### `apps/web/client/src/components/__tests__/LocaleToggle.i18n.test.tsx`

Test file for the updated component.

**Test setup requirements:**
- Mock `react-i18next` with a controllable `i18n` object that has `language` and `changeLanguage` properties.
- Import `LANGUAGE_LABELS` from `@shared/i18n` (or mock it).
- Use `@testing-library/react` for rendering and user interactions.

**Test cases (from TDD plan section 4.6):**

```
Test: renders current language and English options
  - Set i18n.language = 'th'
  - Render <LocaleToggle />
  - Assert two buttons are visible: one with text from LANGUAGE_LABELS['en'], one with text from LANGUAGE_LABELS['th']

Test: clicking Thai option calls i18next.changeLanguage('th')
  - Set i18n.language = 'en' initially, then render with visible locales including 'th'
  - Note: when language is 'en', only one button shows. This test should set language to 'th' first,
    then click the English button, verifying changeLanguage('en') is called.
  - Alternative: test that clicking the non-active button calls changeLanguage with the correct code.

Test: clicking English option calls i18next.changeLanguage('en')
  - Set i18n.language = 'th'
  - Click the English button
  - Assert changeLanguage was called with 'en'

Test: has correct ARIA attributes (role, aria-label, aria-pressed)
  - Set i18n.language = 'th'
  - Render <LocaleToggle />
  - Assert container has role="group" and aria-label="Language switcher"
  - Assert active language button has aria-pressed="true"
  - Assert inactive language button has aria-pressed="false"

Test: active language button has primary styling
  - Set i18n.language = 'th'
  - Render <LocaleToggle />
  - Assert the Thai button has the "bg-primary" class
  - Assert the English button has the "text-muted-foreground" class

Test: renders only English button when language is 'en'
  - Set i18n.language = 'en'
  - Render <LocaleToggle />
  - Assert only one button is visible (English)

Test: passes className prop to container element
  - Render <LocaleToggle className="custom-class" />
  - Assert container div has "custom-class"
```

**Mock pattern for react-i18next:**

```typescript
const mockChangeLanguage = vi.fn();
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: {
      language: 'th', // override per test
      changeLanguage: mockChangeLanguage,
    },
    t: (key: string) => key,
  }),
}));
```

## Consumer Impact

The following files import `LocaleToggle` and require zero changes (the component's props interface is unchanged):

| File | Usage |
|------|-------|
| `apps/web/client/src/pages/Dashboard.tsx` | 3 usages with various `className` props |
| `apps/web/client/src/pages/Teams.tsx` | 2 usages in header area |

Existing test mocks for `LocaleToggle` (e.g., in `Dashboard.test.tsx` which mocks it as a simple div) continue working because the mock replaces the entire module.

## Interaction with Other Sections

- **section-06-backward-compat**: After this section, `LocaleToggle` no longer uses the legacy `useI18n()` hook. It goes directly through `react-i18next`. The backward-compat wrapper exists only for the other 13 consumer files that still use `useI18n()`.
- **section-09-welcome-picker**: The `WelcomeLanguagePicker` also calls `i18next.changeLanguage()`. Both components use the same underlying mechanism.
- **section-11-settings-language**: The Settings page language dropdown also calls `i18next.changeLanguage()` and additionally fires a tRPC mutation to persist the preference to the DB.
- **section-12-wave1-nav-auth**: May place the `LocaleToggle` in additional header/nav locations during Wave 1 migration.

## Styling Notes

The existing pill toggle styling must be preserved exactly:

- Container: `inline-flex items-center rounded-full border bg-background/80 p-1 text-xs shadow-sm`
- Active button: `rounded-full px-3 py-1 font-medium bg-primary text-primary-foreground`
- Inactive button: `rounded-full px-3 py-1 font-medium text-muted-foreground hover:bg-muted hover:text-foreground`

The `cn()` utility from `@/lib/utils` continues to be used for class merging.

## Validation Checklist

After implementation, verify:

1. `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- --run LocaleToggle` -- all new tests pass.
2. `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check` -- no TypeScript errors in `LocaleToggle.tsx`.
3. The component renders correctly in Dashboard and Teams pages (manual or integration test).
4. Clicking the toggle changes the displayed language without page reload.
5. The component does not import anything from `@/lib/i18n` (fully migrated to new system).

## Implementation Notes (Actual)

**Files modified:**
- `apps/web/client/src/components/LocaleToggle.tsx` — replaced useI18n with useTranslation; added SUPPORTED_LANGUAGES normalization guard

**Files created:**
- `apps/web/client/src/components/__tests__/LocaleToggle.i18n.test.tsx` (11 tests)

**Code review fixes:**
- MEDIUM: Normalized `i18n.language` against SUPPORTED_LANGUAGES (guards en-US browser codes)
- MEDIUM: Fixed test Thai label finder from "ภาษาไทย" → title attribute "ไทย"
- LOW: Added styling-class tests (bg-primary, text-muted-foreground)
- LOW: Added BCP-47 subtag test (zh-Hans) and unsupported locale test (en-US → single button)