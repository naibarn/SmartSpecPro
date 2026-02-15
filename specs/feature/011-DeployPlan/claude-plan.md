# SmartSpecPro MVP Deployment — Implementation Plan

## Overview

SmartSpecPro is an AI-driven specification and media generation platform built as a Turborepo monorepo. The codebase consists of a Node.js web app (React 19 + Express + tRPC + Drizzle ORM), a Python backend (FastAPI + SQLAlchemy + Celery), and shared packages. It currently runs locally with Docker Compose for PostgreSQL and Redis, Nginx for reverse proxy, and Celery workers for async job processing.

This plan deploys the MVP to production using Google Cloud Run for compute, Google Cloud Tasks replacing Celery and BullMQ for job orchestration, Cloud Scheduler replacing CeleryBeat for periodic tasks, Neon Postgres for managed databases, a split Redis strategy (Upstash for stateless operations + Google Memorystore for pub/sub and connection-oriented features), Cloudflare R2 for object storage, Cloudflare Vectorize for semantic search, PostHog for product analytics, and Sentry for error tracking.

The target scale is 100-1,000 users with 50-500 jobs/day at launch. The domain structure uses `app.smartaihub.app` for the unified dashboard + API (Cloud Run) and `www.smartaihub.app` for public/SEO pages (Cloudflare Pages, deferred to Phase 2).

---

## Section 1: GCP Project Bootstrap

### Purpose
Establish the foundational GCP infrastructure. Nothing else can proceed without a project, billing, APIs, service accounts, and Artifact Registry.

### What to Provision

**GCP Project and Billing:**
Create a new GCP project (e.g., `smartspecpro-mvp`). Link a billing account. Enable required APIs: Cloud Run, Cloud Tasks, Cloud Scheduler, Artifact Registry, Secret Manager, Cloud Logging, Cloud Monitoring.

**Artifact Registry:**
Create a Docker repository in the project's primary region (e.g., `asia-southeast1` or `us-central1` depending on user base). This stores all Docker images for Cloud Run services and jobs.

**Service Accounts (least-privilege):**
- `cloud-run-api@` — For the Node.js and Python Cloud Run services. Roles: `run.invoker`, `secretmanager.secretAccessor`, `cloudtasks.enqueuer`, `logging.logWriter`.
- `cloud-run-jobs@` — For Cloud Run Jobs (media/video). Roles: `secretmanager.secretAccessor`, `logging.logWriter`, `storage.objectAdmin` (for R2 via S3 API — handled externally, but the SA needs Cloud Tasks permissions if jobs enqueue follow-up tasks).
- `cloud-scheduler@` — For Cloud Scheduler to invoke Cloud Tasks. Roles: `cloudtasks.enqueuer`.
- `github-deploy@` — For GitHub Actions to push images and deploy. Roles: `artifactregistry.writer`, `run.admin`, `iam.serviceAccountUser`.

**Cloud Tasks Queues:**
Create six queues with specific rate limits and retry policies:
- `media-jobs`: max 5/s dispatch, 10 concurrent, 5 retries, 1s-300s backoff
- `video-jobs-short`: max 2/s, 10 concurrent, 3 retries, 5s-600s backoff
- `video-jobs-long`: max 1/s, 3 concurrent, 3 retries, 10s-600s backoff
- `workflow-tasks`: max 10/s, 20 concurrent, 5 retries, 1s-60s backoff
- `polling-tasks`: max 2/s, 5 concurrent, 10 retries, 30s-600s backoff
- `periodic-tasks`: max 1/s, 5 concurrent, 3 retries, 5s-300s backoff

