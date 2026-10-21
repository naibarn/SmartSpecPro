# Section 01 — Production target metadata UI

## Contract

- **Requirement IDs:** PCT-01.
- **Objective:** allow an exact admin to record a production target as metadata while clearly separating it from deployment and activation authority.
- **Owned paths:** `apps/web/client/src/components/admin/AdminDeploymentTargets.tsx`, its focused test, and localized copy only if required.
- **Prerequisites:** canonical main baseline; existing backend supports environment-scoped target records and exact-admin authorization.
- **Deliverable:** production appears as an explicit environment option; target edits remain scoped to the chosen tenant/project/environment; UI states that adding a target does not deploy or change DNS/routes.
- **Acceptance:** component tests cover selection, empty target state, existing staging/preview behavior, and no automatic deploy; focused UI test passes.
- **Fallback:** if production target metadata is unsupported by the backend, keep creation disabled and surface the exact server reason; do not coerce production to staging.
- **Rollback:** revert the UI option/copy; no provider resources or data are mutated by this section.
- **Merge readiness:** independent UI slice can integrate before production grant implementation.

## Boundary

Do not create or edit a live production target row from this code task. Do not add a button that deploys, activates, creates a grant, or changes provider routes. Do not add credentials to browser responses.

## Verification

Run `pnpm --filter @smartspec/web exec vitest run client/src/components/admin/AdminDeploymentTargets.test.tsx` and `git diff --check`. Record current main SHA and exact next action in parent HANDOFF.
