<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-docker-foundation
section-02-database-schema
section-03-python-sdk-client
section-04-python-services
section-05-nodejs-router-services
section-06-media-pipeline-migration
section-07-skill-workflow-migration
section-08-router-modifications
section-09-hetzner-setup
section-10-admin-observability
section-11-config-feature-flags
section-12-production-hardening
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-docker-foundation | - | 02, 03 | Yes |
| section-02-database-schema | 01 | 04, 05 | No |
| section-03-python-sdk-client | 01 | 04 | Yes (with 02) |
| section-04-python-services | 02, 03 | 06, 07 | No |
| section-05-nodejs-router-services | 02 | 08 | Yes (with 04) |
| section-06-media-pipeline-migration | 04 | 09, 12 | No |
| section-07-skill-workflow-migration | 04, 05 | 08, 12 | No |
| section-08-router-modifications | 05, 07 | 10 | No |
| section-09-hetzner-setup | 06 | 12 | Yes (with 07, 08) |
| section-10-admin-observability | 08 | 12 | Yes (with 09) |
| section-11-config-feature-flags | 04, 05 | 12 | Yes (with 06-10) |
| section-12-production-hardening | 06, 07, 08, 09, 10, 11 | - | No |

## Execution Order

1. **Batch 1**: section-01-docker-foundation (no dependencies)
2. **Batch 2**: section-02-database-schema, section-03-python-sdk-client (parallel after 01)
3. **Batch 3**: section-04-python-services, section-05-nodejs-router-services (parallel after 02+03)
4. **Batch 4**: section-06-media-pipeline-migration, section-07-skill-workflow-migration, section-11-config-feature-flags (parallel after 04+05)
5. **Batch 5**: section-08-router-modifications, section-09-hetzner-setup, section-10-admin-observability (parallel after 06+07)
6. **Batch 6**: section-12-production-hardening (final, after all others)

## Section Summaries

### section-01-docker-foundation
Docker Compose setup for OpenSandbox (`docker-compose.opensandbox.yml`), Docker network creation (opensandbox-network + opensandbox-exec), service management integration in `run-services.sh`.

### section-02-database-schema
4 new Drizzle ORM tables (sandbox_profiles, sandbox_jobs, sandbox_artifacts, tenant_sandbox_policies), existing table extensions, SQLAlchemy models for Python backend, seed data for 4 baseline profiles, migration execution.

### section-03-python-sdk-client
Python OpenSandbox integration module (`app/integrations/opensandbox/`): config, models, HTTP client with circuit breaker + retry, lifecycle management, execution, filesystem operations, SandboxBackend protocol, MockSandboxBackend.

### section-04-python-services
Sandbox dispatcher service, profile service, artifact service, audit service, cost service, Celery queue routing, sandbox job worker with session reuse pattern.

### section-05-nodejs-router-services
tRPC sandbox router (CRUD, status, cancel), dispatch service, policy resolver, status projection, cost estimator with credit integration, job completion polling, artifact access with signed URLs.

### section-06-media-pipeline-migration
FFmpeg video pipeline migration to sandbox, media_job_worker.py multi-command session reuse, media_pipeline.py migration, presentation_render.py migration, factory_orchestrator.py migration, Docker executor migration.

### section-07-skill-workflow-migration
Skill execution mode enum extension, skill executor modification for sandbox dispatch, workflow code node migration (RestrictedPython → sandbox code interpreter), workflow HTTP node egress control.

### section-08-router-modifications
Chat router sandbox dispatch path, skills router sandbox metadata, media router sandbox routing, library router file parsing sandbox dispatch.

### section-09-hetzner-setup
Hetzner CPX31 server provisioning, setup script, Docker + OpenSandbox installation, TLS with Let's Encrypt, firewall configuration, monitoring setup, GCP connectivity verification.

### section-10-admin-observability
Sandbox job explorer admin page, profile management UI, tenant policy management, cost analytics, data retention policies, monitoring metrics, reconciliation workers (orphan cleanup, stuck job detection).

### section-11-config-feature-flags
Environment variable configuration for all environments (web, Python localhost, Python production, Hetzner), feature flag system (OPENSANDBOX_ENABLED, DISPATCH_MODE, per-feature flags), rollout strategy.

### section-12-production-hardening
Launch readiness gate checklist, chaos testing scenarios, rollback strategy, legacy path removal, final security verification.
