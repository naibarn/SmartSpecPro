# Implementation Plan: i18n Dual-Language System (Feature 062)

## 1. Overview

This plan implements internationalization for SmartSpecPro's web app using `i18next` + `react-i18next` with a dual-language, English-anchored architecture. English is always loaded; each user activates one additional language. Translations are split into 17 namespaces, lazy-loaded via Vite dynamic imports.

The implementation is organized into Wave 0 (infrastructure) through Wave 4 (hardening), with this plan covering Wave 0 and Wave 1 in detail. Waves 2–4 are defined at the architectural level for future implementation.

### Key Context

**Current state**: Custom i18n in `apps/web/client/src/lib/i18n/` — flat key→value dictionaries (1,067 keys en, 1,042 keys th) for help pages only. 13 consumer files use `useI18n()` hook. 95% of UI is hardcoded English.

**Target state**: i18next with 17 namespaces, lazy-loaded per route, 19 supported languages (en + th for Phase 1), welcome language picker, settings integration, LLM-assisted translation pipeline (Phase 2+).

**Technology stack**: `i18next`, `react-i18next`, `i18next-resources-to-backend` — loaded in a `vendor-i18n` Vite chunk.

---

## 2. File Structure

All new i18n files live under `apps/web/client/src/`:

```
i18n/
  index.ts                    # i18next initialization + failure recovery
  config.ts                   # SUPPORTED_LANGUAGES, NAMESPACES, STARTUP_NAMESPACES
  loader.ts                   # import.meta.glob loader with in-flight dedup
  languageDetector.ts         # DB → localStorage → browser → en
  namespaces.ts               # ROUTE_NAMESPACES map (pathPrefix → namespace[])
  useNamespacePreloader.ts    # Route-change hook calling i18next.loadNamespaces()
  formatters.ts               # Intl.* date/number/currency/relativeTime
  types.ts                    # TypeScript helpers (TypedNamespaces, etc.)
locales/
  en/
    common.json               # ~100 keys: buttons, labels, confirmations
    nav.json                  # ~30 keys: sidebar items, header
    auth.json                 # ~40 keys: login, register, MFA
    errors.json               # ~50 keys: validation, HTTP, generic
    dashboard.json            # Wave 1
    help.json                 # Migrated from locales/en.ts
    chat.json                 # Wave 2
    agency.json               # Wave 2
    presentation.json         # Wave 2
    media.json                # Wave 3
    marketplace.json          # Wave 3
    workflow.json             # Wave 3
    profile.json              # Wave 3
    settings.json             # Wave 3
    billing.json              # Wave 3
    admin.json                # Wave 3
    social.json               # Wave 3
  th/
    common.json               # Partial — startup keys at minimum
    nav.json                  # Partial
    auth.json                 # Partial
    errors.json               # Partial
    help.json                 # Migrated from locales/th.ts
    ...                       # Other namespaces added incrementally
```

---

## 3. Core Infrastructure (Wave 0)

### 3.1 Package Installation

Add to `apps/web/package.json`:
- `i18next` (core library)
- `react-i18next` (React bindings)
- `i18next-resources-to-backend` (Vite glob integration)

### 3.2 Configuration Module (`i18n/config.ts`)

Exports:
- `SUPPORTED_LANGUAGES`: Readonly tuple of all 19 language codes — single source of truth shared by client and server
- `STARTUP_NAMESPACES`: `['common', 'nav', 'auth', 'errors']`
- `ALL_NAMESPACES`: Full list of 17 namespace identifiers
- `DEFAULT_LANGUAGE`: `'en'`
- `RTL_LANGUAGES`: `['ar']` (for Phase 4 RTL support)
- `LANGUAGE_LABELS`: Map of language code → display name (e.g., `{ th: 'ไทย', ja: '日本語' }`)
- `LANGUAGE_COVERAGE`: Map of language code → coverage percentage (for welcome picker filtering)

Security comment at top of file: "Translation values MUST be plain text only. No HTML markup. See spec Security Requirements S1."

### 3.3 Locale Loader (`i18n/loader.ts`)

Uses `import.meta.glob('../locales/*/*.json')` to create a static manifest at build time. Each JSON file becomes a separate Vite chunk with content-hashed URL.

Core function `loadNamespace(lng: string, ns: string): Promise<void>`:
1. Check `i18next.hasResourceBundle(lng, ns)` — skip if already loaded
2. Check `inFlight` Map — deduplicate concurrent requests for same lng/ns
3. Look up loader function from glob manifest
4. If loader missing → return (fallback to English handled by i18next)
5. Execute loader, call `i18next.addResourceBundle(lng, ns, data, true, true)`
6. Clean up `inFlight` entry in `.finally()`

