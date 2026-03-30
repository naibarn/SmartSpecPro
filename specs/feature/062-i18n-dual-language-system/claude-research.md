# Research: i18n Dual-Language System (Feature 062)

## Part 1: Codebase Analysis

### 1.1 Current i18n System

**Location**: `apps/web/client/src/lib/i18n/`

| File | Purpose | Size |
|------|---------|------|
| `context.tsx` | I18nProvider + useI18n hook (~74 LoC) | Small |
| `types.ts` | `Locale = "en" \| "th"`, constants | Small |
| `index.ts` | Barrel exports | Tiny |
| `locales/en.ts` | English dictionary (flat key→value) | 1,067 lines |
| `locales/th.ts` | Thai dictionary (flat key→value) | 1,042 lines |
| `locales/index.ts` | `getLocale(locale)` loader | Tiny |

**Key types**:
- `Locale`: `"en" | "th"` (hardcoded union)
- `TranslationDictionary`: `Record<string, string>` (flat)
- Constants: `DEFAULT_LOCALE = "en"`, `LOCALE_LABELS = { en: "English", th: "ไทย" }`, `AVAILABLE_LOCALES = ["en", "th"]`

**Context API** (`useI18n()`):
- `locale: Locale` — current active locale
- `setLocale(locale)` — updates state + localStorage
- `t(key, params?)` — translation with `{{param}}` interpolation
- `dict: TranslationDictionary` — raw dictionary access

**Storage**: `localStorage("smartspec_locale")` with strict allowlist validation (`stored === "en" || stored === "th"`)

**Loading**: Synchronous — both dictionaries bundled into main JS payload via static imports.

### 1.2 All Consumers of useI18n (13 files)

**Help system pages**:
- `pages/Help.tsx` — passes `locale` to tRPC `help.getManifest`, inline ternaries
- `pages/HelpTopic.tsx` — passes `locale` to tRPC `help.getTopic`, inline ternaries

**Help components**:
- `components/help/HelpPanel.tsx` — reusable help widget, locale toggle, search
- `components/chat/ChatHelpDialog.tsx` — help overlay for chat
- `components/browser-session/BrowserSessionHelpDialog.tsx` — help for browser sessions

**Teams/Orchestration**:
- `pages/Teams.tsx` — team management, renders `<LocaleToggle />`
- `components/orchestrator/TeamRoomView.tsx` — display labels
- `components/orchestrator/RunMonitorPanel.tsx` — run status translations
- `components/orchestrator/RoomWorkflowPanel.tsx` — workflow config

**Admin**:
- `components/admin/InviteCodeDashboard.tsx` — uses `t()` only (no setLocale)

**Editor**:
- `components/editor/ConflictResolutionDialog.tsx` — conflict messages

**UI**:
- `components/LocaleToggle.tsx` — reusable toggle component

### 1.3 LocaleToggle Component

**File**: `apps/web/client/src/components/LocaleToggle.tsx`
- Props: `{ className?: string }`
- Renders pill-styled button group: `AVAILABLE_LOCALES.map()` with active/inactive styling
- Accessible: `role="group"`, `aria-label="Language switcher"`, `aria-pressed`
- Used in: Help pages, Teams page, HelpPanel

### 1.4 App.tsx Provider Hierarchy

```
ErrorBoundary (outermost)
  HelmetProvider
    I18nProvider          ← line 406
      ThemeProvider
        AuthProvider
          TenantProvider
            TooltipProvider
              Toaster, GlobalAlerts, SystemHealthBanner
              Router (130+ lazy routes)
              FeedbackButton
```

**Suspense**: Single `<Suspense fallback={null}>` wrapping all routes at line 191.
**Route guards**: `RequireAdmin`, `RequireAuth`, `RequireDomainAdmin` components.
**Lazy imports**: All 130+ pages use `lazy(() => import("@/pages/..."))`.

### 1.5 Vite Configuration

**File**: `apps/web/vite.config.ts`

**Path aliases**: `@` → `client/src`, `@shared` → `shared`, `@assets` → `attached_assets`

**Manual chunks** (current):
```
vendor-react, vendor-router, vendor-query, vendor-radix,
vendor-framer, vendor-icons, vendor-canvas, vendor-codemirror, vendor-xlsx
```
**No i18next vendor chunk exists** — must add `vendor-i18n`.

**Build**: output `dist/public/`, source maps `hidden`, chunk warning 2000 kB.

### 1.6 User Preferences Storage

**Backend**: `apps/web/server/routers/users.ts` → `updatePreferences` mutation

