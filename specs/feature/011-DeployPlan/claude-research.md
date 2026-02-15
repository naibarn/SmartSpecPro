# Research Findings: MVP Deployment Plan

## Part 1: Codebase Analysis

### 1. Project Structure and Architecture

**Monorepo Layout** (Turborepo + pnpm):
```
SmartSpecPro/
├── apps/web/                    # React + Express + tRPC (main app)
│   ├── client/src/              # React frontend (Vite 7, React 19)
│   ├── server/                  # Express backend + tRPC routers
│   ├── drizzle/                 # Database schema (Drizzle ORM)
│   └── skills/                  # Skill definitions
├── python-backend/              # FastAPI (LLM gateway, Celery tasks)
├── packages/db/                 # Database type exports
├── packages/shared/             # Shared types, constants
├── packages/skills/             # Skill detection/parsing
├── packages/ui/                 # Radix UI component library
├── control-plane/               # Fastify management service (:7070)
└── docker-compose*.yml          # Orchestration configs
```

**Key Technologies**: React 19, Vite 7, TailwindCSS 4, Radix UI, Wouter, TanStack Query, Express 4, tRPC 11, Drizzle ORM, FastAPI, SQLAlchemy 2, Celery 5.3, Tauri 2, BullMQ, PostgreSQL 15, Redis 7.

### 2. Database Schema (Drizzle ORM)

**Location**: `apps/web/drizzle/schema.ts` (440+ lines)

**Core Tables**:
- `users` (openId, email, password hash, role, credits, plan)
- `creditTransactions` / `creditPackages` (credit system)
- `galleryItems` (media: images, videos, websites)
- `llmProviders` / `modelProviderMap` / `providerUsageLog` (LLM system)
- `mediaGenerations` / `mediaModels` (media generation tasks)
- `storageSettings` (R2/S3/local config with encrypted credentials)
- `videoEditorProjects` (saved editor projects)
- `scheduledMessages` (BullMQ scheduled jobs)

**Patterns**: pgEnum for roles/plans/types, AES-256-GCM encrypted columns, camelCase, JSONB config columns, unique indexes for idempotency.

**Python Backend Models** (`python-backend/app/models/`): User, Tenant, MediaTask, ApiKeyV2, Workflow, Execution, Credit, AuditLog via SQLAlchemy 2 + asyncpg.

### 3. Current Job Processing

**Celery Configuration** (`python-backend/app/core/celery_app.py`):
- Broker: Redis (`redis://localhost:6379/0`)
- Queues: `celery` (workflows), `video` (FFmpeg), `media` (API-based generation)
- Time limits: 30min hard, 29min soft; prefetch=1; task tracking enabled

**Periodic Tasks** (CeleryBeat):
- `cleanup-expired-tasks` - Daily 3am UTC (>12 days)
- `retry-failed-tasks` - Every 15 minutes
- `retry-media-callback-events` - Every minute
- `retry-library-index-jobs` - Every minute
- `recover-stuck-tasks` - Every 2 minutes
- `check-scheduled-workflows` - Every minute
- `cleanup-expired-edit-sessions` - Every 30 minutes
- `renew-drive-watch-channels` - Every 6 hours
- `poll-drive-changes` - Every 15 minutes

**Media Job Lifecycle (Node.js side)** (`apps/web/server/routers/mediaJobs.ts`):
1. User submits → concurrency check (max 3 per user via Redis Set)
2. Job tracked in Redis: active set, recent sorted set (24h TTL), job details hash
3. Progress via Redis channel `media-job-progress:{jobId}`
4. Completion via webhook callback from Python

**Media Job Lifecycle (Python side)** (`python-backend/app/api/v1/media_generation.py`):
1. MediaTask created (pending → processing → completed/failed)
2. Celery task dispatched to appropriate queue
3. Provider integration: Kie.ai, fal.ai, etc.
4. Persistent callback pipeline (DB-backed) or legacy stateless
5. Polling fallback at `/api/v1/media/tasks/{task_id}`

### 4. Docker & Infrastructure

**Compose Files**: `docker-compose.dev.yml` (full dev), `docker-compose.media.yml` (Celery workers), `docker-compose.infra.yml` (PostgreSQL + Redis), `docker-compose.nginx.yml` (reverse proxy)

**Service Startup** (`run-services.sh`): PostgreSQL → Redis → Nginx → Python Backend → Web App → Celery Workers. Hybrid systemd + screen management.

