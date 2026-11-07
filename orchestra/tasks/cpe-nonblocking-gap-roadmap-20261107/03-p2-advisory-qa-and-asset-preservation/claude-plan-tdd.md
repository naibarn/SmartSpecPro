# P2 Focused Test Plan

## Advisory QA matrix

Inject: low cinematic score, frame continuity warning, `minor_drift`, `identity_break`, no samples, unavailable vision, timeout, malformed response, report DB failure and stale result after clip replacement. For each, assert the existing asset remains in the active pack, run/media status remains successful, and the same tenant can inspect/download it.

## Repair/version matrix

For successful current repair, failed generation, schema-invalid repair, artifact not ready, checksum/ownership failure, stale source version, and concurrent user upload: assert only verified owner-scoped candidates activate; otherwise the previous asset ID/version and URL remain current. Assert explicit action and budget/idempotency for each paid retry.

## Assembly matrix

Test all clips complete, one technical failure with explicit partial assembly, one CPE warning, zero complete clips, missing/corrupt required media, and still-image fallback. Verify a CPE warning does not block assembly; technical invalidity still does; partial/fallback labeling is accurate.

## Commands

Add focused Vitest coverage under QC/identity/episode repair/assembly/router suites. Run `pnpm --filter @smartspec/web exec vitest run <focused files>`. Use authenticated UI verification for warning visibility and media download after implementation reaches the UI. Never run broad typecheck locally.
