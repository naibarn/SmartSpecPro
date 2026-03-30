# TDD Plan: i18n Dual-Language System (Feature 062)

Testing framework: **Vitest** (existing setup in `apps/web/vitest.config.ts`)
Test environment: `node` (default), `jsdom` for `client/src/**/*.test.tsx`
Setup file: `client/src/test-setup.ts` (mocks ResizeObserver, matchMedia, adds jest-dom matchers)
Existing i18n mock pattern: `vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: ... }) }))`

---

## 2. File Structure

No tests needed — directory structure is verified by loader tests.

---

## 3. Core Infrastructure (Wave 0)

### 3.1 Package Installation
No tests — verified by build/typecheck.

### 3.2 Configuration Module (`i18n/config.ts`)

```
Test file: client/src/i18n/__tests__/config.test.ts

# Test: SUPPORTED_LANGUAGES contains 'en' and 'th'
# Test: SUPPORTED_LANGUAGES length matches expected count (19)
# Test: STARTUP_NAMESPACES are a subset of ALL_NAMESPACES
# Test: DEFAULT_LANGUAGE is 'en'
# Test: RTL_LANGUAGES contains 'ar'
# Test: LANGUAGE_LABELS has an entry for every SUPPORTED_LANGUAGES member
# Test: LANGUAGE_COVERAGE has an entry for every SUPPORTED_LANGUAGES member
# Test: All language codes are lowercase or use valid BCP-47 format (e.g., zh-Hans, pt-BR)
```

### 3.3 Locale Loader (`i18n/loader.ts`)

```
Test file: client/src/i18n/__tests__/loader.test.ts

# Test: loadNamespace returns resolved promise for existing en/common
# Test: loadNamespace returns resolved promise (no-op) for non-existent locale file
# Test: loadNamespace calls i18next.addResourceBundle with correct args
# Test: loadNamespace skips fetch if i18next.hasResourceBundle returns true
# Test: concurrent calls to loadNamespace for same lng/ns only trigger one fetch
# Test: concurrent calls to loadNamespace for different lng/ns trigger parallel fetches
# Test: inFlight map is cleaned up after promise resolves
# Test: inFlight map is cleaned up after promise rejects
# Test: loadNamespace with invalid lng (not in glob) returns without error
```

### 3.4 Language Detector (`i18n/languageDetector.ts`)

```
Test file: client/src/i18n/__tests__/languageDetector.test.ts

# Test: detects 'th' from localStorage when smartspec_locale='th'
# Test: detects 'en' from localStorage when smartspec_locale='en'
# Test: ignores invalid localStorage values (returns undefined, triggers next detector)
# Test: ignores path traversal attempts in localStorage ('../../etc/passwd')
# Test: ignores script injection attempts in localStorage ('<script>')
# Test: maps navigator.language 'th-TH' to 'th'
# Test: maps navigator.language 'zh' to 'zh-Hans'
# Test: maps navigator.language 'pt-BR' to 'pt-BR'
# Test: falls back to 'en' when navigator.language is unsupported
# Test: cacheUserLanguage writes to localStorage
# Test: cacheUserLanguage only writes valid language codes
```

### 3.5 i18next Initialization (`i18n/index.ts`)

```
Test file: client/src/i18n/__tests__/init.test.ts

# Test: i18next initializes with fallbackLng 'en'
# Test: i18next initializes with defaultNS 'common'
# Test: i18next loads STARTUP_NAMESPACES on init
# Test: i18next uses custom language detector
# Test: i18next has escapeValue set to false
# Test: i18next uses Suspense (react.useSuspense = true)
# Test: init timeout: if init takes >3s, app still proceeds
# Test: init failure: if backend rejects, t('key') returns key string
# Test: i18nReady promise resolves even on init failure
```

### 3.6 Route-to-Namespace Map (`i18n/namespaces.ts`)

```
Test file: client/src/i18n/__tests__/namespaces.test.ts

# Test: /chat maps to ['chat'] namespace
# Test: /agencies/123/edit maps to ['agency'] namespace
# Test: /admin/providers maps to ['admin'] namespace
# Test: /social/inbox maps to ['social'] namespace
# Test: /unknown-path returns no match (undefined)
# Test: / (root) returns no match (startup namespaces handle it)
# Test: every namespace in ROUTE_NAMESPACES is in ALL_NAMESPACES
```

### 3.7 Namespace Preloader Hook (`i18n/useNamespacePreloader.ts`)

```
Test file: client/src/i18n/__tests__/useNamespacePreloader.test.tsx

# Test: calls i18next.loadNamespaces when location changes to /chat
# Test: loads namespaces for both current language and 'en'
# Test: does not call loadNamespaces for unmatched routes
# Test: calls loadNamespaces again when location changes from /chat to /agencies
# Test: does not reload namespaces for same route (location stays /chat)
```

### 3.8 App.tsx Modifications

```
Test file: client/src/__tests__/App.i18n.test.tsx

# Test: App renders without crashing with i18next provider
# Test: i18next provider is present in component tree
# Test: useNamespacePreloader is active (mock and verify calls)
# Test: Suspense fallback renders during namespace loading
# Test: App renders English text when no Thai translation exists (fallback)
```

### 3.9 Backward Compatibility Wrapper

```
Test file: client/src/lib/i18n/__tests__/backwardCompat.test.tsx

# Test: useI18n().t('help.title') returns English value
# Test: useI18n().t('help.title') returns Thai value when locale is 'th'
# Test: useI18n().locale returns current i18next language
# Test: useI18n().setLocale('th') calls i18next.changeLanguage('th')
# Test: useI18n().t('missing.key') returns key string (fallback)
# Test: useI18n().t('key', { name: 'Alice' }) interpolates correctly
# Test: I18nProvider renders children without error (passthrough)
```

