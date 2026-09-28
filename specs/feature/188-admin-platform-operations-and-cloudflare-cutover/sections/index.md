<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contracts-schema
section-02-platform-control-plane
section-03-data-promotion
section-04-hyperdrive-cloudflare
section-05-feature-186-legacy
section-06-admin-api-ui
section-07-release-workflows
section-08-cutover-runbooks
section-09-verification-observability
section-10-integration-gates
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-contracts-schema | - | 02, 03, 04, 05, 06, 07, 08 | Yes |
| section-02-platform-control-plane | 01 | 06, 08, 10 | No |
| section-03-data-promotion | 01 | 08, 09, 10 | Yes after 01 |
| section-04-hyperdrive-cloudflare | 01 | 05, 07, 08, 09, 10 | Yes after 01 |
| section-05-feature-186-legacy | 01, 04 | 08, 09, 10 | Yes after 04 |
| section-06-admin-api-ui | 01, 02 | 08, 09, 10 | Yes after 02 |
| section-07-release-workflows | 01, 04 | 08, 10 | Yes after 04 |
| section-08-cutover-runbooks | 02, 03, 04, 05, 06, 07 | 10 | No |
| section-09-verification-observability | 01, 02, 03, 04, 05, 06, 07 | 10 | No |
| section-10-integration-gates | 02, 03, 04, 05, 06, 07, 08, 09 | - | No |

## Execution Order

1. section-01-contracts-schema.
2. section-02-platform-control-plane and section-03-data-promotion in parallel.
3. section-04-hyperdrive-cloudflare after section-01.
4. section-05-feature-186-legacy and section-06-admin-api-ui after their
   dependencies.
5. section-07-release-workflows after sections 01 and 04.
6. section-08-cutover-runbooks and section-09-verification-observability after
   all operational components are contract-stable.
7. section-10-integration-gates as the final assembly and evidence gate.

## Section Summaries

### section-01-contracts-schema

Runtime-neutral contracts, environment configuration, Drizzle schema, migration
0306, constraints, and shared fixtures.

### section-02-platform-control-plane

Guarded platform lifecycle, gate aggregation, action idempotency, durable
platform-operation outbox, activation coordinator, and authorization port.

### section-03-data-promotion

Source inventory, new Production PostgreSQL target preflight, snapshot, durable
CDC/watermark synchronization, final fence/delta, and data/object/index
validation.

### section-04-hyperdrive-cloudflare

Cloudflare Worker package, Hyperdrive-only database factory, Queues, Workflows,
Containers, Worker App, Cron, and callback adapters.

### section-05-feature-186-legacy

Feature 186 job-control integration, queue-family migration manifests, legacy
audit, compatibility shims, side-effect idempotency, and fallback blocking.

### section-06-admin-api-ui

Platform Operations tRPC router, redaction/authorization, Admin page and
components, responsive/accessibility states, and browser evidence.

### section-07-release-workflows

GitHub environment/OIDC controls, Cloudflare workflows, immutable release
manifests, artifact retention, and dry-run deployment evidence.

### section-08-cutover-runbooks

Maintenance-window sequence, guarded activation/traffic handoff, separation
certificate, rollback decision process, and operator runbooks.

### section-09-verification-observability

Structured metrics/logs, alerts, audit evidence bundle, failure injection,
security checks, static/runtime/network audits, and verification commands.

### section-10-integration-gates

Cross-section contract checks, target synthetic run, end-to-end cutover rehearsal,
final acceptance, and production-evidence handoff.
