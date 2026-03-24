Now I have all the context needed. Here is the section content:

# Section 05: App Integration

**Section ID**: `section-05-app-integration`
**Depends on**: section-02-i18n-core, section-03-loader-detector, section-04-namespace-preloader
**Blocks**: section-06-backward-compat, section-08-locale-files, section-09-welcome-picker, section-10-locale-toggle

---

## Overview

This section wires the new i18next system into the React application. It modifies `App.tsx` to replace the legacy `<I18nProvider>` with `<I18nextProvider>`, integrates the namespace preloader hook into the Router component, upgrades the Suspense fallback from `null` to a loading skeleton, gates the React tree behind the `i18nReady` promise, and syncs the user's DB language preference to i18next after authentication completes.

---

## Files to Modify

| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/App.tsx` | Replace provider, add preloader, add skeleton fallback, add DB preference sync |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/main.tsx` | Gate React tree mount behind `i18nReady` promise |

## Files to Create

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/RouteLoadingSkeleton.tsx` | Suspense fallback skeleton for route transitions during namespace/chunk loading |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/hooks/useLanguageSync.ts` | Hook that syncs DB `translationLanguage` preference to i18next after auth |

---

## Dependencies from Prior Sections

This section consumes the following exports created by prior sections. These are listed here for reference only -- do not re-implement them.

From **section-02-i18n-core** (`i18n/index.ts`):
- `i18n` -- the initialized i18next instance
- `i18nReady` -- a `Promise<void>` that resolves when startup namespaces finish loading (or after 3-second timeout)

From **section-03-loader-detector** (`i18n/languageDetector.ts`):
- The custom language detector is already registered with `i18n` during init. No direct import needed here.

From **section-04-namespace-preloader** (`i18n/useNamespacePreloader.ts`):
- `useNamespacePreloader()` -- hook that reads wouter `useLocation()` and calls `i18next.loadNamespaces()` for route-matched namespaces

---

## Tests (TDD)

### Test File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/__tests__/App.i18n.test.tsx`

```
# Test: App renders without crashing with I18nextProvider
  - Render <App />, await screen to have some content. No thrown errors.
  - Mock i18nReady to resolve immediately.
  - Mock i18n with a minimal i18next instance (use createInstance() from i18next with in-memory resources for 'common' namespace).

# Test: I18nextProvider is present in component tree
  - Render <App />, verify useTranslation() from react-i18next does not throw when used inside the tree.
  - This can be tested by rendering a small test component inside the provider hierarchy that calls useTranslation('common') and asserts ready === true.

# Test: useNamespacePreloader is active (fires on route change)
  - Mock useNamespacePreloader as a vi.fn().
  - Render <App /> at route /chat.
  - Assert useNamespacePreloader was called at least once.

# Test: Suspense fallback renders RouteLoadingSkeleton during namespace loading
  - Create a test component wrapped in <Suspense> that throws a never-resolving promise (simulates pending namespace load).
  - Assert that the RouteLoadingSkeleton (identified by data-testid="route-loading-skeleton") appears.

# Test: App renders English text when no translation exists (fallback behavior)
  - Initialize i18next with only en/common resources.
  - Set language to 'th'.
  - Call t('common:save') -- should return the English value "Save" via fallback.
```

### Test File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/hooks/__tests__/useLanguageSync.test.tsx`

```
# Test: syncs DB preference to i18next when user has translationLanguage='th' and i18next language is 'en'
  - Mock useAuth to return user with preferences containing translationLanguage: 'th'.
  - Mock i18next.language as 'en'.
  - Render hook. Assert i18next.changeLanguage was called with 'th'.

# Test: does not call changeLanguage when DB preference matches current i18next language
  - Mock useAuth to return translationLanguage: 'en'.
  - Mock i18next.language as 'en'.
  - Render hook. Assert i18next.changeLanguage was NOT called.

# Test: does not call changeLanguage when user is not authenticated (null user)
  - Mock useAuth to return user: null, isLoading: false.
  - Render hook. Assert i18next.changeLanguage was NOT called.

# Test: does not call changeLanguage while auth is still loading
  - Mock useAuth to return user: null, isLoading: true.
  - Render hook. Assert i18next.changeLanguage was NOT called.

# Test: ignores invalid DB preference value (not in SUPPORTED_LANGUAGES)
  - Mock useAuth to return translationLanguage: 'zz-invalid'.
  - Render hook. Assert i18next.changeLanguage was NOT called.

# Test: updates localStorage when syncing DB preference
  - Mock useAuth to return translationLanguage: 'th'.
  - Mock i18next.language as 'en'.
  - Render hook. Assert localStorage.setItem was called with ('smartspec_locale', 'th').
```

### Test File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/__tests__/RouteLoadingSkeleton.test.tsx`

```
# Test: renders a container with data-testid="route-loading-skeleton"
# Test: renders at least one animated pulse/shimmer element
# Test: is not empty (has visible child elements)
```

