# Feature 061: Upload-Post Universal Social Gateway

## 1. Overview

### 1.1 Problem Statement

ปัจจุบันระบบ Social Automation ของ SmartSpecPro ใช้การเชื่อมต่อแบบ provider-by-provider (Meta OAuth, TikTok API, YouTube API) ซึ่งต้องจัดการ OAuth flow, token refresh, และ platform-specific API ของแต่ละ provider เอง ส่งผลให้:

- user ต้องผ่าน OAuth flow ที่ซับซ้อนสำหรับแต่ละ platform
- การเพิ่ม platform ใหม่ต้อง implement provider adapter ใหม่ทุกครั้ง
- บาง platform (เช่น Pinterest, Reddit, Bluesky, LinkedIn) ยังไม่มี native adapter ในระบบ
- user ที่มี account ใน Upload-Post อยู่แล้วไม่สามารถใช้ประโยชน์จากการเชื่อมต่อที่มีอยู่ได้

### 1.2 Goal

เพิ่ม **Upload-Post API** (https://api.upload-post.com) เป็น **universal social gateway** เส้นทางที่ 2 ของระบบ ให้ user สามารถ:

1. **Config เอง** — เพิ่ม Upload-Post API Key ในหน้า Settings ของตนเอง
2. **เชื่อมต่อ social accounts** — ผ่าน Upload-Post JWT flow (ไม่ต้องทำ OAuth กับแต่ละ platform เอง)
3. **โพสต์ข้ามแพลตฟอร์ม** — จากระบบ SmartSpecPro ไปยัง 10+ platforms ผ่าน API เดียว
4. **ใช้ร่วมกับ native providers** — เลือกได้ว่าจะโพสต์ผ่าน Upload-Post หรือ native adapter ที่มีอยู่
5. **ใช้ได้จาก workflow/agency** — dispatch social action ผ่าน Upload-Post gateway

### 1.3 Scope

**In Scope**

- User-level Upload-Post API key storage (encrypted) + connection management UI
- Upload-Post profile creation/linking per user
- JWT-based social account connection flow with CSRF + nonce protection
- Publish gateway: video, photo, text, document upload through Upload-Post API
- Scheduling and queue support via Upload-Post
- Upload status tracking (async/scheduled) with polling sync loop
- Provider selection: choose between native adapter vs Upload-Post per post
- Integration via parallel `UploadPostDispatcher` (separate from `SocialProviderAdapter` — see Section 4.4)
- Analytics retrieval through Upload-Post API
- Platform resource discovery (Facebook pages, LinkedIn pages, Pinterest boards)
- Feature flag: `UPLOAD_POST_GATEWAY_ENABLED` (fail-closed default)
- Per-user rate limiting on all Upload-Post proxy endpoints
- SSRF validation on all media URLs
- Third-party data disclosure UI

**Out of Scope**

- Upload-Post webhook/DM ingestion (social inbox via Upload-Post) — future spec
- FFmpeg media processing through Upload-Post — use existing media pipeline
- Upload-Post admin/billing management
- Replacing existing native Meta/TikTok/YouTube adapters
- Upload-Post comment management (reply via Upload-Post)

### 1.4 Placement in Current Architecture

This feature adds a new gateway layer that sits alongside the existing native providers:

```
                       User Request (publish post)
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
          Native Provider          Upload-Post Gateway
          (Meta/TikTok/YT)        (unified API)
                    │                   │
                    ▼                   ▼
          Platform-specific       api.upload-post.com
          OAuth + API calls       ├── TikTok
                                  ├── Instagram
                                  ├── YouTube
                                  ├── Facebook
                                  ├── X (Twitter)
                                  ├── LinkedIn
                                  ├── Threads
                                  ├── Pinterest
                                  ├── Reddit
                                  ├── Bluesky
                                  └── Google Business
```

**Integration points** (based on architecture review):
- `apps/web/server/services/social/providerCatalog.ts` — register Upload-Post capabilities in the catalog
- `apps/web/server/services/uploadPostClient.ts` — **NEW** standalone client (does NOT implement `SocialProviderAdapter` — see Section 4.4)
- `apps/web/server/services/uploadPostDispatcher.ts` — **NEW** dispatch layer for workflow/agency integration
- `apps/web/server/routers/uploadPost.ts` — **NEW** tRPC router for all Upload-Post operations
- **NOT** `providerRegistry.ts` — Upload-Post uses a parallel dispatch path because `SocialProviderAdapter.execute()` requires `pageId: number` and has no `userId`/`apiKey` fields (incompatible interface)

### 1.5 Third-Party Trust & Data Disclosure

**MANDATORY: Users must acknowledge before first use.**

Upload-Post is a third-party service that:
- **Receives user-generated content** (text, media files, captions)
- **Manages social OAuth tokens** for all connected platforms
- **Stores platform identifiers** (Facebook page IDs, LinkedIn page URNs, etc.)

**Blast radius if Upload-Post is compromised:** An attacker gains access to all connected social accounts for affected users.

**Regulatory requirements:**
- GDPR/PDPA: Upload-Post processes personal data — requires Data Processing Agreement (DPA) before enabling for EU/Thai tenants
- Users must see a disclosure banner explaining data flows before connecting
- Tenant admins must explicitly enable the feature (opt-in, not opt-out)

---

## 2. Upload-Post API Summary

### 2.1 Authentication

```
Authorization: Apikey {user_api_key}
Base URL: https://api.upload-post.com/api
```

Each SmartSpecPro user stores their own Upload-Post API key (encrypted). API key is passed per-request. All connections MUST use HTTPS. `NODE_TLS_REJECT_UNAUTHORIZED` MUST never be set to `0`.

### 2.2 Core Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/upload_videos` | POST | Video upload to 10+ platforms |
| `/api/upload_photos` | POST | Photo/carousel upload |
| `/api/upload_text` | POST | Text-only posts |
| `/api/upload_document` | POST | LinkedIn document upload |
| `/api/uploadposts/status` | GET | Check async/scheduled status |
| `/api/uploadposts/history` | GET | Upload history (paginated) |
| `/api/uploadposts/schedule` | GET/DELETE/PATCH | Manage scheduled posts |
| `/api/uploadposts/queue/settings` | GET/POST | Queue slot configuration |
| `/api/uploadposts/queue/preview` | GET | Preview upcoming queue slots |
| `/api/analytics/{username}` | GET | Multi-platform analytics |
| `/api/uploadposts/me` | GET | Validate API key |
| `/api/uploadposts/users` | POST/GET/DELETE | Manage Upload-Post profiles |
| `/api/uploadposts/users/generate-jwt` | POST | Generate JWT for social account connection |
| `/api/uploadposts/facebook/pages` | GET | List connected Facebook pages |
| `/api/uploadposts/linkedin/pages` | GET | List connected LinkedIn pages |
| `/api/uploadposts/pinterest/boards` | GET | List Pinterest boards |

### 2.3 Supported Platforms

| Platform | Video | Photo | Text | Document | Scheduling | Queue |
|----------|-------|-------|------|----------|------------|-------|
| TikTok | Yes | Yes | — | — | Yes | Yes |
| Instagram | Yes | Yes | — | — | Yes | Yes |
| YouTube | Yes | — | — | — | Yes | Yes |
| Facebook | Yes | Yes | Yes | — | Yes | Yes |
| X (Twitter) | Yes | Yes | Yes | — | Yes | Yes |
| LinkedIn | Yes | Yes | Yes | Yes | Yes | Yes |
| Threads | Yes | Yes | Yes | — | Yes | Yes |
| Pinterest | Yes | Yes | — | — | Yes | Yes |
| Reddit | — | Yes | Yes | — | Yes | Yes |
| Bluesky | Yes | Yes | Yes | — | Yes | Yes |
| Google Business | — | Yes | Yes | — | — | — |

### 2.4 Response Pattern

```json
// Sync (200)
{ "success": true, "request_id": "...", "results": { "instagram": { "success": true, "url": "..." } } }

// Async (202)
{ "success": true, "request_id": "...", "message": "Upload initiated in background.", "total_platforms": 3 }

// Scheduled (202)
{ "success": true, "job_id": "...", "scheduled_date": "2026-04-01T09:00:00Z" }
```

---

## 3. Database Schema Changes

### 3.1 Design Decision: Separate Tables for Upload-Post (No circular FK)

**Decision:** Upload-Post jobs are tracked in `upload_post_jobs` as a standalone record. We do NOT reuse `social_posts` for Upload-Post tracking because:

1. `social_posts.pageId` is `NOT NULL` and references `social_pages` — Upload-Post posts have no native `socialPage`, so inserting into `social_posts` would require a dummy page (fragile).
2. Circular FK between `upload_post_jobs.socialPostId` ↔ `social_posts.uploadPostJobId` is impossible to migrate in a single transaction without `DEFERRABLE` constraints.
3. Keeping them separate maps cleanly to the two-gateway mental model and avoids the Celery scheduled publish task (`_load_due_posts()`) accidentally picking up Upload-Post jobs.

**Consequence:** Upload-Post post history is queried from `upload_post_jobs`, not `social_posts`. The UI merges both sources for a unified timeline view.

### 3.2 New Table: `upload_post_connections`

Stores per-user Upload-Post configuration.

```sql
CREATE TABLE upload_post_connections (
  id SERIAL PRIMARY KEY,
  "tenantId" VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "encryptedApiKey" TEXT NOT NULL,           -- AES-256-GCM via crypto.ts encrypt()
  -- NOTE: uploadPostEmail intentionally NOT stored (PDPA data minimization)
  -- Only plan tier is stored for display; email stays in Upload-Post's system
  "plan" VARCHAR(50),                        -- free/basic/pro/etc from /me
  "status" VARCHAR(20) NOT NULL DEFAULT 'active',  -- active/invalid/suspended
  "consecutiveValidationFailures" INTEGER NOT NULL DEFAULT 0, -- for cron retry logic
  "lastValidatedAt" TIMESTAMP WITH TIME ZONE,
  "metadata" JSON,                           -- typed: { monthlyUploadsUsed?: number, monthlyLimit?: number }
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE("tenantId", "userId")
);

CREATE INDEX idx_upload_post_connections_tenant ON upload_post_connections("tenantId");
CREATE INDEX idx_upload_post_connections_user ON upload_post_connections("userId");
```

### 3.3 New Table: `upload_post_profiles`

Each Upload-Post connection can have multiple social profiles.

```sql
CREATE TABLE upload_post_profiles (
  id SERIAL PRIMARY KEY,
  "connectionId" INTEGER NOT NULL REFERENCES upload_post_connections(id) ON DELETE CASCADE,
  "tenantId" VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- SECURITY: enforce ownership
  "profileUsername" VARCHAR(255) NOT NULL,    -- validated: /^[\w\-\.]{1,100}$/
  "displayName" VARCHAR(500),
  "connectedPlatforms" JSON,                  -- typed: ValidPlatform[]
  "status" VARCHAR(20) NOT NULL DEFAULT 'active',
  "metadata" JSON,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE("connectionId", "profileUsername")
);

CREATE INDEX idx_upload_post_profiles_connection ON upload_post_profiles("connectionId");
CREATE INDEX idx_upload_post_profiles_tenant ON upload_post_profiles("tenantId");
CREATE INDEX idx_upload_post_profiles_user ON upload_post_profiles("userId");
```

### 3.4 New Table: `upload_post_jobs`

Track uploads sent through Upload-Post API. Standalone — no FK to `social_posts`.

```sql
CREATE TABLE upload_post_jobs (
  id SERIAL PRIMARY KEY,
  "tenantId" VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  "userId" INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- nullable: preserve job history after user deletion for audit
  "profileId" INTEGER REFERENCES upload_post_profiles(id) ON DELETE SET NULL,  -- nullable: preserve history after profile deletion
  "uploadType" VARCHAR(20) NOT NULL,          -- video/photo/text/document
  "requestId" VARCHAR(255),                   -- Upload-Post request_id (async)
  "jobId" VARCHAR(255),                       -- Upload-Post job_id (scheduled)
  "targetPlatforms" JSON NOT NULL,            -- typed: ValidPlatform[] (validated on write)
  "contentText" TEXT,                         -- post content (for display in history)
  "mediaRefs" JSON,                           -- typed: string[] (media URLs, SSRF-validated)
  "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
    -- pending | processing | completed | partial | failed | scheduled | queued | cancelled
  "scheduledAt" TIMESTAMP WITH TIME ZONE,
  "completedAt" TIMESTAMP WITH TIME ZONE,
  "platformResults" JSON,                     -- typed: Record<ValidPlatform, PlatformResult>
  "errorMessage" TEXT,                        -- sanitized: never raw Upload-Post response
  "metadata" JSON,                            -- typed: UploadPostJobMetadata (validated)
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_upload_post_jobs_tenant ON upload_post_jobs("tenantId");
CREATE INDEX idx_upload_post_jobs_user ON upload_post_jobs("userId");
CREATE INDEX idx_upload_post_jobs_request_id ON upload_post_jobs("requestId");
CREATE INDEX idx_upload_post_jobs_job_id ON upload_post_jobs("jobId");
CREATE INDEX idx_upload_post_jobs_status ON upload_post_jobs("status");
CREATE INDEX idx_upload_post_jobs_scheduled ON upload_post_jobs("scheduledAt")
  WHERE "status" = 'scheduled';
```

### 3.5 NO changes to `social_posts` table

`social_posts` remains exclusive to native provider publishing. This avoids:
- Breaking the `pageId NOT NULL` constraint
- Celery `_load_due_posts()` accidentally picking up Upload-Post jobs
- Circular FK issues

The UI merges `social_posts` + `upload_post_jobs` into a unified timeline at the presentation layer.

### 3.6 Typed JSON Column Schemas

All JSON columns MUST have TypeScript type enforcement and validation on write:

```typescript
// Types for JSON columns — validated with Zod before INSERT/UPDATE

const VALID_PLATFORMS = [
  "tiktok", "instagram", "youtube", "facebook", "twitter",
  "linkedin", "threads", "pinterest", "reddit", "bluesky", "google_business",
] as const;
type ValidPlatform = typeof VALID_PLATFORMS[number];

interface PlatformResult {
  success: boolean;
  url?: string;          // validated as URL before storing
  errorCode?: string;    // Upload-Post error code only
  errorMessage?: string; // sanitized — no raw API response
}

interface UploadPostJobMetadata {
  platformSpecificParams?: Record<string, unknown>;  // validated per-platform
  firstComment?: string;
  addToQueue?: boolean;
}

interface ConnectionMetadata {
  monthlyUploadsUsed?: number;
  monthlyLimit?: number;
}
```

### 3.7 Migration DDL & Safety

```bash
# BEFORE migration — backup affected area
mkdir -p .db-backups
pg_dump "$DATABASE_URL" --schema-only \
  --file=".db-backups/schema_pre_061_$(date +%Y%m%d_%H%M%S).sql"

# Drizzle schema changes → generate migration
cd apps/web && pnpm db:push

# AFTER migration — verify tables created
psql "$DATABASE_URL" -c "
  SELECT tablename FROM pg_tables
  WHERE tablename IN ('upload_post_connections', 'upload_post_profiles', 'upload_post_jobs');
"
```

**Rollback plan:** Since these are 3 NEW tables with no data and NO changes to existing tables, rollback is safe:

```sql
DROP TABLE IF EXISTS upload_post_jobs CASCADE;
DROP TABLE IF EXISTS upload_post_profiles CASCADE;
DROP TABLE IF EXISTS upload_post_connections CASCADE;
```

---

## 4. Backend Architecture

### 4.1 Architecture Decision: Node.js for Account Mgmt, Python for Uploads

**Decision:** Based on architecture review, all existing social provider clients (Meta, TikTok, YouTube) live in Python because video upload requires multipart streaming, file management, and long-running async operations that cannot live inside a 30-second tRPC request/response cycle.

**Split:**
- **Node.js (tRPC):** Account management, profile CRUD, JWT generation, status queries, analytics — lightweight JSON API calls
- **Python (Celery):** All upload operations (video, photo, text, document), status polling with exponential backoff, retry on transient failures

The decrypted API key **NEVER leaves the Node.js process**. Node.js calls Upload-Post directly using `node-fetch` with streaming.

**Video upload size cap (Phase 2):** Max **50MB** via direct Node.js upload. This limits the API key memory exposure window to ~10 seconds. For larger videos (>50MB), the secure internal delegation token exchange (Section 6.8) is **REQUIRED before enabling** — NOT "future scope." Phase 3 must implement the delegation token before removing the 50MB cap.

**Upload-Post accepts media URLs:** For video uploads, the preferred pattern is to pass an HTTPS media URL (e.g., from our R2/S3 storage) in the Upload-Post request body rather than streaming the file directly. This avoids large file transfers through Node.js entirely. Upload-Post fetches the file server-side.

### 4.2 Node.js (tRPC) — New Router: `uploadPost`

File: `apps/web/server/routers/uploadPost.ts`

All procedures are `protectedProcedure` with explicit `ctx.user.id` + `ctx.tenantId` enforcement.

```typescript
import { z } from "zod";

// ── Shared Zod schemas ──

const validPlatformEnum = z.enum([
  "tiktok", "instagram", "youtube", "facebook", "twitter",
  "linkedin", "threads", "pinterest", "reddit", "bluesky", "google_business",
]);

const profileUsernameSchema = z.string().min(1).max(100).regex(/^[\w\-.]+$/);

const publicMediaUrlSchema = z.string().url().refine((url) => {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") return false;
  if (/^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1|0\.0\.0\.0)/i.test(parsed.hostname)) return false;
  return true;
}, { message: "Media URL must be public HTTPS" });

const scheduledAtSchema = z.string().datetime().refine((v) => {
  const d = new Date(v);
  const now = new Date();
  const max = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  return d > now && d < max;
}, { message: "Must be between now and 365 days in the future" });

// ── Procedures ──

uploadPost.connect = protectedProcedure
  .input(z.object({ apiKey: z.string().min(10).max(500) }))
  .mutation(/* validate key via /me, encrypt, store */);

uploadPost.disconnect = protectedProcedure
  .mutation(/* delete connection + cascade profiles/jobs */);

uploadPost.getConnection = protectedProcedure
  .query(/* return { configured, plan, status, profileCount } — NEVER return API key */);

uploadPost.listProfiles = protectedProcedure
  .query(/* list profiles WHERE userId = ctx.user.id */);

uploadPost.createProfile = protectedProcedure
  .input(z.object({ username: profileUsernameSchema }))
  .mutation(/* create via Upload-Post API, store in DB */);

uploadPost.deleteProfile = protectedProcedure
  .input(z.object({ profileId: z.number().int().positive() }))
  .mutation(/* verify ownership via JOIN, delete via API + DB */);

uploadPost.generateJwt = protectedProcedure
  .input(z.object({
    profileUsername: profileUsernameSchema,
    redirectUrl: z.string().url().optional(), // validated against allowlist
  }))
  .mutation(/* see Section 6.7 for CSRF + nonce protection */);

uploadPost.listPlatformPages = protectedProcedure
  .input(z.object({
    profileUsername: profileUsernameSchema,
    platform: z.enum(["facebook", "linkedin", "pinterest"]),
  }))
  .query(/* fetch from Upload-Post API */);

uploadPost.publish = protectedProcedure
  .input(z.object({
    profileId: z.number().int().positive(),
    uploadType: z.enum(["video", "photo", "text", "document"]),
    targetPlatforms: z.array(validPlatformEnum).min(1).max(11),
    content: z.object({
      text: z.string().max(10000).optional(),
      mediaUrls: z.array(publicMediaUrlSchema).max(10).optional(),
      title: z.string().max(500).optional(),
      link: z.string().url().optional(),
    }),
    platformParams: z.record(z.string(), z.unknown()).optional(),
    scheduledAt: scheduledAtSchema.optional(),
    addToQueue: z.boolean().optional(),
  }))
  .mutation(/* validate ownership, publish via UploadPostClient, store job */);

uploadPost.getJobStatus = protectedProcedure
  .input(z.object({ jobId: z.number().int().positive() }))
  .query(/* verify ownership, fetch status from Upload-Post if pending */);

uploadPost.listJobs = protectedProcedure
  .input(z.object({
    cursor: z.string().optional(), // composite keyset: "{ISO}:{id}" for tie-breaking
    limit: z.number().int().min(1).max(50).default(20),
    status: z.enum(["all", "pending", "completed", "failed", "scheduled"]).default("all"),
  }))
  .query(/* paginated, userId-scoped, keyset cursor:
    ORDER BY createdAt DESC, id DESC
    WHERE (createdAt < cursor.createdAt) OR (createdAt = cursor.createdAt AND id < cursor.id)
    — prevents skipped rows when multiple jobs share the same createdAt millisecond
  */);

uploadPost.cancelScheduled = protectedProcedure
  .input(z.object({ jobId: z.number().int().positive() }))
  .mutation(/* verify ownership + status=scheduled, cancel via API */);

uploadPost.editScheduled = protectedProcedure
  .input(z.object({
    jobId: z.number().int().positive(),
    scheduledAt: scheduledAtSchema.optional(),
    title: z.string().max(500).optional(),
    caption: z.string().max(10000).optional(),
  }))
  .mutation(/* verify ownership + status=scheduled, patch via API */);

uploadPost.getAnalytics = protectedProcedure
  .input(z.object({
    profileUsername: profileUsernameSchema,
    platforms: z.array(validPlatformEnum).min(1),
  }))
  .query(/* fetch from Upload-Post API */);

uploadPost.getQueueSettings = protectedProcedure
  .input(z.object({ profileUsername: profileUsernameSchema }))
  .query(/* fetch from Upload-Post API */);

uploadPost.updateQueueSettings = protectedProcedure
  .input(z.object({
    profileUsername: profileUsernameSchema,
    timezone: z.string().max(100),
    slots: z.array(z.object({
      time: z.string().regex(/^\d{2}:\d{2}$/),
      days: z.array(z.number().int().min(0).max(6)),
    })).max(24),
  }))
  .mutation(/* update via Upload-Post API */);

uploadPost.previewQueueSlots = protectedProcedure
  .input(z.object({ profileUsername: profileUsernameSchema }))
  .query(/* fetch from Upload-Post API */);
```

### 4.3 Upload-Post Client Service (Node.js — Account & Light Operations)

File: `apps/web/server/services/uploadPostClient.ts`

```typescript
export class UploadPostClient {
  private readonly BASE = "https://api.upload-post.com/api";
  private readonly TIMEOUT_MS = 30_000;

  constructor(private apiKey: string) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Apikey ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  // All HTTP methods use AbortController with 30s timeout
  private async request<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.TIMEOUT_MS);
    try {
      const res = await fetch(`${this.BASE}${path}`, {
        ...opts,
        signal: controller.signal,
        headers: { ...this.headers(), ...opts.headers },
      });
      if (!res.ok) return this.handleError(res, path);
      return res.json() as T;
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new TRPCError({ code: "TIMEOUT", message: "Upload-Post request timed out" });
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // Error handler — NEVER forwards raw Upload-Post error bodies
  private async handleError(res: Response, operation: string): Promise<never> {
    let rawBody: unknown;
    try { rawBody = await res.json(); } catch { rawBody = null; }

    // Audit log (internal only — no API key, no email, no token)
    auditLogger.log({
      eventType: "upload_post.error",
      metadata: { operation, statusCode: res.status },
    });

    const clientMessage: Record<number, string> = {
      401: "Upload-Post API key is invalid or expired",
      403: "Insufficient permissions on your Upload-Post account",
      404: "Resource not found on Upload-Post",
      429: "Upload-Post rate limit reached. Please try again later.",
    };

    throw new TRPCError({
      code: res.status === 429 ? "TOO_MANY_REQUESTS" : res.status === 401 ? "UNAUTHORIZED" : "BAD_REQUEST",
      message: clientMessage[res.status] ?? "Upload-Post request failed",
    });
  }

  // Account
  async validateKey(): Promise<{ email: string; plan: string }> { /* GET /uploadposts/me */ }
  async createUser(username: string): Promise<UploadPostUser> { /* POST /uploadposts/users */ }
  async listUsers(): Promise<UploadPostUser[]> { /* GET /uploadposts/users */ }
  async deleteUser(username: string): Promise<void> { /* DELETE /uploadposts/users */ }

  // JWT — with CSRF-safe redirect
  async generateJwt(username: string, opts?: JwtOptions): Promise<{ url: string }> {
    /* POST /uploadposts/users/generate-jwt — redirectUrl set server-side */
  }

  // Upload (Node.js handles directly — no Python delegation)
  async uploadVideo(params: VideoUploadParams): Promise<UploadResponse> { /* POST /upload_videos */ }
  async uploadPhoto(params: PhotoUploadParams): Promise<UploadResponse> { /* POST /upload_photos */ }
  async uploadText(params: TextUploadParams): Promise<UploadResponse> { /* POST /upload_text */ }
  async uploadDocument(params: DocumentUploadParams): Promise<UploadResponse> { /* POST /upload_document */ }

  // Status & History
  async getStatus(requestId?: string, jobId?: string): Promise<UploadStatus> { /* GET /uploadposts/status */ }
  async getHistory(page?: number, limit?: number): Promise<UploadHistory> { /* GET /uploadposts/history */ }

  // Scheduling & Queue
  async listScheduled(): Promise<ScheduledPost[]> { /* GET /uploadposts/schedule */ }
  async cancelScheduled(jobId: string): Promise<void> { /* DELETE /uploadposts/schedule/{jobId} */ }
  async editScheduled(jobId: string, updates: ScheduleUpdate): Promise<void> { /* PATCH /uploadposts/schedule/{jobId} */ }
  async getQueueSettings(username: string): Promise<QueueSettings> { /* GET /uploadposts/queue/settings */ }
  async updateQueueSettings(username: string, settings: QueueSettingsUpdate): Promise<void> { /* POST /uploadposts/queue/settings */ }
  async previewQueueSlots(username: string): Promise<QueueSlot[]> { /* GET /uploadposts/queue/preview */ }

  // Platform Resources (URL-encode username to prevent path traversal)
  async getFacebookPages(username: string): Promise<FacebookPage[]> {
    return this.request(`/uploadposts/facebook/pages?user=${encodeURIComponent(username)}`);
  }
  async getLinkedInPages(username: string): Promise<LinkedInPage[]> { /* similar */ }
  async getPinterestBoards(username: string): Promise<PinterestBoard[]> { /* similar */ }

  // Analytics
  async getAnalytics(username: string, platforms: string[]): Promise<AnalyticsResponse> {
    return this.request(`/analytics/${encodeURIComponent(username)}?platforms=${platforms.join(",")}`);
  }
}
```

### 4.4 Dispatch Architecture: Parallel Path (NOT SocialProviderAdapter)

**Design Decision:** Upload-Post does NOT implement `SocialProviderAdapter` because the existing interface is incompatible:

```typescript
// Existing interface (providerRegistry.ts) — CANNOT be used for Upload-Post:
interface SocialProviderAdapter {
  execute(input: SocialBackgroundActionInput): Promise<Record<string, unknown>>;
}
// SocialBackgroundActionInput requires pageId: number (FK to social_pages)
// Has NO userId, NO apiKey fields
// Upload-Post has no concept of social_pages
```

**Instead, Upload-Post uses a parallel dispatch path:**

File: `apps/web/server/services/uploadPostDispatcher.ts`

```typescript
// Standalone dispatcher — does NOT implement SocialProviderAdapter
export class UploadPostDispatcher {
  async publish(params: {
    userId: number;
    tenantId: string;
    profileId: number;
    uploadType: "video" | "photo" | "text" | "document";
    targetPlatforms: ValidPlatform[];
    content: PublishContent;
    scheduledAt?: string;
    addToQueue?: boolean;
  }): Promise<{ jobId: number; requestId?: string; uploadPostJobId?: string }> {
    // 1. Verify user owns profileId (JOIN through connections)
    // 2. Decrypt API key from connection
    // 3. Instantiate UploadPostClient
    // 4. Call appropriate upload method
    // 5. Store in upload_post_jobs
    // 6. Return job reference
  }
}
```

Register Upload-Post capabilities in the catalog (read-only metadata, not an adapter):

```typescript
// In providerCatalog.ts — capabilities metadata only
providerCatalog.register("upload_post", {
  type: "upload_post",
  capabilities: { publish: true, schedule: true, queue: true, draft: false, statusPoll: true, analytics: true },
  supportedPlatforms: VALID_PLATFORMS,
});
```

This keeps Upload-Post completely decoupled from the native provider adapter system.

### 4.5 Status Sync Loop

Upload-Post uploads are async. We need a mechanism to sync status back to `upload_post_jobs`:

**Option A (chosen): Client-side polling + background cron**

1. After `uploadPost.publish`, the job is stored with `status: "pending"` and `requestId`
2. The frontend polls `uploadPost.getJobStatus` every 5 seconds for active jobs (batched: one call with array of jobIds to avoid per-job rate limit exhaustion)
3. `getJobStatus` calls Upload-Post's `/uploadposts/status?request_id=X` and updates the DB
4. Background cron (every 5 minutes) sweeps **all non-terminal jobs**:
   - `status IN ('pending', 'processing') AND updatedAt < NOW() - INTERVAL '2 minutes'` — async uploads
   - `status = 'scheduled' AND scheduledAt < NOW() - INTERVAL '10 minutes'` — scheduled posts that should have executed
   - `status = 'queued' AND updatedAt < NOW() - INTERVAL '30 minutes'` — queued posts awaiting slot
5. Cron batch-polls their status via Upload-Post API and updates DB

**Acceptable staleness window:** Maximum 10 minutes for status updates when browser is closed. This is acceptable because Upload-Post uploads are background operations and users receive no real-time notification anyway.

**`getJobStatus` batching:** To prevent rate limit exhaustion during batch publishing (12+ concurrent jobs), the procedure accepts an optional `jobIds: number[]` array and makes a single upstream status call per unique `requestId`, deduplicating results.

```typescript
uploadPost.getJobStatuses = protectedProcedure
  .input(z.object({ jobIds: z.array(z.number().int().positive()).min(1).max(20) }))
  .query(/* batch status check — one upstream call per requestId */);
```

**Option B (future): Upload-Post webhook notifications**
- Configure via `/uploadposts/users/notifications` with our webhook URL
- Handle `uploadCompleted`, `uploadFailed` events
- More efficient but requires exposing a public webhook endpoint

### 4.6 Workflow/Agency Integration

Extend `builtin-social-actions` tool to support Upload-Post gateway:

```typescript
// In agency_tools — extend social publish action
{
  action: "social_publish",
  gateway: "upload_post",          // or "native"
  profile: "my-brand-profile",
  platforms: ["tiktok", "instagram", "youtube"],
  content: { text: "...", mediaUrl: "..." },
  schedule: "2026-04-01T09:00:00Z"  // optional
}
```

**User identity resolution in workflow/agency context:**

In agency/workflow execution, there is no tRPC `ctx.user.id`. The user identity is resolved as follows:

1. **Workflow owner's connection is used** — the `userId` that created/owns the workflow is stored in the workflow metadata at creation time
2. The workflow dispatch chain passes `{ tenantId, ownerUserId }` through to `UploadPostDispatcher`
3. The dispatcher looks up `upload_post_connections WHERE tenantId = ? AND userId = ownerUserId`
4. If the owner has no Upload-Post connection, the action fails with a clear error: "Workflow owner has no Upload-Post connection configured"

This means the workflow always publishes using the creator's Upload-Post account, not the triggering user's. This is consistent with how native social providers work (using page tokens stored by the user who connected the page).

**Required change to `SocialBackgroundActionInput`:** Add optional fields for Upload-Post dispatch:

```typescript
// Extend existing type (backward-compatible — all new fields optional)
interface SocialBackgroundActionInput {
  // ... existing fields ...
  uploadPostProfileId?: number;        // NEW: Upload-Post profile to use
  uploadPostTargetPlatforms?: string[]; // NEW: target platforms
  uploadPostOwnerId?: number;          // NEW: workflow owner's userId for connection lookup
}
```

---

## 5. Frontend Architecture

### 5.1 Settings Page: Upload-Post Connection

Route: `/settings/upload-post`

**UI Flow:**

1. **Third-Party Disclosure** (first visit only)
   - Banner explaining: "Upload-Post is a third-party service. Your content and social account access will be managed by Upload-Post. [Learn more]"
   - User must acknowledge before proceeding

2. **Connect** — User enters Upload-Post API Key
   - System validates key via `/api/uploadposts/me`
   - Shows plan tier (not email — PII minimization)
   - Stores encrypted key
   - Shows monthly upload quota and usage

3. **Manage Profiles** — List/create Upload-Post profiles
   - Each profile can be linked to multiple social platforms
   - "Connect Accounts" button generates JWT URL → opens popup
   - Popup redirect URL is hardcoded server-side (see Section 6.7)
   - On popup close, system fetches connected platforms list via polling
   - Badge per profile showing connected platform icons

4. **Platform Pages** — Select specific pages/boards (per-platform)
   - Facebook: choose which page to post to
   - LinkedIn: choose org page
   - Pinterest: choose board

5. **Queue Settings** — Configure posting schedule
   - Timezone, time slots (max 24), active days

6. **Connection Health** — Status indicator
   - Green: active, validated
   - Yellow: approaching quota limit
   - Red: invalid key, suspended

### 5.2 Publishing UI Extension

In existing `SocialPublishing.tsx`:

- Add gateway selector: "Post via: Direct / Upload-Post" (only visible when Upload-Post connected)
- When Upload-Post selected:
  - Show available profiles dropdown
  - Multi-select target platforms (filtered by profile's connected platforms)
  - Show platform-specific options per selected platform
  - Show estimated queue slot if "add to queue" selected
- Same draft/schedule/publish-now flow
- Submit calls `uploadPost.publish` instead of native publish

### 5.3 Post History — Two-Tab MVP (Phase 2) → Unified Timeline (Phase 4)

**Phase 2 (MVP):** Show two separate tabs in the post history view:
- **"Direct Posts"** tab — queries `social_posts` via `socialPublishing.listPosts` (existing pagination)
- **"Upload-Post"** tab — queries `upload_post_jobs` via `uploadPost.listJobs` (new pagination)
- Each tab has its own cursor-based pagination (no cross-table merge issues)
- Badge/icon per entry indicating gateway type

**Phase 4 (Unified Timeline):** Merge both sources into a single sorted view:

```typescript
// Composite cursor approach:
// Cursor = base64({ nativeCursor: string, uploadCursor: string, lastTimestamp: string })
// Each page:
//   1. Fetch limit+1 from each source using their respective cursors
//   2. Merge by createdAt DESC
//   3. Return top `limit` items
//   4. Encode remaining cursors for next page

// This ensures correct global sort order across two independent DB tables.
```

**Rationale for deferral:** Cross-table pagination with independent cursors is complex and error-prone. Two-tab MVP ships faster, avoids pagination bugs, and lets users see each source clearly. Merge in Phase 4 after the core flow is battle-tested.

---

## 6. Security Requirements

### 6.1 API Key Storage

- Upload-Post API keys MUST be encrypted using `encrypt()` from `crypto.ts` (AES-256-GCM)
- Keys stored in `upload_post_connections.encryptedApiKey`
- Decrypted key exists in memory only during the HTTP request lifecycle
- NEVER exposed in API responses — only `configured: true/false` and `plan` tier
- NEVER logged — only log connection ID and profile username
- NEVER serialized into Celery task arguments, Redis keys, or error messages

### 6.2 API Key Validation & Rotation

- Validate on save via `/api/uploadposts/me`
- Daily cron revalidation with jitter (random 0-30 min delay between checks)
- **3-strike rule:** Only mark connection as `invalid` after 3 consecutive validation failures (prevents false invalidation during Upload-Post outages)
- On success: reset `consecutiveValidationFailures` to 0
- Notify user via UI banner when status changes to `invalid`

**Master key rotation procedure:** If `LLM_ENCRYPTION_KEY` is compromised:
```bash
# scripts/reencrypt-upload-post-keys.ts
# 1. Read each row's encryptedApiKey, decrypt with OLD key
# 2. Re-encrypt with NEW key
# 3. Write back in a transaction
# 4. Verify round-trip for each row before committing
```

### 6.3 Tenant & User Isolation

- All Upload-Post connections scoped to `tenantId + userId`
- tRPC procedures enforce `ctx.user.id` AND `ctx.tenantId` on ALL queries
- Profile lookups MUST join through `upload_post_connections` and verify `connections.userId = ctx.user.id`
- No cross-tenant or cross-user access to connections, profiles, or jobs

```typescript
// EVERY profile query MUST include this pattern:
const profile = await db
  .select(...)
  .from(uploadPostProfiles)
  .innerJoin(uploadPostConnections, eq(uploadPostProfiles.connectionId, uploadPostConnections.id))
  .where(and(
    eq(uploadPostProfiles.id, profileId),
    eq(uploadPostConnections.tenantId, ctx.tenantId),
    eq(uploadPostConnections.userId, ctx.user.id),  // CRITICAL
  ))
  .limit(1);
```

**Profile creation ownership validation:**

`createProfile` MUST call Upload-Post API (`POST /uploadposts/users`) to create the username. If Upload-Post returns an error (username already owned by a different API key holder), the creation fails. This prevents User A from creating a local profile record pointing to User B's Upload-Post username.

```typescript
// In createProfile procedure:
// 1. Call client.createUser(username) — Upload-Post validates ownership
// 2. Only on success: INSERT into upload_post_profiles
// 3. On Upload-Post error (409 Conflict or 403): throw TRPCError({ code: "CONFLICT" })
```

### 6.4 Rate Limiting

Per-user rate limits on SmartSpecPro side BEFORE hitting Upload-Post API:

```typescript
// Redis-based rate limiting
const RATE_LIMITS = {
  publish:    { points: 10, duration: 60 },   // 10 publishes/min
  status:     { points: 60, duration: 60 },   // 60 status checks/min
  management: { points: 30, duration: 60 },   // 30 profile/queue ops/min
};
```

Additionally:
- Respect Upload-Post 429 responses with exponential backoff (1s, 2s, 4s, max 30s)
- Track monthly upload count from connection metadata
- Warn user at 80% of monthly quota

### 6.5 Input Validation — SSRF Prevention

All media URLs MUST be validated before passing to Upload-Post.

**Layer 1: URL string validation (defense-in-depth, NOT a complete SSRF defense)**

```typescript
function validatePublicMediaUrl(url: string): void {
  const parsed = new URL(url);

  // 1. Protocol check — HTTPS only
  if (parsed.protocol !== "https:") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Media URL must use HTTPS" });
  }

  const host = parsed.hostname.toLowerCase();

  // 2. Exact blocked hosts
  const BLOCKED_EXACT = new Set(["localhost", "0.0.0.0", "::1"]);
  if (BLOCKED_EXACT.has(host)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Media URL must be public" });
  }

  // 3. IP range check — block ALL private/reserved ranges
  //    Use net.isIP() to detect IP literals, then check ranges
  const ipVersion = net.isIP(host);
  if (ipVersion > 0) {
    // Block: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16, 0.0.0.0/8
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.|0\.)/.test(host)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Media URL must be public" });
    }
    // Block IPv6 mapped: ::ffff:127.0.0.1, ::ffff:10.0.0.1, etc.
    if (/^::ffff:/i.test(host)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "IPv6-mapped addresses not allowed" });
    }
  }

  // 4. Hostname suffix check — block if hostname ends with private IP patterns
  //    Prevents 127.0.0.1.evil.com from passing (resolves to attacker's DNS, but looks suspicious)
  //    This is defense-in-depth, not authoritative
  if (/\.(local|internal|localhost)$/i.test(host)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Media URL must be public" });
  }
}
```

**Layer 2: Node.js MUST NOT fetch user-supplied media URLs**

SmartSpecPro's Node.js process MUST NEVER make HTTP requests to user-supplied media URLs (no preview thumbnails, no content-type sniffing, no file size pre-checks). All media URLs are passed as-is to Upload-Post API in the JSON request body. Upload-Post fetches them server-side.

This eliminates DNS rebinding as an attack vector against SmartSpecPro's infrastructure. DNS rebinding can only target Upload-Post's servers, which is their responsibility.

**Layer 3: Allowlist for known-safe origins (optional enhancement)**

For media URLs from SmartSpecPro's own R2/S3 storage, an allowlist of trusted origin domains can be maintained to fast-path validation:

```typescript
const TRUSTED_MEDIA_ORIGINS = new Set([
  "pub-xxx.r2.dev",           // R2 public bucket
  "smartaihub.app",           // our own domain
]);
```

### 6.6 Input Validation — Platform & Content

```typescript
// Platform names — hard-coded allowlist
const validPlatformEnum = z.enum([
  "tiktok", "instagram", "youtube", "facebook", "twitter",
  "linkedin", "threads", "pinterest", "reddit", "bluesky", "google_business",
]);

// Profile usernames — prevent path traversal
const profileUsernameSchema = z.string().min(1).max(100).regex(/^[\w\-.]+$/);

// Schedule dates — bounded future window
const scheduledAtSchema = z.string().datetime().refine(/* between now and +365 days */);

// Content — size limits
const contentTextSchema = z.string().max(10000);
const titleSchema = z.string().max(500);
```

### 6.7 JWT Flow Security (CSRF + Nonce + Redirect Validation)

The JWT URL generation flow MUST include:

1. **Redirect URL allowlist** — NEVER forward user-provided redirect URLs to Upload-Post:

```typescript
// Server-side: always use our hardcoded callback URL
const SAFE_REDIRECT = "https://smartaihub.app/settings/upload-post/callback";

generateJwt: protectedProcedure.mutation(async ({ ctx, input }) => {
  // 1. Generate nonce bound to user session
  const nonce = crypto.randomBytes(16).toString("hex");
  await redis.set(`upload_post_jwt_nonce:${ctx.user.id}:${nonce}`, "1", "EX", 3600);

  // 2. Embed nonce in redirect URL
  const redirectUrl = `${SAFE_REDIRECT}?nonce=${nonce}`;

  // 3. Call Upload-Post with our controlled redirect
  const result = await client.generateJwt(input.profileUsername, {
    redirectUrl,
    // platform filtering if needed
  });

  return { url: result.url };
});

// Callback route verifies nonce
app.get("/settings/upload-post/callback", async (req, res) => {
  const { nonce } = req.query;
  const userId = req.session.userId;
  const key = `up_jwt:${userId}:${nonce}`;  // short key prefix (nonce has 128-bit entropy)

  // Atomic single-use consumption — GETDEL prevents race conditions
  const valid = await redis.getDel(key);  // Redis 6.2+ GETDEL or Lua GETDEL equivalent
  if (!valid) return res.status(403).send("Invalid or expired link");

  // Close popup, trigger profile refresh
  // SECURITY: targetOrigin MUST be our exact origin — NEVER '*'
  res.send(`<script>
    if (window.opener) {
      window.opener.postMessage('upload-post-linked', 'https://smartaihub.app');
    }
    window.close();
  </script>`);
});

// Frontend message handler MUST also verify origin:
// window.addEventListener('message', (event) => {
//   if (event.origin !== 'https://smartaihub.app') return;
//   if (event.data === 'upload-post-linked') { refetchProfiles(); }
// });
```

2. **CSRF protection** — The `generateJwt` mutation is already protected by tRPC's session cookie requirement (SameSite=Lax), but the callback endpoint MUST verify the nonce.

3. **Popup isolation** — JWT URL opens in a new popup window (`window.open`), not an iframe, to prevent clickjacking.

### 6.8 Secrets in Transit

**Rule: Decrypted API key NEVER leaves the Node.js process.**

- All Upload-Post API calls happen in Node.js `UploadPostClient` over HTTPS
- API key is decrypted per-request from the DB, used for the HTTP call, then discarded
- For large video uploads (>50MB, Phase 3), use internal delegation token pattern:

**Delegation Token Exchange Protocol:**

```
1. Node.js generates token: nanoid(32) (~190 bits entropy)
2. Store in Redis: SET "up_deleg:{token}" "{connectionId}" EX 300 (5-min TTL)
3. Pass token to Python via Celery task args (NOT the API key)
4. Python calls Node.js internal endpoint to exchange token for decrypted key
5. Node.js returns key ONLY if all checks pass
6. Token is consumed atomically (single-use)
```

**Internal exchange endpoint specification:**

```typescript
// Bound to 127.0.0.1 ONLY — NEVER 0.0.0.0
// Path: POST /api/internal/upload-post/exchange-token
// Auth: x-internal-token header = SMARTSPEC_WEB_GATEWAY_TOKEN (from .env)
// Body: { token: string }

app.post("/api/internal/upload-post/exchange-token", async (req, res) => {
  // 1. Verify internal token
  if (req.headers["x-internal-token"] !== process.env.SMARTSPEC_WEB_GATEWAY_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // 2. Atomic single-use consumption (GETDEL — prevents race condition)
  const connectionId = await redis.getDel(`up_deleg:${req.body.token}`);
  if (!connectionId) return res.status(404).json({ error: "Token not found or expired" });

  // 3. Decrypt and return API key
  const connection = await db.select(...).from(uploadPostConnections).where(eq(id, connectionId));
  const apiKey = decrypt(connection.encryptedApiKey);

  // 4. Return over loopback only
  res.json({ apiKey });
  // Key is NOT logged, NOT cached
});
```

**Security constraints:**
- Endpoint binds to `127.0.0.1` only (not `0.0.0.0`)
- Requires `SMARTSPEC_WEB_GATEWAY_TOKEN` header (existing secret in `.env`)
- Token is consumed atomically via `GETDEL` — second exchange returns 404
- 5-minute TTL prevents stale tokens from accumulating
- API key is NEVER stored in Celery task arguments, Redis values, or log output

### 6.9 Error Sanitization

Upload-Post error responses MUST be sanitized before:
- Returning to client (map to internal error codes)
- Storing in `upload_post_jobs.errorMessage` (strip emails, tokens, account details)
- Logging to audit trail (log operation + status code, not raw body)

```typescript
// Two-tier sanitization:

// Tier 1: For client-facing error messages (aggressive — safe for browser)
function sanitizeForClient(statusCode: number): string {
  const clientMessage: Record<number, string> = {
    401: "Upload-Post API key is invalid or expired",
    403: "Insufficient permissions on your Upload-Post account",
    404: "Resource not found on Upload-Post",
    429: "Upload-Post rate limit reached. Please try again later.",
  };
  return clientMessage[statusCode] ?? "Upload-Post request failed";
}

// Tier 2: For DB storage (less aggressive — preserves diagnostic context)
function sanitizeForStorage(rawError: unknown): string {
  if (typeof rawError !== "string") return "Upload-Post request failed";
  return rawError
    .replace(/[\w.-]+@[\w.-]+\.\w+/g, "[email]")                    // strip emails
    .replace(/\b(sk_|apikey_|token_|Bearer\s)[A-Za-z0-9_-]+/gi, "[redacted-key]") // strip known key prefixes
    .replace(/\b[0-9a-f]{40,}\b/gi, "[redacted-hex]")               // strip long hex (SHA, tokens)
    .substring(0, 500);                                               // truncate
  // NOTE: Intentionally does NOT strip general alphanumeric strings —
  // "PLATFORM_RATE_LIMIT_EXCEEDED" is a useful error code, not a token
}
```

---

## 7. Feature Flag

```typescript
// In featureFlags.ts — FAIL-CLOSED default
UPLOAD_POST_GATEWAY_ENABLED: boolean  // default: false

// MUST use strict helper that defaults to false (not the generic getTenantFeatureFlag which defaults true):
async function isUploadPostEnabled(tenantId: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const tenantVal = await redis.get(`feature-flag:UPLOAD_POST_GATEWAY_ENABLED:${tenantId}`);
    if (tenantVal !== null) return tenantVal === "true";
    const globalVal = await redis.get("feature-flag:UPLOAD_POST_GATEWAY_ENABLED");
    if (globalVal !== null) return globalVal === "true";
  } catch { /* Redis down — fail closed */ }
  return process.env.UPLOAD_POST_GATEWAY_ENABLED === "true"; // explicit opt-in only
}
```

**Enforcement: Middleware, NOT per-procedure checks.**

All 17+ procedures use a shared middleware wrapper — feature flag is checked ONCE:

```typescript
// Define uploadPostProcedure as middleware wrapper
const uploadPostProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const enabled = await isUploadPostEnabled(ctx.tenantId);
  if (!enabled) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Upload-Post gateway is not enabled" });
  }
  return next();
});

// All procedures use uploadPostProcedure instead of protectedProcedure:
uploadPost.connect = uploadPostProcedure.input(...).mutation(...);
uploadPost.publish = uploadPostProcedure.input(...).mutation(...);
// etc.
```

When disabled:
- Upload-Post settings tab hidden
- Gateway selector defaults to "native" only
- Upload-Post gateway option hidden in workflow builder
- All `uploadPost.*` tRPC procedures return `FORBIDDEN` (via middleware)

---

## 8. Migration & Rollout Plan

### Phase 1: Foundation (MVP)
1. Feature flag (fail-closed)
2. DB schema — 3 new tables (Drizzle schema + migration)
3. `UploadPostClient` service with timeout + error sanitization
4. tRPC router — connect/disconnect/validate/getConnection
5. Settings UI — API key management + disclosure banner
6. Rate limiting middleware
7. Audit event types registered

### Phase 2: Publishing
1. Profile management (create/list/delete) with userId enforcement + API ownership validation
2. JWT-based social account connection (CSRF + nonce + postMessage origin restriction)
3. Publish flow — photo/text via Upload-Post + video capped at 50MB (SSRF-validated media URLs)
4. Status tracking — batched client polling + background sweep cron (including scheduled jobs)
5. Job history — two-tab MVP ("Direct Posts" / "Upload-Post")
6. Publishing UI extension in SocialPublishing.tsx with gateway selector
7. `UploadPostDispatcher` service (parallel path, NOT SocialProviderAdapter)

### Phase 3: Advanced
1. Delegation token exchange endpoint (REQUIRED before removing 50MB video cap)
2. Large video upload support (>50MB via delegation token)
3. Scheduling & queue management
4. Platform resource discovery (pages/boards)
5. Workflow/agency integration with owner userId resolution
6. Analytics retrieval
7. Cancel/edit scheduled posts

### Phase 4: Polish
1. Daily key revalidation cron (with jitter + 3-strike rule)
2. Monthly quota tracking & warning
3. Master key re-encryption script
4. Help documentation page
5. Comprehensive monitoring dashboards

---

## 9. Testing Strategy

### Unit Tests
- `UploadPostClient` — mock HTTP calls, verify request/response mapping, timeout handling, error sanitization
- tRPC router procedures — mock client, verify auth/validation, Zod schema enforcement, userId scoping
- SSRF validation — test against all blocked host patterns
- Rate limiting — verify per-user limits enforced
- JWT nonce — verify nonce generation, storage, validation, expiry
- Platform allowlist — verify rejection of invalid platform names
- Error sanitization — verify email/token stripping

### Integration Tests
- Full publish flow: create connection → create profile → publish → poll status → see in history
- JWT generation → popup flow → callback nonce verification → profile refresh
- Concurrent native + Upload-Post publishing (verify no interference)
- Error handling: invalid key, rate limit, platform-specific failures, Upload-Post downtime
- Feature flag: verify all endpoints blocked when disabled
- Cross-user isolation: verify User A cannot access User B's profiles

### E2E Tests
- Settings: add API key → validate → see profiles → connect social accounts
- Publish: create post → select Upload-Post → select platforms → publish → see status update
- Schedule: create scheduled post → see in schedule list → cancel
- Disconnect: remove API key → verify all data cascades

---

## 10. Monitoring & Observability

### Audit Events (add to `AuditEventType` union in `auditLogger.ts`)

```typescript
| "upload_post.connect"
| "upload_post.disconnect"
| "upload_post.key_validated"
| "upload_post.key_invalid"
| "upload_post.publish"
| "upload_post.status"
| "upload_post.error"
| "upload_post.rate_limit"
| "upload_post.jwt_generated"
| "upload_post.profile_created"
| "upload_post.profile_deleted"
```

Each event includes `metadata: { connectionId, profileUsername }` — NEVER includes `apiKey`, `encryptedApiKey`, or Upload-Post account email.

### Metrics
- `upload_post.requests_total` — total API calls by endpoint
- `upload_post.publish_latency_ms` — publish request duration
- `upload_post.errors_by_type` — error breakdown (401/403/429/500)
- `upload_post.platform_usage` — posts per platform via Upload-Post
- `upload_post.active_connections` — gauge of active connections per tenant
- `upload_post.quota_usage_pct` — monthly quota utilization

---

## 11. Comparison: Native vs Upload-Post Gateway

| Aspect | Native Providers | Upload-Post Gateway |
|--------|-----------------|---------------------|
| OAuth | Per-platform, managed by us | Upload-Post manages all OAuth |
| Platform coverage | Meta, TikTok, YouTube | 10+ platforms including Pinterest, Reddit, Bluesky |
| Token refresh | Our responsibility | Upload-Post's responsibility |
| Media processing | Our pipeline (FFmpeg, Celery) | Our pipeline → Upload-Post receives URL |
| Scheduling | Our scheduler | Upload-Post scheduler + queue system |
| Analytics | Per-provider API calls | Unified Upload-Post analytics API |
| Cost | Free (API costs only) | Upload-Post subscription (free tier: 10/mo) |
| Latency | Direct API call | Extra hop through Upload-Post |
| Control | Full control over OAuth tokens | Tokens managed by third party |
| Setup complexity | Complex (OAuth per platform) | Simple (one API key) |
| Data residency | Our servers only | Content passes through Upload-Post servers |
| Blast radius | Limited to one platform per breach | All connected platforms exposed if Upload-Post compromised |

Users benefit from having both options — native for high-volume/low-latency needs and full control, Upload-Post for breadth, simplicity, and platforms we don't natively support.

---

## 12. Data Retention & Cleanup

- `upload_post_jobs` older than **90 days** with `status IN ('completed', 'failed', 'cancelled')` → auto-delete (cron job)
- `upload_post_jobs.platformResults` and `metadata` → retained only for 30 days, then nullified (reduce storage)
- On `uploadPost.disconnect` → CASCADE deletes all profiles and jobs (DB FK constraints)
- Audit events: `upload_post.publish` and `upload_post.error` events MUST be stored in `apiAuditEvents` DB table (persistent) in addition to JSONL files. This ensures audit trail survives JSONL file cleanup (default 30 days)
- For EU/PDPA tenants: `AUDIT_LOG_RETENTION_DAYS` MUST be set to at least 90 days to maintain parity with job record retention
- Shared Upload-Post account warning: If two users in the same tenant connect the same Upload-Post API key, the UI shows a warning that they share queue settings and upload quota

---

## 13. Open Questions

1. **Upload-Post webhook support** — Should we implement webhook ingestion (`/uploadposts/users/notifications`) in Phase 2 instead of polling? Would reduce API calls but requires exposing a public endpoint.
2. **Credit system integration** — Should Upload-Post publishes consume SmartSpecPro credits? Or is the Upload-Post subscription cost sufficient?
3. **Multi-tenant key sharing** — Should tenant admins be able to set a shared Upload-Post API key for all users in a tenant? (Currently per-user only.)
4. **Upload-Post profile auto-creation** — Should we auto-create an Upload-Post profile on first connect, or let users manage profiles manually?
