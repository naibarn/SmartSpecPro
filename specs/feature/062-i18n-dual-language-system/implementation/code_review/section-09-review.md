# Section 09 — WelcomeLanguagePicker — Code Review

**Spec**: `specs/feature/062-i18n-dual-language-system/sections/section-09-welcome-picker.md`
**Branch**: `codex/feature-044-multimodal-chat-memory`
**Reviewer**: SSP Reviewer Agent (CMD-8)
**Date**: 2026-03-25

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `WelcomeLanguagePicker.tsx:49-50` | `safeLocalStorage()` called at render root (outside React lifecycle), not inside `useMemo` or a stable ref. On every re-render a new `storage` object is created and `alreadyChosen` is re-derived synchronously from `localStorage.getItem` — but because `alreadyChosen` is not in any state or memo, a storage change elsewhere in the same session will not be reflected and the component has no stable equality for the value, creating a subtle stale-closure risk if React batches renders. | Move `safeLocalStorage()` behind a module-level singleton or stable `useRef`. Derive `alreadyChosen` via `useState` initialized once (not re-read on every render). |
| HIGH | `WelcomeLanguagePicker.tsx:89` | **Unauthenticated exposure**: The component is placed inside `TooltipProvider` but is NOT gated by `AuthProvider`'s `isAuthenticated` check. `trpc.users.getPreferences` is a `protectedProcedure` — it will throw a 401 for unauthenticated visitors, which causes an unhandled query error. The error path (`isError`) then opens the modal for non-logged-in users (e.g., the landing page, login page, public routes). Spec §Dependencies requires component renders only for authenticated users. | Consume `useAuth()` and return `null` if `!isAuthenticated`. Alternatively, set `enabled: !alreadyChosen && isAuthenticated` on the query. The spec test "does not render when user is not authenticated (no user context)" is in the spec list but is **not implemented** in the test file. |
| MEDIUM | `WelcomeLanguagePicker.tsx:62` | **Falsy check on `translationLanguage` conflates `null` / `undefined` / `""` / `"0"`**: `prefs?.translationLanguage && prefs.translationLanguage !== ""` treats all falsy values as "no preference". If the server ever returns `translationLanguage: null` (e.g., column not yet set on older rows), this correctly suppresses the modal, but if a future schema change returns `0` or `false`, the check fails. More importantly, the double check is redundant: `prefs?.translationLanguage !== ""` is sufficient if a non-empty string is the invariant. The pattern is also inconsistent with `section-06-backward-compat` notes about falsy checks being a MEDIUM issue. | Replace with `typeof prefs?.translationLanguage === "string" && prefs.translationLanguage !== ""` to be explicit about the expected type. |
| MEDIUM | `WelcomeLanguagePicker.tsx:98-113` | **Silent empty grid with no user feedback**: When `availableLanguages.length === 0` (the current production state — `th` coverage is 15%, below `MIN_COVERAGE=50`; all other non-`en` languages are 0%) the grid block is omitted and the modal shows only a "Continue with English" button. A user who sees this modal will have no idea why there are no choices, and the modal's `DialogDescription` still says "Select your preferred display language", which is now misleading. The spec acknowledges this in §Behavioral Notes but does not specify any fallback UI. | Add a `{availableLanguages.length === 0 && <p className="text-muted-foreground text-sm my-4">More languages are coming soon. Continue in English for now.</p>}` branch, and consider whether the modal should show at all when the grid is empty (in the current state, it will always be empty for new users, making the one-time prompt purely noise). |
| MEDIUM | `WelcomeLanguagePicker.test.tsx:127-141` | **Duplicate test**: `"sets localStorage smartspec_locale_chosen to 'true' after dismissal"` and `"dismissing modal sets smartspec_locale_chosen to 'true'"` are identical in setup, action, and assertion — both click the "Continue with English" button and assert the same `setItem` call. One of these should be removed and replaced with a **missing** test: verifying that `i18next.changeLanguage` is **not** called on dismiss (the spec explicitly states English is already the default and calling it would trigger an unnecessary namespace reload). | Remove the duplicate. Add: `"dismissing modal does NOT call i18next.changeLanguage"`. |
| MEDIUM | `WelcomeLanguagePicker.test.tsx` | **5 spec-required tests not implemented**: The spec lists 14 named tests. The test file implements 10. Missing: (1) `"does not render when user is not authenticated"` (2) `"selecting Thai calls i18next.changeLanguage('th')"` (3) `"selecting Thai writes 'th' to localStorage key smartspec_locale"` (4) `"selecting Thai fires tRPC users.updatePreferences mutation with { translationLanguage: 'th' }"` (5) `"each language option shows native name from LANGUAGE_LABELS"` / `"each language option shows coverage percentage"` — the last two are display tests that require a language option to be visible, so they require mocking `LANGUAGE_COVERAGE` with a language >= 50. | Implement all 5 missing test cases. Language selection tests require patching `LANGUAGE_COVERAGE` via `vi.mock('@shared/i18n', ...)` to surface at least one language option (e.g., `th: 60`). |
| LOW | `WelcomeLanguagePicker.tsx:75` | `safeLocalStorage()` uses a bare `try/catch` that catches at function call time (when the object is created), not at each individual `get`/`set` call. If `localStorage` is initially accessible but a storage quota error occurs during `set`, the error propagates uncaught to the caller. Quota errors (`QuotaExceededError`) are real on some iOS Safari private modes even when `localStorage` itself is accessible. | Wrap each `localStorage.getItem` and `localStorage.setItem` call in individual try/catch within the returned object methods. |
| LOW | `WelcomeLanguagePicker.tsx:104` | `aria-label` on language buttons uses native name only: `"ไทย (th)"`. Screen reader users relying on screen readers configured for English will hear "ไทย" without recognizing it. The spec §Accessibility states "each language button should have `aria-label` with both native and English name". The English name (`LANGUAGE_LABELS_EN`) is available in `@shared/i18n` but is not imported. | Import `LANGUAGE_LABELS_EN` and use `aria-label={`${LANGUAGE_LABELS[lang]} — ${LANGUAGE_LABELS_EN[lang]}`}`. |
| LOW | `App.tsx:426` | `<WelcomeLanguagePicker />` is placed **outside** any authentication gate (it is a sibling of `<Router />` directly under `TooltipProvider`). The component itself has no auth check (see HIGH-2 above). In contrast, `<GlobalAlerts />` and `<SystemHealthBanner />` are also ungated, but those are designed to be public. The placement is correct per the spec ("inside AuthProvider, inside I18nextProvider") — both are satisfied. However, the position is before `<Router />`, meaning on the very first render before route-based lazy loading completes, the tRPC query fires against `protectedProcedure`. This is safe architecturally only if an auth check is added (HIGH-2 fix). | No placement change needed; implement HIGH-2 fix to gate the query on `isAuthenticated`. |

