# section-10-settings-admin-i18n

## Goal

Deliver the user-facing and admin-facing interfaces for safety profile, Security PIN, protected unlocks, and central safety policy management, with English and Thai localization.

## Depends On

- `section-04-admin-policy-audit-flags`
- `section-05-profile-completion-ux`

## Files In Scope

- Settings Profile and Settings Security pages/components.
- Admin safety policy pages/components.
- Menu/navigation projection code.
- i18n files for English and Thai.
- Frontend tests and browser evidence where UI changes are substantial.

## Test First

Add tests for:

- User can view completed safety profile with DOB protected/masked where appropriate.
- Changing DOB/country requires PIN unlock if PIN is configured.
- Security PIN setup/change/disable flows render all states and server errors.
- Admin can view active policy, edit draft, publish, archive, and inspect version history where RBAC allows.
- Menu items and protected buttons hide/disable according to central policy decision.
- English and Thai strings exist for new user-visible safety states and errors.
- Unknown-age users can still reach DOB setup, Settings/Security PIN setup, support/account recovery, and allowed legal/privacy flows.
- Authorized admins can still reach admin safety recovery and emergency kill-switch controls during profile-completion enforcement.
- UI state refetches after tenant switch, DOB/country update, policy/preset version change, enforcement mode change, and protected unlock expiry.

## UI/UX Contract

- States: no PIN, PIN set, PIN lockout, unlock success, unlock expired, profile complete, profile edit locked, policy draft, policy published, policy save error, read-only admin.
- Responsive matrix: settings and admin policy screens must support mobile, tablet, and desktop without text overflow in Thai.
- Accessibility: form labels, grouped controls, focus return after modals, keyboard-operable PIN entry, no color-only status indicators.
- Browser evidence expected during implementation: settings security on mobile/desktop, admin policy editor on desktop, blocked menu/action state.

## Implementation Requirements

- Follow existing SmartSpecPro UI system and route patterns. If Astryx components are used in touched UI areas, discover components through `npm run astryx -- build` and component docs before implementation.
- Do not expose raw policy JSON as the only admin UI unless existing admin settings already uses that pattern.
- Reuse route/server decision reason codes instead of inventing UI-only messages.
- PIN unlock UI should be scoped and temporary. It should clearly return to locked behavior after logout/day rollover without promising persistent adult mode.
- UI must never display raw DOB in general admin list/reporting surfaces; use age band, completion state, preset, and reason codes instead.
- Preserve existing Private Vault UX while moving shared PIN logic underneath.

## Integration Notes

- This section should not implement new policy semantics. It only surfaces services from sections 03-05.
- Menu projection should consume central policy decisions from section 04.

## Verification

- `cd apps/web && pnpm test -- settings`
- `cd apps/web && pnpm test -- adminSafety`
- `cd apps/web && pnpm check`
- Run browser screenshots for changed pages if Playwright or the repo's UI test flow is available.

## Handoff

The UI should make age-safety behavior understandable without leaking sensitive DOB details or overwhelming normal users.
