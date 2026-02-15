# Section 14 Code Review: PostHog Analytics Integration

## CRITICAL

### 1. PostHog packages installed in wrong package.json (root vs apps/web)
`posthog-js` and `posthog-node` added to root `package.json` instead of `apps/web/package.json`. May cause resolution issues in the web workspace.

### 2. PostHogPageViewTracker misses initial page load
`prevPath.current` initialized to `location`, so `location !== prevPath.current` is false on first render. First pageview is never captured.

### 3. Sensitive failure_reason leaked to PostHog in login_failed
Raw server error messages sent as `failure_reason` may contain PII. Should use enumerated values.

## IMPORTANT

### 4. Missing `dashboard_viewed` event
Plan requires it on Dashboard mount. Not implemented.

### 5. Missing `rate_limited` event
Plan requires it from rate limit middleware. Not implemented.

### 6. `capture_kie_submit` not wired into media_generation.py
Function exists but never called from anywhere.

### 7. `signup_started` fires on submit, not on page render
Plan says it should fire when form is rendered, not on submit click.

### 8. Login `identify` falls back to email as distinctId
If `result.userId` and `result.id` are both undefined, email becomes the distinct_id, causing identity issues.

### 9. Missing `browser` and `os` properties on `login_succeeded`
Plan specifies these but implementation only sends `auth_method`.

### 10. Unrelated code changes in diff
Text clip validation, new job types, and other changes mixed in.

## SUGGESTION

### 11. `VITE_POSTHOG_HOST` not documented in .env.example
### 12. Client disabled state not cached - minor perf
### 13. Python tests use fragile assertion pattern
### 14. Graceful shutdown swallows ALL errors silently
### 15. No test for `getPostHogServer()` directly
### 16. Python `capture_event` missing `release` and `request_id` properties

## GOOD

- Clean no-op stub pattern in all three layers
- Correct DSN gating
- PostHog shutdown integrated in both Node.js and Python graceful shutdown
- Tests cover core event capture and identity management
- `person_profiles: 'identified_only'` saves cost
