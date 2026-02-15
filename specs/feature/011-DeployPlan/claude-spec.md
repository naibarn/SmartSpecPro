# SmartSpecPro MVP Deployment — Complete Specification

> Synthesized from: original spec, codebase research, web research, and stakeholder interview.

---

## 1. Project Context

SmartSpecPro is an AI-driven specification and media generation platform. It's a Turborepo monorepo with:
- **Node.js web app** (React 19 + Express + tRPC, Drizzle ORM, BullMQ) on port 3000
- **Python backend** (FastAPI, SQLAlchemy, Celery 5.3) on port 8000
- **PostgreSQL 15** (primary DB) and **Redis 7** (cache/queue)
- **49 tRPC routers**, multi-provider LLM system, video editor with FFmpeg pipeline

The goal is to deploy this MVP to production with:
1. **Google Cloud Run** for all services and jobs
2. **Google Cloud Tasks** replacing Celery for job orchestration
3. **Cloud Scheduler** replacing CeleryBeat for periodic tasks
4. **Neon Postgres** for staging/prod databases (local PG for dev)
5. **Upstash Redis** for ephemeral data
6. **Cloudflare R2** for object storage with lifecycle rules
7. **Cloudflare Pages** for public/SEO pages (Phase 2 split)
8. **Cloudflare Vectorize** for docs and images search
9. **PostHog** (Cloud) for product analytics
10. **Sentry** (3 projects) for error tracking
11. **GCP Secret Manager** for secrets
12. **GitHub Actions** for CI/CD (extending existing pipeline)

---

## 2. Architecture Decisions (from Interview)

### 2.1 Frontend Split Strategy
**Hybrid phased approach:**
- **Phase 1 (MVP):** Deploy the unified Express+React app to Cloud Run on `app.smartaihub.app`. The `/api/*` routes and dashboard UI are same-origin (no CORS needed).
- **Phase 2 (post-MVP):** Split public/SEO marketing pages to Cloudflare Pages at `www.smartaihub.app`. Dashboard remains on Cloud Run.

### 2.2 Domain Structure
- `www.smartaihub.app` → Cloudflare Pages (public/SEO, Phase 2)
- `app.smartaihub.app` → Cloud Run (Dashboard + `/api/*`, unified, same-origin)
- `smartaihub.app` → Redirect to `www.smartaihub.app`
- No separate `api.` subdomain for MVP (avoids CORS complexity)

### 2.3 GCP Setup
Full GCP project bootstrap required. No existing GCP resources. Plan must include:
- Project creation, billing, API enablement
- Artifact Registry for Docker images
- Service accounts with least-privilege IAM roles
- Cloud Run services + jobs provisioning
- Cloud Tasks queue creation
- Cloud Scheduler job creation
- Secret Manager secret creation
- All via manual `gcloud` CLI commands (no Terraform for MVP)

### 2.4 Celery Migration
**Big-bang migration:** All Celery queues (`media`, `video`, `celery`) migrate to Cloud Tasks simultaneously. No dual-running period.

Current Celery queues → Cloud Tasks mapping:
- `media` queue → `media-jobs` Cloud Tasks queue → triggers Cloud Run Job `media-job-runner`
- `video` queue → `video-jobs-short` and `video-jobs-long` Cloud Tasks queues → triggers Cloud Run Jobs
- `celery` queue → `workflow-tasks` Cloud Tasks queue → triggers Cloud Run Service endpoint

### 2.5 Periodic Tasks
CeleryBeat → Cloud Scheduler + Cloud Tasks:

| CeleryBeat Task | Schedule | Cloud Scheduler Target |
|----------------|----------|----------------------|
| cleanup-expired-tasks | Daily 3am UTC | Cloud Tasks → Cloud Run Service endpoint |
| retry-failed-tasks | Every 15 min | Cloud Tasks → Cloud Run Service endpoint |
| retry-media-callback-events | Every 1 min | Cloud Tasks → Cloud Run Service endpoint |
| retry-library-index-jobs | Every 1 min | Cloud Tasks → Cloud Run Service endpoint |
| recover-stuck-tasks | Every 2 min | Cloud Tasks → Cloud Run Service endpoint |
| check-scheduled-workflows | Every 1 min | Cloud Tasks → Cloud Run Service endpoint |
| cleanup-expired-edit-sessions | Every 30 min | Cloud Tasks → Cloud Run Service endpoint |
| renew-drive-watch-channels | Every 6 hrs | Cloud Tasks → Cloud Run Service endpoint |
| poll-drive-changes | Every 15 min | Cloud Tasks → Cloud Run Service endpoint |

### 2.6 Database Strategy
- **Local dev:** Keep existing PostgreSQL 15 (docker-compose.infra.yml)
- **Staging:** Neon Postgres (separate branch/DB)
- **Production:** Neon Postgres (separate branch/DB)
- **No data migration** from local to Neon for MVP (fresh start)
- Use Neon connection pooling to avoid exhaustion

### 2.7 Scale Expectations (MVP Launch)
- 100-1,000 users
- 50-500 jobs/day
- Moderate concurrency
- Cloud Run: min-instances=1 for API services, scale-to-zero for jobs

### 2.8 Cost Strategy
- API services: `min-instances=1` (no cold starts for users), max-instances capped
- Cloud Run Jobs: scale-to-zero (only pay during processing)
- Cloud Tasks: cost-free at this scale (first 1M tasks/month free)
- R2: lifecycle rules auto-delete temp files after 12 days
- PostHog: Cloud free tier (1M events/month)
- Sentry: free tier adequate for MVP

---

## 3. Services Architecture

### 3.1 Cloud Run Services (always-on)

**Node.js API Service** (`node-api`):
- Image: `node-api:latest` from Artifact Registry
- CPU: 1 vCPU, Memory: 512 MiB
- Min instances: 1, Max instances: 5
- Port: 3000
- Responsibilities: Auth, tRPC routers, dashboard UI, media job submission, admin APIs, PostHog server-side events
- Domain: `app.smartaihub.app`

**Python Orchestrator Service** (`python-orchestrator`):
- Image: `python-orchestrator:latest` from Artifact Registry
- CPU: 1 vCPU, Memory: 512 MiB
- Min instances: 1, Max instances: 3
- Port: 8000
- Responsibilities: LLM gateway, Kie AI callbacks, media provider integration, Cloud Tasks webhook handler for periodic tasks, state machine transitions

### 3.2 Cloud Run Jobs (scale-to-zero)

**media-job-runner:**
- CPU: 1 vCPU, Memory: 2 GiB
- Timeout: 600s (10 min)
- Max retries: 1
- Responsibilities: Fetch results from Kie AI, generate thumbnails/metadata, upload to R2, update DB

**video-job-short:**
- CPU: 2 vCPU, Memory: 8 GiB
- Timeout: 1800s (30 min)
- Max retries: 1
- Max concurrent: 5-10
- Responsibilities: Short clip assembly (1-2 min output), stream copy + simple effects

**video-job-long:**
- CPU: 4 vCPU, Memory: 16 GiB
- Timeout: 3600s (60 min)
- Max retries: 1
- Max concurrent: 1-3
- Responsibilities: Long footage processing (5-30 min → 2-8 min), full filter_complex pipeline

### 3.3 Cloud Tasks Queues

| Queue | Rate | Max Concurrent | Max Retries | Backoff |
|-------|------|---------------|-------------|---------|
| media-jobs | 5/s | 10 | 5 | 1s-300s, 4 doublings |
| video-jobs-short | 2/s | 10 | 3 | 5s-600s, 3 doublings |
| video-jobs-long | 1/s | 3 | 3 | 10s-600s, 3 doublings |
| workflow-tasks | 10/s | 20 | 5 | 1s-60s, 4 doublings |
| polling-tasks | 2/s | 5 | 10 | 30s-600s, 5 doublings |
| periodic-tasks | 1/s | 5 | 3 | 5s-300s, 3 doublings |