```typescript
translationLanguage: z.string().max(10).optional(),  // ⚠ No allowlist
```

- Merges into `users.userPreferences` JSON column
- **NOT synced** with localStorage `smartspec_locale`
- Read by: `routers/media.ts` (voice lang), `routers/translation.ts` (LLM target lang)

### 1.7 Help System (Server-Side)

**Router**: `apps/web/server/routers/help.ts`

4 procedures with locale validation:
- `getManifest`, `getTopic`, `getSearchIndex`, `getContextualTopics`
- All use `z.enum(["en", "th"]).default("en")` — **hardcoded enum**
- Content files: `docs/help/{en|th}/*.md` with YAML frontmatter
- Service: `helpContentService.ts` with 5-min cache TTL

### 1.8 Testing Setup

**Config**: `apps/web/vitest.config.ts`
- Environment: `node` (default), `jsdom` for `client/src/**/*.test.tsx`
- Setup file: `client/src/test-setup.ts` (mocks ResizeObserver, matchMedia, adds jest-dom matchers)

**i18n mocking pattern** (from Teams.test.tsx):
```typescript
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?) => {
      const dictionary = { "teams.create.title": "New Team" };
      const template = dictionary[key] ?? key;
      // ... param interpolation
      return template;
    },
  }),
}));
```

**Translation validation** (notificationTranslations.test.ts): Direct import of `en`/`th` dictionaries, validates 50 required keys exist and are non-empty.

### 1.9 Dependencies

**i18next is NOT currently a dependency** — entirely custom implementation.

---

## Part 2: i18next Best Practices Research

### 2.1 Lazy Loading with Vite

**Recommended approach**: `i18next-resources-to-backend` + `import.meta.glob`

```typescript
import resourcesToBackend from 'i18next-resources-to-backend';

const localeModules = import.meta.glob('./locales/**/*.json');

i18next
  .use(resourcesToBackend((lng, ns) => {
    const key = `./locales/${lng}/${ns}.json`;
    return localeModules[key]?.() ?? Promise.reject();
  }))
  .use(initReactI18next)
  .init({ fallbackLng: 'en', partialBundledLanguages: true });
```

**Confirmed**: `import.meta.glob` for JSON files creates **separate chunks** in Vite production build. Each file becomes a dynamic `import()` call. Using `{ eager: true }` would inline everything (avoid).

**Alternative**: `i18next-http-backend` fetches from `public/locales/` at runtime — no build-time splitting, but works without bundler integration. **Not recommended** for this project.

**Package sizes**: `i18next-resources-to-backend` ~0.5 kB gzipped vs `i18next-http-backend` ~2.5 kB.

### 2.2 React Suspense Integration

`useTranslation('namespace')` natively integrates with React Suspense — throws a Promise when namespace is loading, caught by nearest `<Suspense>` boundary.

**Multiple namespaces**: `useTranslation(['dashboard', 'common'])` suspends until ALL are loaded.

**Disabling per-hook**: `useTranslation('ns', { useSuspense: false })` returns `{ ready }` boolean instead.

**Recommended pattern**: Enable Suspense globally, use per-route `<Suspense>` boundaries:
```tsx
<Route path="/dashboard">
  <Suspense fallback={<PageSkeleton />}>
    <DashboardPage /> {/* useTranslation('dashboard') inside */}
  </Suspense>
</Route>
```

### 2.3 Namespace Preloading on Route Change

No built-in i18next mechanism ties namespace loading to routes. Must wire manually:

```typescript
// Parallel loading pattern
function useNamespacePreloader() {
  const [location] = useLocation();
  useEffect(() => {
    const route = ROUTE_NAMESPACES.find(r => location.startsWith(r.pathPrefix));
    if (route) {
      i18next.loadNamespaces(route.namespaces); // fire-and-forget
    }
  }, [location]);
}
```

This starts namespace fetch at URL change time — parallel with `React.lazy` chunk fetch.
Without this, loading is sequential: chunk loads → component renders → `useTranslation` discovers missing namespace → fetch starts.

**Config**: `maxParallelReads: 10` (default) limits concurrent backend fetches.

### 2.4 Init Failure Handling

`i18next.init()` returns a Promise. On failure:
- i18next **still initializes** — `t('key')` returns the key string
- `failedLoading` event fires for monitoring
- Fallback chain: requested lng → fallback lng → raw key

**Recommended pattern**: Catch init errors, mount app anyway, show English keys:
```typescript
try {
  await Promise.race([i18next.init(config), timeout(3000)]);
} catch {
  console.error('i18n init failed');
}
// Always mount React — keys display as-is
```

