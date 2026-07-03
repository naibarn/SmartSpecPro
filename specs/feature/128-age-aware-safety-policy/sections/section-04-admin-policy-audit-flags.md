# section-04-admin-policy-audit-flags

## Goal

Add the central admin-managed policy layer, audit helpers, feature flags, and kill switches that allow the age-safety system to operate across the full product instead of only chat/media pages.

## Depends On

- `section-01-policy-foundation`

## Files In Scope

- `apps/web/shared/featureFlags.ts`.
- Admin/system settings routers and services, especially `apps/web/server/routers/systemSettings.ts`.
- New policy service/router, for example `apps/web/server/services/ageSafetyPolicyService.ts` and `apps/web/server/routers/adminSafetyPolicy.ts`.
- Audit helpers and existing admin RBAC utilities.
- Tests for policy CRUD, projection, RBAC, and audit.

## Test First

Add tests for:

- Default preset policy exists for new tenants/domains without manual setup.
- Admin can read policy; only authorized admin roles can change policy.
- Domain admins resolve their tenant through registered-domain/primary-domain ownership and cannot rely on Host-header tenant context alone.
- Tenant id comparisons normalize string/numeric tenant sources before policy lookup, token validation, and audit writes.
- Policy changes create immutable version history and audit entries.
- Menu/action restrictions support global defaults and per-surface overrides.
- Feature flags support off, shadow, warn-only, enforce, and emergency child-safe modes.
- Age-safety rollout flags are present in `TenantFeatureFlags`, `ALLOWED_FEATURE_FLAGS`, and `FEATURE_FLAG_DEFAULTS`.
- Generic `systemSettings.updateSetting` cannot write the active age policy without `adminSafety` validation/audit.
- The `"safety"` system setting category is added deliberately if system settings storage is used.
- Kill switch can force unknown/child-safe behavior without data loss.

## Implementation Requirements

- Store policies as versioned records or existing settings records with version metadata.
- If policy storage uses `system_settings`, prefer category `"safety"` and key `"age_policy"`, but make the dedicated admin safety service the only write path.
- Maintain a central evaluator path: request context + actor profile + policy version -> decision.
- Include tenant/domain scoping if the project already supports tenant or domain admin boundaries.
- Reuse existing tenant isolation patterns from tenant feature flags/system settings where domain admins are verified through DB-backed domain ownership.
- Preserve existing admin/system settings patterns; do not introduce an unrelated policy storage system if current settings infrastructure is suitable.
- Use deterministic reason codes for blocked access so UI, logs, and support can explain outcomes consistently.
- Redact DOB and prompt content from normal audit events. Include hashed or categorized references where needed.

## Integration Notes

- Sections 05-09 must call this central policy service, not their own local config.
- The admin UI in section 10 should consume this router/service.
- Observability in section 11 should subscribe to the audit events and reason codes introduced here.

## Verification

- `cd apps/web && pnpm test -- ageSafetyPolicyService`
- `cd apps/web && pnpm test -- adminSafety`
- `cd apps/web && pnpm check`

## Handoff

Define policy lifecycle states:

- draft
- active
- archived
- emergency override

Expose:

- `getActiveAgeSafetyPolicy`
- `evaluateAgeSafetyAccess`
- `updateAgeSafetyPolicy`
- `recordAgeSafetyAuditEvent`
