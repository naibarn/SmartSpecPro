# Section 01 Code Review Interview

## Interview Decisions

### Q1: Vitest test tests local copy instead of actual code
**Decision:** Extract to shared util — create `validateGoogleOAuthFormat()` utility and import in both router and test.

## Auto-Fixes Applied

1. **Fix misleading success message** — change to honest message about format validation only
2. **Add 10s fetch timeout** — AbortController on Google endpoint fetch
3. **Fix `clear=True` in Python test** — only clear specific Google env vars
4. **Add dark mode styling** — to Google Drive info box in AdminSettings.tsx
5. **Fix `&amp;` in JSX** — use literal `&` instead
6. **Extract validation function** — to `server/services/googleOAuthValidation.ts`

## Let Go

- `error: any` in catch block — matches existing codebase pattern
- Missing save/get tests — those procedures already exist
- Python import inside `with` blocks — acceptable risk
- redirectUri validation — has default fallback
