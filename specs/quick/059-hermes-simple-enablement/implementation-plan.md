# Implementation Plan

## Objective

Turn Grok via Hermes enablement into one safe admin action and make every
remaining readiness requirement visible in the user's selected language.

## Implementation

1. Add a server-owned safe preset and an admin-only atomic mutation that writes
   the six enablement keys and clears the Hermes settings cache.
2. Expand availability with separate platform and tenant gate booleans.
3. Refactor the admin card so the primary switch invokes the preset. Move
   individual operator settings into a collapsed advanced section and add
   concise setup guidance.
4. Add bilingual readiness copy to the user panel. When disabled, name the
   missing gate; when enabled, show worker/account readiness without blocking
   the existing connection flow.
5. Clarify the tenant feature flag label/description.
6. Update targeted unit tests and run TypeScript/test verification.
7. Apply the same safe preset to production with a pre-change snapshot and
   read-back verification.

## Risks and mitigations

- Partial configuration: use a database transaction.
- Accidental server/shared traffic: preset explicitly disables both scopes.
- Production dev drainer: preset explicitly disables it.
- Misleading readiness: separate configuration gates from worker/account state.
- Dirty worktree: patch only Hermes-related files and new planning artifacts.

## Acceptance criteria

- One admin switch enables the safe preset.
- Advanced controls are hidden until expanded.
- Tenant-only enablement no longer yields an unexplained disabled state.
- English UI shows English; Thai UI shows Thai.
- No secret or device code is returned in availability.
- Existing connection, consent, authorization, quota, and disconnect flows
  remain intact.