**Critical**: If using Suspense and init fails, Suspense boundary may never resolve. Must ensure fallback resources are available or set timeout.

### 2.5 Bundle Size

| Package | Gzipped |
|---------|---------|
| `i18next` | ~14.8 kB |
| `react-i18next` | ~7.1 kB |
| `i18next-resources-to-backend` | ~0.5 kB |
| **Total** | **~22.4 kB** |

i18next does **not** tree-shake effectively (issue #1396). Full core included regardless of features used.

**Skip** `i18next-browser-languagedetector` (~3 kB) — we know user's language from DB/localStorage.

### 2.6 Key Extraction (i18next-parser)

```javascript
// i18next-parser.config.js
export default {
  locales: ['en', 'th'],
  defaultNamespace: 'common',
  output: 'src/locales/$LOCALE/$NAMESPACE.json',
  input: ['src/**/*.{ts,tsx}'],
  sort: true,
  keepRemoved: false,
  lexers: {
    tsx: [{ lexer: 'JsxLexer', functions: ['t'], attr: 'i18nKey', componentFunctions: ['Trans'] }],
    ts: [{ lexer: 'JavascriptLexer', functions: ['t'] }],
  },
};
```

**Limitation**: Cannot extract dynamic keys (`t(variable)`, `t('key' + suffix)`).
**Workaround**: Comments `// t('key_1')` near dynamic usage.

**Modern alternative**: `i18next-cli` (Rust-based, faster, handles `keyPrefix`).

### 2.7 ICU MessageFormat vs i18next Native

**Recommendation: Stick with i18next native format.**

| Aspect | i18next Native | ICU (i18next-icu) |
|--------|---------------|-------------------|
| Bundle overhead | 0 kB | +12 kB gzipped |
| Plural support | All CLDR categories | All CLDR categories |
| Feature loss | None | Nesting, context, interpolation ALL disabled |
| Parser compat | Full | Partial |
| Thai needs | Simple (no gender, 1 plural form) | Overkill |

ICU disables all i18next-specific features. Not worth the trade-off for en/th.

---

## Part 3: Recommended Technology Stack

| Decision | Choice | Reason |
|----------|--------|--------|
| Core library | `i18next` + `react-i18next` | Mature, Suspense support, namespace lazy-loading |
| Lazy backend | `i18next-resources-to-backend` | 0.5 kB, works with Vite `import.meta.glob` |
| Format | i18next native (not ICU) | Zero overhead, full features, simple for en/th |
| Suspense | Enabled globally, per-route boundaries | Clean loading UX, automatic |
| Route preload | `useNamespacePreloader` hook | Parallel chunk + namespace loading |
| Init failure | Catch + timeout + mount anyway | Never white-screen |
| Extraction | `i18next-parser` (upgrade to CLI later) | Mature, full TSX support |
| Browser detection | Skip (`i18next-browser-languagedetector`) | Already have DB/localStorage |
| Vendor chunk | Add `vendor-i18n` to vite.config.ts | Parallel loading, not blocking critical path |

## Part 4: Key Integration Points

### Files that need modification (infrastructure)
1. `apps/web/package.json` — add `i18next`, `react-i18next`, `i18next-resources-to-backend`
2. `apps/web/vite.config.ts` — add `vendor-i18n` manual chunk
3. `apps/web/client/src/App.tsx` — swap I18nProvider, add namespace preloader
4. `apps/web/client/src/lib/i18n/context.tsx` — backward-compat wrapper
5. `apps/web/server/routers/users.ts` — fix `translationLanguage` validation

### Files that need modification (help system alignment)
6. `apps/web/server/routers/help.ts` — widen locale enum
7. `apps/web/client/src/pages/Help.tsx` — use i18next instead of useI18n
8. `apps/web/client/src/pages/HelpTopic.tsx` — use i18next instead of useI18n

### Files to create (new i18n system)
9. `apps/web/client/src/i18n/index.ts` — initialization
10. `apps/web/client/src/i18n/config.ts` — supported languages, namespace list
11. `apps/web/client/src/i18n/loader.ts` — Vite glob loader with dedup
12. `apps/web/client/src/i18n/languageDetector.ts` — detection chain
13. `apps/web/client/src/i18n/namespaces.ts` — route→namespace map
14. `apps/web/client/src/i18n/useNamespacePreloader.ts` — route preloader hook
15. `apps/web/client/src/i18n/formatters.ts` — Intl-based formatters
16. `apps/web/client/src/i18n/types.ts` — TypeScript helpers
17. `apps/web/client/src/locales/{en,th}/*.json` — 17 namespace files each