The `inFlight` Map prevents duplicate network requests when multiple components request the same namespace simultaneously.

### 3.4 Language Detector (`i18n/languageDetector.ts`)

Implements a custom i18next language detector plugin following the `LanguageDetectorModule` interface:

Detection order:
1. Read localStorage `smartspec_locale` → validate against `SUPPORTED_LANGUAGES` Set
2. If valid → return
3. Read `navigator.language` → map to supported set (e.g., `th-TH` → `th`, `zh` → `zh-Hans`)
4. If mapped → return
5. Default: `'en'`

The DB preference (`users.userPreferences.translationLanguage`) is NOT available at init time (requires auth). It is synced after login:
- On auth success: read DB preference → if different from current → call `i18next.changeLanguage()` + update localStorage
- This ensures DB preference takes priority once available, without blocking app init

Caching: When i18next calls `cacheUserLanguage(lng)`, write to localStorage.

### 3.5 i18next Initialization (`i18n/index.ts`)

Initialize i18next with:
- `fallbackLng: 'en'`
- `defaultNS: 'common'`
- `ns: STARTUP_NAMESPACES` (load these on init)
- `partialBundledLanguages: true` (required for lazy backend)
- `interpolation: { escapeValue: false }` (React handles escaping)
- `react: { useSuspense: true }`
- `i18next-resources-to-backend` plugin using the glob loader
- Custom language detector plugin

Init with 3-second timeout via `Promise.race()`. On timeout or rejection:
- Log error to console (and Sentry when available)
- i18next is still usable — `t('key')` returns the key string as fallback
- App mounts regardless — never white-screen

Export the initialized `i18next` instance and a `i18nReady` Promise for App.tsx to await.

### 3.6 Route-to-Namespace Map (`i18n/namespaces.ts`)

Export `ROUTE_NAMESPACES` array (imported by `useNamespacePreloader.ts`) mapping URL path prefixes to required namespace arrays:

```
/dashboard    → ['dashboard']
/chat         → ['chat']
/agencies     → ['agency']
/workflows    → ['workflow']
/media        → ['media']
/generate     → ['media']
/gallery      → ['media']
/marketplace  → ['marketplace']
/presentation → ['presentation']
/video-editor → ['presentation']
/social       → ['social']
/automation   → ['social']
/admin        → ['admin']
/domain-admin → ['settings']
/profile      → ['profile']
/settings     → ['settings']
/credits      → ['billing']
/usage        → ['billing']
/help         → ['help']
```

Match logic: first entry where `location.startsWith(pathPrefix)`.

### 3.7 Namespace Preloader Hook (`i18n/useNamespacePreloader.ts`)

Uses wouter's `useLocation()` to detect route changes. On each URL change:
1. Find matching entry in `ROUTE_NAMESPACES`
2. If match found, call `i18next.loadNamespaces(matchedNamespaces)` for both `i18next.language` and `'en'`
3. This is fire-and-forget — the actual rendering waits via `useTranslation` + Suspense

This hook is placed in the Router component to fire at the same moment wouter processes the route change and triggers `React.lazy` chunk loading — achieving true parallel loading of component code and translation data.

### 3.8 App.tsx Modifications

Changes to provider hierarchy:

1. Remove `<I18nProvider>` import from `lib/i18n`
2. Add `<I18nextProvider i18n={i18nInstance}>` at the same position in the tree (after HelmetProvider, before ThemeProvider)
3. Inside Router component, add `useNamespacePreloader()` call
4. Wrap Router's inner `<Switch>` with `<Suspense fallback={<RouteLoadingSkeleton />}>` — this catches both React.lazy suspensions AND i18next namespace loading suspensions
5. After AuthProvider resolves, sync DB language preference to i18next

The existing `<Suspense fallback={null}>` at line 191 is replaced with a proper skeleton to handle namespace loading delays gracefully.

### 3.9 Backward Compatibility Wrapper

Update `lib/i18n/context.tsx`:

The `useI18n()` hook is rewritten to delegate to `react-i18next`:
- Calls `useTranslation(['help', 'common', 'admin'])` (loads namespaces used by existing consumers — help pages use `help.*` keys, invite dashboard uses `invite.*` keys in `admin`, most others use `common`)
- Returns the same interface: `{ locale, setLocale, t, dict }`
- `locale` reads `i18n.language`
- `setLocale` calls `i18n.changeLanguage()`
- `t` delegates to i18next's `t()` function
- `dict` returns empty object (deprecated)