**Nginx** (`nginx/conf.d/dev-host.conf`):
- `/api/media-jobs/` → Node.js (600s timeout)
- `/api/storage/` → Node.js (streaming, no buffering)
- `/api/` → Python (600s timeout)
- `/trpc/` → Node.js (streaming)
- `/ws` → Node.js (WebSocket)
- `/` → Node.js (static + SSR)
- Max body: 5GB, TLS 1.2+

### 5. Auth & Sessions

**Location**: `apps/web/server/_core/authz.ts`, `cookies.ts`

**Two modes**: Bearer token (server-to-server, signed JWT) and Session cookie (browser UI).
- Cookie: `SMARTSPEC_SESSIONID`, HttpOnly, Secure, SameSite=Lax, 30-day TTL
- JWT via `jose` library, short-lived with scopes (`llm:chat`, `mcp:read`, `mcp:write`)
- JTI revocation checking
- Roles: `user`, `admin`, `domain_admin`

### 6. Storage Layer

**Location**: `apps/web/server/storage.ts`

Multi-provider with priority: Legacy Forge ENV → DB active `storageSettings` → Local fallback.
Providers: Forge (legacy HTTP), R2/S3 (AWS SDK), Local filesystem.
Config cached 5 minutes. Credentials encrypted via AES-256-GCM.

### 7. Testing

**Vitest (Web App)**: Run with `JWT_SECRET=test-jwt-secret... vitest run`. Coverage via `@vitest/coverage-v8`. Test files for routers and components.

**Pytest (Python)**: 80% coverage enforced. Markers: unit, integration, e2e, slow, auth, credits, llm, payment. Async mode auto. SQLite in-memory for fast tests. Code quality: Black (100 chars), isort, Ruff, mypy.

### 8. Observability

**Current**: Structured JSONL audit logs (`logs/audit/audit-YYYY-MM-DD.jsonl`), DB `providerUsageLog` table, DB `apiAuditEvents` table.
**Missing**: No PostHog, no Sentry, no Cloud Monitoring integration.

### 9. Video Editor

**Location**: `apps/web/client/src/components/videoeditor/`

Components: VideoEditorPhase3 (main), Timeline, PreviewPlayer, Toolbar, MediaLibraryPanel, SilenceDetectionDialog, AspectRatioSelector, AudioDuckingPanel, TransitionsPanel, OverlayPanel, ExportDialog, RenderProgressDialog, TextClipEditor, HistoryPanel, SilenceTimeline.

Types (`client/src/types/videoEditor.ts`): VideoEditorProject, Clip (video/audio/text), SilentRegion, Track, etc.

FFmpeg jobs (`python-backend/app/tasks/media_job_worker.py`): probe, render_mp4_h264, render_hls, waveform_peaks, thumbnails, subtitles_extract, subtitles_burnin, concat, dead_air_detect, dead_air_cut, generate_clip_from_api, transcode_h264, extract_audio. Security: job spec validation, SSRF protection, shell metachar filtering.

### 10. API Structure (49 tRPC Routers)

Notable: accountSecurity, adminTenants, audit, chat, credits, googleDrive, library, libraryOps, llmProviders, media, mediaJobs, mediaModels, mediaProviders, queues, scheduledMessages, skills, storage, storageSettings, users, videoEditorProjects, workflow, plus system router.

Procedures: publicProcedure, protectedProcedure, adminProcedure, loginProcedure, registerProcedure, verifyEmailProcedure, resetPasswordProcedure.

---

## Part 2: Web Research

### Topic 1: Google Cloud Run + Cloud Tasks

#### Cloud Run Services vs Jobs

**Services**: HTTP request/response, autoscaling, up to 60min timeout, supports concurrency.
**Jobs**: Batch processing, runs to completion, up to 168 hours (CPU) / 1 hour (GPU), up to 10,000 parallel tasks.

CPU-to-memory constraints for jobs:

| vCPU | Memory Range |
|------|-------------|
| 1 | 128 MiB - 4 GiB |
| 2 | 128 MiB - 8 GiB |
| 4 | 2 - 16 GiB |
| 8 | 4 - 32 GiB |

#### Cloud Tasks Configuration

**Rate limiting** (token bucket): `--max-dispatches-per-second=500`, `--max-concurrent-dispatches=100`

**Retry policy**: `--max-attempts=5`, `--min-backoff=1s`, `--max-backoff=300s`, `--max-doublings=4`, `--max-retry-duration=3600s`

