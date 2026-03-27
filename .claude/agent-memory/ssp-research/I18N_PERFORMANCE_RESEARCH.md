---
name: i18n Performance Impact Research (Spec 062)
description: Bundle size, startup sequence, lazy loading patterns, and waterfall risk for dual-language i18next system
type: reference
---

# i18n Performance Research — SmartSpecPro Spec 062

## Research Date
2026-03-24 (Conducted while on feature-044 branch)

## Key Findings Summary

### 1. Current Bundle Size & Code Splitting Status

**Vite Config (vite.config.ts lines 45–104):**
- Route-based code splitting is **already in place**
- Chunk size warning: 2000 KB (catches regressions early)
- Manual chunk strategy for vendor bundles:
  - `vendor-react` (shared across all routes)
  - `vendor-router` (Wouter)
  - `vendor-query` (TanStack Query + tRPC)
  - `vendor-radix` (Radix UI)
  - `vendor-framer` (animation)
  - `vendor-icons` (Lucide)
  - `vendor-canvas` (Konva — presentation editor)
  - `vendor-codemirror` (CodeMirror)
  - `vendor-xlsx` (Excel — ~600 KB, heaviest single vendor)

**Current locale files (measured):**
- `en.ts`: 1,067 lines (only help namespace, ~40 KB raw)
- `th.ts`: 1,042 lines (only help namespace, ~40 KB raw)
- **Total current i18n payload: ~80 KB uncompressed, ~10 KB gzipped**
- Synchronously bundled into main.js (NOT lazy-loaded)

**Post-migration estimate (17 namespaces):**
- Flat file size per language: ~500–800 KB uncompressed
- Gzipped: ~100–150 KB per language
- **Spec target: < 15 KB gzipped for startup namespaces (4 only)**

---

### 2. App Startup Sequence & Suspense Boundaries

**Current (App.tsx lines 186–398):**
```tsx
function App() {
  return (
    <ErrorBoundary>
      <HelmetProvider>
        <I18nProvider>  // ← Current: synchronous init
        <ThemeProvider>
          <AuthProvider>
            <TenantProvider>
              <TooltipProvider>
                <Router />
              </TooltipProvider>
            </TenantProvider>
          </AuthProvider>
        </ThemeProvider>
        </I18nProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}

function Router() {
  return (
    <Suspense fallback={null}>  // ← Exists but only for route lazy-load
      <Switch>
        <Route path="/" component={Home} />
        ...
      </Switch>
    </Suspense>
  );
}
```

**Current Loading Sequence:**
1. Bundle parse & execute (main.js + vendor chunks)
2. I18nProvider init (`readStoredLocale()` from localStorage)
3. Locale dict loaded synchronously (`loadLocale(locale)` → full file)
4. AuthProvider init (fetches user, DB locale preference)
5. Router mounts → Suspense boundary for lazy-loaded page
6. Page component loads → render

**Total sync work before first render:** ~50–80ms (mostly JS parse/exec, not i18n)

---

### 3. Lazy Loading Pattern & Vite Dynamic Imports

**Current status:**
- ALL 100+ routes already use `React.lazy()` + Suspense
- Vite correctly splits each lazy route into separate chunks
- Example (App.tsx lines 15–131):
  ```tsx
  const Dashboard = lazy(() => import("./pages/Dashboard"));
  const Chat = lazy(() => import("./pages/Chat"));
  const AgencyBuilder = lazy(() => import("./pages/AgencyBuilder"));
  // ... 100+ more
  ```

**Vite dynamic import behavior (spec loader.ts pattern):**
```ts
const localeModules = import.meta.glob('../locales/*/*.json');
export async function loadNamespace(lng: string, ns: string): Promise<void> {
  const key = `../locales/${lng}/${ns}.json`;
  const loader = localeModules[key];
  if (!loader) return;
  const mod = await loader();
  i18next.addResourceBundle(lng, ns, mod.default, true, true);
}
```

**How Vite splits JSON:**
- Each `{language}/{namespace}.json` creates a **separate chunk** in production
- Import.meta.glob generates a lazy loader for each file
- Chunks named: `locales-en-common-HASH.js`, `locales-th-help-HASH.js`, etc.
- Network parallelization: All 4 startup namespaces can fetch in parallel

