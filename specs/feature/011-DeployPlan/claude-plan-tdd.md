# SmartSpecPro MVP Deployment — TDD Plan

## Testing Context

**Node.js/TypeScript:** Vitest with `@vitest/coverage-v8`. Tests run with `JWT_SECRET=test-jwt-secret... vitest run`. Existing patterns in `apps/web/` with `*.test.ts` files.

**Python:** pytest with 80% coverage enforced. Markers: unit, integration, e2e, slow, auth, credits, llm. Async mode auto. SQLite in-memory for fast unit tests. Code quality: Black (100 chars), isort, Ruff, mypy.

**Conventions:** Follow existing test patterns in the codebase. Node.js tests colocated with source or in `__tests__/`. Python tests in `python-backend/tests/`.

---

## Section 1: GCP Project Bootstrap

Infrastructure provisioning — no application code tests. Validate via:
- Script: `scripts/validate-gcp-setup.sh` that checks all APIs are enabled, service accounts exist, queues are created, and secrets are populated (returns exit 0 or lists missing resources).

---

## Section 2: Docker Images

### Node.js Image
- Test: Dockerfile builds successfully with `docker build --target production`
- Test: Built image starts and responds to `GET /healthz` with 200
- Test: Built image responds to `GET /readyz` with 200 when DB is reachable
- Test: SIGTERM causes graceful shutdown within 30 seconds (process exits 0)
- Test: Static assets are served correctly from `/assets/`

### Python Image
- Test: Dockerfile builds successfully
- Test: Built image starts and responds to `GET /health` with 200
- Test: Built image responds to `GET /ready` with 200 when DB is reachable
- Test: SIGTERM causes graceful shutdown (in-flight request completes before exit)

### Video Job Runner Image
- Test: FFmpeg is available at expected version
- Test: Fonts are installed and discoverable via `fc-list`
- Test: Entrypoint script reads timeline spec from environment

---

## Section 3: Database Setup (Neon Postgres)

### Schema Migration
- Test: Drizzle migration generates SQL without errors against a fresh database
- Test: Alembic migration runs successfully after Drizzle migration (ordering)
- Test: `cloud_task_events` table exists with expected columns after migration
- Test: `media_tasks.cloud_task_id` column exists after migration

### Connection Pooling (Vitest)
- Test: DB client respects max pool size configuration
- Test: DB client reconnects after transient connection failure
- Test: PgBouncer connection string works with Drizzle queries

### Seed Data
- Test: `seed-production.ts` creates admin user when DB is empty
- Test: `seed-production.ts` is idempotent (running twice does not duplicate data)
- Test: `seed-production.ts` creates default tenant with correct domain

---

## Section 4: Celery → Cloud Tasks Migration

### Cloud Tasks Enqueue (Python — pytest)
- Test: `enqueue_task` creates a Cloud Tasks task with correct queue, URL, and payload
- Test: `enqueue_task` with `delay_seconds` sets the schedule time correctly
- Test: `enqueue_task` with `task_id` sets deterministic task name for dedup
- Test: `enqueue_task` raises appropriate error when queue doesn't exist

### Cloud Tasks Enqueue (Node.js — Vitest)
- Test: `enqueueTask` creates a task with correct HTTP target
- Test: `enqueueTask` passes payload as JSON body
- Test: `enqueueTask` applies delay via scheduleTime

### OIDC Validation Middleware (Python — pytest)
- Test: Request with valid OIDC token from allowed SA is accepted (200)
- Test: Request without Authorization header returns 401
- Test: Request with expired token returns 401
- Test: Request with wrong audience claim returns 401
- Test: Request with unauthorized service account email returns 401
- Test: OIDC validation is skipped when ENVIRONMENT=development

### Task Handler Endpoints (Python — pytest)
- Test: `POST /tasks/poll-job` returns 200 for already-completed job (idempotent)
- Test: `POST /tasks/poll-job` polls Kie AI and enqueues follow-up on success
- Test: `POST /tasks/poll-job` re-enqueues with backoff when job still processing
- Test: `POST /tasks/process-media` processes job and returns 200
- Test: `POST /tasks/process-media` returns 200 for already-processed job (idempotent)
- Test: `POST /tasks/cleanup-expired` deletes old tasks and returns count
- Test: All `/tasks/*` endpoints reject requests without OIDC token

### Dead Letter Queue (Python — pytest)
- Test: Final retry attempt writes to `cloud_task_events` with status `dead_letter`
- Test: Non-final retry attempt does not write dead letter record
- Test: Dead letter processing sends admin email alert

### Feature Flag Migration (Vitest)
- Test: When `USE_CLOUD_TASKS=true`, job dispatch uses Cloud Tasks enqueue
- Test: When `USE_CLOUD_TASKS=false`, job dispatch uses existing HTTP POST to Python

---

## Section 4.5: BullMQ Migration