**CRITICAL: No built-in dead letter queue.** Failed tasks silently vanish after max retries. Workaround: on final retry (detect via `X-CloudTasks-TaskRetryCount` header), publish to Pub/Sub → dead letter storage.

#### Replacing Celery

**Pros**: No Redis/RabbitMQ infra, first 1M tasks/month free ($0.40/M after), built-in retry, OIDC auth between services.

**Cons**: No DLQ, task name dedupe only 24h, at-least-once (not exactly-once), no chord/chain/group, max payload 100KB, for long work must trigger Cloud Run Jobs via Admin API.

#### Cloud Run Jobs Trigger Pattern

```
POST https://{REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/{PROJECT_ID}/jobs/{JOB_NAME}:run
```
Requires OIDC auth with `roles/run.invoker`.

#### Cost Guardrails

Combined: Queue `--max-concurrent-dispatches` + Service `--max-instances` + Jobs `--parallelism`.

#### Idempotency

- Deterministic task names (e.g., `render-{jobId}-{version}`) for dedup (24h window)
- DB-backed idempotency keys in handler
- Checkpoint pattern for long-running jobs

**Sources**: Google Cloud Run docs, Cloud Tasks docs, fastapi-cloud-tasks library, Cloud Run pricing docs.

---

### Topic 2: PostHog Analytics Integration

#### React SDK

```tsx
import posthog from 'posthog-js';
posthog.init('<KEY>', {
  api_host: 'https://us.i.posthog.com',
  person_profiles: 'identified_only',  // IMPORTANT: saves cost
  autocapture: false,                   // IMPORTANT: reduces noise/cost
});
```

Hooks: `usePostHog()`, `useFeatureFlagEnabled()`, `useFeatureFlagVariantKey()`, `useFeatureFlagPayload()`, `useActiveFeatureFlags()`.

#### Node.js SDK

```typescript
import { PostHog } from 'posthog-node';
const posthog = new PostHog('<KEY>', { host: 'https://us.i.posthog.com', flushAt: 20, flushInterval: 10000 });
// MUST call posthog.shutdown() on process exit
```

#### Identity Management

1. PostHog auto-generates anonymous `distinct_id` (cookie)
2. On login/signup: `posthog.alias(sessionId, newUserId)` BEFORE `posthog.identify(newUserId)`
3. `person_profiles: 'identified_only'` avoids expensive anonymous profiles

#### Event Naming

Object_Action format, `snake_case`: `media_job_created`, `video_render_completed`, `user_signed_up`. Store specifics in properties, not event names. Never put PII in payloads.

#### Pricing (Cloud)

Free tier: 1M events, 5K session replays, 1M feature flag requests/month. No per-seat charges. Paid: ~$0.00005/event after free tier. Hard spending caps available.

**Recommendation**: PostHog Cloud for MVP. Free tier covers 10K-50K MAU.

**Gotchas**: Autocapture doubles event volume. Missing `shutdown()` loses batched events. Must `.alias()` BEFORE `.identify()`.

**Sources**: PostHog docs, posthog-js/react npm, posthog-node npm, PostHog pricing guides, Userpilot review.

---

### Topic 3: Cloudflare R2 Lifecycle + Vectorize

#### R2 Lifecycle Rules

Via S3 API (`PutBucketLifecycleConfiguration`), Wrangler CLI, or Dashboard. Up to 1,000 rules per bucket. Prefix-based filtering. Auto-expire after N days. Transition to Infrequent Access. Auto-abort incomplete multipart uploads. Objects removed within ~24 hours of expiration.

```typescript
// Example: S3 API lifecycle config
Rules: [
  { ID: 'delete-temp', Status: 'Enabled', Filter: { Prefix: 'temp/' }, Expiration: { Days: 12 } },
  { ID: 'delete-previews', Status: 'Enabled', Filter: { Prefix: 'renders/preview/' }, Expiration: { Days: 7 } },
  { ID: 'cleanup-multipart', Status: 'Enabled', AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 } },
]
```

#### R2 Presigned URLs

Via `@aws-sdk/s3-request-presigner`. Max expiry: 7 days. Works ONLY with S3 API domain (not custom domains). Supports GET, PUT, HEAD, DELETE.

#### Cloudflare Vectorize

Create indexes: `npx wrangler vectorize create docs-index --dimensions=768 --metric=cosine`

