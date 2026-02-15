# MVP Deployment & Product Spec (SmartSpecPro)

> **Scope:** This spec consolidates all decisions from the planning session into a single, actionable implementation plan for building and deploying the MVP with reliable jobs, controlled cost, full-funnel product analytics, and admin monitoring.

---

## 0) High-level goals

### Goals
- **Ship an MVP fast** with low idle cost and automatic scaling under bursts.
- Support **public customers**: signup/login → dashboard → generate images/videos → receive outputs.
- Ensure **job reliability** (no missing jobs, safe retries, idempotency).
- Keep **storage cost bounded** via retention policies (12-day temp, permanent gallery).
- Provide **full-funnel product analytics** (acquisition → activation → retention) and **admin ops dashboards** for early detection of issues.
- Enable **safe continuous development** post-MVP with low-risk deployments and database migrations.

### Non-goals (for MVP)
- Multi-region active-active origin deployments.
- Enterprise SSO (can be added later).
- Complex Kubernetes infrastructure.
- Vector search over videos (not needed per requirements).

---

## 1) Final architecture (chosen)

### Frontend
- **Cloudflare Pages** hosts the customer web app (public + login + dashboard).

### Backend (GCP)
- **Node.js API**: **Google Cloud Run (Service)**
  - Responsibilities: auth, user/account, billing/quota guardrails, job submission, job status APIs, admin APIs, analytics event ingestion (optional).
- **Python Orchestrator**: **Google Cloud Run (Service)**
  - Responsibilities: Kie AI callbacks, per-job polling fallback, state machine transitions, enqueue downstream media/video jobs, retries, idempotency enforcement.

### Workers (GCP)
- **Google Cloud Run Jobs** (no Celery)
  - `media-job` (IO/light compute): fetch results, generate thumbnails/metadata, upload to R2, update DB.
  - `video-job-short` (2 vCPU): for short clips assembled into 1–2 min outputs.
  - `video-job-long` (4 vCPU + higher RAM): for camera footage 5–30 min cut down to 2–8 min plus overlays/text/audio.
  - **Max concurrent executions** is the primary **cost guardrail**.

### Queue / Trigger (replaces Celery)
- **Google Cloud Tasks** is the primary queue/trigger system for MVP:
  - Scheduling polling tasks with delays and retries (per job).
  - Enqueuing `media-job` and `video-job-*` executions with controlled rate and retries.
- (Optional later) Pub/Sub for high-throughput streaming-style workloads.

### Data
- **DB**: **Neon Postgres**
  - Source of truth for users, sessions (if chosen), jobs, renders, timeline specs, state transitions.
  - Use pooling to avoid connection exhaustion.
- **Redis**: **Upstash Redis**
  - Only for *ephemeral* data: rate limiting, session cache (optional), short-lived locks, dedupe keys.
  - Migration path: upgrade to **Google Memorystore** later if latency/throughput requires.
- **Storage**: **Cloudflare R2** (S3-compatible)
  - Temp objects retained **12 days**, permanent `gallery/` objects retained indefinitely.
  - Keep an abstraction layer to optionally switch to **AWS S3** later.
- **Vector DB**: **Cloudflare Vectorize**
  - Index: docs (.md, article text), selective spreadsheet summaries, and selective image embeddings.
  - **No video vectors**.
  - Use separate indexes: `docs_index`, `images_index` to prevent cost/latency coupling.

### Observability & Analytics
- **Sentry** integrated in **Frontend + Backend** from day 1.
- **Google Cloud Logging + Cloud Monitoring** for infra metrics & alerts.
- **Product analytics (full funnel)**: choose a dedicated product analytics platform (recommended: **PostHog**; GA4 is acceptable if preferred).
- **Admin Ops Dashboard** in-app: single pane view of health, funnel, abuse, and costs.

---

## 2) Domains, routing, and session strategy

### Recommended domains
- `app.<domain>` → Cloudflare Pages (customer UI)
- `api.<domain>` → Cloud Run Node API
- `orc.<domain>` (optional) → Cloud Run Python Orchestrator (can also be under api; separate recommended for isolation)

### Auth/session
- Use **HttpOnly Secure cookies** for session (preferred for security over localStorage tokens).
- Cookie attributes:
  - `Secure`, `HttpOnly`
  - `SameSite=Lax` (or `None` only if cross-site is required)
  - Domain scope: `.<domain>` if sharing across subdomains is needed
