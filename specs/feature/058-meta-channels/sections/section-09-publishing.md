# Section 09 — Publishing

## Dependencies
- **section-01-db-schema**: `socialPosts` table
- **section-02-feature-flag-menu**: `/social/publishing` route, `META_CHANNELS_ENABLED` flag
- **section-03-meta-graph-client**: `MetaGraphClient.create_post()`, `get_page_feed()`

## Overview

This section implements the Page post publishing system: a tRPC router (`socialPublishing.ts`) for draft/schedule/publish/cancel operations, the `SocialPublishing.tsx` frontend page with a post composer and history table, and a Celery task for scheduled post publishing.

---

## Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/server/routers/socialPublishing.ts` | Create | tRPC router |
| `apps/web/server/routers/__tests__/socialPublishing.test.ts` | Create | Router tests |
| `apps/web/client/src/pages/SocialPublishing.tsx` | Modify | Replace stub with full implementation |
| `python-backend/app/api/meta_posts.py` | Create | Internal post endpoints |
| `python-backend/app/tasks/social_publish_task.py` | Create | Scheduled post publisher |
| `python-backend/tests/unit/tasks/test_social_publish_task.py` | Create | Task tests |
| `apps/web/server/routers.ts` | Modify | Register `socialPublishingRouter` |

---

## Tests First

### tRPC Router Tests (`apps/web/server/routers/__tests__/socialPublishing.test.ts`)
```
# Test: createDraft creates post with status "draft" and correct tenantId
# Test: publishNow calls python-backend and updates status to "published"
# Test: publishNow stores providerPostId on success
# Test: publishNow sets status to "failed" on provider error
# Test: schedulePost validates scheduledAt is 10min-30days in future
# Test: schedulePost rejects past dates
# Test: schedulePost sets status to "scheduled"
# Test: listPosts returns paginated results filtered by status
# Test: listPosts scopes by tenantId
# Test: cancelScheduledPost sets status to "draft"
# Test: cancelScheduledPost rejects non-scheduled posts
# Test: all procedures reject when META_CHANNELS_ENABLED is false
```

### Celery Task Tests (`python-backend/tests/unit/tasks/test_social_publish_task.py`)
```
# Test: publish_scheduled_posts queries posts with scheduledAt <= now and status "scheduled"
# Test: publish_scheduled_posts calls MetaGraphClient.create_post for each
# Test: publish_scheduled_posts updates status to "published" and sets providerPostId
# Test: publish_scheduled_posts updates status to "failed" on API error
# Test: publish_scheduled_posts skips posts for disconnected pages
```

---

## Implementation Guidance

### tRPC Router: `socialPublishing.ts`

All procedures use `protectedProcedure` with `META_CHANNELS_ENABLED` middleware.

**Procedures:**

- **`createDraft`**: Input `{ pageId, contentText, contentLink? }`. Insert `socialPosts` with `status="draft"`, `createdByUserId`. Validate page belongs to tenant.

- **`publishNow`**: Input `{ postId }`. Load post, verify tenant. Decrypt page token. POST to `python-backend /api/internal/meta/posts/publish` with `{ page_id, page_access_token, message, link }`. On success: update `status="published"`, `providerPostId`, `publishedAt=now()`. On failure: update `status="failed"`, `errorMessage`.

- **`schedulePost`**: Input `{ postId, scheduledAt: z.string().datetime() }`. Validate: `scheduledAt` must be >= now+10min and <= now+30days (Meta constraint). Update `status="scheduled"`, `scheduledAt`.

- **`listPosts`**: Input `{ pageId?, status?, cursor?, limit }`. Cursor-paginated query on `socialPosts` WHERE `tenantId`, ordered by `createdAt DESC`.

- **`cancelScheduledPost`**: Input `{ postId }`. Verify `status === "scheduled"`. Update to `status="draft"`, clear `scheduledAt`.

### Python Endpoints: `meta_posts.py`

FastAPI router at `/api/internal/meta/posts`. All endpoints verify `X-Internal-Token`.

- **`POST /publish`**: Body `{ page_id, page_access_token, message, link?, scheduled_publish_time? }`. Create `MetaGraphClient`, call `create_post()`. Return `{ post_id, provider_post_id }`.

- **`POST /schedule`**: Same as publish but with `scheduled_publish_time` parameter.

### Celery Task: `social_publish_task.py`

**`publish_scheduled_posts`** — Celery beat task, runs every 60s:
1. Query `socialPosts` WHERE `status="scheduled"` AND `scheduledAt <= now()`
2. For each post: load page, verify `status="active"`, decrypt token
3. Call `MetaGraphClient.create_post(message, link)`
4. Update: `status="published"`, `providerPostId`, `publishedAt=now()`
5. On error: `status="failed"`, `errorMessage=str(e)`

Register in `celery_app.py` beat_schedule and task_routes (queue: `social`).

### Frontend: `SocialPublishing.tsx`

Replace the stub with:

**Post Composer Section:**
- Page selector dropdown (connected pages with `selectedForPublishing=true`)
- `Textarea` for post content with character count
- Optional URL link input field
- "Publish Now" button (primary)
- "Schedule" button (outline) → opens date/time picker, validates 10min-30day range

**Post History Section:**
- Table with columns: Status badge, Content preview (truncated), Page name, Created date, Published/Scheduled date
- Status filter tabs: All, Draft, Scheduled, Published, Failed
- Cancel action button for scheduled posts
- Cursor-paginated with "Load More"

**Data:** Uses `trpc.socialPublishing.*` hooks via TanStack Query.
