I now have all the context needed. Let me produce the section content.

# Section 12 -- Wave 1: Navigation and Auth Page Migration

## Section ID

`section-12-wave1-nav-auth`

## Dependencies

- **section-06-backward-compat** -- backward-compat `useI18n()` wrapper must be in place so existing consumers are not broken while new `useTranslation()` calls are introduced alongside them.
- **section-08-locale-files** -- the `locales/en/nav.json`, `locales/en/auth.json`, `locales/th/nav.json`, `locales/th/auth.json` files must exist with at least stub keys. This section populates them fully and wires components.
- **section-10-locale-toggle** -- `LocaleToggle.tsx` must already be migrated to use `useTranslation()` and `i18next.changeLanguage()`.

## Goal

Extract all hardcoded English strings from navigation components (sidebar menu, Navbar header, breadcrumbs, user menu) and authentication pages (Login, Signup, ForgotPassword, AuthCallback, VerifyEmail, 2FA flows) into the `nav` and `auth` i18next namespaces. Replace inline strings with `t()` calls. Add Thai translations for all extracted keys.

---

## Background: Current Hardcoded Strings

### Navigation

The sidebar is driven by **`packages/shared/src/constants/menu.ts`** which defines `defaultMenuItems` with `label` (English) and optional `labelTh` (Thai) fields. These labels are consumed in `apps/web/client/src/hooks/useMenuItems.ts` via `getResolvedMenuItems()`. The `DashboardLayout.tsx` component also contains hardcoded strings like "Sign in to continue" and "Access to this dashboard requires authentication."

The public marketing `Navbar.tsx` (`apps/web/client/src/components/Navbar.tsx`) has hardcoded `navItems` with labels: "Home", "Features", "Workflows", "Pricing", "Gallery", "Marketplace", "Skills", "Agencies", "Docs", "Blog", "Contact".

The breadcrumb component at `apps/web/client/src/components/ui/breadcrumb.tsx` is a pure UI primitive (no hardcoded labels). Breadcrumb labels are set per-page; those pages will be migrated as they are reached in their respective wave sections.

### Auth Pages

All auth pages contain extensive hardcoded English strings:

- **`pages/Login.tsx`** -- "Welcome back to the future of development", "Sign in to continue building amazing applications with AI-powered tools.", form labels ("Email", "Password"), button text ("Sign In", "Forgot Password?"), OAuth buttons ("Continue with Google", "Continue with GitHub"), 2FA challenge strings, toast messages.
- **`pages/Signup.tsx`** -- Plan names ("Free", "Pro"), feature bullet points, form labels ("Full Name", "Email", "Password"), invite code section, terms acceptance, social login.
- **`pages/ForgotPassword.tsx`** -- Multi-step flow strings ("Choose recovery method", "Send code to backup email", "Send code via SMS"), form labels, toast messages.
- **`pages/AuthCallback.tsx`** -- "Processing authentication...", "Meta Pages connected! Redirecting...", error states.
- **`pages/VerifyEmail.tsx`** -- Email verification flow strings.

---

## Files to Create

### `/home/dev/projects/SmartSpecPro/apps/web/client/src/locales/en/nav.json`

Populate with all navigation string keys. Structure using dot-free flat keys or shallow nesting. Key naming convention: `camelCase` grouping by area.

Required key groups (approximately 30+ keys):

```
sidebar.dashboard, sidebar.chat, sidebar.mediaStudio, sidebar.skills,
sidebar.workflows, sidebar.webhookTriggers, sidebar.agencies, sidebar.teams,
sidebar.automationCopilot, sidebar.socialChannels, sidebar.socialInbox,
sidebar.socialPublishing, sidebar.socialModeration, sidebar.socialAutomation,
sidebar.mediaHistory, sidebar.library, sidebar.privateFiles, sidebar.presentations,
sidebar.groups, sidebar.saasFactory, sidebar.terminal, sidebar.cli,
sidebar.dockerSandbox, sidebar.videoEditor, sidebar.credits, sidebar.usageAnalytics,
sidebar.myFeedback, sidebar.settings, sidebar.taskQueue,

header.search, header.notifications, header.userMenu, header.signOut,
header.profile, header.settings,

navbar.home, navbar.features, navbar.workflows, navbar.pricing,
navbar.gallery, navbar.marketplace, navbar.marketplaceSkills,
navbar.marketplaceAgencies, navbar.docs, navbar.blog, navbar.contact,
navbar.signIn, navbar.getStarted,

layout.signInToContinue, layout.authRequired
```

