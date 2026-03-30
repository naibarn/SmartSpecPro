# Section-12 Code Review Interview

## Auto-Fixed Items

### HIGH: Mobile Navbar buttons not translated
**Decision**: Auto-fix
**Action**: Replaced `"Sign In"` and `"Get Started Free"` in mobile menu `<Button>` elements with `{t('navbar.signIn')}` and `{t('navbar.getStarted')}`.

### HIGH: useMenuItems stale labels on language change
**Decision**: Auto-fix
**Action**: Added `useTranslation('nav')` call in `Dashboard.tsx` to subscribe to language changes. This causes React to re-render when language changes, which re-calls `getResolvedMenuItems()` and picks up new i18next.t() values.

### HIGH: AuthCallback.tsx non-meta paths still hardcoded
**Decision**: Auto-fix
**Action**: Replaced `'Authentication successful! Redirecting...'` with `t('callback.success') + ' ' + t('callback.redirecting')` and `'Authentication failed'` fallback with `t('callback.error')`.

### MEDIUM: Test missing `layout.signIn` key
**Decision**: Auto-fix
**Action**: Added `"layout.signIn"` to `REQUIRED_LAYOUT_KEYS` in wave1-nav-auth-keys.test.ts.

### MEDIUM: REQUIRED_NAVBAR_KEYS incomplete in test
**Decision**: Auto-fix
**Action**: Extended to cover all 13 navbar keys from `navItems` array.

## Let-Go Items

### MEDIUM: signUp.* vs signup.* key naming inconsistency
**Decision**: Let go
**Rationale**: The implementation uses `signUp.*` (camelCase) consistently throughout both JSON files and tests. Renaming would require touching ~20 keys in 2 JSON files and tests. The spec example was illustrative, not binding. No runtime impact since Signup.tsx strings haven't been replaced yet. Tracked for Wave 2 cleanup.

### LOW: DashboardLayout authRequired wording change
**Decision**: Let go — intentional rewording (cleaner UX copy).

### LOW: Missing Login.i18n, Signup.i18n, ForgotPassword.i18n test files
**Decision**: Deferred to Wave 2 when those pages complete full string replacement.