### Scheduled Messages (Vitest)
- Test: Scheduling a message enqueues Cloud Tasks task with correct delay
- Test: `POST /tasks/deliver-scheduled-message` delivers message and marks complete
- Test: `POST /tasks/deliver-scheduled-message` skips already-delivered message
- Test: Fallback scheduler catches undelivered messages

### Admin Queue Dashboard (Vitest)
- Test: `admin.queueHealth` returns Cloud Tasks queue metrics
- Test: `admin.queueHealth` returns queue depth, retry count, dead letter count

---

## Section 5: Cloud Scheduler (Periodic Tasks)

### Scheduler Configuration
- Test: Each scheduler job exists with correct cron expression and target
- Test: Scheduler jobs use OIDC authentication with correct service account

### Handler Registration
- Test: All handler paths listed in scheduler table have corresponding endpoint
- Test: Each periodic handler is idempotent (safe to run twice in succession)

---

## Section 6: Kie AI Integration (Webhook + Polling)

### Webhook Handler (Python — pytest)
- Test: Valid webhook with correct signature updates job status to `done`
- Test: Valid webhook enqueues media-job processing task
- Test: Duplicate webhook (same kie_job_id) returns 200 without re-processing
- Test: Webhook with invalid signature returns 401
- Test: Webhook for unknown kie_job_id returns 404
- Test: Webhook stores dedup key in Redis with TTL

### Polling Handler (Python — pytest)
- Test: Poll for completed job triggers media-job processing
- Test: Poll for in-progress job re-enqueues with increased delay
- Test: Poll for timed-out job (>24h) marks as timeout and alerts
- Test: Poll for already-completed job (webhook arrived first) returns 200

### Job Submission (Vitest)
- Test: Job submission enqueues polling task with 2-minute delay
- Test: Job submission stores kie_job_id in DB
- Test: Job submission respects per-user concurrency limit (max 3)

---

## Section 7: Media Job Pipeline

### Media Processing Handler (Python — pytest)
- Test: Handler downloads media from Kie AI result URL
- Test: Handler generates thumbnail for image (300px width)
- Test: Handler generates thumbnail for video (frame at 25% duration)
- Test: Handler uploads result and thumbnail to R2
- Test: Handler updates DB with R2 keys and metadata
- Test: Handler emits PostHog `media_job_completed` event
- Test: Handler returns 200 for already-processed job (idempotent)
- Test: Handler returns 5xx on transient download failure (triggers retry)
- Test: Handler returns 200 with failed status on permanent Kie AI error

---

## Section 8: Video Rendering Pipeline

### Render Hash (Python — pytest)
- Test: Same inputs produce same render hash
- Test: Different profiles produce different render hashes
- Test: Changed timeline spec produces different render hash

### FFmpeg Pipeline (Python — pytest, marker: slow)
- Test: Assembly stage concatenates two clips with stream copy when compatible
- Test: Assembly stage re-encodes when clips have different codecs
- Test: Final render applies text overlay with drawtext filter
- Test: Final render mixes audio tracks
- Test: Preview profile produces smaller file than standard profile
- Test: Output includes `-movflags +faststart`

### Job Routing (Python — pytest)
- Test: Short clip (<2min, no overlays) routes to `video-jobs-short`
- Test: Long clip or overlays routes to `video-jobs-long`

### Idempotency (Python — pytest)
- Test: Existing render hash in R2 skips FFmpeg and returns success
- Test: Non-existing render hash triggers full pipeline

---

## Section 9: R2 Storage Configuration

### Lifecycle Rules (Integration test)
- Test: Lifecycle configuration is applied to bucket with correct rules
- Test: `temp/*` objects have 12-day expiration
- Test: `gallery/*` objects have no expiration

### Presigned URLs (Vitest)
- Test: Download URL is generated with 1-hour expiry
- Test: Upload URL restricts content-type
- Test: Presigned URL uses S3 API endpoint, not custom domain

### Storage Abstraction (Vitest + pytest)
- Test: Node.js storage module uploads and retrieves objects via R2
- Test: Python boto3 client uploads and retrieves objects via R2
- Test: Both clients can read objects written by the other

---

## Section 10: Split Redis Strategy & Rate Limiting

### Redis Client Setup (Vitest)
- Test: `redis.cache` connects to Upstash URL
- Test: `redis.realtime` connects to Memorystore URL
- Test: `redis.realtime` supports pub/sub (subscribe + publish round-trip)

### Rate Limiting (Vitest)
- Test: Request within limit returns 200
- Test: Request exceeding limit returns 429 with Retry-After header
- Test: Rate limit resets after window expires
- Test: Login rate limit is per-IP
- Test: Job rate limit is per-userId

### Rate Limiting (Python — pytest)
- Test: Python rate limit middleware rejects over-limit requests
- Test: Rate limit keys use correct prefix and TTL

### Pub/Sub (Vitest)
- Test: Publishing progress to Memorystore channel delivers to subscriber
- Test: SSE endpoint receives progress updates via Redis subscription

---

## Section 11: Vectorize Integration

### Embedding Generation
- Test: Document chunking produces ~500 token segments
- Test: Embedding API call returns 768-dimension vector
- Test: Image description generation produces non-empty text