The `I18nProvider` component becomes a no-op passthrough (children only) since `I18nextProvider` handles context.

All 13 existing consumer files continue working without changes.

### 3.10 Vite Configuration

Add to `vite.config.ts` `manualChunks`:
```
if id contains 'node_modules/i18next/' or 'node_modules/react-i18next/'
  or 'node_modules/i18next-resources-to-backend/'
  → return 'vendor-i18n'
```

This separates ~22 kB gzipped of i18next code into a parallel-loadable chunk, keeping it off the critical rendering path.

### 3.11 Server-Side Language Allowlist

In `apps/web/server/routers/users.ts`, the `updatePreferences` mutation's `translationLanguage` field:

Change from `z.string().max(10).optional()` to `z.enum(SUPPORTED_LANGUAGES).optional()`.

The `SUPPORTED_LANGUAGES` tuple is defined in `apps/web/shared/i18n.ts` (a new file in the shared directory, importable by both client and server). Both `i18n/config.ts` and `server/routers/users.ts` import from this shared location — single source of truth.

This fix prevents arbitrary strings from reaching LLM prompts via `translation.ts` and is a blocking prerequisite.

### 3.12 Locale File Migration

Convert existing `locales/en.ts` (1,067 lines) and `locales/th.ts` (1,042 lines) to `locales/en/help.json` and `locales/th/help.json`:

- Strip TypeScript export wrapper
- Convert to JSON format
- Strip `help.` prefix from keys (the namespace provides the context)
- Verify all keys are present in both languages

Create initial startup namespace files:
- `en/common.json` — extract shared strings from existing codebase: "Save", "Cancel", "Delete", "Confirm", "Loading...", "Search...", etc.
- `en/nav.json` — extract sidebar items: "Home", "Chat", "Agencies", "Workflows", etc.
- `en/auth.json` — extract auth page strings: "Sign In", "Email", "Password", etc.
- `en/errors.json` — extract error messages: "Something went wrong", "Not found", etc.

For Thai: create partial files with same keys. Missing keys fall back to English automatically.

### 3.13 Welcome Language Picker

New component `WelcomeLanguagePicker.tsx`:

- Modal dialog (using existing Radix Dialog pattern)
- Shown on first authenticated route render when `!userPreferences.translationLanguage` and `!localStorage.getItem('smartspec_locale_chosen')`
- Lists languages filtered by `LANGUAGE_COVERAGE` ≥ 50%
- Each option shows: flag/icon, native name, English name, coverage percentage
- On selection: calls `i18next.changeLanguage(lng)`, updates localStorage, fires tRPC mutation to save preference
- Sets `localStorage('smartspec_locale_chosen') = 'true'` to prevent re-showing
- "Continue with English" option always available
- Dismissible — defaults to English if closed without selection
- Offline resilience: if namespace loading fails during picker display, show options but note "some languages may show English text until translations load"

### 3.14 Formatters (`i18n/formatters.ts`)

Centralized locale-aware formatting using browser `Intl` APIs:

- `formatDate(date, options?)` — uses `Intl.DateTimeFormat` with active language
- `formatNumber(num, options?)` — uses `Intl.NumberFormat`
- `formatCurrency(amount, currency)` — uses `Intl.NumberFormat` with currency style
- `formatRelativeTime(date)` — uses `Intl.RelativeTimeFormat`

Each function reads the current language from `i18next.language` as default locale. All accept an optional `lng` override parameter.

---

## 4. Core UI Migration (Wave 1)

Wave 1 migrates ~500 English strings to `t()` calls across the highest-impact areas.

### 4.1 Navigation (nav namespace)

Extract strings from sidebar and header components:
- All sidebar menu items (Home, Chat, Agencies, Workflows, Media Studio, etc.)
- Header elements (search placeholder, user menu items, notifications label)
- Breadcrumb labels
- Mobile menu items

Replace hardcoded strings with `t('nav.xxx')` calls using `useTranslation('nav')`.

### 4.2 Auth Pages (auth namespace)

Migrate all auth-related pages:
- Login page: title, email/password labels, submit button, "forgot password" link, OAuth buttons
- Register page: form labels, validation messages, terms acceptance
- Password reset: instructions, form labels, success/error messages
- MFA page: code input label, instructions, backup code option
- Auth callback: loading/error states

### 4.3 Dashboard (dashboard namespace)

Migrate the main dashboard page:
- Welcome message, section titles
- Card labels, stat descriptions
- Quick action buttons
- Empty state messages

