# Section 05 Code Review Interview

**Section**: section-05-app-integration
**Verdict**: CONDITIONAL PASS → PASS after fixes

## Auto-Fixes Applied

### 1. localStorage setItem try/catch (MEDIUM)
`hooks/useLanguageSync.ts` — Wrapped `localStorage.setItem` in try/catch to handle `QuotaExceededError` in private/full storage. Language still applied to i18next even if persistence fails.

### 2. Use resolvedLanguage for comparison (MEDIUM)
`hooks/useLanguageSync.ts` — Changed `i18n.language === dbLang` to use `i18n.resolvedLanguage ?? i18n.language` to handle region-variant mismatch (e.g., browser sets "en-US" but DB stores "en"). Prevents unnecessary `changeLanguage` calls on every auth.

### 3. Type cast improvement (HIGH)
`hooks/useLanguageSync.ts` — Changed `(prefs as Record<string, unknown>).translationLanguage` to `(prefs as { translationLanguage?: string }).translationLanguage` for a more precise cast that reflects the actual expected field.

### 4. aria-hidden on RouteLoadingSkeleton (LOW)
`components/RouteLoadingSkeleton.tsx` — Added `aria-hidden="true"` and `role="presentation"` to prevent screen readers from announcing pulse divs as empty regions during loading.

### 5. Null guard for root element (LOW)
`main.tsx` — Added null guard: `const rootEl = document.getElementById("root"); if (!rootEl) return;` to prevent unhandled promise rejection if DOM element is absent (SSR/test environments).

## Let Go

### i18nReady timeout race (HIGH from reviewer)
Section-02 already implements the i18nReady promise with a 3-second timeout. The "race" (init callbacks firing post-mount) is existing behavior that section-05 doesn't introduce. Fixing it requires changes to section-02 which is already committed.

### I18nextProvider inside ErrorBoundary (MEDIUM from reviewer)
The spec diagram explicitly shows: `ErrorBoundary > HelmetProvider > I18nextProvider`. This matches the current implementation. Changing it would deviate from the spec. The reviewer's concern about error fallback needing translations is valid but out of scope for this section.

### Missing full `<App />` rendering tests (MEDIUM from reviewer)
Rendering `<App />` in tests requires mocking tRPC provider, React Query, all contexts, and wouter. The 5 existing App.i18n tests cover the same behaviors (I18nextProvider works, Suspense fallback shows, English fallback works) without the brittleness of a full App render test. The spec's intent is met.
