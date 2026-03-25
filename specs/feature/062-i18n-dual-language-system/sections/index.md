<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-shared-config
section-02-i18n-core
section-03-loader-detector
section-04-namespace-preloader
section-05-app-integration
section-06-backward-compat
section-07-server-allowlist
section-08-locale-files
section-09-welcome-picker
section-10-locale-toggle
section-11-settings-language
section-12-wave1-nav-auth
section-13-wave1-dashboard-common
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-shared-config | - | 02, 03, 07 | Yes |
| section-02-i18n-core | 01 | 03, 04, 05 | No |
| section-03-loader-detector | 01, 02 | 05 | No |
| section-04-namespace-preloader | 02 | 05 | Yes (with 03) |
| section-05-app-integration | 02, 03, 04 | 06, 08, 09, 10 | No |
| section-06-backward-compat | 05 | 12, 13 | Yes |
| section-07-server-allowlist | 01 | 09, 11 | Yes (with 02-06) |
| section-08-locale-files | 05 | 12, 13 | Yes |
| section-09-welcome-picker | 05, 07 | - | Yes (with 08) |
| section-10-locale-toggle | 05 | 12 | Yes (with 08, 09) |
| section-11-settings-language | 07 | - | Yes (with 08-10) |
| section-12-wave1-nav-auth | 06, 08, 10 | - | Yes (with 13) |
| section-13-wave1-dashboard-common | 06, 08 | - | Yes (with 12) |

## Execution Order

1. **Batch 1**: section-01-shared-config (foundation — no dependencies)
2. **Batch 2**: section-02-i18n-core (requires 01)
3. **Batch 3**: section-03-loader-detector, section-04-namespace-preloader (parallel, both require 02)
4. **Batch 4**: section-05-app-integration (requires 02, 03, 04)
5. **Batch 5**: section-06-backward-compat, section-07-server-allowlist, section-08-locale-files, section-09-welcome-picker, section-10-locale-toggle, section-11-settings-language (parallel — independent after 05/07)
6. **Batch 6**: section-12-wave1-nav-auth, section-13-wave1-dashboard-common (parallel — final wave)

## Section Summaries

### section-01-shared-config
Create `apps/web/shared/i18n.ts` with `SUPPORTED_LANGUAGES` tuple, `RTL_LANGUAGES`, `LANGUAGE_LABELS`, and `LANGUAGE_COVERAGE` maps. Single source of truth shared by client and server. Install `i18next`, `react-i18next`, `i18next-resources-to-backend` packages. Add `vendor-i18n` manual chunk to `vite.config.ts`.

### section-02-i18n-core
Create `i18n/config.ts` (imports from shared, exports STARTUP_NAMESPACES, ALL_NAMESPACES, DEFAULT_LANGUAGE), `i18n/index.ts` (i18next initialization with resources-to-backend plugin, 3-second timeout, failure recovery), `i18n/types.ts` (TypeScript helpers), and `i18n/formatters.ts` (Intl-based date/number/currency formatters).

### section-03-loader-detector
Create `i18n/loader.ts` (import.meta.glob loader with in-flight dedup Map) and `i18n/languageDetector.ts` (custom i18next LanguageDetectorModule: localStorage → browser → 'en' fallback, with SUPPORTED_LANGUAGES allowlist validation).

### section-04-namespace-preloader
Create `i18n/namespaces.ts` (ROUTE_NAMESPACES map from path prefixes to namespace arrays) and `i18n/useNamespacePreloader.ts` (hook using wouter's useLocation() to preload namespaces on route change, parallel with React.lazy chunk loading).

### section-05-app-integration
Modify `App.tsx`: replace `<I18nProvider>` with `<I18nextProvider>`, add `useNamespacePreloader()` in Router, replace `<Suspense fallback={null}>` with skeleton fallback. Wire DB preference sync after auth. Await `i18nReady` before mounting React tree.

### section-06-backward-compat
Update `lib/i18n/context.tsx`: rewrite `useI18n()` to delegate to `useTranslation(['help', 'common', 'admin'])`. Make `I18nProvider` a passthrough. Update `lib/i18n/index.ts` barrel exports to re-export from new i18n system. Verify all 13 existing consumer files work without changes.

### section-07-server-allowlist
Modify `apps/web/server/routers/users.ts`: change `translationLanguage` from `z.string().max(10)` to `z.enum(SUPPORTED_LANGUAGES)`. Import from `shared/i18n.ts`. Add tests validating accept/reject behavior.

### section-08-locale-files
Create all 17 English namespace JSON files (`locales/en/*.json`). Migrate existing `locales/en.ts` → `locales/en/help.json` and `locales/th.ts` → `locales/th/help.json` (strip TypeScript wrapper, convert to JSON, remove `help.` key prefix). Create partial Thai startup namespace files (`th/common.json`, `th/nav.json`, `th/auth.json`, `th/errors.json`). Add locale file validation tests.

### section-09-welcome-picker
Create `WelcomeLanguagePicker.tsx` component: Radix Dialog modal, shown on first authenticated render when no preference is set, filters languages by ≥50% coverage, calls `i18next.changeLanguage()` + tRPC mutation + localStorage on selection, "Continue with English" always available, sets `smartspec_locale_chosen` flag.

### section-10-locale-toggle
Update `components/LocaleToggle.tsx`: replace `useI18n()` with `useTranslation()` + `i18next.changeLanguage()`, show only en + selected language, place in main header nav. Keep existing ARIA attributes.

### section-11-settings-language
Add "Display Language" dropdown to existing settings/profile page. Lists SUPPORTED_LANGUAGES filtered by coverage. On change: `i18next.changeLanguage()` + tRPC mutation + localStorage update. Shows native name + English name per option.

### section-12-wave1-nav-auth
Wave 1 migration: extract hardcoded strings from navigation components (sidebar, header, breadcrumbs) into `nav` namespace keys. Extract auth page strings (login, register, MFA, password reset) into `auth` namespace keys. Replace with `useTranslation('nav')` and `useTranslation('auth')` calls. Add Thai translations for extracted keys.

### section-13-wave1-dashboard-common
Wave 1 migration: extract dashboard page strings into `dashboard` namespace. Extract common UI strings (buttons, toasts, confirmations, pagination, empty states) into `common` namespace. Extract error messages (404, 500, validation) into `errors` namespace. Replace with `t()` calls. Add Thai translations for extracted keys.