- API must validate session on every request (frontend route guards are not sufficient).

### CORS
- If using `api.<domain>`: configure strict allowed origins (only `app.<domain>`), allow credentials.
- If CORS/cookie becomes painful, optionally move to a **single-domain `/api`** model via Cloudflare Pages Functions or Cloudflare Workers (Phase 2).

---

## 3) Storage layout & lifecycle rules (R2)

### Buckets/prefixes
- `temp/raw/` → user uploads/camera footage (delete > 12 days)
- `temp/work/` → intermediate artifacts/proxies (delete > 12 days)
- `renders/preview/` → preview outputs (delete 3–7 days suggested)
- `renders/final/` → final outputs (delete > 12 days or keep by business rule)
- `gallery/` → curated public content (keep indefinitely)

### Lifecycle policy
- Apply object lifecycle rules to `temp/*` (and optionally `renders/preview/*`) to delete after retention.
- Keep `gallery/*` indefinitely.
- Ensure UI/admin tools never list entire buckets; always query by prefix.

---

## 4) Video editing pipeline (timeline spec)

### Timeline model
- **V1**: primary video track (cuts/concats)
- **V2**: overlay track (image/video overlays)
- **T1**: text overlay
- **A1**: audio track

### Spec format
- Store `timeline_spec` as JSON in DB with a `timeline_spec_version`.
- Include deterministic identifiers for all assets (R2 keys + checksum if available).

### Execution strategy (recommended)
- **Two-stage pipeline**
  1) **Assemble V1** (cut/concat/trim). Use stream copy where feasible; otherwise re-encode.
  2) **Final render** once with `filter_complex` applying V2/T1/A1.
- **Profiles**
  - Preview profile: faster preset, lower bitrate/resolution (optional but recommended).
  - Final profile: quality preset/CRF tuned for target platform.

### Job routing
- `video-job-short`: for short clips assembled into 1–2 min output.
- `video-job-long`: for 5–30 min footage cut to 2–8 min with overlays/text/audio.

### Idempotency and caching
- Compute `render_hash = hash(inputs + timeline_spec + render_profile)`.
- Output key: `renders/{render_hash}.mp4`.
- If output already exists: return success immediately (safe retries).

### Concurrency guardrails
- `video-job-short`: start with max concurrent executions **5–10**
- `video-job-long`: start with max concurrent executions **1–3**
- Adjust based on cost and SLA.

---

## 5) Job lifecycle, callbacks, and polling (no Celery)

### DB tables (minimum)
- `users`
- `sessions` (if server-managed)
- `jobs` (generation jobs: image/video generation via Kie AI)
- `renders` (editing/rendering tasks; references timeline spec)
- `job_events` (state transitions/audit trail)
- `rate_limits` (optional, or Redis-only)
- `admin_events` (optional)

### Generation job flow
1) User submits generate request → Node API creates `jobs` row: `status=queued`
2) Node API calls Kie AI → saves `kie_job_id`, sets `status=submitted`
3) Node API enqueues Cloud Tasks `poll_job(job_id)` for +2 min

### Completion handling
- **Primary**: Kie AI webhook callback to Python Orchestrator
  - Verify shared secret/signature (if available) and correlate to `job_id`
  - Update DB status to `done` and enqueue `media-job(job_id)`
- **Fallback**: per-job polling via Cloud Tasks
  - Use exponential backoff
  - Respect Kie AI rate limits
  - On completion: update DB and enqueue `media-job`

### media-job
- Downloads result(s) from Kie AI / origin
- Generates thumbnails/metadata as needed
- Uploads to R2 (`temp/` or `gallery/`)
- Updates DB with R2 object keys and URLs
- Emits analytics events (completion, duration)

### Failure, retry, TTL
- All tasks must be **idempotent**
- Maintain `attempts`, `next_retry_at`, `last_error`
- Mark `timeout` after TTL (e.g., 12–24h) and notify user/admin

---

## 6) Vector search (Cloudflare Vectorize)

### Indexing strategy
- `docs_index`: markdown/articles + selected spreadsheet text summaries
- `images_index`: embeddings for selected website images (not all images unless necessary)
- **Never index videos** in Vectorize for MVP

### Query strategy
- Separate search endpoints in API:
  - `/search/docs`
  - `/search/images`
- Metadata filters (tenant/user/time/category) as required.

---

## 7) Redis usage (Upstash) and migration path