### `/home/dev/projects/SmartSpecPro/apps/web/client/src/locales/th/nav.json`

Thai translations for all nav keys. Many already exist in `packages/shared/src/constants/menu.ts` as `labelTh` fields -- extract and reuse those values.

### `/home/dev/projects/SmartSpecPro/apps/web/client/src/locales/en/auth.json`

Populate with all auth page string keys. Required key groups (approximately 60+ keys):

```
login.title, login.subtitle, login.emailLabel, login.emailPlaceholder,
login.passwordLabel, login.passwordPlaceholder, login.rememberMe,
login.forgotPassword, login.signIn, login.signingIn, login.noAccount,
login.createAccount, login.continueWithGoogle, login.continueWithGithub,
login.or, login.successRedirecting, login.invalidCredentials, login.loginFailed,

login.features.codeGen, login.features.aiModels, login.features.collaborate,

login.twoFa.title, login.twoFa.subtitle, login.twoFa.enterCode,
login.twoFa.verify, login.twoFa.lostAccess, login.twoFa.backToVerify,
login.twoFa.resetTitle, login.twoFa.resetSubtitle,
login.twoFa.sendToBackupEmail, login.twoFa.sendViaSms,
login.twoFa.noBackupMethods, login.twoFa.enterResetCode,

login.verification.title, login.verification.subtitle,
login.verification.resend, login.verification.codeSent,
login.verification.resendFailed,

signup.title, signup.subtitle, signup.fullName, signup.email, signup.password,
signup.confirmPassword, signup.inviteCode, signup.agreeTerms,
signup.createAccount, signup.alreadyHaveAccount, signup.signIn,
signup.planFree, signup.planPro,

forgot.title, forgot.chooseMethod, forgot.sendToEmail,
forgot.sendToBackupEmail, forgot.sendViaSms, forgot.enterCode,
forgot.newPassword, forgot.confirmPassword, forgot.resetPassword,
forgot.codeSent, forgot.resetSuccess, forgot.backToLogin,

callback.processing, callback.success, callback.error,
callback.metaConnected, callback.redirecting,

verify.title, verify.checkEmail, verify.codeLabel, verify.verify, verify.resend
```

### `/home/dev/projects/SmartSpecPro/apps/web/client/src/locales/th/auth.json`

Thai translations for all auth keys.

---

## Files to Modify

### `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/Navbar.tsx`

**Change**: Import `useTranslation` from `react-i18next`. Replace the hardcoded `navItems` array labels with `t('nav:navbar.home')`, `t('nav:navbar.features')`, etc. The `navItems` array should be built inside the component (or a hook) so `t()` is available.

**Pattern**:
```typescript
const { t } = useTranslation('nav');
const navItems: NavItem[] = [
  { href: '/', label: t('navbar.home') },
  { href: '/features', label: t('navbar.features') },
  // ...
];
```

Also translate the "Sign In" and "Get Started" buttons in the header.

### `/home/dev/projects/SmartSpecPro/apps/web/client/src/hooks/useMenuItems.ts`

**Change**: The `getResolvedMenuItems()` function currently returns `label` (English) from the shared `defaultMenuItems`. This section does NOT modify the shared `packages/shared` package (it must remain dependency-free). Instead, modify the hook in `useMenuItems.ts` to look up the translation:

- Import `i18next` (the singleton instance, not a hook -- this is a plain function, not a React component).
- For each menu item, check if `i18next.exists('nav:sidebar.' + item.id)` is true; if so, use `i18next.t('nav:sidebar.' + item.id)` as the display label. Otherwise fall back to `item.label`.
- This approach means labels self-update when language changes because sidebar re-renders.

**Alternative (if `getResolvedMenuItems` is called from a React component context)**: Create a new wrapper hook `useTranslatedMenuItems()` that calls `useTranslation('nav')` and maps the `label` fields. The existing `getResolvedMenuItems` stays unchanged; the new hook wraps it.

### `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/DashboardLayout.tsx`

**Change**: Import `useTranslation` from `react-i18next`. Replace:
- `"Sign in to continue"` with `t('nav:layout.signInToContinue')`
- `"Access to this dashboard requires authentication..."` with `t('nav:layout.authRequired')`
- `"Sign in"` button label with `t('auth:login.signIn')`

### `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Login.tsx`

**Change**: Import `useTranslation` from `react-i18next`. Add `const { t } = useTranslation('auth');` at component top. Replace all hardcoded strings with `t()` calls referencing `auth` namespace keys. Examples:

