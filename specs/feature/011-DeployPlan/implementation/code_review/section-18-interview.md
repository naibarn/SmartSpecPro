# Section 18: Auth Hardening - Code Review Interview

## Auto-fixes Applied

1. **IP address CSRF bypass in production** - `isAllowedOrigin` accepted ANY IPv4 address in all environments. Gated behind `process.env.NODE_ENV !== 'production'` so IP addresses are only allowed in development.

2. **Bearer token bypass validation** - Added `authHeader.length > 7` check so `Authorization: Bearer ` (empty token) doesn't bypass CSRF. A non-empty Bearer token is still required.

3. **Unused `vi` import** - Removed unused `vi` import from session-validation.test.ts.

4. **Import path consistency** - Changed `../../shared/const` to `@shared/const` matching existing import convention in context.ts, oauth.ts, etc.

5. **Updated CSRF tests** - Added production mode test for IP address rejection; updated `isAllowedOrigin` test function to accept `isProduction` parameter.

## Decisions (Let Go)

- **SameSite=none kept** - Needed for cross-subdomain cookie sharing. The CSRF middleware provides equivalent protection.
- **Tests use inline logic** - Acceptable for config validation; `getSessionCookieOptions` is tested with real import.
- **No DB sessions** - Correctly kept stateless JWT + JTI revocation architecture.
- **smartspec.pro in ALLOWED_SUFFIXES** - Pre-existing, not introduced by this section.
- **No integration test** - Would need full Express setup; unit tests cover the logic.
