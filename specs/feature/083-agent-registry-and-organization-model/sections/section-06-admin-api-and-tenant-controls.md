# Section 06 - Admin Api And Tenant Controls

## Objective

Expose registry management and inspection through the existing server/router layer with tenant-aware authorization and feature-flag gating.

## Scope

- Add registry admin procedures to the existing router structure.
- Expose registry creation, version publication, promotion review, freeze, rollback, and inspection endpoints.
- Reuse tenant-scoped feature-flag patterns for rollout gating.
- Ensure tenant admins only operate within their tenant and system admins can inspect across tenants when allowed by the existing auth model.

## Files Likely Changed

- `apps/web/server/routers/agentRegistry.ts` or similar new router module
- `apps/web/server/routers/tenantFeatureFlags.ts`
- `apps/web/server/routers.ts`
- `apps/web/server/routers/__tests__/agentRegistry.test.ts`
- `apps/web/server/routers/__tests__/tenantFeatureFlags.*.test.ts` if rollout flags need augmentation

## Implementation Notes

1. Keep admin operations separate from the core resolver.
2. Return explainability data from inspection endpoints so operators can understand why a version is active.
3. Reuse the existing admin/domain-admin RBAC style already present in the repo.
4. Feature flags should hide incomplete or unsafe rollout surfaces rather than changing the registry's core rules.
5. Make the read/write authorization matrix explicit in the router contract and test it separately for system admin, tenant admin, and regular-user flows.

## TDD Stubs

- Test that admin-only registry mutations are rejected for non-admin users.
- Test that tenant-scoped operations cannot cross tenant boundaries.
- Test that inspection endpoints return identity, version, policy, rollout, and reason data.
- Test that feature-flag gating hides or disables rollout actions when the tenant is not opted in.
- Test that router paths are wired into the top-level router.

## Completion Check

This section is done when the registry can be managed and inspected through the same server surface pattern used by the rest of the application.
