<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 node_modules/.bin/vitest run --config apps/web/vitest.config.ts
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-run-foundation
section-02-library-marketplace
section-03-job-admission
section-04-checkpoints-run-modes
section-05-run-lifecycle-controls
section-06-results-observability
section-07-ui-state-integration
section-08-economics-release
END_MANIFEST -->

# Spec 209 runtime completion implementation sections

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| section-01-run-foundation | — | 02, 03, 04, 05, 06, 07, 08 | No |
| section-02-library-marketplace | 01 | 03, 07, 08 | Yes after 01 |
| section-03-job-admission | 01, 02 | 04, 05, 06, 07, 08 | No |
| section-04-checkpoints-run-modes | 01, 03 | 05, 06, 07, 08 | No |
| section-05-run-lifecycle-controls | 01, 03, 04 | 06, 07, 08 | No |
| section-06-results-observability | 01, 03 | 07, 08 | Yes after 03 |
| section-07-ui-state-integration | 02, 03, 04, 05, 06 | 08 | No |
| section-08-economics-release | 01–07 | — | No |

## Execution order

1. `section-01-run-foundation`
2. `section-02-library-marketplace`
3. `section-03-job-admission`
4. `section-04-checkpoints-run-modes`
5. `section-05-run-lifecycle-controls`
6. `section-06-results-observability` (can begin after 03, but integrate after 05)
7. `section-07-ui-state-integration`
8. `section-08-economics-release`

## Section summaries

### section-01-run-foundation

Durable workflow run, checkpoint, dependency snapshot, invocation and event
projection contracts, additive schema and tenant-safe repository boundary.

### section-02-library-marketplace

Exact-version Library/Marketplace detail, search/filter, dependency readiness,
entitlement, pricing disclosure and invoke preflight.

### section-03-job-admission

Durable compiler acceptance and server-authoritative run intent through the
Feature 195 canonical orchestration/Job gateway with Feature 207 preflight.

### section-04-checkpoints-run-modes

Full, run-until, run-from, node and subflow compilation with immutable
version/input-bound checkpoint recovery.

### section-05-run-lifecycle-controls

Approval/user-input waits, retry, cancel, resume, fencing, expiry and
operator-review behavior over canonical Job commands.

### section-06-results-observability

Schema-driven outputs, artifact publication/preview/recovery and durable
trace/log/event projections with redaction and ordering.

### section-07-ui-state-integration

Mockup-led interactive graph editor plus Builder/Subflow/Library/Marketplace/Run
state integration, real node/edge/property actions, draft persistence,
responsive/accessibility states, bilingual copy and Playwright evidence.

### section-08-economics-release

Economic correlation, failure-injection drills, release gates, parent Spec 209
documentation sync and production evidence requirements.
