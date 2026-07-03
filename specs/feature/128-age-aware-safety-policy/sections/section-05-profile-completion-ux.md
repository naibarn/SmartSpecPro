# section-05-profile-completion-ux

## Goal

Enforce production-grade post-login profile completion. If a logged-in user is missing DOB or country/region, route them to a required completion flow before they can use normal product surfaces. Until completion, every protected system path treats them as child-under-13.

## Depends On

- `section-02-data-profile-service`
- `section-03-security-pin-tokens`
- `section-04-admin-policy-audit-flags`

## Files In Scope

- `apps/web/client/src/App.tsx` route guard area around `RequireAuth`.
- Settings/profile pages and route definitions.
- User/auth hooks and query clients used by current login flow.
- Server middleware or response helpers for profile-required errors.
- Tests for route guard, completion page, and server rejection.

## Test First

Add tests for:

- First login with missing DOB/country redirects to safety profile completion page.
- Existing incomplete user cannot reach chat, media, private chat, library, admin surfaces, or normal settings pages except allowed completion/logout/help surfaces.
- Completion succeeds with valid DOB/country and returns to the intended destination.
- Completion errors are user-safe and do not reveal policy internals.
- Non-browser/API callers receive structured `safety_profile_required` or `country_profile_invalid` responses with missing fields and next allowed route instead of browser redirects.
- Authorized admin safety recovery and kill-switch routes remain reachable even when profile completion enforcement is active.
- Completion and menu projections refetch after DOB/country save, tenant switch, policy/preset version changes, enforcement-mode changes, and unlock expiry.
- Users with completed profile are not redirected.
- Server endpoints still enforce profile requirement when client routing is bypassed.

## UI/UX Contract

- States: loading profile, incomplete profile, validation error, saving, saved, server rejected, offline/retry, logout.
- Responsive matrix: completion flow must work on small mobile, tablet, and desktop without overlapping controls or hidden required fields.
- Accessibility: DOB and country fields require labels, keyboard navigation, focus management after validation errors, and screen-reader-compatible error text.
- Browser evidence expected during implementation: desktop and mobile screenshots for incomplete profile, validation error, and successful completion redirect.

## Implementation Requirements

- Add a `RequireCompletedSafetyProfile` guard after authentication and before normal app routes.
- Allow explicit exempt routes only: logout, auth callback handling if needed, safety profile completion, minimal account help, and possibly legal/privacy pages.
- Include Settings/Security and admin safety recovery/kill-switch routes in the exempt list only for the exact authorized users who need them.
- Do not allow users to edit DOB/country from normal settings after initial completion without protected PIN/token from section 03.
- Preserve existing auth behavior and admin/domain admin guards. The new guard should compose with them instead of replacing them.
- The server must return a structured `PROFILE_REQUIRED` or equivalent error for protected APIs.

## Integration Notes

- Use `ageSafetyProfileService` for effective profile status.
- Use central policy from section 04 for exempt-route list if the app requires tenant customization.
- Settings/security UI in section 10 can reuse the same form components.

## Verification

- `cd apps/web && pnpm test -- safetyProfile`
- `cd apps/web && pnpm test -- App`
- `cd apps/web && pnpm check`

## Handoff

The app should now have a single post-login path that guarantees downstream pages can assume a known effective profile or a deliberate child-safe fallback.
