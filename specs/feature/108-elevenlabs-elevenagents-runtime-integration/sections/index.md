<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-provider-research
section-02-schema-contracts
section-03-backend-services
section-04-api-callbacks
section-05-chat-admin-ui
section-06-observability-regression
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-provider-research | - | 02, 03, 04, 05 | No |
| section-02-schema-contracts | 01 | 03, 04, 05, 06 | No |
| section-03-backend-services | 02 | 04, 05, 06 | No |
| section-04-api-callbacks | 02, 03 | 05, 06 | No |
| section-05-chat-admin-ui | 02, 03, 04 | 06 | No |
| section-06-observability-regression | 03, 04, 05 | - | No |

## Execution Order

1. `section-01-provider-research`
2. `section-02-schema-contracts`
3. `section-03-backend-services`
4. `section-04-api-callbacks`
5. `section-05-chat-admin-ui`
6. `section-06-observability-regression`

## Section Summaries

### section-01-provider-research

Verify ElevenLabs SDK/API assumptions and capture payload fixtures before
production implementation.

### section-02-schema-contracts

Add Drizzle schema, migrations, shared Zod contracts, and schema/contract tests.

### section-03-backend-services

Implement provider, config, session, event, reconciliation, tool bridge, and
billing services.

### section-04-api-callbacks

Expose tRPC procedures and the public ElevenLabs callback route with security
tests.

### section-05-chat-admin-ui

Build Chat voice panel and Admin voice-agent config/session UI.

### section-06-observability-regression

Add observability, audits, regression tests, final gates, and rollout hardening.
