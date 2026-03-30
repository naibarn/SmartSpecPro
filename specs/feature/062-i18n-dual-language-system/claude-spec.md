# Synthesized Specification: i18n Dual-Language System (Feature 062)

## What We're Building

A production-ready internationalization system for SmartSpecPro's web application that replaces the existing custom i18n with `i18next` + `react-i18next`. The system follows a **dual-language, English-anchored** model: English is always loaded as the canonical fallback, and each user activates exactly one additional language. Translations are split into 17 namespaces and lazy-loaded via Vite dynamic imports.

## Why

SmartSpecPro has a minimal custom i18n covering ~300 keys for help pages only. The remaining ~95% of the UI is hardcoded English. The platform targets Southeast Asian and global markets, requiring Thai as the first non-English language with architecture to support 19 languages without code changes.

The current system has no namespace splitting, no lazy loading, no pluralization, no RTL support, and no sync between the browser localStorage preference and the user profile DB field.

## Core Requirements

### R1: Dual-Language Runtime
- English (`en`) is **always** loaded and available as fallback
- Each user selects exactly one additional language (default: `th` for Phase 1)
- At runtime, only `en` + `selectedLanguage` are in memory
- Language toggle is instant when both are loaded

### R2: Namespace-Based Lazy Loading
- 17 namespaces split by feature domain
- 4 startup namespaces load before first render: `common`, `nav`, `auth`, `errors`
- 13 route namespaces load on route entry, parallel with React.lazy component chunk
- Vite `import.meta.glob` creates separate hashed chunks per JSON file

### R3: Language Detection Precedence
1. User profile (`users.userPreferences.translationLanguage`) — fetched on auth
2. localStorage (`smartspec_locale`) — fast bootstrap before DB available
3. Browser language (`navigator.language` mapped to supported set)
4. Default: `en`

### R4: Welcome Language Picker
- One-time modal on first login for new users
- Shows only languages with ≥50% translation coverage
- Sets preference in both DB and localStorage
- Dismissed permanently after selection

### R5: Language Settings
- "Display Language" dropdown added to existing user profile/settings page
- Changes both localStorage and DB preference via tRPC mutation
- No dedicated settings page — integrated into existing settings

### R6: Backward Compatibility
- Existing `useI18n()` hook continues working via wrapper around `useTranslation(['help', 'common'])`
- All 13 consumer files (Help, Teams, Orchestrator, Admin, Editor) remain functional
- Wrapper removed after all consumers migrated (Wave 3 completion gate)

### R7: Init Failure Recovery
- `i18next.init()` has 3-second timeout
- On failure: mount app in English-only mode, log to error monitoring
- Never white-screen the app

### R8: Security
- Language codes validated against strict allowlist (client + server)
- Server-side: `z.enum(SUPPORTED_LANGUAGES)` replaces `z.string().max(10)`
- Translation values: plain text only, no HTML
- `escapeValue: false` safe because React JSX escapes text nodes
- Locale files are public static assets — no sensitive data allowed

### R9: Help System Integration
- Two-layer i18n: UI chrome in `help.json` namespace + markdown content via `helpRouter`
- `helpRouter` locale enum widened from `["en", "th"]` to `SUPPORTED_LANGUAGES` when Phase 2 languages added
- Adding a new language requires both JSON namespace files and `docs/help/{lng}/` markdown (or graceful fallback to `en`)

### R10: AI-Assisted Translation (Phase 2+)
- Design workflow for LLM-generated translation drafts with human review
- Use existing LLM gateway (OpenRouter/Anthropic/OpenAI) for generation
- Add tooling in Wave 4: extraction → LLM translate → human review → merge

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Core library | `i18next` + `react-i18next` | Mature, Suspense support, namespace lazy-loading |
| Lazy backend | `i18next-resources-to-backend` | 0.5 kB gzipped, works with Vite `import.meta.glob` |
| Format | i18next native (not ICU) | Zero overhead, full features, sufficient for en/th |
| Route preload | `useNamespacePreloader` hook | Parallel chunk + namespace loading via `useLocation()` |
| Vendor chunk | `vendor-i18n` in vite.config.ts | Separate i18next from critical path |
| Key format | Flat dot-notation | Matches existing en.ts/th.ts pattern |
| Browser detection | Skip `i18next-browser-languagedetector` | Already have DB/localStorage; saves 3 kB |
| Key extraction | `i18next-parser` | Mature, full TSX support, CI integration |

## Namespace Map

