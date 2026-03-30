# Section 06 -- Backward Compatibility Wrapper

## Overview

This section rewrites the legacy `lib/i18n/` module so that every existing consumer of `useI18n()`, `I18nProvider`, `AVAILABLE_LOCALES`, `LOCALE_LABELS`, and the `Locale` type continues to work without any code changes. The old custom i18n is replaced with thin wrappers delegating to `react-i18next`.

**Depends on**: section-05-app-integration
**Blocks**: section-12, section-13

## Consumer Inventory (All Files Importing from `@/lib/i18n`)

| # | File | Imports Used |
|---|------|-------------|
| 1 | `App.tsx` | `I18nProvider` |
| 2 | `components/LocaleToggle.tsx` | `useI18n`, `AVAILABLE_LOCALES`, `LOCALE_LABELS` |
| 3 | `components/help/HelpPanel.tsx` | `useI18n`, `AVAILABLE_LOCALES`, `LOCALE_LABELS`, `Locale` |
| 4 | `components/chat/ChatHelpDialog.tsx` | `useI18n`, `AVAILABLE_LOCALES`, `LOCALE_LABELS`, `Locale` |
| 5 | `components/browser-session/BrowserSessionHelpDialog.tsx` | `useI18n`, `AVAILABLE_LOCALES`, `LOCALE_LABELS`, `Locale` |
| 6 | `components/admin/InviteCodeDashboard.tsx` | `useI18n` |
| 7 | `components/editor/ConflictResolutionDialog.tsx` | `useI18n` |
| 8 | `components/orchestrator/RunMonitorPanel.tsx` | `useI18n` |
| 9 | `components/orchestrator/TeamRoomView.tsx` | `useI18n` |
| 10 | `components/orchestrator/RoomWorkflowPanel.tsx` | `useI18n` |
| 11 | `pages/Help.tsx` | `useI18n`, `AVAILABLE_LOCALES`, `LOCALE_LABELS`, `Locale` |
| 12 | `pages/HelpTopic.tsx` | `useI18n`, `AVAILABLE_LOCALES`, `LOCALE_LABELS`, `Locale` |
| 13 | `pages/Teams.tsx` | `useI18n` |
| 14 | `pages/Chat.tsx` | `useI18n` |
| 15 | `pages/Workflows.tsx` | `useI18n` |
| 16 | `pages/Dashboard.tsx` | `useI18n` |

**Note**: Verify at implementation time with `grep -r "from.*@/lib/i18n" apps/web/client/src/` — there may be additional consumers not captured here.

## Files to Modify

### 1. `apps/web/client/src/lib/i18n/context.tsx`

**Rewrite `useI18n()`:**
- Call `useTranslation(['help', 'common', 'admin'])` — these three namespaces cover all keys used by existing consumers (help pages use `help.*`, invite dashboard uses `admin.*` keys, shared buttons in `common`)
- Return the same `I18nContextValue` interface:
  - `locale`: read `i18n.language`, cast to `Locale`
  - `setLocale(locale)`: call `i18n.changeLanguage(locale)` + `localStorage.setItem('smartspec_locale', locale)`
  - `t(key, params?)`: delegate to i18next's `t()` function (supports `{{param}}` interpolation natively)
  - `dict`: return `{}` (deprecated, no consumer iterates it at runtime)

**Rewrite `I18nProvider`:**
- Becomes passthrough: `({ children }) => <>{children}</>`
- Remove all `useState`, `useMemo`, `useCallback`, `I18nContext`
- Remove import of `getLocale` from `./locales`

**Do NOT delete any exports.** Function signatures and return types stay the same.

### 2. `apps/web/client/src/lib/i18n/types.ts`

- `Locale`: keep as `"en" | "th"` for Phase 1 backward compat
- `AVAILABLE_LOCALES`: keep as `["en", "th"]`
- `LOCALE_LABELS`: keep as `{ en: "English", th: "ไทย" }`
- `DEFAULT_LOCALE`: keep as `"en"`
- `TranslationDictionary`, `LocaleMap`: keep unchanged

### 3. `apps/web/client/src/lib/i18n/index.ts`