**Secret Manager:**
Create secrets for: `DATABASE_URL`, `REDIS_UPSTASH_URL`, `REDIS_MEMORYSTORE_URL`, `LLM_ENCRYPTION_KEY`, `JWT_SECRET`, `KIE_AI_API_KEY`, `KIE_AI_WEBHOOK_SECRET`, `SENTRY_DSN_FRONTEND`, `SENTRY_DSN_NODE`, `SENTRY_DSN_PYTHON`, `POSTHOG_API_KEY`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_ACCOUNT_ID`.

### Dependencies
None — this is the first step.

### Key Decisions
- All `gcloud` commands will be documented (no Terraform for MVP, can be added later).
- Region selection should consider proximity to target users and Neon Postgres region availability.
- IAM follows least-privilege: each service account has only the roles it needs.

---

## Section 2: Docker Images

### Purpose
Create production-ready Docker images for three services/jobs that will run on Cloud Run. (Media-job processing runs inline in the Python service — see Section 7.)

### Images to Build

**1. node-api**
Multi-stage build targeting Node.js 20 Alpine. Stage 1 installs all dependencies (including devDependencies for the Vite build). Stage 2 runs the Vite production build for the React frontend. Stage 3 copies only production deps and built artifacts into a slim image. The entrypoint runs the Express server via `tsx` on port 3000. This image serves both the dashboard UI and the API (same-origin `/api/*`, `/trpc/*`, static assets).

The Turborepo monorepo structure means the Docker build context must include `apps/web/`, `packages/shared/`, `packages/db/`, `packages/ui/`, `packages/skills/`, and root config files. Use a `.dockerignore` to exclude `node_modules`, `.git`, and `python-backend/`.

**2. python-orchestrator**
Multi-stage build targeting Python 3.11 Alpine. Install dependencies via `uv` (the project already uses it). Copy only `python-backend/` into the image. Run with `uvicorn app.main:app --host 0.0.0.0 --port 8000`. This image handles LLM gateway, Kie AI webhooks, media provider integration, and Cloud Tasks periodic task endpoints.

Remove all Celery imports and worker startup logic. The Cloud Tasks HTTP handler replaces Celery task registration.

**3. video-job-runner** (Cloud Run Job)
Based on the python-orchestrator image with FFmpeg 7.1 and font packages added. Configured as a Cloud Run Job (runs to completion, not a server). Media-job processing runs inline in the python-orchestrator service (see Section 7), so no separate media-job-runner image is needed.

FFmpeg and font packages:
- `ffmpeg` 7.1 pinned version
- `fontconfig`, `ttf-dejavu`, `ttf-liberation`, `ttf-freefont`
- Run `fc-cache -fv` during build

The entrypoint reads the timeline spec, executes the two-stage FFmpeg pipeline (assembly + final render), uploads output to R2, and exits. Short vs long configurations are the same image with different Cloud Run Job CPU/memory settings.

### Health Check Endpoints

Service images (not jobs) must include health check endpoints:
- **Node.js:** `GET /healthz` — Returns 200 if the process is up. `GET /readyz` — Returns 200 if the DB connection pool and Redis are reachable (shallow checks with short timeouts). Cloud Run uses the startup probe against `/healthz` to detect cold-start readiness.
- **Python:** `GET /health` — Returns 200 if FastAPI is serving. `GET /ready` — Returns 200 if DB and Redis connections are established. Configure Cloud Run startup probe on `/health`.

### Graceful Shutdown

Cloud Run sends SIGTERM before terminating instances (default 10s grace period, configurable up to 300s). Both services must handle SIGTERM:

**Node.js (`apps/web/server/index.ts`):**
1. Stop accepting new connections (`server.close()`).
2. Drain in-flight HTTP requests (Express handles this via `server.close` callback).
3. Flush PostHog event batch (`posthog.shutdown()`).
4. Flush Sentry events (`Sentry.close(2000)`).
5. Close Redis connections (disconnect IORedis clients).
6. Close DB connection pool (`pool.end()`).

**Python (`app/main.py`):**
1. FastAPI/uvicorn handles request draining on SIGTERM automatically.
2. Flush PostHog (`posthog.shutdown()`).
3. Flush Sentry (`sentry_sdk.flush()`).
4. Close SQLAlchemy engine (`engine.dispose()`).
5. Close Redis connections.

Set Cloud Run `--termination-grace-period=30` to allow time for graceful drain.

### Build Strategy
- All images use multi-stage builds to minimize final image size.
- Base images: `node:20-alpine`, `python:3.11-alpine`.
- Pin all system package versions for reproducibility.
- Use `.dockerignore` at the repo root to exclude irrelevant files.

### Local Development
Add a `docker-compose.cloud-run-dev.yml` that mirrors the Cloud Run setup locally, allowing developers to test the containerized services before deploying. This is separate from the existing `docker-compose.dev.yml` which runs the uncontainerized dev setup.

---

## Section 3: Database Setup (Neon Postgres)

### Purpose
Configure Neon Postgres for staging and production environments while keeping local PostgreSQL for development.

### Database Strategy
- **Local dev:** Continue using existing PostgreSQL 15 via `docker-compose.infra.yml`.
- **Staging:** Create a Neon project with a staging database. Use Neon's branching for isolated testing.
- **Production:** Create a separate Neon database (or branch) for production.

### Schema Migration and Table Ownership

The codebase uses two ORMs against the same database. To prevent migration conflicts, establish clear ownership:

**Drizzle ORM (Node.js) owns:**
- All tables in `apps/web/drizzle/schema.ts` (users, sessions, tenants, system_settings, videoEditorProjects, scheduledMessages, etc.)
- New table: `cloud_task_events` — Tracks Cloud Tasks execution for observability and DLQ handling. Fields: task_id, queue_name, job_id, status, attempt_count, created_at, completed_at, error_message. Owned by Drizzle because the Node.js API service reads/writes this table.
- Add `cloud_task_id` column to `media_tasks` table to correlate Cloud Tasks with application jobs.

**SQLAlchemy/Alembic (Python) owns:**
- `media_tasks` table (the Python backend's primary job tracking table)
- Any Python-only tables for LLM provider state

**Migration Execution Order (CI/CD):**
1. Run Drizzle migrations first (`pnpm db:push`). Drizzle owns the majority of tables.
2. Run Alembic migrations second (`alembic upgrade head`). Alembic models for Drizzle-owned tables use `__table_args__ = {"extend_existing": True}` to read without conflicting.
3. Both ORMs must never create or alter the same table in the same release.

The `renders` table referenced in the spec maps to the existing `videoEditorProjects` table with extensions for render metadata.

### Production Seed Data

A fresh production database requires seed data to function. Create a `seed-production.ts` script that applies:
1. Default admin user (email from `ADMIN_EMAIL` env var, temporary password that must be changed on first login).
2. Default tenant with domain `smartaihub.app`.
3. System settings: SMTP configuration, default LLM provider preferences.
4. Media model definitions (Kie AI model registry entries).

Run this script as a one-time CI step after initial migration, not on every deploy.

### Connection Pooling
Neon provides connection pooling via PgBouncer in transaction mode. Configure the `DATABASE_URL` to use the pooled connection string (port 5432 with `?pgbouncer=true`). Set conservative per-service pool sizes to avoid exceeding Neon's plan limits:

- **Node.js Cloud Run Service:** max 5 connections per instance × 5 max instances = 25 connections
- **Python Cloud Run Service:** max 5 connections per instance × 3 max instances = 15 connections
- **Cloud Run Jobs (video):** max 2 connections per job × 3 max concurrent = 6 connections
- **Total:** ~46 connections (well within Neon's 100 connection limit on the Launch plan)

Add a Cloud Monitoring alert for connection pool utilization > 80% to catch exhaustion before it causes errors.

### Environment Configuration
- `DATABASE_URL` stored in GCP Secret Manager, mounted as env var in Cloud Run.
- Local dev continues using `apps/web/.env` with the local PostgreSQL URL.
- Drizzle migration commands (`pnpm db:push`) run locally against Neon during deployment (or as a CI step).

---

## Section 4: Celery → Cloud Tasks Migration

### Purpose
Replace all Celery task processing with Google Cloud Tasks HTTP targets, using a phased migration approach to ensure rollback safety.

### Migration Architecture

**Current flow (Celery):**
```
Node.js → Redis (Celery broker) → Celery Worker → task execution
CeleryBeat → Redis → Celery Worker → periodic task
```

**New flow (Cloud Tasks):**
```
Node.js → Cloud Tasks API → HTTP POST to Cloud Run Service/Job → task execution
Cloud Scheduler → Cloud Tasks queue → HTTP POST to Cloud Run → periodic task
```

### Phased Migration Strategy

Instead of a big-bang cutover, migrate in three phases:

**Phase A (Deploy alongside):** Deploy Cloud Tasks endpoints alongside existing Celery tasks. Both systems run. New jobs dispatched to Cloud Tasks, Celery workers still running as fallback. Feature flag `USE_CLOUD_TASKS=true` controls which path is used.

**Phase B (Validate):** Run Cloud Tasks in production for 1-2 weeks with monitoring. Compare job completion rates, latencies, and error rates between Cloud Tasks and Celery. If Cloud Tasks fails, flip the feature flag back to Celery.

**Phase C (Remove Celery):** After Phase B validates, remove all Celery code (see "Removing Celery" below). Keep the Celery branch tagged in git for emergency rollback.

### Task Handler Endpoints

Add new endpoints to the Python orchestrator service that replace Celery task functions:

**On the Python Cloud Run Service:**
- `POST /tasks/poll-job` — Polls Kie AI for a specific job status. Replaces `poll_kie_job` Celery task.
- `POST /tasks/process-media` — Triggers media-job processing. Instead of running inline, this enqueues a Cloud Run Job execution via the Cloud Run Admin API.
- `POST /tasks/process-video` — Triggers video-job processing. Same pattern — enqueues a Cloud Run Job.
- `POST /tasks/cleanup-expired` — Deletes tasks older than 12 days.
- `POST /tasks/retry-failed` — Retries failed tasks.
- `POST /tasks/retry-callbacks` — Retries failed callback events.
- `POST /tasks/recover-stuck` — Recovers stuck tasks.
- `POST /tasks/check-workflows` — Checks scheduled workflows.
- `POST /tasks/cleanup-sessions` — Cleans expired edit sessions.
- `POST /tasks/renew-drive-channels` — Renews Google Drive watch channels.
- `POST /tasks/poll-drive-changes` — Polls for Drive file changes.

All task handler endpoints must:
1. **Validate the Cloud Tasks OIDC token** (reject unauthorized callers) — see OIDC Validation below.
2. Read `X-CloudTasks-TaskRetryCount` to implement DLQ logic on final retry.
3. Be fully idempotent — checking DB state before processing.
4. Return 2xx on success (Cloud Tasks considers any 2xx a successful delivery).
5. Return 5xx for transient errors (triggers retry) or 4xx for permanent errors (no retry).

### Cloud Tasks OIDC Validation

All `/tasks/*` endpoints are internal-only and must reject unauthorized callers. Implement a FastAPI middleware that:

1. Extracts the `Authorization: Bearer <token>` header from the incoming request.
2. Uses `google-auth` library's `google.oauth2.id_token.verify_oauth2_token()` to validate the JWT.
3. Checks the `aud` (audience) claim matches the Python Cloud Run service URL (e.g., `https://python-orchestrator-xxxxx.run.app`).
4. Checks the `email` claim matches one of the allowed service accounts: `cloud-run-api@{project}.iam.gserviceaccount.com` or `cloud-scheduler@{project}.iam.gserviceaccount.com`.
5. Returns HTTP 401 with a JSON error body on validation failure. Never return 5xx for auth failures (would trigger retry).
6. In local development, skip OIDC validation when `ENVIRONMENT=development` (use a shared internal token instead).

### Cloud Tasks Enqueue Pattern

Create a shared Cloud Tasks client module in the Python backend:

```python
def enqueue_task(queue_name: str, handler_path: str, payload: dict, delay_seconds: int = 0, task_id: str | None = None) -> str:
    """Enqueue a task to Cloud Tasks.

    - queue_name: which queue to use (e.g., 'media-jobs')
    - handler_path: endpoint path on the target service (e.g., '/tasks/process-media')
    - payload: JSON body for the task
    - delay_seconds: optional delay before first dispatch
    - task_id: optional deterministic name for deduplication (24h window)
    Returns: the created task name
    """
```

Create an equivalent module on the Node.js side for job submission. Add `@google-cloud/tasks` to `apps/web/package.json` and create `apps/web/server/services/cloudTasks.ts`:

```typescript
async function enqueueTask(options: {
  queueName: string;
  handlerPath: string;
  payload: Record<string, unknown>;
  delaySeconds?: number;
  taskId?: string;
}): Promise<string>
```

### Node.js Files Requiring Modification

The following files currently dispatch work via HTTP POST to the Python backend or via Celery-adjacent patterns. Each must be updated to use the `enqueueTask` function:

- `apps/web/server/routers/mediaJobs.ts` — Replace the direct HTTP POST to `/api/v1/media-jobs/execute` (around line 209-235) with `enqueueTask({ queueName: 'media-jobs', handlerPath: '/tasks/process-media', ... })`. Also replace polling task dispatch with Cloud Tasks delayed enqueue.
- `apps/web/server/services/scheduler.ts` — This file imports BullMQ for scheduled message alerts. Migrate to Cloud Tasks or Cloud Scheduler (see Section 4.5).
- `apps/web/server/routers/mediaJobs.ts` (setInterval at lines 1049-1093) — Remove the `setInterval`-based Redis cleanup. Move to a Cloud Scheduler endpoint `POST /tasks/cleanup-redis-stale` that runs every 5 minutes.
- Any other file that dispatches to the Python backend's `/api/v1/media-jobs/*` endpoints for async processing should be audited and migrated.

### Dead Letter Queue Pattern

Since Cloud Tasks has no built-in DLQ:
1. Each task handler checks `X-CloudTasks-TaskRetryCount` against the queue's `max_attempts`.
2. On the final retry attempt: write the failed task payload to `cloud_task_events` table with `status='dead_letter'`.
3. A Cloud Scheduler periodic job runs daily to check for dead letters and send email alerts to admins.

### Removing Celery

After the Cloud Tasks integration is complete:
1. Remove `celery_app.py` and all `@celery_app.task` decorators.
2. Remove `celery` and `redis` (as broker) from Python dependencies (keep `redis` for Upstash rate limiting).
3. Remove `docker-compose.media.yml` Celery worker services.
4. Remove CeleryBeat configuration.
5. Update `run-services.sh` to remove Celery worker startup.

---

## Section 4.5: BullMQ Migration

### Purpose
Migrate all BullMQ-based job scheduling and queue processing from the Node.js side to Cloud Tasks and Cloud Scheduler. BullMQ relies on persistent Redis connections with blocking pops (`BRPOPLPUSH`), which are incompatible with Upstash Redis's serverless/HTTP model.

### Current BullMQ Usage

The Node.js codebase uses BullMQ extensively (~33 files reference it):
- `apps/web/server/services/scheduler.ts` — `chat-alerts` queue for scheduled message delivery. Uses BullMQ `Queue`, `Worker`, and `Job` classes.
- `apps/web/drizzle/schema.ts` — `scheduledMessages` table stores messages to be delivered at a future time by BullMQ workers.
- Admin queue dashboards (`AdminQueues.tsx`, `AdminQueueLLM.tsx`, `AdminQueueDashboard.tsx`) — UI for monitoring BullMQ queue health.
- Various services that enqueue background work via BullMQ.

### Migration Strategy

**Scheduled Messages (chat-alerts queue):**
Replace with Cloud Tasks delayed dispatch. When a message is scheduled:
1. Write the scheduled message to the `scheduledMessages` table (existing behavior).
2. Enqueue a Cloud Tasks task with `delay_seconds` set to the time until delivery.
3. The task handler (`POST /tasks/deliver-scheduled-message`) reads from `scheduledMessages`, delivers the message, and marks it complete.
4. A Cloud Scheduler fallback job runs every minute to catch any tasks that were not enqueued (belt-and-suspenders).

**LLM Queue Management:**
BullMQ manages LLM request queuing via Bottleneck + BullMQ. Replace with:
1. In-process rate limiting via Bottleneck (already in use, no Redis required).
2. Cloud Tasks `workflow-tasks` queue for LLM requests that need retry/backoff semantics.
3. The admin queue dashboards will query Cloud Tasks queue metrics via the Cloud Tasks Admin API instead of BullMQ's built-in monitoring.

**Admin Queue Dashboards:**
Update `AdminQueues.tsx` and related components to fetch data from Cloud Tasks Admin API (queue depth, task counts, retry metrics) instead of BullMQ introspection. The tRPC endpoint `admin.queueHealth` replaces direct BullMQ queue queries.

### Removal

After migration:
1. Remove `bullmq` from `apps/web/package.json`.
2. Remove `apps/web/server/services/scheduler.ts` BullMQ worker code.
3. Update admin dashboard components to use Cloud Tasks data source.
4. BullMQ's Redis usage was a primary driver of needing a persistent Redis connection — with BullMQ removed, the Node.js service can use Upstash for its remaining stateless Redis needs.

---

## Section 5: Cloud Scheduler (Periodic Tasks)

### Purpose
Replace CeleryBeat with Cloud Scheduler jobs that enqueue tasks to the `periodic-tasks` Cloud Tasks queue.

### Scheduler Jobs

Create one Cloud Scheduler job per periodic task:

| Scheduler Job | Cron Expression | Target Queue | Handler Path |
|--------------|----------------|--------------|-------------|
| cleanup-expired-tasks | `0 3 * * *` | periodic-tasks | /tasks/cleanup-expired |
| retry-failed-tasks | `*/15 * * * *` | periodic-tasks | /tasks/retry-failed |
| retry-media-callbacks | `* * * * *` | periodic-tasks | /tasks/retry-callbacks |
| retry-library-index | `* * * * *` | periodic-tasks | /tasks/retry-callbacks |
| recover-stuck-tasks | `*/2 * * * *` | periodic-tasks | /tasks/recover-stuck |
| check-scheduled-workflows | `* * * * *` | periodic-tasks | /tasks/check-workflows |
| cleanup-edit-sessions | `*/30 * * * *` | periodic-tasks | /tasks/cleanup-sessions |
| renew-drive-channels | `0 */6 * * *` | periodic-tasks | /tasks/renew-drive-channels |
| poll-drive-changes | `*/15 * * * *` | periodic-tasks | /tasks/poll-drive-changes |
| process-dead-letters | `0 8 * * *` | periodic-tasks | /tasks/process-dead-letters |
| cleanup-redis-stale | `*/5 * * * *` | periodic-tasks | /tasks/cleanup-redis-stale |
| deliver-scheduled-messages | `* * * * *` | periodic-tasks | /tasks/deliver-scheduled-fallback |

The `cleanup-redis-stale` job replaces the `setInterval` pattern in `apps/web/server/routers/mediaJobs.ts` (lines 1049-1093) which is incompatible with Cloud Run's scaling model. The `deliver-scheduled-messages` job is a fallback for the BullMQ scheduler migration (Section 4.5).

Each scheduler job uses OIDC authentication with the `cloud-scheduler@` service account to create tasks in Cloud Tasks, which then uses OIDC to call the Python orchestrator service.

### Monitoring
Cloud Scheduler provides execution history. Add a Cloud Monitoring alert for scheduler job failures (status != SUCCESS) to catch broken periodic tasks.

---

## Section 6: Kie AI Integration (Webhook + Polling)

### Purpose
Implement the dual completion path for media generation jobs: webhook as primary, polling as fallback.

### Webhook Path

The Python orchestrator exposes a public webhook endpoint:
- `POST /api/webhooks/kie` — Receives Kie AI completion callbacks.

Webhook handler logic:
1. Validate the webhook signature/shared secret (from Secret Manager).
2. Extract `kie_job_id` and result data from the payload.
3. Look up the application `job_id` from the `jobs` table via `kie_job_id`.
4. If job already completed (idempotency check): return 200 OK immediately.
5. Update job status to `done`, store result metadata.
6. Enqueue `media-job` to Cloud Tasks to download and process the result.
7. Record a `job_events` entry for the state transition.
8. Store a webhook dedup key in Upstash Redis with 24h TTL to prevent double-processing.

### Polling Fallback Path

When a job is submitted, the Node.js API enqueues a polling task to Cloud Tasks with a 2-minute delay:
```
Cloud Tasks: poll_job(job_id) → delay 2 minutes → POST /tasks/poll-job
```

Poll handler logic:
1. Check if job is already completed (webhook may have arrived first): if so, return 200.
2. Call Kie AI status API with the `kie_job_id`.
3. If completed: same processing as webhook path (update DB, enqueue media-job).
4. If still processing: re-enqueue poll task with exponential backoff (2min → 4min → 8min → 16min → ... up to 30min cap).
5. If max polling duration exceeded (12-24h TTL): mark job as `timeout`, record event, alert admin.
6. Respect Kie AI rate limits — the `polling-tasks` queue rate limit (2/s, 5 concurrent) handles this.

### Job Submission Flow (Updated)

The existing Node.js media job router (`apps/web/server/routers/mediaJobs.ts`) needs these changes:
1. After calling Kie AI and getting `kie_job_id`: enqueue a Cloud Tasks polling task instead of relying solely on the webhook.
2. Keep the Redis-based per-user concurrency tracking (max 3 concurrent via Redis Set).
3. Keep the Redis-based progress reporting channel.

---

## Section 7: Media Job Pipeline

### Purpose
Implement media-job processing as an inline handler in the Python Cloud Run Service (not a separate Cloud Run Job). Media jobs are IO-bound (download, upload, DB write) and do not require the dedicated CPU/memory resources that justify a separate Cloud Run Job. Running inline simplifies the architecture by eliminating the three-hop pattern (Cloud Tasks → Service → Admin API → Job).

### Architecture

Cloud Tasks dispatches `POST /tasks/process-media` directly to the Python Cloud Run Service. The handler runs the full media pipeline within the request lifecycle (Cloud Tasks allows up to 30-minute handler timeouts).

### Pipeline Steps

The `POST /tasks/process-media` handler receives a JSON payload with `job_id` and `kie_job_id`:

1. **Fetch result:** Download the generated media (image/video/audio) from Kie AI's result URL.
2. **Generate thumbnails:** For images, create a thumbnail at 300px width. For videos, extract a frame at 25% duration using a lightweight FFmpeg call (no full video-job-runner needed).
3. **Extract metadata:** File size, dimensions, duration (video/audio), format, codec.
4. **Upload to R2:** Upload the full result and thumbnail to R2 under `temp/raw/{user_id}/{job_id}/` using `boto3` with R2 credentials from Secret Manager.
5. **Update DB:** Write R2 object keys, presigned URLs (for immediate access), and metadata to the `media_tasks` table.
6. **Emit analytics:** Capture PostHog server-side event `media_job_completed` with properties: job_type, duration_ms, output_size_bytes, resolution.

### Idempotency

Before step 1, check if the job already has R2 keys in the DB. If so, return 200 immediately. This makes the handler safe to retry.

### Error Handling

- Transient errors (network timeout, R2 upload failure): return 5xx → Cloud Tasks retries per queue config.
- Permanent errors (Kie AI returns error, invalid result): update job status to `failed`, record error in `job_events`, return 200 (to prevent retry).

### Docker Image Simplification

With media jobs running inline in the Python Cloud Run Service, the separate `media-job-runner` Docker image is no longer needed. Remove it from Section 2. Only the `video-job-runner` image remains as a Cloud Run Job for heavy FFmpeg rendering.

---

## Section 8: Video Rendering Pipeline

### Purpose
Implement the `video-job-runner` Cloud Run Job that renders video from timeline specs using FFmpeg.

### Timeline Spec Format

Extend the existing `VideoEditorProject` type in `apps/web/client/src/types/videoEditor.ts` with render-specific fields:

```typescript
interface RenderSpec {
  project: VideoEditorProject;       // Existing editor state (tracks, clips, assets)
  profile: 'preview' | 'standard' | 'high';
  renderHash: string;                // sha256(inputs + timeline + profile)
  outputKey: string;                 // R2 path: renders/{renderHash}.mp4
  inputAssetKeys: Record<string, string>;  // assetId → R2 object key mapping
}
```

### Two-Stage FFmpeg Pipeline

**Stage 1 — Assembly (V1 track):**
Generate a concat file from the V1 track's clip list. If all clips share the same codec, resolution, and timebase, use stream copy (`-c copy`) for near-instant assembly. Otherwise, re-encode with the standard profile.

Output: `temp/work/{renderHash}_assembled.mp4`

**Stage 2 — Final Render (V2 + T1 + A1):**
Build a `filter_complex` command that:
- Starts from the assembled V1 output.
- Overlays V2 elements at specified positions and time ranges (`overlay` + `enable` filters).
- Burns T1 text elements using `drawtext` filter with font from the container's fontconfig.
- Mixes A1 audio track with V1 audio using `amix` filter.
- Applies the selected render profile's encoding settings.

Output: `renders/{renderHash}.mp4` in R2.

### Render Profiles

| Profile | Video Codec | Preset | CRF | Scale | Audio | Bitrate |
|---------|------------|--------|-----|-------|-------|---------|
| preview | libx264 | ultrafast | 28 | 640:-2 | aac 128k | ~1 Mbps |
| standard | libx264 | medium | 23 | original | aac 192k | ~5 Mbps |
| high | libx264 | slow | 18 | original | aac 256k | ~10 Mbps |

All outputs include `-movflags +faststart` for streaming playback.

### Job Routing

The enqueuing service determines which Cloud Tasks queue based on:
- Input total duration < 2 minutes AND no V2/T1 overlays → `video-jobs-short` queue (2 vCPU, 8 GiB)
- Otherwise → `video-jobs-long` queue (4 vCPU, 16 GiB)

### Idempotency and Caching

Before starting FFmpeg:
1. Compute `renderHash = sha256(sorted_input_hashes + timeline_spec_json + profile)`.
2. HEAD request to R2 for `renders/{renderHash}.mp4`.
3. If exists: update DB with the existing URL, emit completion event, exit.
4. If not: proceed with rendering.

### Progress Reporting

The video-job-runner publishes progress to Redis channel `media-job-progress:{jobId}` at regular intervals (every 5 seconds). Parse FFmpeg's stderr for frame count and duration to calculate percentage.

---

## Section 9: R2 Storage Configuration

### Purpose
Configure Cloudflare R2 with lifecycle rules, presigned URL generation, and the storage abstraction layer.

### Bucket Setup

Create a single R2 bucket per environment (staging, production). Use prefix-based organization:

```
smartspecpro-{env}/
├── temp/raw/        # User uploads, camera footage
├── temp/work/       # Intermediate artifacts, proxies
├── renders/preview/ # Preview render outputs
├── renders/final/   # Final render outputs
└── gallery/         # Curated public content
```

### Lifecycle Rules

Configure via the S3 API (`PutBucketLifecycleConfiguration`):
- `temp/*` → Delete objects older than 12 days
- `renders/preview/*` → Delete objects older than 7 days
- Incomplete multipart uploads → Abort after 1 day
- `gallery/*` → No expiration (keep indefinitely)
- `renders/final/*` → Delete after 12 days (or adjust per business rule)

### Presigned URLs

Use `@aws-sdk/s3-request-presigner` for generating presigned GET and PUT URLs:
- Download URLs: 1-hour expiry for user-facing content, 24-hour for admin
- Upload URLs: 1-hour expiry with content-type restriction
- Presigned URLs only work with the S3 API endpoint (`{ACCOUNT_ID}.r2.cloudflarestorage.com`), not custom domains

### Storage Abstraction

The existing `apps/web/server/storage.ts` already supports R2/S3 via the AWS SDK. For the Cloud Run deployment:
1. Store R2 credentials in GCP Secret Manager.
2. The storage module reads credentials from environment variables (mounted from Secret Manager).
3. For the Python video-job-runner: use `boto3` or the AWS SDK directly with the same R2 credentials.
4. Maintain the abstraction layer to support future S3 migration.

---

## Section 10: Split Redis Strategy & Rate Limiting

### Purpose
Configure a split Redis architecture that addresses two distinct access patterns: stateless operations (rate limiting, locks, dedup) via Upstash, and connection-oriented operations (pub/sub for SSE progress, per-user concurrency tracking) via Google Memorystore.

### Why Split Redis

Upstash Redis is HTTP-based and serverless — ideal for stateless key-value operations but **does not support traditional Redis pub/sub** (`SUBSCRIBE`/`PSUBSCRIBE` commands). The existing codebase uses pub/sub extensively for real-time SSE progress streaming (`apps/web/server/routers/mediaJobs.ts` creates dedicated Redis subscriber connections per client). Upstash also does not support the blocking-pop patterns required by BullMQ (though BullMQ is being removed — see Section 4.5).

### Upstash Redis (Stateless Operations)

Create separate Upstash Redis instances per environment. Store URL as `REDIS_UPSTASH_URL` in Secret Manager.

Used for:
- **Rate limiting** (sliding window counters) — see below.
- **Job locks:** Short-lived locks (`SETNX` with TTL) to prevent double-start of the same job.
- **Webhook dedup:** Store processed webhook IDs with 24h TTL.
- **Session cache:** Optional cache of session data (DB remains source of truth).
- **Feature flags:** Store Cloud Tasks migration feature flag (`USE_CLOUD_TASKS`).

The Node.js service uses `@upstash/redis` (HTTP client) for these operations. The Python service uses the `upstash-redis` Python SDK.

### Google Memorystore Redis (Connection-Oriented Operations)

Create a Google Memorystore for Redis instance (Basic tier, 1 GiB, same region as Cloud Run). Store URL as `REDIS_MEMORYSTORE_URL` in Secret Manager.

Used for:
- **Pub/sub for SSE progress:** The Python media-job worker publishes progress to `media-job-progress:{jobId}`. The Node.js SSE endpoint subscribes to the channel via a dedicated IORedis connection. This requires a persistent TCP connection — only Memorystore supports this.
- **Per-user concurrency tracking:** Redis Set tracking (`media-jobs:user:{userId}:active`) uses `SADD`/`SREM`/`SCARD` which work fine over Upstash, but are colocated with pub/sub for simplicity.

The Node.js service uses IORedis (existing client) for Memorystore connections. The Python service uses `redis-py` (existing client).

### Redis Adapter

Create a `RedisClients` singleton that exposes two clients:
- `redis.cache` → Upstash (for rate limiting, locks, dedup, flags)
- `redis.realtime` → Memorystore (for pub/sub, concurrency sets)

Existing code that calls `createRedisConnection()` must be updated to use the appropriate client based on the operation type.

### Rate Limiting Implementation

Add rate limiting middleware to these endpoints:
- `POST /api/auth/login` — 5 attempts per IP per minute
- `POST /api/auth/signup` — 3 attempts per IP per minute
- `POST /api/jobs` — 10 per user per minute
- `POST /api/generate` — 5 per user per minute

Use the sliding window pattern with Upstash Redis:
- Key: `ratelimit:{endpoint}:{identifier}` (IP for auth, userId for jobs)
- TTL: window duration (e.g., 60 seconds)
- On limit hit: return HTTP 429 with `Retry-After` header

---

## Section 11: Vectorize Integration

### Purpose
Set up Cloudflare Vectorize indexes for semantic search over documents and images.

### Index Creation

Create two indexes per environment:
- `docs-index-{env}` — 768 dimensions, cosine metric
- `images-index-{env}` — 768 dimensions, cosine metric

Create metadata indexes for filtering:
- `tenantId` (string) — For multi-tenant isolation
- `type` (string) — Content type (article, spreadsheet, specification, etc.)
- `createdAt` (number) — Timestamp for recency filtering

### Embedding Generation

Use Cloudflare Workers AI model `@cf/baai/bge-base-en-v1.5` (768 dimensions):
- **Documents:** Chunk markdown/articles into ~500 token segments. Embed each chunk. Store with metadata: title, section, source URL, tenantId.
- **Images:** Generate text descriptions via Workers AI vision model, then embed the description text. Store with metadata: filename, gallery item ID, tenantId.

### Indexing Pipeline

**At launch:** Create a one-time indexing script (Cloudflare Worker or local script):
1. Query existing gallery items and markdown articles from the database.
2. For docs: chunk text, generate embeddings, batch upsert to `docs-index` (1,000 per batch).
3. For images: generate descriptions, embed, batch upsert to `images-index`.

**Ongoing:** When content is promoted to `gallery/`:
1. The gallery promotion endpoint triggers an indexing task.
2. Generate embedding and upsert to the appropriate index.
3. When gallery items are deleted, delete the corresponding vectors.

### Search Endpoints

Add two tRPC endpoints:
- `search.docs` — Input: query string + optional filters (tenantId, type, limit). Output: ranked results with metadata.
- `search.images` — Input: query string + optional filters. Output: ranked results with image metadata.

Both endpoints: embed the query text, call Vectorize query with topK and metadata filters, return results with scores.

---

## Section 12: Sentry Integration

### Purpose
Add error tracking with Sentry across all three services with correlation IDs.

### Project Setup

Create three Sentry projects under one organization:
- `smartspecpro-frontend` — React/browser errors
- `smartspecpro-node` — Express/tRPC backend errors
- `smartspecpro-python` — FastAPI backend errors

Store DSNs in GCP Secret Manager.

### Frontend Integration

Install `@sentry/react` and configure:
- Initialize with DSN from build-time env var.
- Error boundary wrapping the React app.
- Automatic breadcrumbs for user interactions.
- Session replay at 1% sampling rate (respect PII by masking inputs).
- Release tracking tied to git commit SHA.
- Environment tag: `staging` or `production`.

### Node.js Backend Integration

Install `@sentry/node` and configure:
- Initialize early in the Express app setup.
- Add Sentry request handler middleware (first) and error handler middleware (last).
- Set `request_id` and `user_id` as Sentry tags on each request.
- Tracing at 5% sampling rate.
- PII scrubbing: strip authorization headers, cookie values, request bodies with sensitive fields.
- Release tracking tied to Docker image tag / git commit.

### Python Backend Integration

Install `sentry-sdk[fastapi]` and configure:
- Initialize in `app/main.py` before FastAPI app creation.
- FastAPI integration auto-captures HTTP errors.
- Add `request_id`, `job_id`, `render_id` as Sentry tags via middleware.
- Tracing at 5% sampling.
- PII scrubbing same as Node.js.

### Correlation ID Flow

Generate a `request_id` (UUID) for each incoming HTTP request in both Node.js and Python services. Pass it as a header (`X-Request-ID`) when one service calls another. Include it in:
- All log entries (structured JSON logging).
- All Sentry events (as a tag).
- All PostHog events (as a property).
- All Cloud Tasks payloads (for tracing through the async pipeline).

---

## Section 13: PostHog Analytics

### Purpose
Implement full-funnel product analytics using PostHog Cloud.

### SDK Setup

**React (client-side):**
Initialize PostHog in the app root with:
- `person_profiles: 'identified_only'` — Only create profiles for identified users (saves cost).
- `autocapture: false` — Disable autocapture (reduces noise and cost).
- `session_recording: { maskAllInputs: true }` — Mask sensitive inputs in session replays.
- API host: `https://us.i.posthog.com`.

**Node.js (server-side):**
Initialize PostHog client with batching (flushAt: 20, flushInterval: 10000ms). Call `posthog.shutdown()` on graceful shutdown to flush remaining events.

### Identity Management

1. Pre-login: PostHog auto-generates anonymous `distinct_id` in a cookie.
2. On signup: Call `posthog.alias(anonymousId, newUserId)` THEN `posthog.identify(newUserId)`.
3. On login: Call `posthog.identify(userId)`.
4. Server-side events: Use `userId` as `distinctId`.

### Event Schema

**Acquisition funnel (client-side):**
- `page_view` — automatic via SPA route changes
- `signup_started` — signup form opened
- `signup_completed` — registration API returns success

**Activation funnel (client-side + server-side):**
- `login_started` / `login_succeeded` / `login_failed` (client)
- `dashboard_viewed` (client)
- `job_create_clicked` / `job_submitted` (client)

**Delivery funnel (server-side):**
- `kie_submit_succeeded` — Kie AI accepts the job
- `kie_callback_received` — Webhook received from Kie AI
- `kie_poll_completed` — Polling found the job done
- `media_job_started` / `media_job_completed` / `media_job_failed`
- `video_render_started` / `video_render_completed` / `video_render_failed`

**Engagement (client-side):**
- `output_viewed` / `output_downloaded`
- `gallery_upload` / `gallery_view`
- `return_visit` — user returns after 24h absence

**Properties (attached to relevant events):**
- Auth: `auth_method`, `failure_reason`, `browser`, `os`, `device`
- Job: `job_type`, `duration_estimate`, `clip_count`, `queue_wait_ms`, `processing_ms`, `result_size_mb`, `resolution`
- Abuse: `rate_limited` (boolean), `ip_hash`, `country`

### PostHog Dashboards

Create these dashboards in PostHog:
1. **Signup Funnel:** page_view → signup_started → signup_completed (conversion rate)
2. **Login Health:** login_started → login_succeeded (success rate, top failure reasons)
3. **Job Pipeline:** job_submitted → kie_submit → media_job_completed (conversion, median time)
4. **Video Rendering:** video_render_started → completed (success rate, p95 duration)
5. **Retention:** DAU/WAU cohort analysis, repeat job submissions

---

## Section 14: Admin Ops Dashboard

### Purpose
Build an in-app admin dashboard at `/admin` with 6 health panels and email alerting.

### Access Control

- Route: `/admin` and `/admin/*` in the React app.
- Server-side: All admin endpoints use `adminProcedure` (checks `role === 'admin' || role === 'domain_admin'`).
- Client-side: Route guard redirects non-admin users to dashboard.

### Dashboard Architecture

Create a new page component at `apps/web/client/src/pages/Admin/AdminDashboard.tsx` with 6 tab panels. Each panel fetches data from dedicated tRPC admin endpoints.

**Backend data sources:** Each panel queries a combination of:
- PostgreSQL aggregation queries (jobs, events, users)
- Cloud Monitoring API (latency, error rates, instance counts)
- Upstash Redis (rate limit counters, queue sizes)
- R2 API (storage usage by prefix)

### Panel Specifications

**1. Traffic & Auth:**
- tRPC: `admin.trafficStats` — Returns daily unique users, sessions, login success/failure counts over past 7/30 days.
- Data from: `users` table (last login), `job_events` table (auth-related events), PostHog (optional).

**2. API Health:**
- tRPC: `admin.apiHealth` — Returns p95 latency, error rate, top failing endpoints over past 24h.
- Data from: Cloud Monitoring API (Cloud Run request metrics) or structured log aggregation.

**3. Jobs Health:**
- tRPC: `admin.jobsHealth` — Returns job counts by status (queued/submitted/processing/done/failed/timeout), retry counts, avg queue wait time.
- Data from: `jobs` table aggregation, `cloud_task_events` table.

**4. Kie AI Health:**
- tRPC: `admin.kieAiHealth` — Returns callback received rate, polling volume, external API error rate and latency.
- Data from: `job_events` table (filter by event_type: webhook_received, poll_completed, poll_failed).

**5. Storage:**
- tRPC: `admin.storageStats` — Returns R2 usage by prefix, object count growth.
- Data from: R2 S3 API (`ListObjectsV2` with prefix and delimiter to get counts/sizes — cache results, don't query live on every page load).

**6. Security/Abuse:**
- tRPC: `admin.securityStats` — Returns rate limit hit counts, top IP hashes by request volume, direct-to-origin suspicion count.
- Data from: Upstash Redis counters, structured logs.

### Email Alerting

Create a background alert checker (triggered by Cloud Scheduler every 5 minutes):
1. Query the same data sources as the dashboard panels.
2. Compare against thresholds:
   - Auth failure rate > 20%
   - 5xx rate > 5% over 5 minutes
   - Job failure rate > 10%
   - Queue backlog > 100 pending tasks
   - Kie AI callback miss rate > 50% over 30 minutes
3. If threshold breached: send email to all users with `role === 'admin'` using the existing SMTP integration (from `system_settings`).
4. Deduplicate: don't re-send the same alert within 1 hour (track in Redis with TTL).

---

## Section 15: Google Cloud Monitoring

### Purpose
Configure Cloud Monitoring dashboards and alerts for infrastructure-level observability.

### Cloud Monitoring Dashboards

Create two dashboards:

**1. Services Dashboard:**
- Cloud Run request count (per service, per status code)
- Cloud Run p95 and p99 latency (per service)
- Cloud Run instance count over time
- Cloud Run CPU and memory utilization
- Cloud Tasks queue depth (per queue)
- Cloud Tasks dispatch rate and retry rate

**2. Jobs Dashboard:**
- Cloud Run Job execution count (per job, per status: succeeded/failed)
- Cloud Run Job execution duration distribution
- Cloud Run Job memory peak utilization
- Cloud Tasks DLQ count (from custom metrics or log-based metrics)

### Alert Policies

Create alert policies with notification channels (email to admin):

| Alert | Condition | Duration | Severity |
|-------|-----------|----------|----------|
| High 5xx rate | Cloud Run 5xx responses > 5% | 5 minutes | Critical |
| High latency | Cloud Run p95 > 2000ms | 5 minutes | Warning |
| Job failures | Cloud Run Job failure rate > 20% | 10 minutes | Critical |
| Queue backlog | Cloud Tasks queue depth > 100 | 10 minutes | Warning |
| Instance limit | Cloud Run instances > 80% of max | 5 minutes | Warning |

### Structured Logging

Both Node.js and Python services must output JSON-formatted logs with consistent fields:
- `severity` (INFO, WARNING, ERROR)
- `message`
- `request_id`, `user_id`, `job_id` (when available)
- `route`, `method`, `status`, `latency_ms` (for HTTP requests)
- `release`, `environment`

Cloud Logging automatically ingests stdout/stderr from Cloud Run. The structured format enables log-based metrics and filtering.

---

## Section 16: CI/CD Pipeline (GitHub Actions)

### Purpose
Extend the existing GitHub Actions workflow to build Docker images, push to Artifact Registry, and deploy to Cloud Run.

### Workflow: Build and Deploy

**Trigger:** Push to `main` branch.

**Steps:**
1. Checkout code.
2. Authenticate to GCP using **Workload Identity Federation** (no long-lived service account keys). Configure a Workload Identity Pool with a GitHub OIDC provider, mapped to the `github-deploy@` service account. This is Google's recommended approach — avoids storing JSON keys in GitHub Secrets.
3. Configure Docker to use Artifact Registry.
4. Build all four Docker images in parallel (using GitHub Actions matrix or parallel jobs).
5. Push images to Artifact Registry with tags: `latest` and the git commit SHA.
6. Run database migrations against Neon staging DB (Drizzle + Alembic).
7. Deploy Cloud Run services with the new image (traffic shift: 10% canary).
8. Run smoke tests against the canary revision.
9. If smoke tests pass: shift 100% traffic to the new revision.
10. If smoke tests fail: roll back by routing 100% to the previous revision.

**Trigger:** Tag/release creation.

**Steps:**
1. Same as above but targeting the production Neon DB and Cloud Run services.
2. Deploy with canary (10% → 50% → 100%) with manual approval gate between 50% and 100%.

### Workflow: PR Preview

**Trigger:** Pull request opened/updated.

**Steps:**
1. Build Docker images.
2. Push with tag: `pr-{number}`.
3. Deploy to a unique Cloud Run revision with a preview URL.
4. Comment the preview URL on the PR.

### Secrets Configuration

GitHub repository secrets needed:
- `GCP_PROJECT_ID`
- `GCP_WORKLOAD_IDENTITY_PROVIDER` (Workload Identity Federation provider resource name)
- `GCP_SERVICE_ACCOUNT` (email of `github-deploy@` service account)
- `GCP_REGION`
- `NEON_STAGING_DB_URL`
- `NEON_PROD_DB_URL`

No service account JSON key is stored — Workload Identity Federation handles authentication via short-lived OIDC tokens.

---

## Section 17: Auth & Session (Production Hardening)

### Purpose
Harden the existing auth system for production Cloud Run deployment.

### Current State
The codebase already has JWT-based auth with HttpOnly Secure cookies (`SMARTSPEC_SESSIONID`), role-based access (`user`, `admin`, `domain_admin`), and bearer token support for server-to-server calls. This section hardens what exists rather than rebuilding.

### Changes Required

**Cookie domain:** Set cookie domain to `.smartaihub.app` so cookies work across `app.smartaihub.app` and future `www.smartaihub.app`.

**CSRF protection:** Since the dashboard and API are same-origin on `app.smartaihub.app`, `SameSite=Lax` cookies provide CSRF protection for GET requests. For state-changing POST/PUT/DELETE, add a `X-CSRF-Token` header check (double-submit cookie pattern) or verify the `Origin` header matches `app.smartaihub.app`.

**Session validation:** Every API request must validate the session against the database (not just verify the JWT signature). The JWT contains the user ID; the server confirms the user exists and the session hasn't been revoked.

**Secure defaults in Cloud Run:** Cloud Run provides TLS termination. Ensure cookies have `Secure: true` and `HttpOnly: true` in all environments. The existing cookie configuration in `apps/web/server/_core/cookies.ts` already does this.

---

## Section 18: Load Testing

### Purpose
Validate the system handles the target scale and identify bottlenecks before launch.

### Test Scenarios

Use a load testing tool (k6, Artillery, or Locust) to simulate:

**Scenario 1: API load (100 concurrent users)**
- Login → browse dashboard → submit 1 job each → poll for status.
- Target: p95 < 500ms for API calls, 0% 5xx.

**Scenario 2: Job burst (500 concurrent generates)**
- Submit 500 image generation jobs simultaneously.
- Target: All jobs queued within 30s, no lost jobs, Cloud Tasks backpressure works correctly.

**Scenario 3: Sustained load (1000 jobs over 1 hour)**
- Steady stream of job submissions.
- Target: Queue depth stays bounded, media-jobs complete within 10 min, no memory leaks.

### Metrics to Capture
- Cloud Run instance count during burst
- Cloud Tasks queue depth over time
- p50/p95/p99 API latency
- Job completion rate and time-to-result
- Neon Postgres connection pool utilization
- R2 upload/download latency
- Error rate by endpoint

### Bottleneck Remediation
Based on load test results, adjust:
- Cloud Run max instances
- Cloud Tasks queue concurrency limits
- Neon connection pool size
- Redis connection limits

---

## Section 19: Production Hardening & Rollback

### Purpose
Final hardening steps and rollback procedure verification before launch.

### DNS and Domain Configuration

Before launch, configure the production domain:
1. **Cloud Run custom domain mapping:** Map `app.smartaihub.app` to the Node.js Cloud Run service using `gcloud run domain-mappings create`. Cloud Run provisions a managed TLS certificate automatically after DNS verification.
2. **DNS records:** Add a CNAME record `app.smartaihub.app → ghs.googlehosted.com` (Google's HTTP load balancer for Cloud Run custom domains).
3. **Python orchestrator:** The Python service does not need a public domain — it is only called by Cloud Tasks (via its `.run.app` URL) and by the Node.js service (via internal service-to-service auth). Keep it on the default `*.run.app` domain.
4. **WebSocket support:** Cloud Run supports WebSockets natively. If the existing `/ws` proxy is needed, configure Cloud Run with `--session-affinity` on the Node.js service to ensure WebSocket connections route to the same instance.

### Hardening Checklist

1. **All secrets in Secret Manager** — No plaintext credentials in env vars, Docker images, or code.
2. **HTTPS everywhere** — Cloud Run provides TLS. Verify no HTTP-only endpoints exposed.
3. **Rate limiting active** — Verify all rate limits work under load test.
4. **Lifecycle rules active** — Verify R2 auto-deletes temp files after 12 days.
5. **Alerting tested** — Trigger each alert condition manually, verify email delivery.
6. **Sentry verified** — Throw a test error in each service, verify it appears in Sentry.
7. **PostHog verified** — Fire test events, verify they appear in PostHog dashboard.
8. **Cloud Monitoring verified** — Check all dashboards show data, alerts are armed.
9. **DLQ tested** — Force a task to fail all retries, verify it appears in dead letter tracking.
10. **Rollback tested** — Deploy a broken revision, roll back, verify previous revision serves traffic.

### Rollback Procedure

**Cloud Run Services:**
```
1. Identify the previous healthy revision tag (from Cloud Run console or `gcloud run revisions list`).
2. Route 100% traffic to the previous revision.
3. Investigate the broken revision.
```

**Database migrations:**
Follow the Expand → Migrate → Contract pattern. If a migration breaks:
1. The new code should still work with the old schema (expand phase ensures backward compatibility).
2. Deploy the previous code revision.
3. If the migration itself caused data issues: restore from Neon point-in-time recovery.

**Cloud Tasks:**
Tasks are at-least-once and idempotent. A broken handler version receives retries, which hit the new (rolled-back) version. No special handling needed.

### Launch Sequence

1. Deploy to staging. Run full test suite. Run load test.
2. Migrate staging DB to verify migrations work.
3. Deploy to production with 10% canary traffic.
4. Monitor for 30 minutes: Sentry errors, Cloud Monitoring metrics, PostHog events.
5. If clean: shift to 50% traffic. Monitor 15 minutes.
6. If clean: shift to 100% traffic.
7. Announce launch.
