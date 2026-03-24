# Section 06 Code Review Interview

**Section**: section-06-backward-compat
**Verdict**: CONDITIONAL PASS → PASS after fixes

## Auto-Fixes Applied

### 1. setLocale wrapped in useCallback (HIGH)
`lib/i18n/context.tsx` — Wrapped `setLocale` in `useCallback([i18n])` to prevent infinite re-render in consumers that place `setLocale` in a `useEffect` dependency array (regression vs old `useCallback([], [])` impl).

### 2. Runtime locale narrowing guard (MEDIUM)
`lib/i18n/context.tsx` — Replaced unsafe `as Locale` cast with:
```typescript
const locale: Locale = (AVAILABLE_LOCALES as readonly string[]).includes(rawLang)
  ? (rawLang as Locale) : DEFAULT_LOCALE;
```
Prevents silent bugs if resolvedLanguage contains a region variant like "en-US".

### 3. Extended namespace coverage (MEDIUM — discovered during triage)
`lib/i18n/context.tsx` — Replaced `["help", "common", "admin"]` with `[...ALL_NAMESPACES]` imported from `../../i18n/config`. Consumer audit revealed keys across: "chat", "teams", "workflows", "settings", "media", "dashboard" etc. Also fixed i18next v25 multi-ns behavior: passing `{ ns: [...ALL_NAMESPACES] }` explicitly in `t()` opts (v25 does NOT auto-search the useTranslation ns array for missing keys).

### 4. afterEach language reset (LOW)
`lib/i18n/__tests__/backwardCompat.test.tsx` — Moved language reset from inside each `it()` body to `afterEach()` to prevent cross-test state pollution on test failure.

## Let Go

### dict type annotation (LOW from reviewer)
`dict: {}` typed as `TranslationDictionary = Record<string, string>` — compatible. No current consumers read `.dict`, and adding a deprecation warning would be added complexity for a Phase 1 shim. Let go.
