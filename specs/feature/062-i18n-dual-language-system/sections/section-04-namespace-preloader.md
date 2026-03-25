I have all the context needed. Let me produce the section content.

# Section 04 -- Namespace Preloader

## Section ID
`section-04-namespace-preloader`

## Goal
Create the route-to-namespace mapping and the React hook that preloads i18next namespaces in parallel with React.lazy component chunks on route changes.

## Dependencies
- **section-02-i18n-core** -- provides the initialized `i18next` instance and the `ALL_NAMESPACES` constant from `i18n/config.ts`
- Uses `wouter` (already installed) -- specifically `useLocation()` for route detection

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/client/src/i18n/namespaces.ts` | `ROUTE_NAMESPACES` mapping from URL path prefixes to namespace arrays |
| `apps/web/client/src/i18n/useNamespacePreloader.ts` | Hook that fires `i18next.loadNamespaces()` on route changes |
| `apps/web/client/src/i18n/__tests__/namespaces.test.ts` | Unit tests for the namespace map |
| `apps/web/client/src/i18n/__tests__/useNamespacePreloader.test.tsx` | Unit tests for the preloader hook |

No existing files are modified in this section.

---

## Tests (TDD -- write first)

### Test File: `apps/web/client/src/i18n/__tests__/namespaces.test.ts`

This test validates the `ROUTE_NAMESPACES` map and the `getRouteNamespaces()` lookup function.

```
# Test: /chat maps to ['chat'] namespace
# Test: /agencies/123/edit maps to ['agency'] namespace
# Test: /admin/providers maps to ['admin'] namespace
# Test: /social/inbox maps to ['social'] namespace
# Test: /unknown-path returns no match (undefined or empty array)
# Test: / (root) returns no match (startup namespaces handle it)
# Test: every namespace referenced in ROUTE_NAMESPACES exists in ALL_NAMESPACES
# Test: /dashboard maps to ['dashboard'] namespace
# Test: /presentation/123 maps to ['presentation'] namespace
# Test: /video-editor maps to ['presentation'] namespace
# Test: /generate maps to ['media'] namespace
# Test: /gallery maps to ['media'] namespace
# Test: /credits maps to ['billing'] namespace
# Test: /usage maps to ['billing'] namespace
# Test: /help maps to ['help'] namespace
# Test: /domain-admin maps to ['settings'] namespace
# Test: /automation maps to ['social'] namespace
```

Key test patterns:
- Import `ALL_NAMESPACES` from `@/i18n/config` (mock if section-02 is not yet implemented -- provide a constant array of 17 namespace strings).
- Import `ROUTE_NAMESPACES` and `getRouteNamespaces` from `@/i18n/namespaces`.
- For the `ALL_NAMESPACES` validation test, iterate every namespace string found in `ROUTE_NAMESPACES` entries and assert it is included in `ALL_NAMESPACES`.

### Test File: `apps/web/client/src/i18n/__tests__/useNamespacePreloader.test.tsx`

This test validates the preloader hook using `@testing-library/react` `renderHook`.

```
# Test: calls i18next.loadNamespaces when location changes to /chat
# Test: loads namespaces for both current language and 'en'
# Test: does not call loadNamespaces for unmatched routes
# Test: calls loadNamespaces again when location changes from /chat to /agencies
# Test: does not reload namespaces when location stays at /chat (same path)
```

Key test patterns:
- Mock `wouter` via `vi.mock("wouter", ...)` -- return a controllable `useLocation` that returns `[currentPath, setLocation]`.
- Mock `i18next` via `vi.mock("i18next", ...)` -- provide `loadNamespaces` as a `vi.fn()` returning `Promise.resolve()`, and `language` as a string property (e.g., `"th"`).
- Use `renderHook(() => useNamespacePreloader())` from `@testing-library/react`.
- To simulate route changes, update the mocked `useLocation` return value and re-render the hook.
- Assert `i18next.loadNamespaces` was called with the expected namespace arrays.

---

## Implementation Guidance

### `apps/web/client/src/i18n/namespaces.ts`

**Exports:**

1. `ROUTE_NAMESPACES` -- a readonly array of `{ pathPrefix: string; namespaces: readonly string[] }` entries, ordered from most-specific to least-specific (longest prefix first for correct matching). The full mapping:

```
/dashboard    -> ['dashboard']
/chat         -> ['chat']
/agencies     -> ['agency']
/workflows    -> ['workflow']
/media        -> ['media']
/generate     -> ['media']
/gallery      -> ['media']
/marketplace  -> ['marketplace']
/presentation -> ['presentation']
/video-editor -> ['presentation']
/social       -> ['social']
/automation   -> ['social']
/admin        -> ['admin']
/domain-admin -> ['settings']
/profile      -> ['profile']
/settings     -> ['settings']
/credits      -> ['billing']
/usage        -> ['billing']
/help         -> ['help']
```

2. `getRouteNamespaces(pathname: string): readonly string[] | undefined` -- pure function that iterates `ROUTE_NAMESPACES` and returns the `namespaces` array for the first entry where `pathname.startsWith(entry.pathPrefix)`. Returns `undefined` if no match.

**Design notes:**
- The array is static and deterministic. No async operations.
- The function uses `Array.prototype.find()` with `startsWith` matching.
- If ordering matters for ambiguous prefixes (e.g., `/settings` vs `/settings-advanced`), longer prefixes must come first in the array. For the current mapping there are no such conflicts, but keep the ordering convention.

### `apps/web/client/src/i18n/useNamespacePreloader.ts`

**Export:**

`useNamespacePreloader(): void` -- a React hook with no return value.

**Behavior:**

1. Call `useLocation()` from `wouter` to get the current `[pathname]`.
2. Store the previous pathname in a `useRef<string>` to avoid redundant loads when the pathname has not changed.
3. In a `useEffect` that depends on `pathname`:
   a. If `pathname === prevRef.current`, return early (no change).
   b. Update `prevRef.current = pathname`.
   c. Call `getRouteNamespaces(pathname)`.
   d. If a match is found, call `i18next.loadNamespaces(matchedNamespaces)`. This is fire-and-forget -- do not `await`. The actual rendering suspension is handled by `react-i18next`'s `useTranslation` + React Suspense, not by this hook.
4. **Load both the current language and English explicitly.** With `partialBundledLanguages: true` and a lazy backend, i18next does NOT automatically preload fallback language namespaces until a missing-key lookup triggers it. To avoid a flash of key strings when Thai translations are incomplete, preload English alongside the current language:
   ```
   const namespaces = matchedNamespaces;
   i18next.loadNamespaces(namespaces); // loads for i18next.language (e.g., 'th')
   if (i18next.language !== 'en') {
     // Also preload English fallback for these namespaces
     namespaces.forEach(ns => {
       if (!i18next.hasResourceBundle('en', ns)) {
         i18next.loadNamespaces(namespaces); // triggers backend for 'en' via fallback
       }
     });
   }
   ```
   Alternatively, call `loadNamespace('en', ns)` from `loader.ts` (section-03) directly for each namespace to leverage the in-flight dedup guard.

**Import requirements:**
- `useLocation` from `"wouter"`
- `useEffect`, `useRef` from `"react"`
- `i18next` from `"i18next"` (the default export -- the initialized instance)
- `getRouteNamespaces` from `"./namespaces"`

**Important considerations:**
- This hook is called inside the Router component in `App.tsx` (wired in section-05). It must be at the top level of a component that is a child of the wouter `Router`.
- The `loadNamespaces` call runs in parallel with `React.lazy` chunk loading because both are triggered by the same route change. This is the key performance optimization -- namespace data and component code load concurrently.
- Error handling: `i18next.loadNamespaces()` returns a Promise. If it rejects (network error), i18next falls back to English via `fallbackLng`. No explicit error handling is needed in the hook -- silent fallback is acceptable.

---

## Interface Contract

Other sections that consume these exports:

- **section-05-app-integration** imports `useNamespacePreloader` and calls it inside the Router component in `App.tsx`.
- No other sections directly import from `namespaces.ts`, but the `ROUTE_NAMESPACES` constant is the single source of truth for which namespaces map to which routes. Future wave migrations (sections 12, 13) must ensure their namespace names match entries in this map.

## Relevant Existing Files

- `/home/dev/projects/SmartSpecPro/apps/web/client/src/App.tsx` -- uses `useLocation` from `wouter` (line 4, line 173). The preloader hook will use the same import.
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/i18n/config.ts` (created in section-02) -- provides `ALL_NAMESPACES` used for validation in tests.