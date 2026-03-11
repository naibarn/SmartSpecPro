# Section 01: Platform And Tenant Boundaries

## Goal

Split browser-policy settings into:

- platform guardrails
- tenant baseline policy

so the ownership model matches the current runtime architecture.

## Scope

- identify which settings are immutable ceilings
- identify which settings are tenant-configurable defaults
- define authz boundaries for `admin` vs `domain_admin`
- keep the current tenant policy storage model

## Implementation Steps

1. Create a platform guardrail schema/service for:
   - release gates
   - provider/model allowlist
   - TTL min/max
   - audit minimums
   - emergency kill switch
2. Leave `tenant_browser_policy_config` as the tenant baseline source of truth
3. Update authz so tenant policy editing is available to:
   - `admin` for any tenant
   - `domain_admin` for own tenant
4. Restrict tenant writes so they cannot exceed platform guardrails
5. Keep current legacy bridge only as a migration layer

## Done When

- platform and tenant settings are no longer mixed conceptually
- tenant admins can own tenant policy without touching platform-only controls
- tenant config validation respects platform ceilings
