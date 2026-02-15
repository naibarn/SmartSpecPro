<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-gcp-bootstrap
section-02-docker-images
section-03-database
section-04-cloud-tasks
section-05-bullmq-migration
section-06-cloud-scheduler
section-07-kie-integration
section-08-media-pipeline
section-09-r2-storage
section-10-redis-ratelimit
section-11-video-pipeline
section-12-vectorize
section-13-sentry
section-14-posthog
section-15-admin-dashboard
section-16-cloud-monitoring
section-17-cicd
section-18-auth-hardening
section-19-load-testing
section-20-prod-hardening
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable With |
|---------|------------|--------|---------------------|
| section-01-gcp-bootstrap | - | 02-20 | - |
| section-02-docker-images | 01 | 11, 17 | 03, 09, 10 |
| section-03-database | 01 | 04, 05, 18 | 02, 09, 10 |
| section-04-cloud-tasks | 01, 03 | 05, 06, 07, 08, 15 | 09, 10, 18 |
| section-05-bullmq-migration | 04 | - | 06, 07 |
| section-06-cloud-scheduler | 04 | - | 05, 07 |
| section-07-kie-integration | 04 | 08 | 05, 06 |
| section-08-media-pipeline | 07, 09 | 11 | - |
| section-09-r2-storage | 01 | 08, 11, 12, 15 | 02, 03, 10 |
| section-10-redis-ratelimit | 01 | 15 | 02, 03, 09 |
| section-11-video-pipeline | 02, 08, 09 | 19 | 12 |
| section-12-vectorize | 09 | - | 11, 13, 14 |
| section-13-sentry | 01, 02 | 19 | 12, 14, 15, 16 |
| section-14-posthog | 01 | 19 | 12, 13, 15, 16 |
| section-15-admin-dashboard | 04, 09, 10 | 19 | 13, 14, 16 |
| section-16-cloud-monitoring | 02 | 19 | 13, 14, 15 |
| section-17-cicd | 02, 03 | 19 | 18 |
| section-18-auth-hardening | 03, 10 | 19 | 04, 17 |
| section-19-load-testing | 01-18 | 20 | - |
| section-20-prod-hardening | 19 | - | - |

## Execution Order (Batched)

1. **Batch 1** — Infrastructure foundations (standalone):
   - section-01-gcp-bootstrap

2. **Batch 2** — Independent infrastructure (parallel after 01):
   - section-02-docker-images
   - section-03-database
   - section-09-r2-storage
   - section-10-redis-ratelimit

3. **Batch 3** — Core migrations (parallel after batch 2):
   - section-04-cloud-tasks
   - section-18-auth-hardening

4. **Batch 4** — Job orchestration (parallel after 04):
   - section-05-bullmq-migration
   - section-06-cloud-scheduler
   - section-07-kie-integration

5. **Batch 5** — Pipelines (after 07 + 09):
   - section-08-media-pipeline
   - section-12-vectorize

6. **Batch 6** — Heavy compute + observability (parallel):
   - section-11-video-pipeline
   - section-13-sentry
   - section-14-posthog
   - section-15-admin-dashboard
   - section-16-cloud-monitoring

7. **Batch 7** — CI/CD:
   - section-17-cicd

8. **Batch 8** — Validation:
   - section-19-load-testing

9. **Batch 9** — Launch:
   - section-20-prod-hardening

## Section Summaries

### section-01-gcp-bootstrap
GCP project creation, API enablement, service accounts, Cloud Tasks queues, Secret Manager configuration. All `gcloud` commands documented.

### section-02-docker-images
Three Docker images: node-api (multi-stage with Vite build), python-orchestrator (FastAPI), video-job-runner (FFmpeg + fonts). Health check endpoints, graceful shutdown handlers, `.dockerignore`.

### section-03-database
Neon Postgres setup for staging/production. Table ownership map (Drizzle vs Alembic), connection pooling configuration, `cloud_task_events` table, `seed-production.ts` script.

### section-04-cloud-tasks
Celery → Cloud Tasks migration with phased rollout (dual-write → validate → remove). Cloud Tasks enqueue modules for Python and Node.js. OIDC validation middleware. DLQ pattern. Node.js file-level migration details.

### section-05-bullmq-migration
BullMQ → Cloud Tasks/Scheduler migration. Scheduled messages, LLM queue management, admin dashboard data source updates. Remove bullmq dependency.

### section-06-cloud-scheduler
Cloud Scheduler jobs for all periodic tasks. OIDC authentication. Replaces CeleryBeat + setInterval patterns. Includes Redis cleanup and scheduled message delivery fallback.

### section-07-kie-integration
Dual completion path: webhook handler with signature validation + polling fallback with exponential backoff. Job submission flow updates for Cloud Tasks. Dedup via Redis.

### section-08-media-pipeline
Inline media processing in Python Cloud Run Service. Download from Kie AI, thumbnail generation, R2 upload, DB update, PostHog event emission. Idempotency and error handling.

### section-09-r2-storage
Cloudflare R2 bucket setup, prefix organization, lifecycle rules (12-day temp, 7-day preview, permanent gallery). Presigned URL generation. Storage abstraction for both Node.js and Python.

### section-10-redis-ratelimit
Split Redis architecture: Upstash (rate limiting, locks, dedup, flags) + Google Memorystore (pub/sub for SSE, concurrency tracking). Rate limiting middleware for auth and job endpoints.

### section-11-video-pipeline
Cloud Run Job for FFmpeg rendering. Timeline spec → two-stage pipeline (assembly + final render). Render profiles (preview/standard/high). Render hash idempotency. Job routing (short vs long).

### section-12-vectorize
Cloudflare Vectorize indexes (docs + images). Embedding generation via Workers AI. One-time indexing script. Gallery promotion triggers. Search tRPC endpoints.

### section-13-sentry
Three Sentry projects (frontend, node, python). Error boundary, middleware, PII scrubbing. Correlation ID flow (X-Request-ID). Release tracking. Session replay at 1% sampling.

### section-14-posthog
PostHog Cloud integration. Client-side and server-side SDKs. Identity management (anonymous → identified). Full event schema (acquisition → delivery → engagement). Dashboard definitions.

### section-15-admin-dashboard
In-app admin dashboard with 6 panels (Traffic, API Health, Jobs, Kie AI, Storage, Security). tRPC admin endpoints. Email alerting via Cloud Scheduler with threshold-based triggers and deduplication.

### section-16-cloud-monitoring
Cloud Monitoring dashboards (Services + Jobs). Alert policies (5xx rate, latency, job failures, queue backlog). Structured JSON logging for both Node.js and Python.

### section-17-cicd
GitHub Actions workflows: build + deploy (staging on push to main, production on tag). Workload Identity Federation. Canary deployments with smoke tests. PR preview environments.

### section-18-auth-hardening
Production cookie configuration (domain, Secure, HttpOnly, SameSite). CSRF protection via Origin header verification. DB-backed session validation. Cloud Run TLS defaults.

### section-19-load-testing
k6/Locust test scenarios: API load (100 users), job burst (500 generates), sustained load (1000/hour). Metrics capture via Cloud Monitoring. Bottleneck remediation guidelines.

### section-20-prod-hardening
DNS/domain configuration for Cloud Run. Hardening checklist (secrets, HTTPS, rate limits, lifecycle, alerting, Sentry, PostHog). Rollback procedure. Launch sequence (10% → 50% → 100% canary).