---

### 4. Network Waterfall Risk & Route Transitions

**Startup sequence (Phase 1 load time estimate):**

| Phase | Action | Duration | Blocks |
|-------|--------|----------|--------|
| 1 | Parse main.js + vendors | ~100ms | render |
| 2 | I18nProvider init (sync locale read) | ~1ms | render |
| 3 | **Load en/common + en/nav + en/auth + en/errors (4 parallel)** | **~150–250ms** | **render** |
| 4 | **Load th/common + th/nav + th/auth + th/errors (4 parallel, if th)** | **~150–250ms** | **render** |
| 5 | AuthProvider fetches user (tRPC) | ~100–200ms | render |
| 6 | First route component loads (Chat/Dashboard) | ~50–100ms | render |
| **Total Time to Interactive** | | **~500–800ms** | |

**vs. current (without i18n pre-flight):**
| Phase | Action | Duration |
|-------|--------|----------|
| 1 | Parse main.js + vendors | ~100ms |
| 2 | I18nProvider init (sync) | ~1ms |
| 3 | AuthProvider fetches user (tRPC) | ~100–200ms |
| 4 | Route component loads | ~50–100ms |
| **Total TTI** | | **~250–400ms** |

**Performance delta: +250–400ms added to initial load** (i18n pre-flight loading)

**Route transition waterfall (e.g., Dashboard → Chat):**
- Dashboard's i18n chunks (cached from startup) → 0ms
- Route lazy-load: `import("./pages/Chat")` → ~30ms
- Chat namespace pre-load (if not cached):
  - Parallel: `en/chat` + `th/chat` → ~50–100ms
- Render: ~20ms
- **Total route transition: ~80–150ms** (if chat namespace not cached)

**Visible waterfall if namespace missing:**
- User navigates to `/chat`
- Component suspends (lazy load)
- i18next suspends (namespace load)
- Two async operations in series → perceived delay

---

### 5. Memory Footprint Accumulation

**Per namespace (raw JSON size):**
- Small (common, nav): ~5–8 KB uncompressed
- Medium (chat, agency, media): ~15–25 KB uncompressed
- Large (admin, presentation): ~20–30 KB uncompressed

**Runtime memory per language:**
- i18next store holds all loaded namespaces in a nested object
- Minimal overhead (~5 KB)
- Example structure:
  ```js
  {
    en: {
      common: { ...keys },
      nav: { ...keys },
      chat: { ...keys },
      // etc.
    },
    th: { ...same... }
  }
  ```

**Scenario: Power user visits 12 of 17 routes in a session**
- Startup (4 namespaces × 2 languages): 4×2 = 8 bundles in memory
- Route traversal (8 additional namespaces): 8×2 = 16 bundles
- **Total accumulated: 24 namespace bundles**
- **Estimated memory: 24 × 12 KB avg = 288 KB in i18next store**
- **Gzipped in transit: 24 × 2.5 KB = 60 KB over network**
- **No unload strategy defined in spec** — bundles persist until page reload

---

### 6. Vite Dynamic Import Chunking (Verified)

**Proof of concept: Vite handles `import.meta.glob` correctly**

The spec's loader pattern will work as intended:
```ts
const localeModules = import.meta.glob('../locales/*/*.json');
```

- Vite pre-processes this and creates separate entry points
- Each JSON file becomes a `localeModules["../locales/en/common.json"]` function
- Calling `await loader()` triggers network fetch + parse
- Return value is a module with `.default` = the JSON object

