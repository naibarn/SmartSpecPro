# Research Notes

## Current Codebase Surfaces

### Tenant-scoped browser policy already exists

- `tenant_browser_policy_config` stores the tenant baseline:
  - `enabled`
  - `enforcementMode`
  - `defaultApprovalTtlSeconds`
  - `reviewCadenceDays`
  - `killSwitchEnabled`
  - `requireTamperEvidence`
  - `evidenceRetentionDays`
  - `allowedDomains`
  - `visionModel`
  - `metadata`
- `tenant_browser_policy_rules` stores tenant-scoped ordered decision rules
- `browser_workflow_entitlements` stores workflow-specific capability and quota limits
- `browser_policy_decisions` stores audit decisions with `tenantId`, optional `userId`, approval state, outcome, and event hash chain

Relevant files:

- `apps/web/drizzle/schema.ts`
- `apps/web/shared/browserPolicy.ts`
- `apps/web/server/services/browserPolicyStore.ts`

### Existing UI and API mismatch

- `AdminSettings.tsx` currently exposes the browser-policy panel
- that panel is guarded for `admin` only
- but the underlying browser-policy config is tenant-scoped, not globally scoped
- `systemSettingsRouter` currently bridges legacy `tenant_automation` settings and the new tenant browser policy config

Relevant files:

- `apps/web/client/src/pages/AdminSettings.tsx`
- `apps/web/server/routers/systemSettings.ts`
- `apps/web/server/services/browserPolicySettingsBridge.ts`

### Feature flags are tenant-scoped and already editable by tenant admins

- feature flags are stored in `tenants.featureFlags`
- `tenantFeatureFlagsRouter.updateFeatureFlags` allows:
  - `admin` for any tenant
  - `domain_admin` for own tenant only

Relevant files:

- `apps/web/shared/featureFlags.ts`
- `apps/web/server/services/tenantFeatureFlagService.ts`
- `apps/web/server/routers/tenantFeatureFlags.ts`

### User-scoped settings pattern already exists

- lightweight preferences are stored in `users.userPreferences`
- users edit these through `users.getPreferences` and `users.updatePreferences`
- the main user-facing settings page already exists in `client/src/pages/Settings.tsx`

Relevant files:

- `apps/web/drizzle/schema.ts`
- `apps/web/server/routers/users.ts`
- `apps/web/client/src/pages/Settings.tsx`

## Security Boundary Observations

1. The current runtime model is tenant-first, not user-first.
   User context is present in audits and decisions, but configuration is not yet user-owned.

2. The current `AdminSettings` placement is too global for a tenant policy surface.
   The data model says tenant config; the UI location says platform admin.

3. User flexibility must be implemented as narrowing overlays.
   If user settings can add domains, extend capabilities, or loosen quotas, the tenant boundary breaks.

4. Workflow entitlements already provide the right abstraction for "this workflow can do X but not Y".
   That should remain separate from both tenant defaults and user preferences.

## Recommended Core Principle

Use four layered policy planes:

1. platform guardrails
2. tenant policy baseline
3. workflow/tool entitlement overlays
4. user self-restriction and preference overlays

Effective policy should always resolve by intersection, never by union.