### Indexing (Integration)
- Test: Batch upsert writes vectors to docs-index
- Test: Gallery promotion triggers indexing
- Test: Gallery deletion removes vectors

### Search Endpoints (Vitest)
- Test: `search.docs` returns ranked results for query
- Test: `search.docs` filters by tenantId
- Test: `search.images` returns results with image metadata
- Test: Empty query returns empty results (not error)

---

## Section 12: Sentry Integration

### Frontend (Manual verification)
- Test: Thrown error appears in Sentry frontend project
- Test: Release tag matches git commit SHA
- Test: Session replay recording respects sampling rate

### Node.js Backend (Vitest)
- Test: Unhandled route error is captured by Sentry
- Test: `request_id` and `user_id` appear as Sentry tags
- Test: PII fields (authorization, cookie) are scrubbed from Sentry events

### Python Backend (pytest)
- Test: FastAPI exception is captured by Sentry
- Test: `request_id`, `job_id` appear as Sentry tags
- Test: PII scrubbing removes sensitive headers

### Correlation ID (Vitest + pytest)
- Test: Incoming request without X-Request-ID gets one generated
- Test: X-Request-ID is forwarded to Python service in outgoing calls
- Test: X-Request-ID appears in structured log output

---

## Section 13: PostHog Analytics

### Identity Management (Vitest)
- Test: Signup calls `posthog.alias` then `posthog.identify`
- Test: Login calls `posthog.identify` with userId
- Test: Server-side events use userId as distinctId

### Event Capture (Vitest)
- Test: `job_submitted` event includes job_type property
- Test: `media_job_completed` event includes duration_ms and output_size_bytes
- Test: Rate-limited request emits event with `rate_limited: true`

### Event Capture (Python — pytest)
- Test: `kie_submit_succeeded` event is captured on successful Kie AI call
- Test: `media_job_completed` server-side event includes correct properties

---

## Section 14: Admin Ops Dashboard

### Access Control (Vitest)
- Test: Admin endpoint returns 403 for non-admin user
- Test: Admin endpoint returns 200 for admin user
- Test: Admin endpoint returns 200 for domain_admin user

### Panel Endpoints (Vitest)
- Test: `admin.trafficStats` returns daily user counts for past 7 days
- Test: `admin.jobsHealth` returns correct job counts by status
- Test: `admin.kieAiHealth` returns callback rate and polling volume
- Test: `admin.storageStats` returns R2 usage by prefix (cached)
- Test: `admin.securityStats` returns rate limit hit counts

### Email Alerting (Python — pytest)
- Test: Alert fires when 5xx rate exceeds 5% threshold
- Test: Alert is deduplicated (not re-sent within 1 hour)
- Test: Alert email is sent to all admin users

---

## Section 15: Google Cloud Monitoring

Infrastructure configuration — validated via:
- Test: Cloud Monitoring dashboard exists with expected widgets
- Test: Alert policies exist with correct conditions
- Test: Alert notification channel is configured (email)

### Structured Logging (Vitest + pytest)
- Test: Node.js log output is valid JSON with required fields (severity, message, request_id)
- Test: Python log output is valid JSON with required fields
- Test: HTTP request logs include route, method, status, latency_ms

---

## Section 16: CI/CD Pipeline (GitHub Actions)

### Workflow Validation
- Test: GitHub Actions workflow YAML is valid (actionlint)
- Test: Workflow triggers on push to main
- Test: Workflow uses Workload Identity Federation (no SA key)

### Build Matrix
- Test: All three Docker images build in CI
- Test: Images are tagged with commit SHA

### Deployment
- Test: Canary deployment creates new revision at 10% traffic
- Test: Failed smoke test triggers rollback to previous revision

---

## Section 17: Auth & Session (Production Hardening)

### Cookie Configuration (Vitest)
- Test: Cookie domain is `.smartaihub.app` in production
- Test: Cookie has Secure, HttpOnly, SameSite=Lax attributes
- Test: Cookie domain is not set in development (localhost)

### CSRF Protection (Vitest)
- Test: POST request without Origin header is rejected
- Test: POST request with correct Origin header is accepted
- Test: GET request is allowed without CSRF check

### Session Validation (Vitest)
- Test: Valid JWT with active session is accepted
- Test: Valid JWT with revoked session is rejected
- Test: Expired JWT is rejected

---

## Section 18: Load Testing

No application code tests — validated via load test scripts:
- Script: k6/Locust scenario files that simulate the three scenarios
- Metric collection: Cloud Monitoring API queries for instance count, latency, error rate

---

## Section 19: Production Hardening & Rollback

### DNS Configuration
- Test: `app.smartaihub.app` resolves to Cloud Run service
- Test: TLS certificate is valid for `app.smartaihub.app`

### Rollback Procedure
- Test: Deploying a broken revision and rolling back restores previous service
- Test: DLQ captures task that fails all retries

### Hardening Checklist
- Verified via manual checklist execution (no automated tests)