**CRITICAL**: Dimensions and metric CANNOT be changed after creation.

Limits: 10M vectors/index, max 1,536 dimensions, 10 KiB metadata/vector, topK=20 (with metadata) / 100 (without), batch upsert 1,000 (Workers) / 5,000 (HTTP API), 10 metadata indexes/index.

**Pricing**: Free: 50M queried dimensions + 10M stored/month. Paid: $0.01/M queried, $0.05/100M stored. MVP estimate: ~$0.31/month (within free tier).

**Separate indexes recommended**: `docs-index` + `images-index`. No cost penalty. Use namespaces for tenant isolation.

**Gotchas**: Immutable dimensions/metric. topK capped at 20 with metadata. R2 lifecycle deletion ~24h delay. Presigned URLs don't work with custom domains.

**Sources**: Cloudflare R2 docs, Vectorize docs, Cloudflare blog posts.

---

### Topic 4: FFmpeg Timeline Rendering

#### filter_complex Multi-Track

```bash
ffmpeg -i main.mp4 -i overlay.png -i music.mp3 \
  -filter_complex "
    [0:v][1:v]overlay=W-w-10:10[with_logo];
    [with_logo]drawtext=text='Title':fontfile=...:fontcolor=white:fontsize=24:x=10:y=10[final_video];
    [0:a][2:a]amix=inputs=2:duration=first[final_audio]
  " -map "[final_video]" -map "[final_audio]" -c:v libx264 -preset medium -crf 23 output.mp4
```

#### Two-Stage Pipeline

**Stage 1 (Assembly)**: Stream copy concat (`-c copy`), near-instant, lossless. Requires matching codec/resolution/timebase.
**Stage 2 (Final Render)**: Apply overlays/text/color → transcode. Cache Stage 1 output.

#### Render Profiles

| Profile | Preset | CRF | Scale | Use Case |
|---------|--------|-----|-------|----------|
| Preview | ultrafast | 28 | 640:-2 | Editor preview |
| Standard | medium | 23 | original | Normal export |
| High | slow | 18 | original | Final delivery |

#### Render Hash / Idempotency

```typescript
const cacheKey = sha256(JSON.stringify({ inputs: fileHashes.sort(), timeline, effects, profile }));
// Check R2: HEAD renders/{cacheKey}.mp4 → skip if exists
```

#### Docker + Fonts

Pin FFmpeg version. Install `fontconfig`, `ttf-dejavu`, `ttf-liberation`. Run `fc-cache -fv`. Without fonts, drawtext filter fails.

#### Cloud Run Jobs Config

| Setting | Preview | Final | GPU |
|---------|---------|-------|-----|
| CPU | 4 vCPU | 8 vCPU | 8 vCPU |
| Memory | 8 GiB | 32 GiB | 32 GiB |
| Timeout | 600s | 3600s | 3600s |
| Retries | 1 | 1 | 1 |

GPU renders: `ffmpeg -hwaccel cuda -i input.mp4 -c:v h264_nvenc -cq 21 output.mp4`

**Gotchas**: Missing fonts crash drawtext. Stream copy requires matching codecs. Complex filter_complex can OOM. FFmpeg output not bit-deterministic (use `-threads 1` for determinism). GPU jobs max 1 hour. Always use `-movflags +faststart` for streaming. Always use explicit `-map`.

**Sources**: FFmpeg docs, FFmpeg wiki, Google Cloud Run docs, jrottenberg/ffmpeg Docker.

---

## Architecture Readiness Summary

| Area | Current Status | Deployment Readiness |
|------|----------------|---------------------|
| Monorepo Structure | Clean Node.js + Python separation | Ready for containerization |
| Database | Drizzle + SQLAlchemy, well-structured | Ready for Neon Postgres |
| Job Processing | Celery + Redis (3 queues) | Needs Cloud Tasks migration |
| Storage | Multi-provider R2/S3/local abstraction | Ready, add lifecycle rules |
| Docker | Compose-based orchestration | Needs Dockerfiles for Cloud Run |
| Auth | JWT + session cookies, roles | Ready (minimal changes) |
| Testing | Vitest + pytest, 80% coverage | Ready |
| Observability | JSONL audit + DB logs only | Needs PostHog + Sentry + Cloud Monitoring |
| Video Editor | Comprehensive React + FFmpeg | Ready (adapt job triggers) |
| API | 49 tRPC routers, well-organized | Ready |