- `"Welcome back to the future of development"` becomes `t('login.title')`
- `"Email"` label becomes `t('login.emailLabel')`
- `"Sign In"` button becomes `t('login.signIn')`
- Toast messages: `toast.success(t('login.successRedirecting'))`, `toast.error(t('login.invalidCredentials'))`
- Feature list strings become `t('login.features.codeGen')`, etc.
- 2FA section strings use `t('login.twoFa.title')`, etc.
- Verification section strings use `t('login.verification.title')`, etc.

### `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Signup.tsx`

**Change**: Same pattern. Import `useTranslation('auth')`. Replace plan names, form labels, feature bullets, button text, and toast messages with `t()` calls using `auth` namespace keys prefixed with `signup.`.

### `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/ForgotPassword.tsx`

**Change**: Import `useTranslation('auth')`. Replace all step/flow strings, form labels, toast messages with `t()` calls using `auth` namespace keys prefixed with `forgot.`.

### `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AuthCallback.tsx`

**Change**: Import `useTranslation('auth')`. Replace status messages with `t()` calls using `auth` namespace keys prefixed with `callback.`.

### `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/VerifyEmail.tsx`

**Change**: Import `useTranslation('auth')`. Replace verification flow strings with `t()` calls using `auth` namespace keys prefixed with `verify.`.

---

## TDD Expectations

### Test File: `apps/web/client/src/i18n/__tests__/wave1-nav-auth-keys.test.ts`

This test validates that the locale JSON files have the required keys and structure.

```
# Test: en/nav.json is valid JSON with only string values (no nested objects beyond 1 level)
# Test: en/nav.json contains all required sidebar keys (sidebar.dashboard, sidebar.chat, sidebar.mediaStudio, ...)
# Test: en/nav.json contains all required navbar keys (navbar.home, navbar.features, ...)
# Test: en/nav.json contains header keys (header.signOut, header.profile, ...)
# Test: en/nav.json has no empty string values
# Test: th/nav.json keys are a subset of en/nav.json keys
# Test: th/nav.json has no empty string values

# Test: en/auth.json is valid JSON with only string values
# Test: en/auth.json contains all required login keys (login.title, login.emailLabel, login.signIn, ...)
# Test: en/auth.json contains all required signup keys (signup.title, signup.email, signup.createAccount, ...)
# Test: en/auth.json contains all required forgot keys (forgot.title, forgot.chooseMethod, ...)
# Test: en/auth.json contains callback keys (callback.processing, callback.success, callback.error)
# Test: en/auth.json contains verify keys (verify.title, verify.verify, verify.resend)
# Test: en/auth.json has no empty string values
# Test: th/auth.json keys are a subset of en/auth.json keys
# Test: th/auth.json has no empty string values
```

### Test File: `apps/web/client/src/components/__tests__/Navbar.i18n.test.tsx`

```
# Test: Navbar renders translated nav item labels when i18next is initialized
# Test: Navbar sign-in button uses translated text
# Test: Navbar renders English labels when Thai translation is missing (fallback)
```

**Mocking pattern**: Use `vi.mock('react-i18next')` returning a `useTranslation` that returns a `t` function resolving keys from a test dictionary. Alternatively, initialize a real i18next instance with in-memory resources.

### Test File: `apps/web/client/src/pages/__tests__/Login.i18n.test.tsx`

```
# Test: Login page renders translated title text
# Test: Login page renders translated email/password labels
# Test: Login page renders translated sign-in button
# Test: Login page 2FA section renders translated strings
# Test: Login page shows English fallback when translation key is missing
```

### Test File: `apps/web/client/src/pages/__tests__/Signup.i18n.test.tsx`

```
# Test: Signup page renders translated form labels
# Test: Signup page renders translated plan names
# Test: Signup page renders translated create-account button
```

### Test File: `apps/web/client/src/pages/__tests__/ForgotPassword.i18n.test.tsx`

```
# Test: ForgotPassword page renders translated title
# Test: ForgotPassword recovery method options use translated text
# Test: ForgotPassword reset form uses translated labels
```

---

## Implementation Notes

### Key Naming Convention

All keys use **dot-separated flat structure** within the namespace. The namespace itself provides the top-level grouping:

- `nav` namespace: `sidebar.<menuItemId>`, `navbar.<label>`, `header.<label>`, `layout.<label>`
- `auth` namespace: `login.<field>`, `signup.<field>`, `forgot.<field>`, `callback.<field>`, `verify.<field>`

