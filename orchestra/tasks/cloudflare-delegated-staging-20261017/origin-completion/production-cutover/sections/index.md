<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --filter @smartspec/web exec vitest run client/src/components/admin/AdminDeploymentTargets.test.tsx
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-production-target-ui
section-02-production-deploy-authority
section-03-production-runtime-composition
section-04-production-readiness-and-cutover
END_MANIFEST -->

# Execution order

| Section | Depends On | Blocks | Parallelizable |
| --- | --- | --- | --- |
| section-01-production-target-ui | - | section-02 | Yes |
| section-02-production-deploy-authority | section-01 | section-04 | No |
| section-03-production-runtime-composition | - | section-04 | Yes |
| section-04-production-readiness-and-cutover | section-02, section-03 | - | No |

Implement Sections 01 and 03 first as independently useful disabled-by-default slices. Section 02 must preserve staging authority. Section 04 includes code preflight plus external live acceptance; provider deployment itself remains gated by existing exact production authorization.