---

## Implementation Guidance

### 1. RouteLoadingSkeleton Component

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/RouteLoadingSkeleton.tsx`

Create a simple page-level skeleton component used as the Suspense fallback. It replaces the current `fallback={null}` which causes a flash of empty content during namespace loading.

Requirements:
- Must render `data-testid="route-loading-skeleton"` on the outermost element
- Use Tailwind CSS for styling -- a full-width container with 2-3 animated shimmer bars
- Keep it lightweight (no imports beyond React)
- Match the overall page layout dimensions (a top bar placeholder, a content area placeholder)
- Use `animate-pulse` from Tailwind for the shimmer effect

Signature:
```typescript
export function RouteLoadingSkeleton(): JSX.Element
```

### 2. useLanguageSync Hook

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/hooks/useLanguageSync.ts`

This hook bridges the gap between the user's DB preference and the i18next runtime. The language detector (section-03) handles pre-auth detection from localStorage/browser. This hook handles the post-auth case: once the user's profile is available via `useAuth()`, sync the DB preference to i18next if it differs.

Requirements:
- Import `useAuth` from `@/contexts/AuthContext`
- Import `i18n` from `@/i18n`
- Import `SUPPORTED_LANGUAGES` from `@shared/i18n` (the shared config from section-01)
- Run inside a `useEffect` that depends on `[user, isLoading]`
- Guard: skip if `isLoading` is true, or `user` is null
- Read `user.userPreferences?.translationLanguage` (or however the auth context exposes it -- the tRPC `auth.me` response includes userPreferences)
- Validate the value is in the `SUPPORTED_LANGUAGES` set
- If valid and different from `i18n.language`, call `i18n.changeLanguage(dbLang)` and set `localStorage.setItem('smartspec_locale', dbLang)`
- Fire-and-forget -- do not block rendering

Signature:
```typescript
export function useLanguageSync(): void
```

**Note on auth context**: The current `AuthContext` transforms the user data and does not expose `userPreferences` directly. The hook may need to make a separate lightweight tRPC call (`users.getPreferences`) or the auth context may need a minor extension to pass through `translationLanguage`. Check the actual shape returned by `auth.me` and adapt accordingly. If `userPreferences` is not available on the auth user object, use a TanStack Query hook to fetch it:

```typescript
const { data: prefs } = trpc.users.getPreferences.useQuery(undefined, {
  enabled: !!user && !isLoading,
});
```

### 3. App.tsx Modifications

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/App.tsx`

#### 3a. Replace I18nProvider with I18nextProvider

Current (line 12 import, line 406 usage):
```typescript
import { I18nProvider } from "@/lib/i18n";
// ...
<I18nProvider>
  <ThemeProvider ...>
    ...
  </ThemeProvider>
</I18nProvider>
```

Change to:
```typescript
import { I18nextProvider } from "react-i18next";
import { i18n } from "@/i18n";
// ...
<I18nextProvider i18n={i18n}>
  <ThemeProvider ...>
    ...
  </ThemeProvider>
</I18nextProvider>
```

The `I18nextProvider` must wrap the same subtree that `I18nProvider` currently wraps. Position in the hierarchy stays the same: after `HelmetProvider`, before `ThemeProvider`.

**Do NOT remove `I18nProvider` from `lib/i18n/context.tsx`** -- that is handled by section-06-backward-compat.

#### 3b. Add useNamespacePreloader to Router

Inside the `Router()` function component (currently at line 186), add the preloader hook call:

```typescript
import { useNamespacePreloader } from "@/i18n/useNamespacePreloader";

function Router() {
  useNamespacePreloader(); // fires on every route change
  return (
    <>
      <PostHogPageViewTracker />
      <Suspense fallback={<RouteLoadingSkeleton />}>
        <Switch>
          {/* ... routes ... */}
        </Switch>
      </Suspense>
    </>
  );
}
```

#### 3c. Replace Suspense fallback

Current (line 191):
```typescript
<Suspense fallback={null}>
```

Change to:
```typescript
import { RouteLoadingSkeleton } from "@/components/RouteLoadingSkeleton";
// ...
<Suspense fallback={<RouteLoadingSkeleton />}>
```

This catches both React.lazy component chunk loading AND i18next namespace loading (when `useSuspense: true` is configured in section-02).

#### 3d. Add useLanguageSync inside AuthProvider scope

The DB preference sync must run inside the `AuthProvider` tree so `useAuth()` is available. Add it as a component rendered inside `TenantProvider`:

```typescript
import { useLanguageSync } from "@/hooks/useLanguageSync";

function LanguageSyncBridge() {
  useLanguageSync();
  return null;
}
```

Place `<LanguageSyncBridge />` inside the provider tree, after `AuthProvider` resolves (e.g., as a sibling of `<Router />`):

```typescript
<AuthProvider>
  <TenantProvider>
    <TooltipProvider>
      <Toaster />
      <GlobalAlerts />
      <SystemHealthBanner />
      <LanguageSyncBridge />
      <Router />
      <FeedbackButton />
    </TooltipProvider>
  </TenantProvider>
