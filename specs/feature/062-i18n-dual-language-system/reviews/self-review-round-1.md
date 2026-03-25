# Self-Review Round 1 (Adversarial)

## Findings

1. **shared/i18n.ts** — New shared file for SUPPORTED_LANGUAGES needed explicit mention → Fixed in plan section 3.11
2. **LANGUAGE_COVERAGE** — Static build-time map is acceptable for Phase 1. Future: could be API endpoint for dynamic coverage.
3. **RouteLoadingSkeleton** — Suspense catches both component + namespace loading. Skeleton UX is an improvement over current `fallback={null}`.
4. **Backward compat namespace gap** — `InviteCodeDashboard.tsx` uses `invite.*` keys not in `help` or `common`. Fixed: wrapper now loads `['help', 'common', 'admin']`.
5. **Concurrent language change** — If user changes language while namespaces are loading, in-flight requests for the old language complete but are wasted. i18next handles this gracefully (addResourceBundle for unused language is harmless). No fix needed.

## Changes Made
- Plan section 3.9: Added `admin` to backward compat wrapper namespace list
- Plan section 3.11: Clarified `shared/i18n.ts` as canonical location

## Regression Check
- Section 3.9 change doesn't affect other sections (wrapper is isolated)
- Section 3.11 change is consistent with section 3.2 (config.ts imports from shared)
- No cross-references broken
