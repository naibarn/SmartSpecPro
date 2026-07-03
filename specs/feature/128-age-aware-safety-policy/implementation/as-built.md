# Spec 128 Age-Aware Safety Policy As-Built

## Completed Implementation Scope

- Section 01: Added central age-safety policy primitives, jurisdiction presets, age calculation, policy evaluation, rollout modes, and feature flags.
- Section 02: Added safety profile preference model/service for date of birth, country, profile versioning, completion status, and child-safe fallback.
- Section 03: Added generalized Security PIN helpers plus protected-surface unlock tokens with day/session/profile/policy invalidation inputs.
- Section 04: Added tenant feature flags, central policy service, audit event types, redaction helpers, and shared enforcement response helpers.
- Section 05: Added backend completion status/update endpoints and a post-auth client route gate controlled by `ageSafetyProfileCompletionGate`.
- Section 06: Added chat request/output enforcer and wired `/api/llm/*` proxy preflight before provider dispatch with redacted provider instruction injection.
- Section 07: Added media prompt enforcer and wired image/video/audio sync and async generation before abuse guard, credit reservation, and provider dispatch.
- Section 08: Added generated asset safety metadata and viewer policy service; async media jobs receive compact `__age_safety` metadata in provider params.
- Section 09: Added actor context builder for human/API/delegated/system actors and protected token scope resolution.
- Section 10: Added user-facing API surface for safety profile, Security PIN, and protected unlock tokens; client token storage/logout clearing is wired.
- Section 11: Added audit logging path with sensitive field redaction for policy decisions and unlock/admin/profile events.
- Section 12: Added focused unit coverage and passed full web TypeScript check.

## Verification

- `cd apps/web && npm test -- server/services/ageSafeChatEnforcer.test.ts server/services/ageSafeMediaEnforcer.test.ts server/services/agePolicyEnforcer.test.ts server/services/generatedAssetSafetyService.test.ts server/services/protectedSurfaceTokenService.test.ts server/services/securityPinService.test.ts server/services/ageSafetyProfileService.test.ts shared/__tests__/ageSafetyPolicy.test.ts shared/__tests__/ageSafetyFeatureFlags.test.ts`
- `cd apps/web && npm run check -- --pretty false`

## Notes

- Existing Private Vault PIN remains supported as a fallback source for Security PIN reads.
- Blocking rollout is tenant-flagged and defaults off through the feature flag defaults.
- The implementation stores profile/security state in the existing `users.userPreferences` JSON column to match existing private-vault preference patterns.
- DB migration assessment: no structural migration is required for this implementation wave because `apps/web/drizzle/schema.ts` only extends the TypeScript JSON shape for the already-existing `userPreferences` column; no table, column, index, enum, or constraint changed.
- Full visual admin policy editing can build on the new policy service and flags; this implementation provides the enforcement and API foundation first.