### 3.4 Dead Letter Queue (DLQ) Pattern
Since Cloud Tasks has no built-in DLQ:
1. Task handler checks `X-CloudTasks-TaskRetryCount` header
2. On final retry: write failed task to `job_events` table with `status=dead_letter`
3. Cloud Scheduler runs a periodic "DLQ processor" that alerts admins via email
4. Admin dashboard shows dead letter count and details

---

## 4. Docker Images

### 4.1 Required Images
1. `node-api` — Multi-stage build: Node.js 20 Alpine, installs deps, builds Vite frontend + tRPC server, runs via `tsx`
2. `python-orchestrator` — Multi-stage build: Python 3.11 Alpine, installs deps via uv, runs FastAPI with uvicorn
3. `media-job-runner` — Based on python-orchestrator, adds media processing deps
4. `video-job-runner` — Based on python-orchestrator, adds FFmpeg 7.1, fonts (DejaVu, Liberation), fontconfig

### 4.2 FFmpeg Docker Specifics
- Pin FFmpeg version: 7.1
- Install fonts: `ttf-dejavu`, `ttf-liberation`, `ttf-freefont`
- Run `fc-cache -fv` after font install
- Include current shell metachar filtering and SSRF protection

---

## 5. Job Lifecycle

### 5.1 Generation Job Flow (Image/Video via Kie AI)
1. User submits → Node.js creates `jobs` row: `status=queued`
2. Node.js calls Kie AI API → saves `kie_job_id`, sets `status=submitted`
3. Node.js enqueues Cloud Tasks `poll_job(job_id)` with 2-min delay

### 5.2 Completion: Webhook Primary + Polling Fallback
**Webhook path:** Kie AI POST → Python orchestrator `/api/webhooks/kie` → verify signature → update DB `status=done` → enqueue Cloud Tasks `media-job(job_id)`

**Polling fallback:** Cloud Tasks fires `poll_job(job_id)` → Python checks Kie AI status → if done: update DB + enqueue media-job → if not done: re-enqueue poll with exponential backoff (respect Kie AI rate limits)

### 5.3 media-job Pipeline
1. Downloads result from Kie AI
2. Generates thumbnails and metadata
3. Uploads to R2 (`temp/raw/` or `gallery/` based on rules)
4. Updates DB with R2 keys and signed URLs
5. Emits PostHog events (`media_job_completed`, duration, size)

### 5.4 Idempotency
- All Cloud Tasks handlers check idempotency key before processing
- Render hash: `sha256(inputs + timeline_spec + render_profile)` → output key `renders/{hash}.mp4`
- If output exists in R2: return success immediately (HEAD check)
- DB-level: unique constraint on `(job_id, step)` in job_events

---

## 6. Video Rendering Pipeline

### 6.1 Timeline Spec
Extend existing `VideoEditorProject` types with render metadata:
- Add `render_profile` field (preview / standard / high)
- Add `render_hash` computed field
- Add `output_key` (R2 path)
- Keep existing Track/Clip types as-is

Tracks: V1 (primary video), V2 (overlay), T1 (text), A1 (audio)

### 6.2 Two-Stage Pipeline
**Stage 1 — Assembly** (stream copy where possible):
- Cut/concat/trim V1 segments
- Near-instant for matching codecs
- Fallback to re-encode if codecs differ

**Stage 2 — Final Render** (single filter_complex pass):
- Apply V2 overlays, T1 text (drawtext), A1 audio mix
- Output with selected render profile

### 6.3 Render Profiles

| Profile | Preset | CRF | Scale | Audio | Use Case |
|---------|--------|-----|-------|-------|----------|
| preview | ultrafast | 28 | 640:-2 | aac 128k | Editor preview |
| standard | medium | 23 | original | aac 192k | Normal export |
| high | slow | 18 | original | aac 256k | Final delivery |

