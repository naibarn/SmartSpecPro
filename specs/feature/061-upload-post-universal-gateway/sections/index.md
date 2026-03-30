<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --filter @smartspec/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-foundation
section-02-router-client
section-03-dispatch-sync
section-04-workflow-agency
section-05-frontend-ui
section-06-security-rollout
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-foundation | - | section-02, section-03, section-04, section-05, section-06 | Yes |
| section-02-router-client | section-01 | section-03, section-05, section-06 | No |
| section-03-dispatch-sync | section-01, section-02 | section-04, section-05, section-06 | No |
| section-04-workflow-agency | section-01, section-03 | section-06 | Yes |
| section-05-frontend-ui | section-01, section-02, section-03 | section-06 | Yes |
| section-06-security-rollout | section-01, section-02, section-03, section-04, section-05 | - | No |

## Execution Order

1. section-01-foundation
2. section-02-router-client
3. section-03-dispatch-sync
4. section-04-workflow-agency and section-05-frontend-ui in parallel where possible
5. section-06-security-rollout

## Section Summaries

### section-01-foundation
Add shared Upload-Post types, schema tables, feature-flag helper, and migration scaffolding.

### section-02-router-client
Implement the Upload-Post client and tRPC router for connection and profile management.

### section-03-dispatch-sync
Implement publish dispatch, Upload-Post job persistence, polling, and background sweeps.

### section-04-workflow-agency
Wire Upload-Post into workflow and agency execution through the parallel dispatch path.

### section-05-frontend-ui
Extend settings and publishing UI to support Upload-Post connection and selection.

### section-06-security-rollout
Add rate limiting, SSRF validation, nonce flow, audit logging, cleanup, and rollout guards.

