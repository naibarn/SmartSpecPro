# Section 10 — Comments & Moderation

## Dependencies
- **section-01-db-schema**: `socialComments`, `socialCommentActions` tables
- **section-02-feature-flag-menu**: `/social/moderation` route, `META_CHANNELS_ENABLED` flag
- **section-03-meta-graph-client**: `MetaGraphClient.get_comments()`, `reply_to_comment()`, `hide_comment()`, `delete_comment()`

## Overview

This section implements comment management: a tRPC router (`socialModeration.ts`) for listing, replying to, hiding, and deleting comments; a `SocialModeration.tsx` frontend page; and Python internal endpoints for comment API calls.

---

## Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/server/routers/socialModeration.ts` | Create | tRPC router |
| `apps/web/server/routers/__tests__/socialModeration.test.ts` | Create | Tests |
| `apps/web/client/src/pages/SocialModeration.tsx` | Modify | Replace stub |
| `python-backend/app/api/meta_comments.py` | Create | Internal comment endpoints |
| `apps/web/server/routers.ts` | Modify | Register `socialModerationRouter` |

---

## Tests First

### tRPC Router Tests (`apps/web/server/routers/__tests__/socialModeration.test.ts`)
```
# Test: listComments returns paginated comments for a page
# Test: listComments scopes by tenantId
# Test: replyToComment calls python-backend and creates socialCommentActions record
# Test: replyToComment rejects cross-tenant access
# Test: hideComment sends hide request and updates comment status to "hidden"
# Test: hideComment creates socialCommentActions record with actionType="hide"
# Test: deleteComment sends delete request and updates comment status to "deleted"
# Test: deleteComment creates socialCommentActions record with actionType="delete"
# Test: all actions reject when page belongs to different tenant
# Test: all procedures reject when META_CHANNELS_ENABLED is false
```

---

## Implementation Guidance

### tRPC Router: `socialModeration.ts`

All procedures use `protectedProcedure` with `META_CHANNELS_ENABLED` middleware.

**Procedures:**

- **`listComments`**: Input `{ pageId, cursor?, limit }`. Query `socialComments` WHERE `tenantId` AND `pageId`, ordered by `createdAt DESC`. Return paginated results with author name, body, status, post reference.

- **`replyToComment`**: Input `{ commentId, body: z.string().min(1).max(2000) }`. Load comment, verify tenant. Decrypt page token. POST to `python-backend /api/internal/meta/comments/reply` with `{ object_id: providerCommentId, message: body, page_access_token }`. Insert `socialCommentActions` with `actionType="reply"`. Write audit log.

- **`hideComment`**: Input `{ commentId }`. Same validation. POST to `/api/internal/meta/comments/hide`. Update `socialComments.status = "hidden"`, `lastAction = "hide"`. Insert `socialCommentActions`.

- **`deleteComment`**: Input `{ commentId }`. Same validation. POST to `/api/internal/meta/comments/delete`. Update `socialComments.status = "deleted"`, `lastAction = "delete"`. Insert `socialCommentActions`.

### Python Endpoints: `meta_comments.py`

FastAPI router at `/api/internal/meta/comments`. All endpoints verify `X-Internal-Token`.

- **`POST /reply`**: Body `{ object_id, message, page_access_token, page_id }`. Create `MetaGraphClient`, call `reply_to_comment()`. Return result.
- **`POST /hide`**: Body `{ comment_id, page_access_token, page_id }`. Call `hide_comment()`.
- **`POST /delete`**: Body `{ comment_id, page_access_token, page_id }`. Call `delete_comment()`.

### Frontend: `SocialModeration.tsx`

Replace the stub with:

- Page filter dropdown (connected pages with `selectedForModeration=true`)
- Comment table: Author, Comment text (truncated), Post reference, Status badge, Date, Actions
- Action buttons per row: Reply (opens modal), Hide (confirmation), Delete (confirmation dialog)
- Reply modal: text input + send button
- Status badges: visible (green), hidden (amber), deleted (red)
- Cursor-paginated with "Load More"

**Data:** Uses `trpc.socialModeration.*` hooks.
