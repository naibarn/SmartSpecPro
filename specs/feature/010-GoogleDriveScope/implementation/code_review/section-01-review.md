# Section 01 Review: Admin Configuration -- Google OAuth App Settings

## HIGH Severity

**1. Misleading success message** — says "credentials are valid" but only checks format + endpoint reachability. Actual credential validation requires token exchange.
- **Recommendation:** Change to honest message.

**2. No fetch timeout** — `fetch()` to Google has no AbortController. Can hang indefinitely.
- **Recommendation:** Add 10s timeout.

## MEDIUM Severity

**3. Vitest tests test a local copy of validation logic, not the production code**
- **Recommendation:** Extract validation to shared util or test actual router.

**4. Python tests import inside `with` blocks** — module caching may cause pollution.
- Minor risk, acceptable for now.

**5. `clear=True` on os.environ in one test** — dangerous in CI, wipes all env vars.
- **Recommendation:** Only clear specific Google env vars.

**6. Info box lacks dark mode styling**
- **Recommendation:** Add dark: variants to match codebase patterns.

## LOW Severity

**7. `error: any` in catch block** — matches existing pattern, acceptable.

**8. Plan specified save/get tests that were not implemented** — those procedures already existed.

**9. `&amp;` in JSX** — non-idiomatic but harmless.

**10. Python function doesn't validate redirectUri** — has a default fallback, low risk.