All outputs include `-movflags +faststart` for streaming.

### 6.4 Job Routing
- Input duration < 2 min AND no overlays/text → `video-job-short`
- Otherwise → `video-job-long`

---

## 7. Storage (R2)

### 7.1 Bucket Structure
Single bucket with prefix-based organization:
- `temp/raw/` — User uploads, camera footage (auto-delete 12 days)
- `temp/work/` — Intermediate artifacts, proxies (auto-delete 12 days)
- `renders/preview/` — Preview outputs (auto-delete 7 days)
- `renders/final/` — Final outputs (auto-delete 12 days or business rule)
- `gallery/` — Curated public content (keep indefinitely)

### 7.2 Lifecycle Rules
```
temp/* → Delete after 12 days
renders/preview/* → Delete after 7 days
Incomplete multipart uploads → Abort after 1 day
gallery/* → No expiration
```

### 7.3 Access Control
- Private objects: presigned URLs (max 7-day expiry) via `@aws-sdk/s3-request-presigner`
- Gallery objects: public read via R2 custom domain or presigned
- Presigned URLs only work with S3 API domain (not custom domains)

---

## 8. Vectorize

### 8.1 Indexes
- `docs-index` (768 dimensions, cosine) — Markdown articles, selected spreadsheet summaries
- `images-index` (768 dimensions, cosine) — Website/gallery image descriptions

### 8.2 Indexing Strategy
- **At launch:** Index existing markdown/articles and gallery images
- **Ongoing:** Index new content only when promoted to `gallery/`
- **Never:** Index user temp uploads or videos
- Use Workers AI `@cf/baai/bge-base-en-v1.5` for text embeddings
- For images: generate text descriptions via Workers AI vision, then embed

### 8.3 Search Endpoints
- `/search/docs` — Search document index with metadata filters (tenant, category, time)
- `/search/images` — Search image index with metadata filters
- Use namespaces for tenant isolation

---

## 9. Observability

### 9.1 Sentry (3 separate projects)
- **Frontend:** JS errors, network/CORS errors, release tracking, session replay (1% sampling)
- **Node.js Backend:** Exception reporting with `request_id`, `job_id`, `render_id` correlation, tracing (5% sampling)
- **Python Backend:** Exception reporting with same correlation IDs, tracing (5% sampling)
- PII scrubbing enabled on all projects

### 9.2 PostHog (Cloud, free tier)
**Client-side** (React SDK):
- `person_profiles: 'identified_only'` (save cost)
- `autocapture: false` (reduce noise)
- Track: page_view, signup_started/completed, login, dashboard_viewed, job_create_clicked, job_submitted, output_viewed/downloaded

**Server-side** (Node.js SDK):
- Track: kie_submit_succeeded, kie_callback_received, media_job_started/completed, video_render_started/completed
- Properties: job_type, duration_ms, output_size_bytes, resolution

**Identity:** Anonymous cookie ID → `posthog.alias()` then `posthog.identify(userId)` on login/signup

### 9.3 Google Cloud Monitoring
- Cloud Run metrics: request count, latency, instance count, CPU/memory utilization
- Cloud Tasks metrics: queue depth, dispatch count, retry count
- Custom alerts: 5xx rate > 5%, p95 latency > 2s, job failure rate > 10%

### 9.4 Structured Logging
JSON format with fields: `request_id`, `user_id`, `job_id`, `render_id`, `route`, `method`, `status`, `latency_ms`, `release`, `environment`

---

## 10. Admin Dashboard

### 10.1 Access
- Protected `/admin` route in existing React app
- Server-side role check (`admin` or `domain_admin`)
- tRPC `adminProcedure` for all admin endpoints

### 10.2 Panels
1. **Traffic & Auth** — Visitors/day, sessions, login success rate, auth failure reasons, 401/403 trend
2. **API Health** — p95 latency, error rate, top failing endpoints
3. **Jobs Health** — Created/completed/failed counts, retry counts, queue backlog, wait time
4. **Kie AI Health** — Callback rate, polling volume, external API errors
5. **Storage** — R2 usage by prefix, object count growth
6. **Security/Abuse** — Rate limit hits, top IP hashes, direct-to-origin count

