Now I have all the context needed. Let me produce the section content.

# Section 02 -- i18n Core Module

## Section ID
`section-02-i18n-core`

## Depends On
- **section-01-shared-config** -- provides `apps/web/shared/i18n.ts` exporting `SUPPORTED_LANGUAGES`, `RTL_LANGUAGES`, `LANGUAGE_LABELS`, `LANGUAGE_COVERAGE`, and the `vendor-i18n` Vite chunk. Also installs `i18next`, `react-i18next`, `i18next-resources-to-backend` packages.

## Blocks
- **section-03-loader-detector** -- needs the initialized i18next instance and config exports
- **section-04-namespace-preloader** -- needs `ALL_NAMESPACES`, `STARTUP_NAMESPACES` from config
- **section-05-app-integration** -- needs the `i18nReady` promise and i18next instance

## Overview

This section creates four files under `apps/web/client/src/i18n/`:

| File | Purpose |
|------|---------|
| `config.ts` | Re-exports shared constants, defines namespace lists, `DEFAULT_LANGUAGE` |
| `index.ts` | i18next initialization with `resources-to-backend`, 3-second timeout, failure recovery |
| `types.ts` | TypeScript helper types for namespaces and translation keys |
| `formatters.ts` | `Intl.*`-based locale-aware date/number/currency/relativeTime formatters |

All files live at absolute path `/home/dev/projects/SmartSpecPro/apps/web/client/src/i18n/`.

---

## Files to Create

### 1. `apps/web/client/src/i18n/config.ts`

**Purpose**: Central configuration for the i18n system on the client side. Imports the shared constants from `@shared/i18n` (section-01) and adds client-specific namespace configuration.

**Exports**:

```ts
// Re-exported from @shared/i18n (section-01)
export { SUPPORTED_LANGUAGES, RTL_LANGUAGES, LANGUAGE_LABELS, LANGUAGE_COVERAGE } from "@shared/i18n";

// Client-specific
export const DEFAULT_LANGUAGE = "en" as const;

export const STARTUP_NAMESPACES = ["common", "nav", "auth", "errors"] as const;

export const ALL_NAMESPACES = [
  "common", "nav", "auth", "errors",
  "dashboard", "chat", "agency", "presentation",
  "media", "marketplace", "workflow", "profile",
  "settings", "billing", "admin", "social", "help",
] as const;
```

**Implementation guidance**:
- Add a security comment at the top: `// Translation values MUST be plain text only. No HTML markup. See spec Security Requirements S1.`
- `STARTUP_NAMESPACES` must be a strict subset of `ALL_NAMESPACES` (enforced by tests).
- `ALL_NAMESPACES` is 17 entries. Both are `as const` readonly tuples.
- Type-derive `Namespace = typeof ALL_NAMESPACES[number]` for use in `types.ts`.

### 2. `apps/web/client/src/i18n/index.ts`

**Purpose**: Initialize `i18next` with the `resources-to-backend` plugin, a placeholder backend loader (section-03 will supply the real loader), custom language detector (section-03 will supply the real one), and export the instance + a ready promise.

**Exports**:

```ts
export { default as i18n } from "i18next";  // The configured instance
export const i18nReady: Promise<void>;       // Resolves when init completes (or times out)
```

**Initialization logic** (docstring-level, not full implementation):

1. Import `i18next`, `initReactI18next` from `react-i18next`, `resourcesToBackend` from `i18next-resources-to-backend`.
2. Import `DEFAULT_LANGUAGE`, `STARTUP_NAMESPACES` from `./config`.
3. Call `i18next.use(initReactI18next).use(resourcesToBackend(...)).init({...})` with:
   - `fallbackLng: DEFAULT_LANGUAGE`
   - `defaultNS: 'common'`
   - `ns: [...STARTUP_NAMESPACES]`
   - `partialBundledLanguages: true`
   - `interpolation: { escapeValue: false }` (React handles XSS escaping)
   - `react: { useSuspense: true }`
