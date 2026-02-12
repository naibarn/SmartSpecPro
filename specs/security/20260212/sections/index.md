<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: cd apps/web && npm run check -- --pretty false
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-baseline-and-reporting
section-02-tsconfig-alias-foundation
section-03-contract-fixes-import-env-deps
section-04-tenant-normalization-contract
section-05-trpc-ui-type-recovery
section-06-strict-cleanup-client-hotspots
section-07-strict-cleanup-server-hotspots
section-08-regression-gates-and-finalization
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-baseline-and-reporting | - | 02 | No |
| section-02-tsconfig-alias-foundation | 01 | 03,04 | No |
| section-03-contract-fixes-import-env-deps | 02 | 05 | No |
| section-04-tenant-normalization-contract | 02 | 05 | No |
| section-05-trpc-ui-type-recovery | 03,04 | 06,07 | No |
| section-06-strict-cleanup-client-hotspots | 05 | 08 | No |
| section-07-strict-cleanup-server-hotspots | 05 | 08 | No |
| section-08-regression-gates-and-finalization | 06,07 | - | No |

## Execution Order

1. `section-01-baseline-and-reporting`
2. `section-02-tsconfig-alias-foundation`
3. `section-03-contract-fixes-import-env-deps`
4. `section-04-tenant-normalization-contract`
5. `section-05-trpc-ui-type-recovery`
6. `section-06-strict-cleanup-client-hotspots`
7. `section-07-strict-cleanup-server-hotspots`
8. `section-08-regression-gates-and-finalization`

## Section Summaries

### section-01-baseline-and-reporting
Capture a deterministic baseline of TypeScript errors and generate machine-readable reports used by all later gates.

### section-02-tsconfig-alias-foundation
Repair TypeScript foundation config and alias resolution to remove module-not-found cascades.

### section-03-contract-fixes-import-env-deps
Fix broken imports, environment contract drift, and missing type declarations/dependencies.

### section-04-tenant-normalization-contract
Introduce canonical tenantId normalization utility and usage policy across approved boundaries.

### section-05-trpc-ui-type-recovery
Recover tRPC typing propagation and unblock UI type inference in high-error pages.

### section-06-strict-cleanup-client-hotspots
Eliminate strict typing errors in top client hotspots without unsafe bypasses.

### section-07-strict-cleanup-server-hotspots
Eliminate strict typing errors in server routers/services while preserving tenant/auth behavior.

### section-08-regression-gates-and-finalization
Run final gates (typecheck + sensitive tests), produce final artifacts, and validate release readiness.