</AuthProvider>
```

#### 3e. Gate React tree on i18nReady

The `i18nReady` promise from section-02 must resolve before mounting the React tree. This prevents a flash of raw translation keys during startup.

In the application entry point (likely `/home/dev/projects/SmartSpecPro/apps/web/client/src/main.tsx` or wherever `createRoot` is called):

```typescript
import { i18nReady } from "@/i18n";

i18nReady.then(() => {
  const root = createRoot(document.getElementById("root")!);
  root.render(<App />);
});
```

If the entry point already calls `createRoot` synchronously, wrap it in the `i18nReady.then()`. The 3-second timeout on `i18nReady` (configured in section-02) guarantees the app mounts even if namespace loading fails.

---

## Provider Hierarchy After Changes

```
ErrorBoundary
  HelmetProvider
    I18nextProvider (i18n={i18n})    ← was I18nProvider
      ThemeProvider
        AuthProvider
          TenantProvider
            TooltipProvider
              Toaster, GlobalAlerts, SystemHealthBanner
              LanguageSyncBridge                         ← NEW (runs useLanguageSync)
              Router
                useNamespacePreloader()                  ← NEW (fires on route change)
                PostHogPageViewTracker
                Suspense fallback={<RouteLoadingSkeleton />}   ← was fallback={null}
                  Switch (130+ lazy routes)
              FeedbackButton
```

---

## Edge Cases and Error Handling

1. **i18nReady timeout**: If startup namespaces fail to load within 3 seconds, `i18nReady` resolves anyway (section-02 behavior). The app mounts with key strings as fallback text. This section does not need additional timeout handling.

2. **Auth not available**: `useLanguageSync` must tolerate `user === null` (unauthenticated visitors). The hook simply does nothing until authentication completes.

3. **Concurrent language changes**: If the user changes language via the locale toggle (section-10) at the same time `useLanguageSync` fires, i18next handles this gracefully -- the last `changeLanguage()` call wins.

4. **SSR/test environments**: `RouteLoadingSkeleton` must not reference `window` or `document`. It is pure JSX with Tailwind classes.

5. **Existing `I18nProvider` import**: After this section, `App.tsx` no longer imports from `@/lib/i18n`. However, the old `I18nProvider` and `useI18n` still exist and are used by 13 consumer files. Section-06 handles the backward compatibility wrapper. Until section-06 is implemented, those 13 files will break if they are rendered -- this is expected and will be resolved in order.

---

## Verification Checklist

- [x] `App.tsx` imports `I18nextProvider` from `react-i18next` and `i18n` from `@/i18n`
- [x] `I18nProvider` import removed from `App.tsx` (or replaced)
- [x] `useNamespacePreloader()` called inside `Router` component
- [x] `<Suspense fallback={null}>` replaced with `<Suspense fallback={<RouteLoadingSkeleton />}>`
- [x] `LanguageSyncBridge` component renders inside `AuthProvider` scope
- [x] Entry point (`main.tsx`) gates on `i18nReady` promise before `createRoot`
- [x] All tests in `App.i18n.test.tsx`, `useLanguageSync.test.tsx`, and `RouteLoadingSkeleton.test.tsx` pass (14 tests)
- [x] TypeScript compiles without errors

## Implementation Notes (Actual vs Planned)

**Deviations from plan:**
- `useLanguageSync` uses `trpc.users.getPreferences.useQuery` (separate fetch) rather than reading from `user` object, because `auth.me` does not return `userPreferences`/`translationLanguage`
- Added `resolvedLanguage` fallback in comparison (`i18n.resolvedLanguage ?? i18n.language`) to handle browser region-variant languages (e.g., "en-US" vs DB "en")
- Added `try/catch` around `localStorage.setItem` in `useLanguageSync` for private/full storage resilience
- Added `aria-hidden="true"` and `role="presentation"` to `RouteLoadingSkeleton` for accessibility
- Added null guard for `document.getElementById("root")` in `main.tsx`

**Files created:**
- `apps/web/client/src/components/RouteLoadingSkeleton.tsx`
- `apps/web/client/src/hooks/useLanguageSync.ts`
- `apps/web/client/src/__tests__/App.i18n.test.tsx` (5 tests)
- `apps/web/client/src/hooks/__tests__/useLanguageSync.test.tsx` (6 tests)
- `apps/web/client/src/components/__tests__/RouteLoadingSkeleton.test.tsx` (3 tests)

**Files modified:**
- `apps/web/client/src/App.tsx` — provider swap, preloader hook, skeleton fallback, LanguageSyncBridge
- `apps/web/client/src/main.tsx` — i18nReady gating, null guard