### Allowed MVP uses
- Rate limiting counters (per IP/user)
- Session cache (optional; DB remains source of truth)
- Short-lived locks (e.g., prevent double-start of same job)
- Deduplication keys for webhooks (TTL)

### Not used for
- Primary job queue/broker (use Cloud Tasks)
- Persistent state

### Future upgrade
- If latency or throughput becomes an issue, migrate to Google Memorystore.
- Keep a single `REDIS_URL` config and wrap access behind a small adapter for easy swap.

---

## 8) Docker usage (explicit)

### Required Docker images
- `node-api` image (Cloud Run Service)
- `python-orchestrator` image (Cloud Run Service)
- `media-job-runner` image (Cloud Run Job)
- `video-job-runner` image (Cloud Run Jobs: short/long configs)

### Build approach
- Multi-stage builds
- Pin FFmpeg version and include required fonts for T1 overlays
- Publish images to a container registry (e.g., Artifact Registry)

### Optional dev tooling
- `docker-compose.yml` for local dev
  - node-api
  - python-orchestrator
  - optional local postgres/redis mocks

---

## 9) Observability (Cloud Monitoring + Sentry)

### Structured logging (Node/Python)
Include fields:
- `request_id`, `user_id`, `route`, `method`, `status`, `latency_ms`
- `job_id`, `render_id`, `kie_job_id`
- `auth_error_reason` (missing_cookie, invalid_session, csrf_failed)
- `release`, `environment`

### Cloud Monitoring alerts (minimum)
- 5xx rate > X% over 5 minutes
- p95 latency > threshold
- 401/403 spike (auth/session issues)
- Job fail/timeout spike (Cloud Run Jobs or log-based metrics)
- Queue backlog growth / excessive retries (Cloud Tasks metrics + app metrics)

### Sentry (Frontend + Backend)
- Frontend: JS errors, network/CORS errors, login loop events, release tracking, optional session replay with low sampling
- Backend: exception reporting with correlation (`request_id`, `job_id`, `render_id`), optional tracing with low sampling
- Ensure PII scrubbing and safe sampling settings.

---

## 10) Full-funnel product analytics (required)

### Platform
- Recommended: **PostHog** (self-hosted or managed)
- Acceptable alternative: GA4 + server-side events (less product-centric)

### Event collection principles
- Track both **client-side** and **server-side** events.
- Use a single stable `distinct_id`:
  - Pre-login: anonymous ID stored in cookie/local storage
  - Post-login: link to `user_id` and alias/identify
- All events include:
  - `timestamp`, `distinct_id`, `user_id` (if known), `session_id`
  - `release` (frontend/backend), `environment`
  - `utm_source`, `utm_medium`, `utm_campaign` when available

### Core funnel (MVP)
1) **Acquisition**
   - `page_view`
   - `signup_started`
   - `signup_completed`
2) **Activation**
   - `login_started`
   - `login_succeeded`
   - `dashboard_viewed`
   - `job_create_clicked`
   - `job_submitted`
3) **Conversion**
   - `payment_started` (if applicable)
   - `payment_succeeded`
4) **Delivery**
   - `kie_submit_succeeded`
   - `kie_callback_received` / `kie_poll_completed`
   - `media_job_started` / `media_job_completed`
   - `video_render_started` / `video_render_completed`
   - `output_viewed` / `output_downloaded`
5) **Retention**
   - `return_visit`
   - `job_submitted` (repeat usage)
   - `gallery_upload` / `gallery_view`

### Properties (minimum)
- Auth funnel:
  - `auth_method`, `failure_reason`, `browser`, `os`, `device`
- Job funnel:
  - `job_type` (image/video)
  - `duration_estimate`, `clip_count`, `timeline_layers` (V1/V2/T1/A1 flags)
  - `queue_wait_ms`, `processing_ms`, `time_to_result_ms`
  - `result_size_mb`, `resolution`, `fps`
- Abuse:
  - `rate_limited` boolean, `ip_hash`, `country`, `asn`

### Analytics dashboards (required)
- Acquisition → Signup conversion rate
- Login success rate + top failure reasons
- Job submit → completion rate
- Median/p95 time-to-result (by job type)
- Retention (DAU/WAU, repeat jobs per user)
- Drop-off points in funnel
- Top browsers/devices by error rate

---

## 11) Admin Ops Dashboard (in-app) — spec

### Access
- Admin-only role in DB
- Protect with server-side checks