### 4.4 Common UI (common namespace)

Extract widely-used strings that appear across multiple pages:
- Button labels: Save, Cancel, Delete, Edit, Create, Close, Back, Next, Submit, Confirm
- Form labels: Search, Filter, Sort, Required, Optional
- Status labels: Loading, Error, Success, Pending, Active, Inactive
- Confirmation dialogs: "Are you sure?", "This action cannot be undone"
- Toast messages: generic success/error patterns
- Pagination: "Showing X of Y", "Page", "Previous", "Next"
- Empty states: "No items found", "Nothing here yet"
- File actions: Upload, Download, Export, Import

### 4.5 Error Messages (errors namespace)

Migrate error-related strings:
- HTTP error pages: 404, 403, 500
- Validation messages: required field, invalid email, password too short
- Network errors: "Connection lost", "Request failed"
- Generic: "Something went wrong", "Please try again"

### 4.6 Language Switcher in Header

Update `LocaleToggle.tsx` to use i18next:
- Replace `useI18n()` with `useTranslation()` + `i18next.changeLanguage()`
- Read available languages from `SUPPORTED_LANGUAGES` config
- Show only 2 options: English + user's selected language
- Place in main header (always visible) in addition to existing help page locations

### 4.7 Settings Page Integration

Add "Display Language" dropdown to existing settings/profile page:
- Use `SUPPORTED_LANGUAGES` for options, filtered by coverage
- Show native name + English name for each option
- On change: call `i18next.changeLanguage()` + tRPC mutation + localStorage update
- Current selection reflects `i18next.language`

---

## 5. Feature Migration (Waves 2–3)

### Wave 2: High-Traffic Features (~1,200 keys)

**Chat** (`chat` namespace):
- Chat input placeholder, send button, typing indicator
- Memory panel labels, orchestration card text
- Message actions (copy, edit, delete, retry)
- System messages, timestamps

**Agency** (`agency` namespace):
- Builder: node labels, tool names, validation messages
- Browser: card labels, filters, search
- Chat: agent names, status indicators

**Presentation** (`presentation` namespace):
- Editor toolbar labels, panel titles
- Document surface: slide labels, layout names
- Export dialog: format options, quality settings
- Video editor: timeline labels, preview controls

### Wave 3: Remaining Features (~1,500 keys)

Each feature gets its own namespace and is migrated independently:
- Media, Marketplace, Workflow, Profile, Settings, Billing, Admin (25+ pages), Social

After Wave 3, all `useI18n()` consumers should be migrated to `useTranslation()`. Remove the backward-compat wrapper.

---

## 6. Hardening (Wave 4)

### 6.1 RTL Support
- Detect RTL language via `RTL_LANGUAGES` config
- Set `document.dir = 'rtl'` on `<html>` when active language is RTL
- Audit CSS: replace `left/right` with logical properties (`inline-start/inline-end`)
- Verify: sidebar, modals, dropdowns, forms, tables, icons

### 6.2 CI Validation
- `i18next-parser` config for key extraction from `src/**/*.{ts,tsx}`
- JSON schema validation for all locale files
- Missing key report: compare each language against `en/*.json` (non-blocking)
- Duplicate key detection within namespaces
- Namespace size check: warn if > 20 kB gzipped
- Dynamic key construction detection: flag `t('key' + variable)` patterns

### 6.3 Translation Coverage
- Per-language, per-namespace coverage percentage
- Coverage metadata stored in `i18n/config.ts` `LANGUAGE_COVERAGE` map
- Updated by CI or manual script after translation merges
- Used by welcome picker to filter languages ≥ 50%

### 6.4 Missing-Key Telemetry
- Register `i18next.on('missingKey', (lng, ns, key) => ...)` handler
- In production: send telemetry events (batched, deduplicated per session)
- Enables data-driven translation prioritization

### 6.5 LLM-Assisted Translation
- Script: reads `en/*.json` → generates prompt per namespace → sends to LLM gateway → writes `{lng}/*.json`
- Prompt includes: context (namespace name, key patterns), existing translations for reference, glossary terms
- Output: draft translations marked as `_draft: true` in a sidecar metadata file
- Human review workflow: diff draft vs existing, approve/reject per key
- Integration: CLI command `pnpm i18n:translate --lang th --namespace chat`

---

## 7. Help System Alignment

The help system has two i18n layers that must coexist:

**Layer 1: UI Chrome** — page titles, search placeholder, "Topic not found", button labels
- Migrated to `locales/{lng}/help.json` namespace files
- Rendered via `t('search.placeholder')` in React components