| Namespace | Scope | Load Strategy |
|-----------|-------|---------------|
| `common` | Shared buttons, labels, confirmations, tooltips | Startup |
| `nav` | Sidebar, header, breadcrumbs | Startup |
| `auth` | Login, register, password reset, MFA | Startup |
| `errors` | Error messages, 404, 500, validation | Startup |
| `dashboard` | Dashboard page | Route `/dashboard` |
| `chat` | Chat, memory panel, orchestration | Route `/chat` |
| `agency` | Agency builder, browser, chat | Route `/agencies/*` |
| `presentation` | Editor, document surface, video editor, export | Route `/presentation*`, `/video-editor` |
| `media` | Media studio, gallery, generation | Route `/media*`, `/generate`, `/gallery` |
| `marketplace` | Marketplace templates, publishing | Route `/marketplace` |
| `workflow` | Workflow editor, node config | Route `/workflows/*` |
| `profile` | User profile, preferences | Route `/profile` |
| `settings` | App settings, tenant config, domain admin | Route `/settings/*`, `/domain-admin/*` |
| `billing` | Credits, plans, payment, usage | Route `/credits`, `/usage` |
| `admin` | All admin panels (25+ routes) | Route `/admin/*` |
| `social` | Social automation, publishing, moderation | Route `/social/*`, `/automation` |
| `help` | Help pages, documentation | Route `/help/*` |

Marketing pages (`/`, `/pricing`, `/features`, etc.) are out of scope for Phase 1.

## Rollout Waves

### Wave 0: Infrastructure
- Install dependencies, create i18n directory structure
- i18next initialization with `i18next-resources-to-backend`
- Namespace loader with in-flight deduplication
- Language detector (DB → localStorage → browser → en)
- `useNamespacePreloader` hook for route-level loading
- App.tsx: swap `<I18nProvider>` for `<I18nextProvider>`, add preloader
- Backward-compat `useI18n()` wrapper
- Vite vendor chunk for i18next
- Server-side language code allowlist fix
- Create startup namespace JSON files (common, nav, auth, errors) for en + th
- Migrate existing en.ts/th.ts to help.json namespace files
- Welcome language picker component

### Wave 1: Core UI Migration (~500 keys)
- Shared navigation (sidebar, header, breadcrumbs)
- Auth pages (login, register, callback, MFA)
- Dashboard page
- Common buttons, confirmations, toasts, error messages
- Language switcher in main header
- Display Language dropdown in settings page

### Wave 2: High-Traffic Features (~1,200 keys)
- Chat page + MemoryPanel + HybridOrchestrationCard
- Agency pages (Builder, Browser, Chat)
- Presentation editor + document surface

### Wave 3: Remaining Features (~1,500 keys)
- Media studio, Marketplace, Workflow editor
- Profile, Settings, Billing
- Social pages
- Remove `useI18n()` wrapper (all consumers migrated)

### Wave 4: Hardening
- RTL support for Arabic
- CI validation (missing keys, JSON validation, duplicates, namespace size)
- Translation coverage reports
- Missing-key telemetry in production
- `i18next-parser` extraction pipeline
- LLM-assisted translation tooling

## Performance Budget

| Metric | Target |
|--------|--------|
| i18next + react-i18next bundle | ~22 kB gzipped (in `vendor-i18n` chunk) |
| Startup namespaces (4 × 2 langs) | < 15 kB gzipped |
| TTI regression | +200–400ms (acceptable — startup namespaces must load before render) |
| Language toggle | < 50ms (already-loaded pair) |
| Route namespace load | < 200ms (first visit) |
| Init timeout | 3 seconds max |

## Target Languages

**Phase 1**: `en`, `th`
**Phase 2+** (JSON files only, no code changes): `ja`, `ar`, `zh-Hans`, `zh-Hant`, `ko`, `vi`, `id`, `hi`, `es`, `pt-BR`, `fr`, `de`, `ru`, `it`, `tr`, `nl`, `pl`

## Files to Create

| File | Purpose |
|------|---------|
| `i18n/index.ts` | i18next init + failure recovery |
| `i18n/config.ts` | `SUPPORTED_LANGUAGES` tuple, namespace list, security rules |
| `i18n/loader.ts` | `import.meta.glob` loader with in-flight dedup |
| `i18n/languageDetector.ts` | DB → localStorage → browser → en chain |
| `i18n/namespaces.ts` | `ROUTE_NAMESPACES` map |
| `i18n/useNamespacePreloader.ts` | Route-change preloader hook |
| `i18n/formatters.ts` | `Intl.*`-based date/number/currency formatters |
| `i18n/types.ts` | TypeScript type helpers |
| `locales/en/*.json` | 17 English namespace files |
| `locales/th/*.json` | Thai namespace files (partial — startup + help at minimum) |
| `components/WelcomeLanguagePicker.tsx` | First-login language selection modal |

## Files to Modify

| File | Change |
|------|--------|
| `package.json` | Add `i18next`, `react-i18next`, `i18next-resources-to-backend` |
| `App.tsx` | Swap provider, add preloader, add welcome picker |
| `vite.config.ts` | Add `vendor-i18n` manual chunk |
| `lib/i18n/context.tsx` | Backward-compat wrapper |
| `components/LocaleToggle.tsx` | Use `i18next.changeLanguage()` |
| `server/routers/users.ts` | Fix `translationLanguage` to `z.enum(SUPPORTED_LANGUAGES)` |
| Settings page | Add Display Language dropdown |