### 3.10 Vite Configuration
No unit tests — verified by build output inspection.

### 3.11 Server-Side Language Allowlist

```
Test file: server/routers/__tests__/users.i18n.test.ts

# Test: updatePreferences accepts translationLanguage='th'
# Test: updatePreferences accepts translationLanguage='ja'
# Test: updatePreferences rejects translationLanguage='invalid'
# Test: updatePreferences rejects translationLanguage='<script>'
# Test: updatePreferences accepts translationLanguage=undefined (optional)
```

### 3.12 Locale File Migration

```
Test file: client/src/i18n/__tests__/localeFiles.test.ts

# Test: en/help.json contains all keys from original en.ts
# Test: th/help.json contains all keys from original th.ts
# Test: en/common.json is valid JSON with string values
# Test: en/nav.json is valid JSON with string values
# Test: en/auth.json is valid JSON with string values
# Test: en/errors.json is valid JSON with string values
# Test: every key in th/*.json exists in corresponding en/*.json
# Test: no empty string values in en/*.json
```

### 3.13 Welcome Language Picker

```
Test file: client/src/components/__tests__/WelcomeLanguagePicker.test.tsx

# Test: renders modal when user has no language preference
# Test: does not render when user already has language preference
# Test: does not render when localStorage has smartspec_locale_chosen=true
# Test: shows only languages with ≥50% coverage
# Test: always shows "Continue with English" option
# Test: selecting Thai calls i18next.changeLanguage('th')
# Test: selecting Thai updates localStorage
# Test: selecting Thai fires tRPC mutation
# Test: dismissing modal defaults to English
# Test: sets smartspec_locale_chosen in localStorage after selection
```

### 3.14 Formatters (`i18n/formatters.ts`)

```
Test file: client/src/i18n/__tests__/formatters.test.ts

# Test: formatDate returns English-formatted date when locale is 'en'
# Test: formatDate returns Thai-formatted date when locale is 'th'
# Test: formatNumber formats with Thai digit grouping when locale is 'th'
# Test: formatCurrency formats USD correctly
# Test: formatCurrency formats THB correctly
# Test: formatRelativeTime returns "2 days ago" style string
# Test: formatters accept optional lng override parameter
```

---

## 4. Core UI Migration (Wave 1)

### 4.1–4.5 Navigation, Auth, Dashboard, Common, Errors

```
Test approach: Snapshot + key presence tests per namespace

Test file: client/src/i18n/__tests__/wave1-keys.test.ts

# Test: en/nav.json has required keys (home, chat, agencies, workflows, settings, ...)
# Test: en/auth.json has required keys (signIn.title, signIn.emailLabel, signIn.submitButton, ...)
# Test: en/dashboard.json has required keys (welcome, sections, quickActions, ...)
# Test: en/common.json has required keys (save, cancel, delete, edit, loading, search, ...)
# Test: en/errors.json has required keys (notFound, serverError, networkError, ...)
# Test: all Wave 1 namespace files are valid JSON
# Test: no Wave 1 key has empty string value in en
```

### 4.6 Language Switcher in Header

```
Test file: client/src/components/__tests__/LocaleToggle.i18n.test.tsx

# Test: renders current language and English options
# Test: clicking Thai option calls i18next.changeLanguage('th')
# Test: clicking English option calls i18next.changeLanguage('en')
# Test: has correct ARIA attributes (role, aria-label, aria-pressed)
# Test: active language button has primary styling
```

### 4.7 Settings Page Integration

```
Test file: client/src/pages/__tests__/Settings.i18n.test.tsx

# Test: settings page shows Display Language dropdown
# Test: dropdown lists supported languages with coverage filter
# Test: changing language calls i18next.changeLanguage
# Test: changing language fires tRPC mutation
```

---

## 5. Feature Migration (Waves 2–3)

```
Test approach per wave: key presence validation

# Test: each new namespace file is valid JSON
# Test: each new namespace file has all required keys for that feature
# Test: no duplicate keys within any namespace
# Test: all th/*.json keys exist in corresponding en/*.json
```

---

## 6. Hardening (Wave 4)

### 6.1 RTL Support

```
# Test: document.dir set to 'rtl' when language is 'ar'
# Test: document.dir set to 'ltr' when language is 'en'
# Test: document.dir reverts to 'ltr' when switching from 'ar' to 'en'
```

### 6.2 CI Validation

```
# Test: i18next-parser config extracts keys from t() calls in .tsx files
# Test: i18next-parser config extracts keys from <Trans> components
# Test: all en/*.json files pass JSON schema validation
# Test: no namespace exceeds 20 KB gzipped
```

### 6.4 Missing-Key Telemetry

```
# Test: missingKey handler fires for key not in any namespace
# Test: missingKey handler does not fire for key that exists in fallback (en)
# Test: telemetry is batched, not sent per-key
```

---

## Testing Conventions

- **File location**: Tests co-located in `__tests__/` directories next to source
- **Naming**: `{module}.test.ts` for unit, `{module}.test.tsx` for component tests
- **Mocking i18next**: Use `vi.mock('i18next')` and `vi.mock('react-i18next')` for unit tests; use real i18next instance with in-memory resources for integration tests
- **Component tests**: Use `@testing-library/react` with `renderWithProviders` pattern (wrap in I18nextProvider)
- **Locale file tests**: Direct JSON import validation — no mocking needed