4. The `resourcesToBackend` callback receives `(language, namespace, callback)`. For now, use a placeholder that calls the glob-based loader. Section-03 will provide the real `loadNamespace` function -- use a dynamic import or direct import of `./loader` to avoid circular dependencies.
5. Wrap `i18next.init()` in `Promise.race([initPromise, timeoutPromise(3000)])`.
6. On timeout or rejection: log `console.error("i18n init failed, proceeding in English-only mode")`. Resolve the `i18nReady` promise regardless (never reject it).
7. Export `i18nReady` as a promise that always resolves, even on failure. This allows `App.tsx` (section-05) to `await i18nReady` before mounting.

**Key constraints**:
- i18next must be initialized at module-level (top-level await or IIFE). The `i18nReady` promise captures the result.
- On init failure, `i18next.t('anyKey')` returns the key string itself -- this is acceptable degraded behavior.
- Never throw from this module. The app must mount regardless.

### 3. `apps/web/client/src/i18n/types.ts`

**Purpose**: TypeScript helper types derived from the config constants.

**Exports**:

```ts
import type { ALL_NAMESPACES } from "./config";

/** Union type of all namespace identifiers */
export type Namespace = typeof ALL_NAMESPACES[number];

/** Type-safe translation function signature */
export type TFunction = (key: string, params?: Record<string, string | number>) => string;

/** Language code from the supported set */
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];
```

**Implementation guidance**:
- Keep this file types-only (no runtime code) for tree-shaking.
- Import `SUPPORTED_LANGUAGES` type from `@shared/i18n` or from `./config`.

### 4. `apps/web/client/src/i18n/formatters.ts`

**Purpose**: Locale-aware formatting functions using browser `Intl` APIs, reading the current language from `i18next.language`.

**Exports**:

```ts
export function formatDate(date: Date | number, options?: Intl.DateTimeFormatOptions, lng?: string): string;
export function formatNumber(num: number, options?: Intl.NumberFormatOptions, lng?: string): string;
export function formatCurrency(amount: number, currency: string, lng?: string): string;
export function formatRelativeTime(date: Date | number, lng?: string): string;
```

**Implementation guidance**:
- Each function reads `lng ?? i18next.language` as the locale for `Intl.*` constructors.
- `formatCurrency` uses `Intl.NumberFormat` with `style: 'currency'` and the provided currency code.
- `formatRelativeTime` computes the difference from `Date.now()` and selects the appropriate unit (seconds, minutes, hours, days, months, years) for `Intl.RelativeTimeFormat`.
- Import `i18next` from `i18next` (the package), not from `./index.ts`, to avoid circular dependency. Access `i18next.language` at call time, not at import time.
- All functions should handle invalid dates gracefully (return empty string or the input stringified).

---

## Tests (TDD)

### Test File: `apps/web/client/src/i18n/__tests__/config.test.ts`

```
# Test: SUPPORTED_LANGUAGES contains 'en' and 'th'
# Test: SUPPORTED_LANGUAGES length matches expected count (19)
# Test: STARTUP_NAMESPACES are a subset of ALL_NAMESPACES
# Test: DEFAULT_LANGUAGE is 'en'
# Test: RTL_LANGUAGES contains 'ar'
# Test: LANGUAGE_LABELS has an entry for every SUPPORTED_LANGUAGES member
# Test: LANGUAGE_COVERAGE has an entry for every SUPPORTED_LANGUAGES member
# Test: All language codes are lowercase or use valid BCP-47 format (e.g., zh-Hans, pt-BR)
# Test: ALL_NAMESPACES has exactly 17 entries
# Test: STARTUP_NAMESPACES has exactly 4 entries
```

**Test approach**: Direct import and assertion. No mocks needed. These are pure data tests.

### Test File: `apps/web/client/src/i18n/__tests__/init.test.ts`