### Sidebar Label Strategy

The shared `packages/shared/src/constants/menu.ts` already has `labelTh` for many menu items. The migration approach is:

1. Copy all `labelTh` values into `locales/th/nav.json` under `sidebar.<id>` keys.
2. Copy all `label` values into `locales/en/nav.json` under `sidebar.<id>` keys.
3. The `useMenuItems.ts` hook (or a new `useTranslatedMenuItems` wrapper) resolves the label via i18next at render time.
4. The `labelTh` field in shared/menu.ts remains untouched for now (backward compatibility). It can be removed in Wave 3 cleanup.

### Toast Messages with Interpolation

Some toast messages include dynamic values (e.g., `"Signed in. ${result.recoveryCodesRemaining} recovery codes remaining."`). Use i18next interpolation:

- Key: `login.twoFa.signedInWithRecovery`
- Value: `"Signed in. {{count}} recovery codes remaining."`
- Call: `t('login.twoFa.signedInWithRecovery', { count: result.recoveryCodesRemaining })`

Similarly for OAuth error messages that include provider names:

- Key: `login.oauthNotConfigured`
- Value: `"{{provider}} OAuth is not configured. Please contact your administrator."`
- Call: `t('login.oauthNotConfigured', { provider })`

### Security Reminders

- **S3**: Always render translated strings as React children (`<p>{t('key')}</p>`), never via `dangerouslySetInnerHTML`. The `escapeValue: false` config is safe only because React escapes text nodes automatically.
- **S4**: All values in locale JSON files MUST be plain text only — no HTML tags, no script content. Run `grep -rP '<[a-z]' locales/` in CI to detect violations.

### Auth Pages: Non-Translatable Content

The following should NOT be translated:

- Brand name "SmartAIHub" -- keep hardcoded
- OAuth provider names ("Google", "GitHub") -- keep hardcoded, but the surrounding text ("Continue with") is translated
- Technical values (email addresses, phone numbers, URLs)
- Validation regex messages that reference technical patterns

### Parallel with section-13

This section can be implemented in parallel with `section-13-wave1-dashboard-common`. There are no file conflicts: section-12 owns `nav.json`, `auth.json`, Navbar, Login, Signup, ForgotPassword, AuthCallback, VerifyEmail. Section-13 owns `dashboard.json`, `common.json`, `errors.json`, Dashboard page, and shared UI patterns.

The only shared dependency is `DashboardLayout.tsx`, which this section modifies for the `layout.*` nav keys and the sign-in button. If section-13 also needs to touch `DashboardLayout.tsx` for common/error strings, coordinate to avoid merge conflicts by having section-12 handle only the nav-namespace strings in that file.

## Implementation Notes (Actual)

**Files modified:**
- `apps/web/client/src/locales/en/nav.json` — expanded from 20 → 52 keys
- `apps/web/client/src/locales/th/nav.json` — expanded to match
- `apps/web/client/src/locales/en/auth.json` — expanded from 20 → 82 keys (login/signup/forgot/callback/verify)
- `apps/web/client/src/locales/th/auth.json` — full Thai translations added
- `apps/web/client/src/components/Navbar.tsx` — migrated to useTranslation('nav'); all nav labels + buttons use t()
- `apps/web/client/src/hooks/useMenuItems.ts` — added i18next.t() lookup with item.label fallback
- `apps/web/client/src/components/DashboardLayout.tsx` — layout.* strings replaced
- `apps/web/client/src/pages/Login.tsx` — useTranslation added; key strings replaced
- `apps/web/client/src/pages/AuthCallback.tsx` — all status messages use t()
- `apps/web/client/src/pages/Signup.tsx`, `ForgotPassword.tsx`, `VerifyEmail.tsx` — imports added

**Files created:**
- `apps/web/client/src/i18n/__tests__/wave1-nav-auth-keys.test.ts` (17 tests)
- `apps/web/client/src/components/__tests__/Navbar.i18n.test.tsx` (6 tests)

**Code review fixes:**
- HIGH: Mobile Navbar buttons now use t()
- HIGH: Dashboard.tsx subscribes to 'nav' namespace to trigger re-renders on language change
- HIGH: AuthCallback non-meta success/error paths now use t()
- MEDIUM: Tests extended to cover all navbar keys + layout.signIn key

**Deferred:** Login.i18n, Signup.i18n, ForgotPassword.i18n test files (to Wave 2 when full string replacement done)