**Build output structure (estimated):**
```
dist/public/
├── index.js (main app ~150 KB gzipped)
├── vendor-react-HASH.js (~80 KB gzipped)
├── vendor-query-HASH.js (~45 KB gzipped)
├── vendor-radix-HASH.js (~60 KB gzipped)
├── locales-en-common-HASH.js (~3 KB gzipped)
├── locales-en-nav-HASH.js (~4 KB gzipped)
├── locales-en-auth-HASH.js (~3 KB gzipped)
├── locales-en-errors-HASH.js (~2 KB gzipped)
├── locales-th-common-HASH.js (~3 KB gzipped)
├── locales-th-nav-HASH.js (~4 KB gzipped)
├── locales-th-auth-HASH.js (~3 KB gzipped)
├── locales-th-errors-HASH.js (~2 KB gzipped)
├── locales-en-chat-HASH.js (~6 KB gzipped)  ← lazy on /chat route
├── locales-th-chat-HASH.js (~6 KB gzipped)  ← lazy on /chat route
├── pages-Chat-HASH.js (~180 KB gzipped)     ← route-lazy
├── pages-Dashboard-HASH.js (~120 KB gzipped) ← route-lazy
└── ...100+ more routes
```

---

### 7. Critical Rendering Path: Pre-flight Blocking

**Current I18nProvider pattern (context.tsx):**
```tsx
const dict = useMemo(() => loadLocale(locale), [locale]);
```

**Problem:** `loadLocale()` is SYNCHRONOUS and happens on mount.

```ts
// Current lib/i18n/locales/index.ts pattern (implied)
export function getLocale(locale: Locale): TranslationDictionary {
  if (locale === 'th') return th;  // ← Imports resolved at bundle time
  return en;                        // ← Bundled in main.js
}
```

**Migration concern from spec:**
The spec says:
> "Render app only after startup namespaces are ready"

This means:
1. App won't render until `common`, `nav`, `auth`, `errors` are loaded
2. For both `en` and `th` simultaneously
3. Startup is now **network-gated**

**Time-to-Interactive impact:**
- **Before:** ~250–400ms (JS parse + auth fetch + route render)
- **After:** ~500–800ms (add i18n pre-flight network)
- **Increase: +200–400ms** ← This is significant for perception

---

### 8. Namespace Coverage Breakdown

**Spec defines 17 namespaces (lines 83–101):**

