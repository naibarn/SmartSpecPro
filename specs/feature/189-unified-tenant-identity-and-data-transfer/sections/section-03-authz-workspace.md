# Section 03 — Protected authorization and authenticated workspace projection

## Scope

Remove host/client tenant override from protected data, billing, storage, job, workflow, notification, and admin paths. Retain hostname resolution only where the endpoint is intentionally public branding/content. Make the authenticated dashboard show the account workspace distinctly.

## Files and boundaries

- `apps/web/server/_core/index.ts`: remove request-body tenant precedence from protected routes.
- `apps/web/server/routers/tenant.ts`: replace `registeredDomain`/host equality checks for `domain_admin` with authenticated current-tenant scope.
- `apps/web/server/routers/media.ts`, media production, library, billing, storage, groups, workflow, notification, artifact, and worker services: use the account-tenant helper for protected operations.
- `apps/web/client/src/contexts/AuthContext.tsx` and `TenantContext.tsx`: expose server account workspace and public branding as distinct values.
- `apps/web/client/src/layouts/DashboardLayout.tsx` and `Dashboard.tsx`: render the workspace identity without creating a tenant switcher.

## Authorization rules

Reload/verify the active tenant from `users.currentTenantId` for authenticated operations. A client `tenantId` is advisory/ignored unless the endpoint is an explicit, separately authorized System Admin operation. A mismatched host cannot read/write/bill/dispatch/administer another tenant. `domain_admin` is scoped only when the account current tenant matches the target tenant; `registeredDomain` is historical metadata and never grants access. Missing/inactive account tenant fails closed.

## Tests before implementation

- Host mismatch isolation for media, library, production, billing, storage, jobs, workflows, notifications, and admin paths.
- Client tenant override rejection and explicit System Admin exception boundary.
- Domain-admin same-tenant success, cross-tenant denial, and registered-domain-change regression.
- AuthContext/TenantContext/Dashboard tests for account workspace badge, branding mismatch, loading/error, and no tenant-switcher behavior.

## Exit criteria

Static call-site audit lists every intentional host-branding consumer and every migrated protected consumer. No high-risk protected path silently falls back to the hostname tenant.

## UI/UX Contract

### Target User / JTBD

Signed-in user needs to identify the authenticated workspace independently from public hostname branding.

### Existing Pattern Reference

Reuse the existing dashboard shell/context pattern; detailed component, state, responsive, accessibility, copy, and browser requirements are owned by section 07.

### Surface Inventory

`AuthContext.tsx`, `TenantContext.tsx`, `DashboardLayout.tsx`, and `Dashboard.tsx`; behavior is integrated in section 07.

### Component Map

`WorkspaceIdentityBadge` consumes server account tenant and host branding metadata; implementation ownership is section 07.

### State Matrix

Loading, missing tenant, branding mismatch, success, and unauthorized states are defined and tested in section 07.

### Responsive Matrix

Use section 07's mobile 390x844, tablet 768x1024, desktop 1440x900, and extended dense-layout viewports.

### Accessibility Acceptance

Use section 07's keyboard, focus, semantic-label, contrast, and reduced-motion contract.

### Copy Contract

Use bilingual workspace/branding copy from section 07; do not imply tenant switching.

### Browser Evidence Required

Section 07 captures mismatched branding/workspace evidence at required viewports.