Keep all existing exports unchanged: `I18nProvider`, `useI18n`, `AVAILABLE_LOCALES`, `DEFAULT_LOCALE`, `LOCALE_LABELS`, `Locale`, `TranslationDictionary`.

## Key Implementation Notes

### Namespace mapping for backward compat

Existing consumers use flat dot-notation keys like `help.title`. In i18next, `useTranslation(['help', 'common', 'admin'])` tells i18next to search across these namespaces. The key `help.title` resolves by searching `help` namespace first (where it exists as a flat key in `help.json`).

For Phase 1, `help.json` retains the full dotted key (e.g., `"help.title": "Help Center"`) to avoid key remapping in consumer code. Section-08 handles the actual key structure.

### Interpolation compatibility

The existing `t()` uses `{{param}}` syntax. i18next uses the same default syntax, so all existing interpolation call sites work without changes.

### localStorage sync

`setLocale` must write to `localStorage("smartspec_locale")` after `i18n.changeLanguage()` because the language detector (section-03) reads it on cold start.

### Removal timeline

After Wave 3 (all consumers migrated to `useTranslation` directly), delete entire `lib/i18n/` directory. Until then, do NOT add new consumers of `useI18n()`.

## Tests

### Test file: `apps/web/client/src/lib/i18n/__tests__/backwardCompat.test.tsx`

Use a real i18next instance with in-memory resources, wrapped in `<I18nextProvider>`.

```
# Test: useI18n().t('help.title') returns English value from help namespace
# Test: useI18n().t('help.title') returns Thai value when language is 'th'
# Test: useI18n().locale returns current i18next language
# Test: useI18n().setLocale('th') calls i18next.changeLanguage('th')
# Test: useI18n().setLocale('th') writes to localStorage
# Test: useI18n().t('missing.key') returns key string (fallback)
# Test: useI18n().t('greeting', { name: 'Alice' }) interpolates correctly
# Test: useI18n().dict returns empty object
# Test: I18nProvider renders children without error (passthrough)
# Test: nested I18nProviders work without error
```

### Test file: `apps/web/client/src/lib/i18n/__tests__/exportsCompat.test.ts`

```
# Test: index.ts exports I18nProvider as a function
# Test: index.ts exports useI18n as a function
# Test: index.ts exports AVAILABLE_LOCALES with 'en' and 'th'
# Test: index.ts exports LOCALE_LABELS with 'en' and 'th' keys
# Test: index.ts exports DEFAULT_LOCALE as 'en'
```

### Existing tests that must pass unchanged

- `pages/__tests__/Teams.test.tsx` — mocks `useI18n` via `vi.mock`
- `components/editor/ConflictResolutionDialog.test.tsx` — mocks `useI18n`
- `components/browser-session/__tests__/*.test.tsx` — wraps with `I18nProvider`
- `components/chat/__tests__/*.test.tsx` — wraps with `I18nProvider`

## Verification Checklist

1. [x] `pnpm test` passes — all existing tests still work
2. [x] `pnpm check` passes — no TypeScript errors
3. [x] Grep `from "@/lib/i18n"` or `from '@/lib/i18n'` — all consumer files compile without changes
4. Manual: Help page displays translations correctly
5. Manual: LocaleToggle switches en/th correctly

## Implementation Notes (Actual vs Planned)

**Deviations from plan:**
- Namespace list extended from `["help", "common", "admin"]` to `[...ALL_NAMESPACES]` — consumer audit revealed keys across "chat", "teams", "workflows", "settings", etc.
- i18next v25 does NOT auto-search the useTranslation ns array for missing keys — must pass `{ ns: [...ALL_NAMESPACES] }` explicitly in `t()` options
- Added `useCallback` for `setLocale` to prevent infinite re-render regression
- Added runtime locale narrowing guard (no unsafe `as Locale` cast)
- Added `afterEach` cleanup in tests for cross-test isolation

**Files modified:**
- `apps/web/client/src/lib/i18n/context.tsx` — rewritten shim

**Files created:**
- `apps/web/client/src/lib/i18n/__tests__/backwardCompat.test.tsx` (10 tests)
- `apps/web/client/src/lib/i18n/__tests__/exportsCompat.test.ts` (5 tests)