### 10.3 Alerting
Email alerts to admin users for:
- Auth failure spike (>20% error rate)
- 5xx spike (>5% over 5 minutes)
- Job failure spike (>10% failure rate)
- Queue backlog threshold (>100 pending tasks)
- Kie AI callback drop (>50% miss rate over 30 minutes)

---

## 11. Security

- HTTPS everywhere (Cloud Run provides TLS by default)
- Session validation: HttpOnly Secure cookies, SameSite=Lax
- Rate limiting: `/login`, `/signup`, `/api/jobs`, `/api/generate` via Upstash Redis
- Signed URLs for private R2 assets
- GCP Secret Manager for all secrets
- IP hashing for abuse analysis (no raw PII in logs)
- CSRF protection on state-changing endpoints

---

## 12. CI/CD

### 12.1 GitHub Actions Extension
Extend existing GitHub Actions:
- On push to `main`: Build Docker images → Push to Artifact Registry → Deploy to Cloud Run (staging)
- On tag/release: Promote staging images to production
- PR previews: Build and deploy to staging with unique revision tags

### 12.2 Deployment Strategy
- Cloud Run: Immutable revisions, canary traffic shift (10% → 50% → 100%), quick rollback
- Cloudflare Pages: Preview deployments per PR, promote to prod
- DB migrations: Expand → Migrate/Backfill → Contract pattern

### 12.3 Environments
- `dev`: Local Docker (PostgreSQL, Redis) + local services
- `staging`: Neon Postgres + Upstash Redis + Cloud Run + R2 (staging bucket/prefix)
- `prod`: Neon Postgres + Upstash Redis + Cloud Run + R2 (prod bucket)
- Separate Sentry projects/envs, PostHog envs, Vectorize indexes per environment

---

## 13. Implementation Order (16 steps from spec)

1. GCP project bootstrap + Artifact Registry + IAM
2. Dockerfiles (node-api, python-orchestrator, media-job, video-job)
3. Neon schema + migrations + pooling config
4. Auth/session (HttpOnly cookie) + user model + admin role
5. Cloud Tasks integration (queues, enqueue, handler endpoints)
6. Cloud Scheduler setup (all periodic tasks)
7. Kie AI integration (submit + webhook + polling fallback)
8. media-job pipeline (R2 upload + thumbnails + DB update)
9. video-job-short + video-job-long (timeline spec → FFmpeg)
10. R2 lifecycle rules + gallery flow
11. Vectorize indexing (docs + images) + search endpoints
12. Upstash rate limiting + abuse guardrails
13. Sentry integration (3 projects) + PII scrubbing
14. PostHog integration (React + Node.js SDKs) + event schema + funnels
15. Admin Ops Dashboard (6 panels + email alerts)
16. Cloud Monitoring dashboards + alerts
17. GitHub Actions CI/CD pipeline extension
18. Load testing (100/500/1000 concurrent generate)
19. Production hardening + canary deploy + rollback drill

---

## 14. MVP Acceptance Criteria

### Functional
- User can signup/login and access dashboard at `app.smartaihub.app`
- User can submit image/video generation requests
- System reliably completes jobs via webhook + polling fallback
- Outputs stored in R2 with correct lifecycle, visible to user
- Video rendering supports V1/V2/T1/A1 timeline

### Reliability
- No job lost under retries; idempotency verified
- Admin dashboard shows real-time health metrics
- Email alerts fire for critical spikes

### Observability
- Sentry captures errors with correlation IDs across all 3 projects
- PostHog provides end-to-end funnel dashboards
- Cloud Monitoring dashboards and alerts configured

### Deployability
- Docker images build and deploy for all services/jobs
- Staging environment runs migrations safely
- Rollback procedure documented and tested