### Panels (single page)
1) **Traffic & Auth**
   - Unique visitors/day, sessions/day, active users (approx)
   - Login success rate; top auth failure reasons
   - 401/403 trend; login loop count
2) **API Health**
   - p95 latency, error rate, top failing endpoints
3) **Jobs Health**
   - Jobs created/completed/failed; retry counts
   - Queue backlog; queue wait time
4) **Kie AI Health**
   - Callback received rate
   - Polling volume and completion rate
   - External API error rate and latency
5) **Storage**
   - R2 storage used by prefix (`temp/`, `gallery/`, `renders/`)
   - Object count growth/day
6) **Security/Abuse**
   - Rate limit hits
   - Top IP hashes by request count (no raw IP in UI)
   - Direct-to-origin suspicion count (missing expected headers)

### Alerts / notifications
- Send alerts to Slack/email for:
  - Auth failures spike
  - 5xx spike
  - Job failure spike
  - Queue backlog threshold exceeded
  - Kie AI callback drop

---

## 12) Security baseline

- Enforce HTTPS everywhere.
- Protect API with session validation + CSRF defenses where needed.
- Rate limit:
  - `/login`, `/signup`, `/api/jobs`, `/api/generate`
- Use signed URLs or token-gated access for private R2 assets.
- Secrets management:
  - Store Kie AI secrets, DB credentials, Redis URL in secure secret manager/environment config.
- Avoid storing raw PII in logs and analytics; hash IP for abuse analysis.

---

## 13) CI/CD, environments, and migrations

### Environments
- `dev`, `staging`, `prod`
- Separate Neon DBs/branches per env
- Separate Upstash DB per env
- Separate R2 prefixes/buckets per env
- Separate Vectorize indexes per env
- Separate Sentry projects or env tags per env
- Separate analytics project/workspace per env

### Deployment strategy
- Cloud Run: immutable revisions, canary traffic shift, quick rollback.
- Cloud Run Jobs: deploy new job revision, keep idempotency to tolerate replays.
- Cloudflare Pages: preview deployments per PR; promote to prod.

### DB migrations (must follow)
- Use **Expand → Migrate/Backfill → Contract**
- Never drop/rename breaking changes in the same release as code changes unless fully coordinated.
- Version `timeline_spec` and keep compatibility reading old versions.

---

## 14) Cost control plan

Primary levers:
- `max concurrent executions` on `video-job-*`
- `max instances` on Cloud Run services
- R2 lifecycle retention (12-day temp)
- Vectorize indexes separated (docs vs images)
- Analytics sampling for heavy features (session replay, tracing)

---

## 15) MVP acceptance criteria (Definition of Done)

### Functional
- User can signup/login and access dashboard.
- User can submit image/video generation requests.
- System reliably completes jobs via callback or polling fallback.
- Outputs are stored in R2 under correct retention policy and visible to user.
- Video rendering supports timeline V1/V2/T1/A1 with final output generated.

### Reliability
- No job is lost under retries; idempotency verified.
- Admin dashboard shows real-time-ish health metrics and recent incidents.
- Alerts fire for critical spikes (5xx, auth failures, job failures, backlog).

### Observability & Analytics
- Sentry captures frontend and backend errors with correlation IDs.
- Product analytics provides end-to-end funnel dashboards.
- Cloud Monitoring dashboards and alerts are configured.

### Deployability
- Docker images build and deploy for all services/jobs.
- Staging environment deploys and runs migrations safely.
- Rollback procedure is documented and tested once.

---

## 16) Implementation task breakdown (recommended order)

1) Repo structure + Dockerfiles (node-api, python-orchestrator, media-job, video-job)
2) Neon schema + migrations + pooling config
3) Auth/session (HttpOnly cookie) + user model + admin role
4) Cloud Tasks integration (polling, enqueue jobs)
5) Kie AI integration (submit + callback + polling fallback)
6) media-job pipeline (R2 upload + thumbnails + DB update)
7) video-job-short + video-job-long runner (timeline spec → ffmpeg)
8) R2 lifecycle rules + gallery flow
9) Vectorize indexing for docs + images + search endpoints
10) Upstash rate limiting + abuse guardrails
11) Sentry integration (frontend + backend) + PII scrubbing
12) Product analytics (PostHog): event schema + funnel dashboards
13) Admin Ops Dashboard (health + funnel + abuse + cost)
14) Cloud Monitoring dashboards + alerts
15) Load testing (100/500/1000 concurrent generate)
16) Production hardening + canary deploy + rollback drill
