# Section 09 — Code Review Interview

## Review Findings Triage

### Auto-fixed (applied without user input)

1. **HIGH: Feature flag not registered** — Added `notificationUnifiedCenter` to `TenantFeatureFlags`, `ALLOWED_FEATURE_FLAGS`, and `FEATURE_FLAG_DEFAULTS` in `featureFlags.ts`. Updated page and menu to use `notificationUnifiedCenter` key.

2. **HIGH: Severity filter values mismatch** — Server uses `low/normal/high/critical`. Changed severity dropdown options from `info/warning/error/critical` to `low/normal/high/critical` with human-friendly labels via `SEVERITY_LABELS` map. Updated `bySeverity` chart to match.

3. **MEDIUM: Admin guard excludes domain_admin** — Changed guard to allow both `admin` and `domain_admin` roles, consistent with backend `adminProcedure`. Added test case for domain_admin access.

4. **LOW: actionUrl XSS** — Added `isSafeUrl()` check: only `http://` and `https://` URLs render as clickable links. Others render as plain text.

5. **LOW: readAt field missing** — Added `readAt` to the interface and display in the detail panel timestamps section.

### Let go (not fixing)

1. **MEDIUM: `bySeverity` empty stub** — This is a section-08 data concern, not section-09's scope.
2. **MEDIUM: Chart test scoping** — Tests work correctly with current assertions.
3. **MEDIUM: Filter interaction tests** — 19 tests provide adequate coverage for this admin-only page.
4. **LOW: `as any` cast on items** — Kept for now since the tRPC type inference requires the full router type chain. Will be resolved when TypeScript check covers the full chain.
5. **LOW: Out-of-scope menu key corrections** — The reviewer flagged changes that don't exist in our diff (false positive).
