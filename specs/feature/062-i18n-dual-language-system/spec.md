# Feature 062: i18n Dual-Language System

## Overview

Internationalization (i18n) for SmartSpecPro web app using a **dual-language, English-anchored architecture**. English is always loaded as canonical fallback; each user activates exactly one additional language. Translations are split by namespace and lazy-loaded via Vite dynamic imports. The system replaces the existing lightweight custom i18n (`lib/i18n/`) with `i18next` + `react-i18next` while preserving the existing `en`/`th` translation data.

## Problem Statement

### Current State
SmartSpecPro has a minimal custom i18n implementation:
- **Location**: `apps/web/client/src/lib/i18n/`
- **Coverage**: ~300 keys for help pages and dialogs only
- **Languages**: `en` and `th` hardcoded
- **Architecture**: Flat key→value dictionaries loaded synchronously
- **Storage**: `localStorage("smartspec_locale")`, not synced with user profile DB field (`users.userPreferences.translationLanguage`)
- **Switcher**: `LocaleToggle.tsx` — appears in help/modal contexts only, NOT in main navigation

### Problems
1. **No namespace splitting** — all translations in a single file per language; every page loads all keys
2. **No lazy loading** — locale data is bundled into the initial JS payload
3. **Limited to 2 languages** — adding new languages requires code changes, not just JSON files
4. **No fallback chain** — missing key shows empty string, not English
5. **No interpolation engine** — custom `{{var}}` replacement lacks pluralization, date formatting, nesting
6. **No RTL support** — Arabic/Hebrew would break layout
7. **User profile not synced** — DB field `userPreferences.translationLanguage` exists but is ignored by i18n context
8. **~95% of UI is hardcoded English** — only help pages use `t()`, all other pages have inline English strings

### Scale of Migration
Based on codebase exploration:
- **100+ route components** in `App.tsx` (lazy-loaded via `React.lazy`)
- **Major page directories**: `pages/`, `components/chat/`, `components/agency/`, `components/editor/`, `components/library/`
- **Admin pages**: 10+ admin panels with dense form labels
- **Estimated extractable strings**: 3,000–5,000 keys across all features

## Architecture

### Technology Choice

**Use `i18next` + `react-i18next`** — do NOT extend the custom i18n engine.

Rationale:
- Mature namespace + fallback + lazy-loading support
- Pluralization rules for all target languages (Thai, Japanese, Arabic, CJK)
- ICU MessageFormat interpolation
- React Suspense integration for async namespace loading
- Active ecosystem with extraction tools (`i18next-parser`)
- The existing custom system would need to be rewritten to match this feature set

### Dual-Language Runtime Model

```
┌─────────────────────────────────────────────┐
│  App Bootstrap                              │
│  1. Read preference: DB → localStorage → en │
│  2. Load: en/common + en/nav + en/auth      │
│  3. Load: th/common + th/nav + th/auth      │
│  4. Render app                              │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  Route Change → /presentation               │
│  1. Load: en/presentation (if not cached)   │
│  2. Load: th/presentation (if not cached)   │
│  3. Render route                            │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  Language Toggle: th → en                   │
│  1. i18next.changeLanguage('en')            │
│  2. Instant — en already loaded             │
│  3. No page reload, no data refetch         │
└─────────────────────────────────────────────┘
```