**Layer 2: Content** — markdown files at `docs/help/{lng}/*.md`
- Stays as-is, served by `helpRouter` via `locale` parameter
- `HelpTopic.tsx` reads `i18n.language` and passes to tRPC query

**Alignment rules:**
- `helpRouter` procedures currently use `z.enum(["en", "th"])` — this must be widened to use `SUPPORTED_LANGUAGES` when Phase 2 languages are added
- Adding a new help language requires both JSON namespace file AND markdown content directory (or graceful server-side fallback to `en` when directory missing)

---

## 8. Performance Considerations

### Bundle Impact
- `vendor-i18n` chunk: ~22 kB gzipped (i18next + react-i18next + resources-to-backend)
- Startup namespaces: ~8.6 kB gzipped (4 ns × 2 languages)
- Total initial load overhead: ~30 kB gzipped (loaded in parallel, not blocking)

### Time-to-Interactive
- Expected regression: +200–400ms (startup namespace fetch before first render)
- Mitigated by: HTTP/2 parallel loading, 3-second timeout, `<Suspense>` with skeleton

### Route Transitions
- First visit to new route: +50–100ms (namespace fetch parallel with component chunk)
- Subsequent visits: 0ms (namespace cached in i18next store)
- `useNamespacePreloader` ensures parallel loading, not sequential

### Memory
- Power user (12 routes visited): ~288 KB in i18next store
- Acceptable for SPA — no eviction needed for Phase 1
- Optional: Wave 4 can add namespace eviction for routes not visited in 10 min

---

## 9. Security Checklist

| Concern | Mitigation |
|---------|------------|
| XSS via translations | Plain text only rule. No `dangerouslySetInnerHTML` with translated strings unless DOMPurify. |
| Path traversal in loader | `import.meta.glob` is build-time only — runtime lookups against fixed manifest. |
| localStorage poisoning | Strict `SUPPORTED_LANGUAGES` Set validation in detector. |
| User preference injection | Server-side `z.enum(SUPPORTED_LANGUAGES)` — blocks arbitrary strings from DB/LLM. |
| Sensitive data in locale files | Locale JSON is public static assets — never include API endpoints or system names. |
| RTL direction injection | Hardcoded `"rtl"/"ltr"` values only, never from user input. |

---

## 10. Migration Dependency Graph

```
Wave 0 (Infrastructure)
├── 0.1 Install packages
├── 0.2 i18n/config.ts (SUPPORTED_LANGUAGES, namespaces)
├── 0.3 i18n/loader.ts (glob + dedup)
├── 0.4 i18n/languageDetector.ts
├── 0.5 i18n/index.ts (init + failure recovery)  ← depends on 0.2, 0.3, 0.4
├── 0.6 i18n/namespaces.ts + useNamespacePreloader.ts
├── 0.7 i18n/formatters.ts
├── 0.8 i18n/types.ts
├── 0.9 Create locales/en/*.json (startup namespaces)
├── 0.10 Create locales/th/*.json (startup namespaces, partial)
├── 0.11 Migrate en.ts/th.ts → help.json  ← depends on 0.9
├── 0.12 App.tsx modifications  ← depends on 0.5, 0.6
├── 0.13 lib/i18n/context.tsx backward compat wrapper  ← depends on 0.5
├── 0.14 vite.config.ts vendor chunk
├── 0.15 server/routers/users.ts allowlist fix  ← depends on 0.2
├── 0.16 WelcomeLanguagePicker component  ← depends on 0.5
└── 0.17 LocaleToggle.tsx update  ← depends on 0.5

Wave 1 (Core UI)  ← depends on Wave 0 complete
├── 1.1 Navigation strings → nav namespace
├── 1.2 Auth pages → auth namespace
├── 1.3 Dashboard → dashboard namespace
├── 1.4 Common UI strings → common namespace
├── 1.5 Error messages → errors namespace
├── 1.6 Language switcher in header
└── 1.7 Settings page language dropdown
```

---

## 11. Rollback Strategy

If i18next introduces regressions:

1. **Quick rollback**: Revert App.tsx to use original `<I18nProvider>`, remove `i18next` from imports. The old `lib/i18n/context.tsx` still exists (not deleted until Wave 3).
2. **Partial rollback**: Keep i18next infrastructure but revert specific Wave 1 page migrations by restoring hardcoded strings.
3. **Feature flag**: Add `FEATURE_I18N_ENABLED` environment variable. If false, App.tsx uses original I18nProvider. Allows gradual rollout.
