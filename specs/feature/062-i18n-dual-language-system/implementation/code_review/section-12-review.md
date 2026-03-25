# Section 12 Review — Wave 1: Navigation and Auth Page Migration

**Spec**: `specs/feature/062-i18n-dual-language-system/sections/section-12-wave1-nav-auth.md`
**Diff**: `specs/feature/062-i18n-dual-language-system/implementation/code_review/section-12-diff.md`
**Reviewer**: CMD-8 (SSP Reviewer Agent)
**Date**: 2026-03-25

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `Navbar.tsx:265–275` (mobile menu) | Mobile "Sign In" and "Get Started Free" buttons are hardcoded English strings — not replaced with `t()`. The diff patches the desktop buttons but the mobile menu section retains literal text `"Sign In"` and `"Get Started Free"`. | Replace with `{t('navbar.signIn')}` and `{t('navbar.getStarted')}` in the mobile `<Button>` elements at lines 265–275 of the post-patch file. |
| HIGH | `useMenuItems.ts:106` | `getResolvedMenuItems` is a plain function called directly from `Dashboard.tsx` (not a hook). It reads `i18next.t()` synchronously at call time but there is no mechanism to re-call it when the language changes. `Dashboard.tsx` does not subscribe to `i18next.on('languageChanged')` and has no `useTranslation` that would trigger a React re-render. The sidebar labels will be stale after the user toggles language without a page reload. | Either (a) create a `useTranslatedMenuItems()` wrapper hook that calls `useTranslation('nav')` — the re-render on language change happens automatically — and replace the three `getResolvedMenuItems()` calls in `Dashboard.tsx`, OR (b) add a `useTranslation('nav')` call in `Dashboard.tsx` to subscribe to language changes (the returned `t` need not be used; the subscription is sufficient to cause re-render). Option (a) is the spec's preferred "Alternative" path. |
| HIGH | `AuthCallback.tsx:98–99` | The non-meta success path (`setMessage('Authentication successful! Redirecting...')`) is still a hardcoded English string. The error-catch path (`error instanceof Error ? error.message : 'Authentication failed'`) also hardcodes the fallback string. Only the meta OAuth path was translated. | Replace the success message with `t('callback.success')` + `' ' + t('callback.redirecting')` (matching the meta path pattern). For the error fallback, use `t('callback.error')`. |
| MEDIUM | `en/auth.json` (key naming) | Spec §Key Naming Convention and §TDD Expectations define `signup.*` (lowercase) as the auth namespace prefix. The implementation uses `signUp.*` (camelCase U) throughout — in both JSON files (`signUp.title`, `signUp.email`, etc.) and the test's `REQUIRED_SIGNUP_KEYS` array. This is an internal inconsistency with the spec. It will not cause runtime failures today (Signup.tsx has only the hook added, no `t()` calls yet), but any future `t('signup.email')` call from the spec will return the key string instead of the value. | Standardise on one casing. The spec uses `signup.` (all-lowercase). Rename all `signUp.*` keys in both `en/auth.json` and `th/auth.json`, update `REQUIRED_SIGNUP_KEYS` in the test, and update the Signup.tsx strings when they are replaced in the next wave. |
| MEDIUM | `wave1-nav-auth-keys.test.ts` — `REQUIRED_LAYOUT_KEYS` | The test asserts `layout.signInToContinue` and `layout.authRequired` but does NOT assert `layout.signIn`. The DashboardLayout diff uses `t('layout.signIn')` at line 37 of the diff, and the key is present in `en/nav.json` and `th/nav.json`. A test gap means accidental removal of `layout.signIn` would go undetected. | Add `"layout.signIn"` to `REQUIRED_LAYOUT_KEYS` in `wave1-nav-auth-keys.test.ts`. |
| MEDIUM | `wave1-nav-auth-keys.test.ts` — `REQUIRED_NAVBAR_KEYS` | Required navbar keys in the test omit `navbar.workflows`, `navbar.gallery`, `navbar.docs`, `navbar.blog`, `navbar.contact`, `navbar.marketplace`, `navbar.marketplaceSkills`, `navbar.marketplaceAgencies`. All are present in the JSON and used in `Navbar.tsx`. A deletion of any of these keys would pass the test. | Extend `REQUIRED_NAVBAR_KEYS` to cover all 13 keys used in `navItems`. |
| MEDIUM | `Navbar.i18n.test.tsx` — structural test quality | All 6 Navbar tests are source-text substring assertions (`navbarSrc.toContain(...)`). They verify the source code was mechanically transformed but do not verify runtime rendering — a key could be present in source but the `useTranslation` call could be mocked out or pointing to the wrong namespace. The "no hardcoded Sign In" guard (line 193–196) strips `t(...)` calls but only checks for `>Sign In<` — it misses `>Sign In ` (trailing space), `Sign In\n`, or JSX text nodes split across lines. | Supplement with at least one render test using `@testing-library/react` that mounts `<Navbar>` with a real i18next instance (or a typed mock dictionary) and asserts that the rendered DOM contains the expected Thai text when the Thai locale is active. This validates the full pipeline, not just source shape. |
| LOW | `DashboardLayout.tsx` — `layout.authRequired` value mismatch | `en/nav.json` value: `"Access to this dashboard requires authentication. Please sign in to continue."` (adds "Please sign in to continue"). Original hardcoded string in the pre-patch file: `"Access to this dashboard requires authentication. Continue to launch the login flow."` The string was silently reworded during migration. This is not a defect, but it is an unintentional content change bundled into a structural migration commit. | If the rewording is intentional, add a comment in the JSON noting it was deliberate. If not, restore the original phrasing. |
| LOW | `Login.tsx` — partial migration creates a mixed-language boundary | `Login.tsx` has only 3 strings replaced with `t()` (title, subtitle, one heading). Remaining strings in the same render path — `"Email Address"`, `"Password"`, `"Remember me"`, `"Forgot password?"`, `"or continue with email"`, `"Don't have an account?"`, `"Sign up free"` — remain hardcoded English. This is explicitly declared intentional in the task context. | No action required for this wave. Document this as a known partial state in the section implementation note so reviewers of Login.i18n tests (spec-required but not yet written) know to expect failures. |
| LOW | `wave1-nav-auth-keys.test.ts` — spec-required test files not present | Spec §TDD Expectations requires four test files: `wave1-nav-auth-keys.test.ts` (present), `Navbar.i18n.test.tsx` (present), `Login.i18n.test.tsx` (absent), `Signup.i18n.test.tsx` (absent), `ForgotPassword.i18n.test.tsx` (absent). The three auth-page test files are not generated. | Auth-page i18n tests can be deferred until those pages complete full string replacement. However the spec defines them as part of this section — note explicitly in the section plan that they are deferred to the next pass and track them as open items. |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| `en/nav.json` has all spec-required sidebar key groups | PASS | All 29 spec-required sidebar keys present. |
| `en/nav.json` has all spec-required navbar keys | PASS | All 13 navbar keys present. |
| `en/nav.json` has all spec-required header keys | PASS | All 4 header keys present plus `header.settings`, `header.userMenu`. |
| `en/nav.json` has layout keys | PASS | `layout.signInToContinue`, `layout.authRequired`, `layout.signIn` all present. |
| `en/auth.json` has all spec-required login keys | PASS | All login keys present including interpolated `login.twoFa.signedInWithRecovery` and `login.oauthNotConfigured`. |
| `en/auth.json` has all spec-required signup keys | PARTIAL | All keys present but under `signUp.*` casing; spec defines `signup.*`. |
| `en/auth.json` has all spec-required forgot keys | PASS | All 4 required keys present. |
| `en/auth.json` has callback/verify keys | PASS | All callback and verify keys present. |
| `th/nav.json` is a strict subset of `en/nav.json` keys | PASS | Key sets match. |
| `th/auth.json` is a strict subset of `en/auth.json` keys | PASS | Key sets match. |
| No HTML markup in locale values (S4 security) | PASS | All values are plain text; no `<tag>` patterns found. |
| `Navbar.tsx` — navItems moved inside component with `t()` | PASS | Static array correctly moved inside function body; all 9 top-level labels use `t()`. |
| `Navbar.tsx` — mobile menu buttons translated | FAIL | Two hardcoded strings remain in mobile menu (HIGH-1). |
| `useMenuItems.ts` — i18next lookup per item | PASS (partial) | Lookup is correct; reactivity on language change is absent (HIGH-2). |
| `DashboardLayout.tsx` — layout strings replaced | PASS | All 3 strings replaced including `layout.signIn` button. |
| `AuthCallback.tsx` — callback strings translated | PARTIAL | Meta path translated; standard OAuth success/error paths still hardcoded (HIGH-3). |
| `Login.tsx` — hook added, partial strings replaced | PASS (intentional partial) | Hook present; title, subtitle, sign-in heading replaced as expected for wave. |
| `Signup.tsx` — hook added | PASS | Import and hook present; no string replacements yet (intentional). |
| `ForgotPassword.tsx` — hook added | PASS | Import and hook present; no string replacements yet (intentional). |
| `VerifyEmail.tsx` — hook added | PASS | Import and hook present. |
| `i18next` interpolation syntax for `{{count}}` / `{{provider}}` | PASS | Correct mustache syntax used in both en and th JSON values. |
| `useTranslation` namespace argument is `'nav'` for nav components | PASS | Correct. |
| `useTranslation` namespace argument is `'auth'` for auth pages | PASS | Correct. |
| `escapeValue: false` safe because React text nodes auto-escape | PASS | All `t()` calls are used as React children, never via `dangerouslySetInnerHTML`. |
| `wave1-nav-auth-keys.test.ts` covers all JSON namespaces | PASS (with gaps) | Covers all four JSON files; `layout.signIn` and several navbar keys absent from assertions (MEDIUM-2/3). |
| `Navbar.i18n.test.tsx` 6 tests present | PASS | All 6 tests present but render-level coverage is absent (MEDIUM-3). |
| Auth-page i18n test files present | FAIL | Three spec-required test files not generated (LOW-3). |

---

### Summary

The locale JSON files are complete and correctly structured — all key groups required by the spec are present in both English and Thai with no empty values, no HTML injection vectors, and correct i18next interpolation syntax. The Navbar desktop migration is correct, and DashboardLayout's three strings are properly replaced. The three blocking issues are: (1) the mobile Navbar still has two hardcoded English strings that were missed by the diff, (2) `getResolvedMenuItems` reads `i18next.t()` from a plain function with no React subscription, so sidebar labels will not update live when the user toggles language, and (3) AuthCallback's standard OAuth success path still hardcodes English. The `signUp.*` vs `signup.*` casing divergence from the spec is a latent defect that will surface when Signup.tsx strings are replaced in the next wave and must be resolved before then.

