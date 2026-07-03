# section-12-rollout-verification

## Goal

Complete rollout controls, migration playbook, end-to-end verification, security review gates, and final readiness checklist for the full age-aware safety policy system.

## Depends On

- All previous sections.

## Files In Scope

- Feature flag defaults and rollout config.
- Migration/backfill scripts and docs.
- End-to-end tests across login, settings, chat, media, asset viewer, admin, and external actor paths.
- Security review documentation and launch checklist.

## Test First

Add integration/E2E tests for:

- Existing user logs in, is routed to required DOB/country completion, completes profile, and returns to intended app route.
- Unknown/incomplete user is treated as child-safe by server APIs even if client routing is bypassed.
- Non-browser/API/MCP/worker clients receive structured `safety_profile_required` or `country_profile_invalid` errors with next allowed route.
- Admin safety recovery and emergency kill switch remain reachable to authorized admins during completion enforcement.
- Child, teen, adult, and unknown users get expected menu access, chat behavior, media behavior, and asset viewer behavior under at least Thailand, United States, EU/EEA, and global fallback presets.
- Age-safety tenant rollout flags exist in interface, allowlist, defaults, admin UI, and tests.
- Generic system settings cannot overwrite active age policy without dedicated admin safety validation/audit.
- PIN unlock temporarily grants only allowed scopes and resets on logout and local-day rollover.
- Admin policy change takes effect by version and does not break existing sessions unpredictably.
- Async media job created before a policy/profile change is revalidated or handled according to configured rollout mode.
- Public API/widget/system job cases fail closed when viewer context is unknown.
- Consent and retention records exist before enabling age-tiered minor access in jurisdictions that require them.

## Implementation Requirements

- Define rollout modes:
  - `off`: data fields exist, no enforcement except existing behavior.
  - `shadow`: evaluate and audit decisions without blocking.
  - `warn`: show warnings/admin reports, minimal user blocking only for required profile if selected.
  - `enforce`: full central policy enforcement.
  - `emergency_child_safe`: force unknown/child-safe decisions across protected surfaces.
- Provide migration playbook:
  - deploy nullable fields and shared policy module,
  - seed default presets/policies,
  - enable shadow mode,
  - monitor audit/metrics,
  - enable profile completion gate by cohort,
  - enable chat/media enforcement,
  - enable viewer-time asset enforcement,
  - enable admin policy editing,
  - remove temporary compatibility flags after acceptance.
- Include rollback path for each stage without deleting user profile data.
- Document known legal/product assumptions and require counsel/product sign-off before broad enforcement in new countries.

## Security And Compliance Gate

- Verify server-side enforcement exists for every client guard.
- Verify canonical tenant normalization is used before policy lookup, token validation, audit writes, and domain-admin policy updates.
- Verify no raw DOB in logs, provider prompts, analytics, or normal audit payloads.
- Verify no raw DOB/profile-sensitive fields in error telemetry, session replay, feature flag payloads, or general admin/reporting list views.
- Verify client cannot self-assert age band/country/protected unlock.
- Verify protected-surface tokens are scoped, expiring, revocable, and cleared on logout.
- Verify `x-protected-surface-token` is separate from `x-private-vault-token` across tRPC, Express/SSE, public API, and MCP routes.
- Verify async worker/provider callbacks cannot bypass policy.
- Verify admin policy changes are RBAC-controlled and audited.

## Verification

- `cd apps/web && pnpm test`
- `cd apps/web && pnpm check`
- Python tests if touched: `cd python-backend && pytest`
- Run available E2E/browser tests for profile completion, settings security, chat, media, asset library/share, and admin safety policy.

## Handoff

The feature is ready for implementation handoff only when every section test gate is either automated or explicitly documented as manual evidence, and all rollout modes have a tested rollback path.
