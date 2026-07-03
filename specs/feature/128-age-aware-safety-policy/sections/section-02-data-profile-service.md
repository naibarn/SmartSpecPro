# section-02-data-profile-service

## Goal

Persist and serve the user's safety profile: date of birth, country or region of use, profile completion state, policy version, and derived age band. This section provides the backend source of truth used by route guards, chat, media, admin policy, and audit.

## Depends On

- `section-01-policy-foundation`

## Files In Scope

- Existing user schema/migration files, likely under `apps/web/shared/schema.ts`, `apps/web/server/db`, or Drizzle migration folders.
- `apps/web/server/services/ageSafetyProfileService.ts`.
- User router additions in `apps/web/server/routers/users.ts`.
- Auth/session user projection code used by `RequireAuth`.
- Focused tests under server/service and router test folders.

## Test First

Add tests for:

- Creating or updating a safety profile with valid DOB and country.
- Rejecting impossible DOB values, future DOB, unsupported country codes, and ambiguous partial dates.
- Returning structured `country_profile_invalid` for malformed, missing, stale, or unsupported country where non-browser clients cannot be redirected.
- Treating locale, browser language, timezone, IP geolocation, and billing country only as redacted mismatch/risk signals unless a separately reviewed policy says otherwise.
- Deriving age from current date instead of storing a mutable age.
- Unknown profile returning child-under-13 effective policy until completion.
- Policy version and jurisdiction version snapshotting on write.
- Invalidating profile completion projections after DOB, country, tenant, policy, preset, or enforcement-mode changes.
- Existing users without new columns continue to authenticate but are marked profile-incomplete.
- Admin/user reads do not leak full DOB where only effective policy is needed.

## Implementation Requirements

- Store DOB as date-only and country/region as normalized ISO-compatible code or documented region code such as `EU`.
- Store country as user-declared residence, not UI language, locale, timezone, IP-derived country, or billing country.
- Separate raw profile data from derived effective policy. Derived age must be calculated at request time with the service clock.
- Add a safety profile read endpoint suitable for route guards and settings.
- Add an update endpoint gated by either normal profile completion flow or protected PIN logic from section 03 once available.
- Define cache/projection invalidation for profile completion, menu projection, protected-surface unlock state, and policy decisions.
- Ensure migration is backward compatible and nullable for existing users during rollout.
- Do not require country/DOB during database migration. Enforce completion at application gate in section 05.
- Include server-side validation; the frontend must not be trusted.

## Integration Notes

- Route handlers should call `ageSafetyProfileService.getEffectiveProfile(userId, now)` rather than calculating age inline.
- Future admin policy storage in section 04 should be referenced by profile service through version ids, not copied wholesale to user rows.
- Keep the service usable by external actor adapters in section 09.

## Verification

- `cd apps/web && pnpm test -- ageSafetyProfile`
- `cd apps/web && pnpm test -- users`
- `cd apps/web && pnpm check`

## Handoff

Expose a stable service API:

- `getEffectiveSafetyProfile(actorContext, now)`
- `upsertUserSafetyProfile(userId, input, options)`
- `isSafetyProfileComplete(userId)`
- `getProfileCompletionRequirement(actorContext)`
