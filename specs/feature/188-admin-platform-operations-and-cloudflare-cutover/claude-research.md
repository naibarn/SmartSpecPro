# Feature 188 — Research Findings

## Research decision

- Codebase research: required because SmartSpecPro is an existing Git repository with an active Node/React/Python/worker codebase and deployment workflows.
- Web research: required because the specification depends on Cloudflare Queues, Workflows, Containers, Cron, Hyperdrive, PostgreSQL replication, and GitHub deployment environments/OIDC.
- Testing research: required because the work spans React UI, tRPC/backend services, Drizzle migrations, runtime adapters, data promotion, and production cutover evidence.
- SocratiCode status: the SocratiCode MCP tools were not available in this session. Research therefore used targeted shell discovery and narrow source reads. This limitation must be carried into implementation planning; broad impact queries should be repeated when SocratiCode is available.

## Repository structure and tooling

The repository root is /home/dev/projects/SmartSpecPro. Git metadata identifies the existing GitHub remote as naibarn/SmartSpecPro, with main tracking origin/main.

The root package manager declaration is npm 10.9.8, while apps/web declares pnpm 10.4.1. Existing commands are therefore package-relative and must be run from the matching workspace/package context rather than assuming one package-manager command works everywhere.

The web package already provides:

- Vitest unit and service test execution.
- Playwright browser tests.
- TypeScript checks.
- Drizzle migration commands.
- Existing migration/backfill/verification scripts.
- Existing production-oriented release-gate scripts.

Relevant existing scripts include apps/web test, test:coverage, test:db-integration, db:migrate, db:push, audit:feature-186-call-sites, and verify:feature-186. A plan should add focused Feature 188 tests/scripts rather than introduce a separate test framework.

## Existing Admin infrastructure surface

apps/web/client/src/components/admin/InfrastructureSettingsPanel.tsx is a large mixed-responsibility panel. It currently queries and mutates:

- GCP configuration.
- Task processing mode.
- Queue dashboard.
- Redis configuration and health.
- Monitoring configuration.
- application and MCP runtime settings.
- scale tier and deployment mode.
- Celery-related operational checks.

apps/web/client/src/pages/AdminSettings.tsx owns the Infrastructure navigation item and renders InfrastructureSettingsPanel. The replacement must preserve unrelated Admin capabilities while moving infrastructure capabilities into the new control-center pages.

This is a high-impact UI replacement. The plan must define an incremental component split, API compatibility boundary, authorization, loading/error/stale states, responsive behavior, and browser evidence. Removing the old panel before the replacement API exists would create an operational blind spot.

## Existing backend and runtime coupling

apps/web/server/routers/infrastructure.ts currently contains GCP configuration keys such as gcp_project_id, gcp_region, cloud_run_python_url, cloud_run_node_url, and cloud_run_sa_email. It also owns the USE_CLOUD_TASKS task-mode flag, queue dashboard queries, Redis health/configuration, scale tier operations, deployment-mode information, and Celery diagnostics.

apps/web/server/routers/mediaJobs.ts currently has Cloud Tasks polling and dispatch paths. It conditionally routes media/video execution through Cloud Tasks or direct Python/Celery-related paths based on configuration and falls back when Cloud Tasks configuration is incomplete. These fallbacks are precisely the hidden legacy behavior that Feature 188 must inventory, replace, and later block.

apps/web/server/services/scheduler.ts currently treats Cloud Tasks as the scheduled message delivery path and local development as a special mode. The future scheduler adapter must preserve deterministic schedule occurrence identity without allowing Beat/Cloud Tasks business execution to remain inline.

apps/web/server/routes/tasks.ts is a Cloud Tasks handler route with Google OIDC/secret validation and retry behavior. It is a direct GCP boundary and must be replaced by the scheduler/queue adapter boundary or explicitly retained as emergency rollback-only.

apps/web/server/services/scaleTier.ts contains Cloud Run and Cloud Tasks capacity/deployment operations. Scale controls must move out of a direct Admin mutation path into reviewed release/platform operations. Direct gcloud or .env mutation from the UI is not an accepted target design.

apps/web/server/services/jobTransportAdapters.ts currently exposes BullMQ, Celery, and in-memory adapters. Native Cloudflare Queues, Workflows, Containers, and Cron adapters are not yet a complete production implementation in the repository.

## Storage and database boundary

apps/web/server/db.ts currently uses a PostgreSQL connection through DATABASE_URL. The implementation plan must decide whether Cloudflare production accesses the same PostgreSQL service through Hyperdrive or another approved provider-neutral connection boundary. The current code does not by itself prove Hyperdrive compatibility.

apps/web/server/storage.ts includes R2/S3-compatible storage and local filesystem fallback. Production authoritative objects must use managed storage and must not silently fall back to local disk. Data promotion needs an object manifest with tenant ownership and content checksums.

Existing Vectorize integration is present in system settings and related services, but the migration plan still needs an explicit index/version/document-manifest promotion or rebuild strategy.

## Existing deployment and repository coupling