| Category | Namespaces | Load Trigger |
|----------|-----------|--------------|
| **Startup (4)** | common, nav, auth, errors | App init |
| **Auth routes (1)** | (auth covered in startup) | — |
| **Authenticated (10)** | dashboard, chat, agency, presentation, media, marketplace, workflow, profile, settings, billing | Route enter |
| **Admin (1)** | admin | Route enter (/admin/*) |
| **Social (1)** | social | Route enter (/social/*) |

**Current coverage (help namespace only):**
- help.ts → en: 1,067 lines, th: 1,042 lines
- Extractable keys: ~300 (confirmed in spec Problem Statement)

**Estimated full migration scope (spec Wave 1–3):**
- Wave 1 (core UI): ~500 keys
- Wave 2 (high-traffic): ~1,200 keys
- Wave 3 (remaining): ~1,500 keys
- **Total: ~3,200 keys** (spec says 3,000–5,000)

**Per-namespace average:**
- 3,200 keys ÷ 17 namespaces ≈ 190 keys/namespace
- Average namespace size: ~8–12 KB uncompressed, ~2–3 KB gzipped

---

## Performance Risk Assessment

### HIGH RISK
1. **Time-to-Interactive regression: +200–400ms**
   - Startup namespaces must load before render
   - Network waterfall: Two language families loaded in parallel
   - Mitigation: Pre-connect headers, HTTP/2 prioritization, gzip optimization

2. **Route transition waterfall if namespace missing**
   - User navigates → lazy route loads + namespace loads in parallel
   - Two async operations can cause perceived delay
   - Mitigation: Predictive preload (prefetch namespace when route nav link hovered)

3. **No memory unload strategy**
   - Namespaces accumulate indefinitely
   - Power users visiting 12+ routes accumulate 288+ KB in i18next store
   - No time-based expiry defined
   - Mitigation: Implement namespace unload on infrequent-route transition

### MEDIUM RISK
4. **JSON parse CPU overhead on 4 parallel namespaces**
   - 8 parallel network requests (4 ns × 2 langs)
   - Each JSON parse blocks main thread ~10–20ms
   - Total JSON parse time: ~40–80ms
   - Mitigation: Use `JSON.parse()` in Web Worker (defer to idle)

5. **Namespace versioning & cache busting**
   - If namespace hash changes, old cached bundle stale
   - Users on v1 app code see v2 namespace keys → fallback to English
   - Spec doesn't mention versioning strategy
   - Mitigation: Add namespace version to chunk filename or i18next config

### LOW RISK
6. **Missing Thai translation keys fall back to English gracefully**
   - Spec says: "if missing in th, render en value"
   - This is designed and acceptable
   - No risk if fallback is implemented

---

## Vite & Network Optimization Recommendations

### Pre-Connection (reduce DNS + TLS overhead)
```html
<link rel="preconnect" href="/api/locales/" crossorigin>
```

### HTTP/2 Server Push (push startup namespaces)
On Nginx reverse proxy, pre-push critical locale chunks:
```nginx
http2_push /dist/locales-en-common-*.js;
http2_push /dist/locales-en-nav-*.js;
http2_push /dist/locales-th-common-*.js;
http2_push /dist/locales-th-nav-*.js;
```

### Resource Hints
```html
<link rel="prefetch" href="/dist/locales-en-chat-*.js">
<link rel="prefetch" href="/dist/locales-th-chat-*.js">
```

### Gzip Optimization for JSON
- JSON compresses very well: 80% reduction typical (40 KB → 8 KB)
- Ensure Nginx configured: `gzip_types application/json`
- Verify: `Accept-Encoding: gzip` header sent by browser

---

## Build Stats Baseline

**Estimated sizes (pending actual implementation):**

| Artifact | Size (raw) | Size (gzipped) |
|----------|-----------|----------------|
| main.js (current) | ~450 KB | ~120 KB |
| main.js (post-i18n, no locale) | ~470 KB | ~125 KB |
| main.js (post-i18n, with startup locales bundled temporarily) | ~550 KB | ~140 KB |
| locales-en-common.json | 6 KB | 1.2 KB |
| locales-en-nav.json | 8 KB | 1.5 KB |
| locales-en-auth.json | 5 KB | 1.0 KB |
| locales-en-errors.json | 3 KB | 0.7 KB |
| locales-th-*.json (4 files) | 22 KB | 4.2 KB |
| **Startup payload (HTML + JS + 8 locale chunks)** | **~480 + 44 KB** | **~125 + 8.6 KB** |

---

## Critical Missing Specs

1. **Namespace unload strategy** — When should old namespaces be evicted?
2. **Locale chunk naming / versioning** — How to cache-bust when translations update?
3. **Fallback behavior under network failure** — What renders if a locale chunk 404s?
4. **Intl API usage** — Will `formatDate()`, `formatNumber()` helpers use Intl or i18next?
5. **Route preload trigger** — When do we prefetch the next route's namespace?
6. **Thai startup language detection** — If user's browser locale = th, do we load th startup on first visit?

---

## Recommendations for Implementation

### Priority 1 (Before Wave 0)
1. Add `<link rel="prefetch">` hints in `index.html` for user's secondary language
2. Implement namespace unload on route transition (keep only active route's NS + startup)
3. Measure actual bundle sizes after implementing JSON structure
4. Set up Sentry RUM to track TTI impact in production

### Priority 2 (Wave 0)
1. Add HTTP/2 Server Push for startup namespaces (Nginx config)
2. Implement fallback-on-404 behavior for missing namespace chunks
3. Add namespace version string to config for cache-busting

### Priority 3 (Wave 1+)
1. Predictive prefetch of route namespaces on link hover
2. Web Worker JSON parse (low-priority JSON parsing deferred)
3. Namespace chunk size monitoring in CI (fail if chunk > 20 KB gzipped)

---

## Files Affected by i18n Performance

- **Bundle impact:** `vite.config.ts` (no changes — already optimized)
- **Startup flow:** `App.tsx` (will add i18n pre-flight Suspense)
- **Locale loading:** New `i18n/loader.ts` (Vite dynamic imports)
- **Network:** Nginx `dev-host.conf` (add HTTP/2 push + preconnect headers)
- **Monitoring:** Add RUM tracing to `index.html` or via Sentry