---

### Contract Compliance

| Requirement | Status | Notes |
|---|---|---|
| Spec §Dependencies: `i18next.changeLanguage()` called on selection | PASS | Line 76: `void i18next.changeLanguage(lang)` |
| Spec §Dependencies: `users.updatePreferences` called with `translationLanguage` | PASS | Line 79: `updatePreferences({ translationLanguage: lang as SupportedLanguage })` |
| Spec: `LOCALE_CHOSEN_KEY = 'smartspec_locale_chosen'` | PASS | Constant defined at line 36 |
| Spec: `LOCALE_KEY = 'smartspec_locale'` | PASS | Constant defined at line 37 |
| Spec: `MIN_COVERAGE = 50` | PASS | Constant defined at line 38 |
| Spec: English excluded from grid, always shown as "Continue" button | PASS | Line 67-70 filter excludes `"en"`, footer button always renders |
| Spec: Defense-in-depth guard on `handleSelect` | PASS | Line 74: `SUPPORTED_LANGUAGES.includes(lang)` guard present |
| Spec: `handleDismiss` does NOT call `i18next.changeLanguage` | PASS | Lines 83-86 — no changeLanguage call |
| Spec: Wait for `isSuccess || isError` before showing modal | PASS | Lines 61 |
| Spec: On query error, treat as "no preference set" (show modal) | PASS | `isError` branch shows modal |
| Spec: localStorage unavailable — graceful degradation | PARTIAL | `safeLocalStorage` catches outer failure; individual `set` calls not guarded (LOW-1) |
| Spec §Accessibility: `DialogTitle` + `DialogDescription` present | PASS | Lines 92-95 |
| Spec §Accessibility: `aria-label` on each language button | PARTIAL | Present but missing English name (LOW-2) |
| Spec §Accessibility: `showCloseButton={true}` on DialogContent | FAIL | `<DialogContent>` at line 90 omits `showCloseButton` prop. Spec explicitly requires `showCloseButton={true}`. If the ui/dialog component defaults to hidden, the close affordance is missing for keyboard/mouse users. |
| Spec: "does not render when user is not authenticated" | FAIL | No auth gate in component (HIGH-2); no test for this case (MEDIUM-2) |
| App.tsx: inside `I18nextProvider` | PASS | Confirmed in App.tsx:417 tree |
| App.tsx: inside `AuthProvider` | PASS (tree only) | Present inside `<AuthProvider>` in tree but component does not consume it — see HIGH-2 |
| `users.updatePreferences` Zod schema accepts `SupportedLanguage` enum | PASS | Confirmed in `server/routers/users.ts:757` |
| Current production state: grid is empty (th=15% < 50%) | CONFIRMED | All non-en languages have 0% or 15% coverage — modal will always show with empty grid |

---

### Summary

The component correctly implements the happy-path spec: storage guards, allowlist validation, query gating, and dismiss behavior are all present. There are two HIGH-severity gaps: `safeLocalStorage` is re-instantiated on every render (stale-closure risk), and the component has no authentication gate, which causes the `protectedProcedure` query to throw 401 for unauthenticated users and the `isError` path to then open the modal on public pages. The test suite has a near-duplicate pair that should be collapsed, and 5 of the 14 spec-mandated tests are missing entirely — notably all Thai-selection behavior tests and the unauthenticated-user test. The `showCloseButton` prop is absent from `DialogContent`, contradicting the spec's explicit requirement.