```
# Test: i18next initializes with fallbackLng 'en'
# Test: i18next initializes with defaultNS 'common'
# Test: i18next loads STARTUP_NAMESPACES on init
# Test: i18next has escapeValue set to false
# Test: i18next uses Suspense (react.useSuspense = true)
# Test: init timeout -- if init takes >3s, i18nReady still resolves
# Test: init failure -- if backend rejects, t('key') returns key string
# Test: i18nReady promise resolves even on init failure
# Test: i18next uses custom language detector (verified via i18next.services.languageDetector)
```

**Test approach**: 
- Mock `i18next-resources-to-backend` to provide instant or delayed responses.
- For timeout test: mock the backend to never resolve, use `vi.useFakeTimers()` to advance past 3 seconds, assert `i18nReady` resolves.
- For failure test: mock the backend to reject, assert `i18nReady` still resolves and `i18next.t('any.key')` returns `'any.key'`.
- Access `i18next.options` after init to verify config values.

### Test File: `apps/web/client/src/i18n/__tests__/formatters.test.ts`

```
# Test: formatDate returns English-formatted date when locale is 'en'
# Test: formatDate returns Thai-formatted date when locale is 'th'
# Test: formatNumber formats with Thai digit grouping when locale is 'th'
# Test: formatCurrency formats USD correctly
# Test: formatCurrency formats THB correctly
# Test: formatRelativeTime returns relative string (e.g., "2 days ago")
# Test: formatters accept optional lng override parameter
# Test: formatDate handles invalid date gracefully
```

**Test approach**:
- Mock `i18next.language` via `vi.mock('i18next', ...)` returning an object with a configurable `language` property.
- Use `Intl` APIs directly in assertions to verify output matches expected locale formatting.
- For relative time tests: use `vi.useFakeTimers()` to control `Date.now()`.

---

## Interface Contracts

### Consumed from section-01 (`apps/web/shared/i18n.ts`)

```ts
export const SUPPORTED_LANGUAGES: readonly ["en", "th", "ja", "ar", "zh-Hans", "zh-Hant", "ko", "vi", "id", "hi", "es", "pt-BR", "fr", "de", "ru", "it", "tr", "nl", "pl"];
export const RTL_LANGUAGES: readonly ["ar"];
export const LANGUAGE_LABELS: Record<string, string>;
export const LANGUAGE_COVERAGE: Record<string, number>;
```

### Provided to downstream sections

- **`i18n/config.ts`** exports `DEFAULT_LANGUAGE`, `STARTUP_NAMESPACES`, `ALL_NAMESPACES` (used by sections 03, 04, 05)
- **`i18n/index.ts`** exports `i18n` instance and `i18nReady` promise (used by sections 03, 05, 06)
- **`i18n/types.ts`** exports `Namespace`, `SupportedLanguage`, `TFunction` types (used by sections 03, 04, 06)
- **`i18n/formatters.ts`** exports formatting functions (used by section 12, 13 and beyond)

---

## Implementation Notes

1. **Circular dependency avoidance**: `formatters.ts` must import `i18next` from the package (`'i18next'`), not from `./index.ts`. The `index.ts` file performs initialization side effects at import time; other modules should not depend on its import order.

2. **resourcesToBackend placeholder**: In `index.ts`, the backend callback for `resourcesToBackend` should dynamically import `./loader.ts` (section-03) to avoid a hard dependency. Until section-03 is implemented, use a minimal stub that resolves with an empty object `{}`. The stub should be clearly marked with a `// TODO: section-03 provides real loader` comment.

3. **No runtime validation in config.ts**: The config file exports static data. Runtime validation of language codes happens in the language detector (section-03) and server allowlist (section-07).

4. **i18next version compatibility**: The project uses `react-i18next` which requires i18next v23+. The `useSuspense: true` option triggers React Suspense boundaries when namespaces are loading, which integrates with the `<Suspense>` wrapper added in section-05.

5. **formatRelativeTime unit selection**: Use a simple cascade: if diff < 60s use seconds, < 60m use minutes, < 24h use hours, < 30d use days, < 12mo use months, else years. This avoids pulling in a date library.