.github/workflows/deploy-staging.yml and .github/workflows/deploy-production.yml currently authenticate to GCP, build/push images to Google Artifact Registry, deploy Cloud Run services, and run smoke/deployment operations. PR preview and cleanup workflows also contain GCP/Cloud Run logic.

The repository therefore should remain the single source of code and release provenance, but the release plan must add Cloudflare workflows, GitHub environment protection, immutable artifact identity, separate OIDC trust conditions, and an explicit GCP rollback/retirement lifecycle.

## Data-promotion research

PostgreSQL logical replication documentation describes an initial snapshot followed by real-time change streaming and ordered commit application. This maps well to the requirement for a full initial promotion followed by continuous source-to-target synchronization until tests pass, but actual feasibility depends on the source/target PostgreSQL provider, version, permissions, extensions, schema ownership, and whether the target can act as a subscriber.

If native logical replication is unavailable, the implementation must provide an equivalent durable transaction-watermark delta exporter. A best-effort periodic table copy is not sufficient because it cannot prove ordering, deletes, resume behavior, or final convergence.

Source:

- https://www.postgresql.org/docs/16/logical-replication-architecture.html
- https://www.postgresql.org/docs/16/logical-replication.html

## Cloudflare research

Cloudflare Queues provides at-least-once delivery by default. Duplicate messages are therefore expected and must use a canonical job/dedupe key and idempotent control-plane/side-effect handling. Queue retries and DLQ behavior are transport policy, not business attempt policy.

Sources:

- https://developers.cloudflare.com/queues/reference/delivery-guarantees/
- https://developers.cloudflare.com/queues/
- https://developers.cloudflare.com/queues/configuration/batching-retries/
- https://developers.cloudflare.com/queues/configuration/dead-letter-queues/

Cloudflare Workflows treats each step as independently retryable and recommends idempotent operations, deterministic step names, granular steps, and durable persisted step results. Database connections using Hyperdrive should be created inside the step that uses them rather than reused across steps.

Sources:

- https://developers.cloudflare.com/workflows/build/rules-of-workflows/
- https://developers.cloudflare.com/workflows/get-started/guide/

Cloudflare Cron Triggers run on UTC and can be configured per environment. Schedule identity therefore remains an application concern: the adapter must generate and validate occurrence keys using the stored schedule timezone/version policy, not rely on a host-local clock.

Source:

- https://developers.cloudflare.com/workers/configuration/cron-triggers/

Cloudflare Hyperdrive provides a PostgreSQL connection boundary and recommends creating a client per request with a bounded connection limit. The target plan must validate connection limits, prepared statement behavior, transaction semantics, latency, and server/provider compatibility before production activation.

Sources:

- https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/
- https://developers.cloudflare.com/hyperdrive/configuration/tune-connection-pool/

Cloudflare Containers are backed by Workers and Durable Objects, expose container lifecycle hooks/instance identity, and have account/resource limits. Container image retention matters to rollback: deleting an image may make an older Worker rollback unusable. The plan must therefore pin image digests and retain rollback images through the rollback window.

Sources:

- https://developers.cloudflare.com/containers/
- https://developers.cloudflare.com/containers/concepts/architecture/
- https://developers.cloudflare.com/containers/platform/limits/

## GitHub release and identity research

GitHub Environments support required reviewers, wait timers, branch policies, and deployment protection rules. GitHub OIDC tokens use issuer, audience, and subject claims that cloud providers can restrict to specific repositories, branches, environments, or reusable workflows. The plan should use environment-scoped trust conditions and short-lived federation rather than long-lived cloud credentials in repository secrets.

Sources:

- https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
- https://docs.github.com/en/actions/reference/security/oidc
- https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments
- https://docs.github.com/en/actions/concepts/security/openid-connect

## Testing implications

The existing Vitest setup supports backend/service tests and React/jsdom component tests. Existing Playwright tests support browser-facing evidence. The plan should use:

- pure unit tests for gate/state/data-manifest logic;
- repository tests for Drizzle/database transactions and idempotency;
- adapter contract tests against fake and provider-shaped adapters;
- migration tests using representative schema/data fixtures;
- failure-injection tests for database, network, queue, provider, worker, and synchronization failures;
- browser tests for Admin control-center states and safe actions;
- static call-site scans and runtime/network audit evidence for zero-hidden-legacy proof.

No real paid provider calls or irreversible production side effects belong in ordinary tests.

## Research conclusions for the implementation plan

1. Reuse the existing repository and testing stack.
2. Split the old infrastructure panel behind a new platform-operations service/API boundary before removing navigation.
3. Treat GCP as a real current runtime dependency and as an explicit emergency rollback path until retirement evidence closes.
4. Treat Cloudflare Queues as at-least-once transport, Workflows as retryable durable steps, Containers as resource-bound execution, Cron as UTC scheduling, and Hyperdrive as a connection boundary; none replaces PostgreSQL truth.
5. Make data promotion a first-class subsystem with full snapshot, durable continuous delta, checksums, row dispositions, final fence, final delta, and post-cutover sync revocation.
6. Keep Dev and Production permanently separate after cutover.
7. Add provider/account capability gates before promising a specific Cloudflare deployment shape.