At runtime, only **2 languages** are in memory:
- `en` (always)
- `selectedLanguage` (user's choice — defaults to `th` for Phase 1)

### Namespace Strategy

Split translations by feature domain, matching existing route structure:

| Namespace | Scope | Startup? |
|-----------|-------|----------|
| `common` | Shared UI: buttons, labels, confirmations, tooltips | Yes |
| `nav` | Sidebar, header, breadcrumbs | Yes |
| `auth` | Login, register, password reset, MFA | Yes |
| `errors` | Error messages, 404, 500, validation | Yes |
| `dashboard` | Dashboard page | Route |
| `chat` | Chat page, memory panel, orchestration | Route |
| `agency` | Agency builder, browser, chat | Route |
| `presentation` | Editor, document surface, export | Route |
| `media` | Media studio, gallery, generation | Route |
| `marketplace` | Marketplace templates, publishing | Route |
| `workflow` | Workflow editor, node config | Route |
| `profile` | User profile, preferences | Route |
| `settings` | App settings, tenant config | Route |
| `billing` | Credits, plans, payment | Route |
| `admin` | All admin panels (LLM providers, queues, flags, etc.) | Route |
| `social` | Social automation, publishing, moderation | Route |
| `help` | Help pages, documentation (migrate existing keys) | Route |

**Startup namespaces** (`common`, `nav`, `auth`, `errors`) load before first render.
**Route namespaces** load when the route is entered (parallel with component lazy-load).

### File Structure

```
apps/web/client/src/
  i18n/
    index.ts              # i18next init + export
    config.ts             # Supported languages, namespace list, defaults
    loader.ts             # Vite dynamic import loader
    languageDetector.ts   # DB → localStorage → browser → en fallback
    namespaces.ts         # Namespace constants + route→namespace map
    types.ts              # TypedTranslation generic types
  locales/
    en/
      common.json
      nav.json
      auth.json
      errors.json
      dashboard.json
      chat.json
      agency.json
      presentation.json
      media.json
      marketplace.json
      workflow.json
      profile.json
      settings.json
      billing.json
      admin.json
      social.json
      help.json           # ← migrated from existing lib/i18n/locales/en.ts
    th/
      common.json
      nav.json
      auth.json
      help.json           # ← migrated from existing lib/i18n/locales/th.ts
      ...                 # other namespaces added incrementally
    ja/
      ...                 # future — partial OK, falls back to en
    ar/
      ...
```

### Loading Strategy (Vite)

```ts
// loader.ts
const localeModules = import.meta.glob('../locales/*/*.json');

export async function loadNamespace(lng: string, ns: string): Promise<void> {
  const key = `../locales/${lng}/${ns}.json`;
  const loader = localeModules[key];
  if (!loader) return; // missing locale file → en fallback
  const mod = await loader();
  i18next.addResourceBundle(lng, ns, mod.default, true, true);
}
```

Vite splits each JSON into a separate chunk — no bundling of unused locales.

### Language Detection Precedence

1. **User profile** (`users.userPreferences.translationLanguage`) — fetched on auth
2. **localStorage** (`smartspec_locale`) — fast bootstrap before profile loads
3. **Browser language** (`navigator.language` mapped to supported set)
4. **Default**: `en`

On login: sync DB preference → localStorage.
On language change: update both localStorage AND DB (via tRPC mutation).

### User Profile Sync

Existing DB field to use:
```ts
// drizzle/schema.ts — users table
userPreferences: json("userPreferences").$type<{
  translationLanguage?: string;  // ← use this field
  // ...other existing fields
}>()
```

No schema migration needed — the field already exists.

## Affected Systems

### Files to Create
| File | Purpose |
|------|---------|
| `apps/web/client/src/i18n/index.ts` | i18next initialization + init failure recovery |
| `apps/web/client/src/i18n/config.ts` | Supported languages, namespace list, security rules |
| `apps/web/client/src/i18n/loader.ts` | Vite dynamic import loader with in-flight dedup |
| `apps/web/client/src/i18n/languageDetector.ts` | Detection chain with allowlist validation |
| `apps/web/client/src/i18n/namespaces.ts` | Namespace constants + route→namespace map |
| `apps/web/client/src/i18n/useNamespacePreloader.ts` | Route-change preloader hook (parallel loading) |
| `apps/web/client/src/i18n/formatters.ts` | Locale-aware date/number/currency formatters |
| `apps/web/client/src/i18n/types.ts` | TypeScript type helpers |
| `apps/web/client/src/locales/en/*.json` | English namespace files (17) |
| `apps/web/client/src/locales/th/*.json` | Thai namespace files (partial) |

### Files to Modify
| File | Change |
|------|--------|
| `apps/web/package.json` | Add `i18next`, `react-i18next` dependencies |
| `apps/web/client/src/App.tsx` | Replace `<I18nProvider>` with `<I18nextProvider>`, add `<Suspense>`, add `useNamespacePreloader()` |
| `apps/web/client/src/lib/i18n/context.tsx` | Deprecate → wrapper around `useTranslation(['help', 'common'])` for backward compat |
| `apps/web/client/src/components/LocaleToggle.tsx` | Update to use i18next `changeLanguage()` |
| `apps/web/server/routers/users.ts` | Fix `translationLanguage` validation: `z.string().max(10)` → `z.enum(SUPPORTED_LANGUAGES)` |
| `apps/web/vite.config.ts` | Add `vendor-i18n` manual chunk for i18next libs |
| `apps/web/server/routers/help.ts` | Widen locale enum when Phase 2 languages added |
| All migrated page/component files | Replace hardcoded English strings with `t()` calls |

### Files to Remove (after migration complete)
| File | Reason |
|------|--------|
| `apps/web/client/src/lib/i18n/locales/en.ts` | Migrated to `locales/en/help.json` |
| `apps/web/client/src/lib/i18n/locales/th.ts` | Migrated to `locales/th/help.json` |
| `apps/web/client/src/lib/i18n/locales/index.ts` | Replaced by i18next loader |

## Target Languages

### Phase 1 (architecture + first pair)
- `en` (canonical — always complete)
- `th` (first paired language — validates non-Latin script)

### Phase 2+ (incremental, no code changes needed)
Add JSON files only:
`ja`, `ar`, `zh-Hans`, `zh-Hant`, `ko`, `vi`, `id`, `hi`, `es`, `pt-BR`, `fr`, `de`, `ru`, `it`, `tr`, `nl`, `pl`

## UI/UX Design

### Language Switcher
**Location**: Main header/navigation bar (always visible)

Format: pill toggle showing active pair only
```
[ ไทย | English ]
```

- Only shows 2 options: selected language + English
- If user's selected language IS English: show single "English" (no toggle needed)
- Future: settings page to change the paired language

### Dual-Display Rules
**Do NOT** render bilingual labels across the entire UI.

**Allowed** dual-display (secondary English hint) only for:
- Legal/billing labels
- AI action descriptions with irreversible consequences
- Permission/role names in admin panels
- Onboarding glossary terms

Pattern: main text in display language, small `(English term)` tooltip on hover.

### RTL Support (Phase 4)
When `ar` is active:
- Set `document.dir = "rtl"` on `<html>`
- Use CSS logical properties (`margin-inline-start` not `margin-left`)
- Mirror sidebar position
- Verify navigation, modals, dropdowns, forms, tables

## Rollout Plan

### Wave 0: Infrastructure (no visible changes)
- Install `i18next` + `react-i18next`
- Create `i18n/` directory with init, config, loader, detector
- Create `locales/en/` with startup namespaces (`common`, `nav`, `auth`, `errors`)
- Create `locales/th/` with startup namespaces (partial OK)
- Wire `<I18nextProvider>` in `App.tsx`
- Backward-compatible: existing `useI18n()` wraps new system
- Sync `userPreferences.translationLanguage` ↔ localStorage ↔ i18next

### Wave 1: Core UI Migration
- Migrate shared navigation (sidebar, header, breadcrumbs)
- Migrate auth pages (login, register, callback, MFA)
- Migrate dashboard page
- Migrate common buttons, confirmations, toasts, error messages
- Add language switcher to main header
- **Estimated keys**: ~500

### Wave 2: High-Traffic Features
- Migrate Chat page + MemoryPanel + HybridOrchestrationCard
- Migrate Agency pages (Builder, Browser, Chat)
- Migrate presentation editor + document surface
- **Estimated keys**: ~1,200

### Wave 3: Remaining Features
- Migrate Media studio
- Migrate Marketplace
- Migrate Workflow editor
- Migrate profile/settings/billing
- Migrate Social pages
- **Estimated keys**: ~1,500

### Wave 4: Hardening
- RTL support for Arabic
- CI validation (missing keys, invalid JSON, duplicates)
- Translation coverage report per language per namespace
- Missing-key telemetry in production
- `i18next-parser` extraction pipeline

## Translation Key Design

### Format
Stable semantic keys grouped by namespace:

```json
// en/nav.json
{
  "home": "Home",
  "chat": "Chat",
  "agencies": "Agencies",
  "workflows": "Workflows",
  "settings": "Settings"
}

// en/auth.json
{
  "signIn": {
    "title": "Sign In",
    "emailLabel": "Email",
    "passwordLabel": "Password",
    "submitButton": "Sign In",
    "forgotPassword": "Forgot Password?"
  }
}
```

### Rules
- Keys MUST be stable (never rename without migration)
- Keys MUST NOT encode layout (`leftButton`, `topLabel`)
- Keys MUST use interpolation, NOT concatenation: `"welcome": "Hello, {{name}}"` not `t('hello') + name`
- Pluralization via ICU: `"items": "{{count}} item", "items_plural": "{{count}} items"`
- Nesting allowed: `"signIn.title"` or `{"signIn": {"title": "..."}}`

## Fallback Rules

| Scenario | Behavior |
|----------|----------|
| Missing key in `th` | Render English value |
| Missing namespace file for `th` | Load English namespace, continue |
| Locale JSON fails to load (network) | Render English, log error, retry on next toggle/route |
| Unknown language code | Default to `en` |
| Missing key in `en` | Render key path as-is (development indicator) |

## Performance Requirements

### Must NOT
- Bundle all languages into initial JS payload
- Eagerly load all namespaces on startup
- Block route transitions waiting for unrelated namespaces
- Render bilingual UI everywhere

### Must DO
- Load only `en` + `selectedLanguage` at runtime
- Load only namespaces required by active route
- Reuse already-loaded resources from i18next store (no re-fetch)
- Keep startup namespaces under 4 (`common`, `nav`, `auth`, `errors`)

### Targets
- i18n overhead on initial load: < 15 KB gzipped (startup namespaces for 2 languages)
- Language toggle latency: < 50ms (already-loaded pair)
- Route namespace load: < 200ms (new namespace fetch)

## Formatting Utilities

Provide centralized locale-aware formatters:

```ts
// i18n/formatters.ts
export function formatDate(date: Date, lng?: string): string;
export function formatNumber(num: number, lng?: string): string;
export function formatCurrency(amount: number, currency: string, lng?: string): string;
export function formatRelativeTime(date: Date, lng?: string): string;
```

These use `Intl.DateTimeFormat`, `Intl.NumberFormat`, `Intl.RelativeTimeFormat` with the active display language locale.

## Testing Strategy

### Unit Tests
- i18next initialization with correct config
- i18next init failure → app still mounts in English-only mode
- i18next init timeout (3s) → app mounts with partial resources
- Namespace loader returns correct data for valid/invalid paths
- Namespace loader deduplicates concurrent requests for same `lng/ns`
- Language detector follows precedence (DB → localStorage → browser → en)
- Language detector rejects invalid localStorage values (path traversal, XSS attempts)
- Fallback: missing `th` key returns `en` value
- Fallback: missing namespace file doesn't crash
- Backward-compat `useI18n().t('help.title')` returns correct value after migration
- `useNamespacePreloader` triggers `loadNamespace` on route change
- Language toggle during pending namespace fetch shows English until loaded

### Integration Tests
- Language toggle updates all visible text
- Route change loads correct namespace (parallel with component chunk)
- User profile sync persists language to DB
- App bootstrap with localStorage `th` but DB preference `ja` — localStorage used initially, syncs to DB value after auth
- Help page renders correctly: UI chrome from `help.json`, content from `docs/help/{lng}/*.md`
- All four startup namespaces loaded before first render (not after)

### CI Validation
- `i18next-parser` extracts keys from source → compares with `en/*.json`
- JSON schema validation on all locale files
- Missing key report (non-blocking — other languages may be incomplete)
- Detect dynamic key construction (`t('errors.' + code)`) — flag for manual review
- Namespace size check: warn if any single namespace > 20 KB gzipped
- Duplicate key detection within namespaces

## Backward Compatibility

### Migration Path for Existing `useI18n()`
During Wave 0, the existing `useI18n()` hook will be updated to delegate to `react-i18next`:

```ts
// lib/i18n/context.tsx (updated, not deleted yet)
export function useI18n() {
  const { t, i18n } = useTranslation();
  return {
    locale: i18n.language as Locale,
    setLocale: (lng: Locale) => i18n.changeLanguage(lng),
    t: (key: string, params?: Record<string, string>) => t(key, params),
    dict: {} // deprecated — consumers should use t() only
  };
}
```

Existing `t('help.xxx')` calls continue working because `help.json` namespace is loaded when `useI18n` is used on help pages.

After all consumers are migrated to `useTranslation()` directly, remove the wrapper (Wave 4).

## Explicit Non-Goals

- Simultaneous display of all supported languages
- 100% translation completeness before shipping
- Machine translation at runtime
- Localization of AI-generated content
- Server-side localized emails or PDF exports (Phase 1)
- Per-region legal copy management
- Multilingual search indexing

## Acceptance Criteria

Phase 1 is complete when:
1. `i18next` + `react-i18next` are initialized with namespace-based lazy loading
2. English is always available as fallback for any missing key
3. A user can select Thai as additional language and toggle instantly
4. Locale files are split by namespace and loaded lazily via Vite dynamic imports
5. Startup payload includes only `common` + `nav` + `auth` + `errors` for `en` + `th`
6. User language preference syncs between DB (`userPreferences.translationLanguage`) and localStorage
7. Language switcher is visible in main navigation
8. Existing `useI18n()` consumers continue working via backward-compatible wrapper
9. Dashboard, navigation, auth, and shared UI components use `t()` instead of hardcoded English
10. Missing Thai translations fall back to English without errors
11. `i18next.init()` failure does not white-screen the app — falls back to English-only mode
12. Route namespace preloader triggers parallel to component lazy-load (not sequential)
13. `vendor-i18n` chunk is separated in Vite build config
14. Language code allowlist enforced in both client (`languageDetector.ts`) and server (`users.updatePreferences`)

---

## Review Findings & Additions (Post-Review)

The following sections address gaps found during architecture, performance, and security review.

### Route-to-Namespace Loading Mechanism

**Gap identified**: The spec said namespaces load "parallel with component lazy-load" but did not specify HOW.

**Required pattern**: Route config map + preloader hook.

```ts
// i18n/namespaces.ts — single source of truth
export const ROUTE_NAMESPACES: Array<{ pathPrefix: string; namespaces: string[] }> = [
  { pathPrefix: '/chat', namespaces: ['chat'] },
  { pathPrefix: '/agencies', namespaces: ['agency'] },
  { pathPrefix: '/workflows', namespaces: ['workflow'] },
  { pathPrefix: '/media', namespaces: ['media'] },
  { pathPrefix: '/generate', namespaces: ['media'] },
  { pathPrefix: '/gallery', namespaces: ['media'] },
  { pathPrefix: '/marketplace', namespaces: ['marketplace'] },
  { pathPrefix: '/presentation', namespaces: ['presentation'] },
  { pathPrefix: '/video-editor', namespaces: ['presentation'] },
  { pathPrefix: '/social', namespaces: ['social'] },
  { pathPrefix: '/automation', namespaces: ['social'] },
  { pathPrefix: '/admin', namespaces: ['admin'] },
  { pathPrefix: '/domain-admin', namespaces: ['settings'] },
  { pathPrefix: '/profile', namespaces: ['profile'] },
  { pathPrefix: '/settings', namespaces: ['settings'] },
  { pathPrefix: '/credits', namespaces: ['billing'] },
  { pathPrefix: '/usage', namespaces: ['billing'] },
  { pathPrefix: '/help', namespaces: ['help'] },
  { pathPrefix: '/dashboard', namespaces: ['dashboard'] },
];

// useNamespacePreloader.ts — called in Router component
export function useNamespacePreloader() {
  const [location] = useLocation();
  useEffect(() => {
    const match = ROUTE_NAMESPACES.find(r => location.startsWith(r.pathPrefix));
    if (match) {
      const lng = i18next.language;
      // Load both languages for matched namespaces — parallel with React.lazy chunk
      Promise.all([
        ...match.namespaces.map(ns => loadNamespace(lng, ns)),
        ...match.namespaces.map(ns => loadNamespace('en', ns)),
      ]);
    }
  }, [location]);
}
```

This fires on URL change (same moment Wouter matches `<Route>` and triggers `React.lazy` chunk load), achieving true parallel loading. Components use `useTranslation(['chat'])` with `<Suspense>` to wait for the namespace.

### Loader Deduplication Guard

The `loadNamespace` function must deduplicate concurrent requests:

```ts
// loader.ts — with in-flight dedup
const localeModules = import.meta.glob('../locales/*/*.json');
const inFlight = new Map<string, Promise<void>>();

export function loadNamespace(lng: string, ns: string): Promise<void> {
  if (i18next.hasResourceBundle(lng, ns)) return Promise.resolve();
  const key = `${lng}/${ns}`;
  if (inFlight.has(key)) return inFlight.get(key)!;
  const moduleKey = `../locales/${lng}/${ns}.json`;
  const loader = localeModules[moduleKey];
  if (!loader) return Promise.resolve();
  const p = loader().then((mod: any) => {
    i18next.addResourceBundle(lng, ns, mod.default, true, true);
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}
```

### Catastrophic Init Failure Recovery

If `i18next.init()` rejects (e.g., all startup namespace fetches fail on slow network):

```ts
// i18n/index.ts
try {
  await Promise.race([
    i18next.init(config),
    new Promise((_, reject) => setTimeout(() => reject(new Error('i18n init timeout')), 3000)),
  ]);
} catch (err) {
  console.error('[i18n] Init failed, falling back to English-only mode', err);
  // Mount app anyway — keys render as-is (English key paths)
  // i18next is still initialized, just without loaded resources
}
// Always mount React tree — never white-screen
ReactDOM.createRoot(root).render(<App />);
```

**Rules**:
- Init timeout: **3 seconds** max
- On failure: mount app in English-only mode, log to Sentry
- UI shows English key paths (readable, not broken)
- Retry namespace loading on next route change or language toggle

### Vite Build Configuration

Add explicit chunk separation in `vite.config.ts`:

```ts
// vite.config.ts manualChunks addition
if (id.includes('node_modules/i18next/') || id.includes('node_modules/react-i18next/')) {
  return 'vendor-i18n';
}
```

**Locale files**: MUST remain in `client/src/locales/` (not `client/public/`). Vite processes them as module assets with content-hashed URLs for automatic cache busting. Moving to `public/` would serve them without cache busting.

### Help System Two-Layer Integration

The help system has two i18n layers:

1. **UI chrome** (page title, search placeholder, "Topic not found") → migrated to `locales/{lng}/help.json`
2. **Content** (markdown files at `docs/help/{lng}/*.md`) → stays as-is, served by `helpRouter` via `locale` parameter

**Integration rules**:
- `HelpTopic.tsx` reads active language from i18next (`i18n.language`) and passes to tRPC query
- `helpRouter` procedures (`getManifest`, `getTopic`, `getSearchIndex`, `getContextualTopics`) currently hardcode `z.enum(["en", "th"])` — must be widened to `z.enum(SUPPORTED_LANGUAGES)` when Phase 2 languages are added
- Adding a Phase 2 language requires BOTH `locales/{lng}/help.json` AND `docs/help/{lng}/*.md` (or graceful fallback to `en` markdown if directory doesn't exist)

### Marketing Pages Scope

Public marketing routes (`/`, `/pricing`, `/features`, `/docs`, `/blog`, `/about`, `/changelog`, `/careers`, `/community`, `/support`, `/status`, `/security`, `/terms`, `/privacy`, `/contact`) are **out of scope for Phase 1**. These pages will remain English-only. If future localization is needed, add a `marketing` namespace.

### Backward Compatibility — Namespace Caveat

The `useI18n()` wrapper calls `useTranslation()` without specifying a namespace, which defaults to i18next's `'translation'` namespace. Existing `t('help.title')` calls would break because the key lives in the `help` namespace.

**Fix**: The wrapper must explicitly load the `help` namespace:

```ts
export function useI18n() {
  const { t, i18n } = useTranslation(['help', 'common']);
  return {
    locale: i18n.language as Locale,
    setLocale: (lng: Locale) => i18n.changeLanguage(lng),
    t: (key: string, params?: Record<string, string>) => t(key, params),
    dict: {} // deprecated
  };
}
```

This means `help` namespace loads on every page that uses `useI18n()` (a transitional cost). Track removal of `useI18n()` consumers as Wave 3 completion gate.

### tRPC Language Preference Mutation

**Procedure**: `profile.setLanguage` (or add to existing `users.updatePreferences`)

```ts
// server/routers/users.ts — fix existing validation
// BEFORE (current — insufficient)
translationLanguage: z.string().max(10).optional(),

// AFTER — strict allowlist
import { SUPPORTED_LANGUAGES } from "../../client/src/i18n/config";
translationLanguage: z.enum(SUPPORTED_LANGUAGES).optional(),
```

The `SUPPORTED_LANGUAGES` tuple is exported from `i18n/config.ts` and shared between client and server.

---

## Security Requirements

### S1: XSS Prevention in Translation Values

- Translation values MUST be plain text only — no HTML markup
- If rich text is needed, use `<Trans components={{ b: <strong /> }}>` with pre-defined React elements
- NEVER use `dangerouslySetInnerHTML` with translated strings unless DOMPurify-sanitized
- Document this rule as a comment in `i18n/config.ts`

### S2: Language Code Allowlist (BLOCKING — fix before implementation)

Both client and server must validate language codes against a strict allowlist:

**Client** (`languageDetector.ts`):
```ts
const stored = localStorage.getItem("smartspec_locale");
const lang = SUPPORTED_LANGUAGES.includes(stored as any) ? stored : null;
```

**Server** (`users.ts`): Replace `z.string().max(10)` with `z.enum(SUPPORTED_LANGUAGES)` — this also prevents arbitrary strings from reaching LLM prompts via `translation.ts`.

### S3: Interpolation Safety

`escapeValue: false` is safe because React JSX escapes text nodes. Document this in `i18n/config.ts`:
```ts
interpolation: {
  escapeValue: false, // React already escapes — see Security Requirements S3 in spec
}
```

### S4: No Sensitive Data in Translation Files

Locale JSON files are publicly accessible static assets. They MUST contain only end-user-visible display text — never API endpoints, internal system names, or configuration values.

---

## Performance Budget

### Bundle Size Impact

| Component | Size (gzipped) |
|-----------|---------------|
| `i18next` library | ~11 KB |
| `react-i18next` library | ~7 KB |
| Startup namespaces (4 ns × 2 languages) | ~8.6 KB |
| **Total initial load overhead** | **~27 KB** |

Mitigated by `vendor-i18n` chunk (loads in parallel, not blocking critical path).

### Time-to-Interactive Regression

**Expected**: +200–400ms (unavoidable — startup namespaces must load before render).

**Mitigations**:
- HTTP/2 parallel loading of 8 startup chunks
- `<link rel="preload">` hints in `index.html` for startup chunks (if URLs are stable)
- 3-second init timeout — app mounts regardless
- Measure baseline TTI before implementation, monitor with Sentry RUM

### Route Transition Cost

First visit to a new route: +50–100ms (namespace fetch parallel with component chunk).
Subsequent visits: 0ms (namespace cached in i18next store).

### Memory Accumulation

Power user visiting 12 of 17 routes: ~288 KB uncompressed in i18next store (24 namespace bundles).

**Optional optimization** (Wave 4): Implement namespace eviction for routes not visited in last 10 minutes, keeping only startup namespaces always resident.

---

## Translation Maintenance Plan

### Phase 1: English-First Workflow
1. Engineers add English keys in `locales/en/{namespace}.json`
2. Feature ships with English only — Thai added when available
3. Missing Thai keys automatically fall back to English

### Phase 2: Translation Pipeline
- Export `en/*.json` as source files for translators
- Translators return `{lng}/*.json` files
- CI validates JSON structure and reports coverage percentage
- Missing translations are non-blocking — English fallback protects UX

### Phase 3: Ongoing Maintenance
- **Coverage tracking**: CI reports per-language, per-namespace completion percentage
- **Missing key telemetry**: In production, log `i18next.on('missingKey')` events to identify untranslated keys used by real users (prioritize translation effort by actual usage)
- **Key extraction**: `i18next-parser` scans source files for `t()` calls → generates missing key reports
- **Stale key detection**: Compare extracted keys against `en/*.json` to find unused keys → prune periodically
- **Translation review**: Non-English JSON files reviewed by native speakers before merge (not automated translation)

### CI Validation Checks
```yaml
# In CI pipeline
- Validate all JSON files parse correctly
- Compare th/*.json keys against en/*.json — report missing (non-blocking)
- Detect duplicate keys within a namespace
- Detect dynamic key construction (t('errors.' + code)) — flag for manual review
- Namespace size check: warn if any single namespace > 20 KB gzipped
```

### Adding a New Language
1. Create `locales/{lng}/` directory
2. Add at minimum: `common.json` with basic labels
3. Add language code to `SUPPORTED_LANGUAGES` in `i18n/config.ts`
4. If help content needed: create `docs/help/{lng}/` with markdown files
5. Update `helpRouter` locale validation if it uses a hardcoded enum
6. No code changes needed beyond config — loader discovers JSON files at build time
