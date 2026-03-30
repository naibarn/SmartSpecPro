# Section 12 — Agency Tool

## Dependencies
- **section-01-db-schema**: Social tables for query operations
- **section-03-meta-graph-client**: `MetaGraphClient` for provider API calls
- **section-06-inbox-backend**: `socialInboxService.ts` for conversation/message queries

## Overview

This section adds `builtin-meta-channels` as an agency tool so AI agents can read inbox, send replies, publish posts, read comments, and reply to comments on connected Facebook Pages. It registers the tool definition in the tRPC `listTools` procedure, maps it in the Python `agency_tools.py`, and creates the internal tool endpoint.

---

## Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/server/routers/agency.ts` | Modify | Add `builtin-meta-channels` to `listTools` |
| `apps/web/server/_core/index.ts` | Modify | Register Express route `/api/internal/tools/meta-channels` (NOT tRPC — matches existing internal tool pattern) |
| `apps/web/server/routes/internalSocialTool.test.ts` | Create | Tests |
| `python-backend/app/services/agency_tools.py` | Modify | Add endpoint + risk level mappings |
| `python-backend/tests/unit/services/test_agency_tools_meta.py` | Create | Python-side tests |
| `apps/web/server/index.ts` or `apps/web/server/routers.ts` | Modify | Register Express route |

---

## Tests First

### Internal Endpoint Tests (`apps/web/server/routers/internalSocialTool.test.ts`)
```
# Test: POST /api/internal/tools/meta-channels requires X-Internal-Token header
# Test: rejects invalid X-Internal-Token with 401
# Test: read_inbox action returns recent conversations for configured pageId
# Test: send_reply action sends message via python-backend
# Test: send_reply respects requireApproval config (returns approval_needed instead of sending)
# Test: publish_post action creates and publishes post
# Test: read_comments action returns recent comments
# Test: reply_comment action replies to specified comment
# Test: rejects action not in allowedActions config
# Test: rejects when pageId is not provided in tool config
```

### Python Agency Tests (`python-backend/tests/unit/services/test_agency_tools_meta.py`)
```
# Test: builtin-meta-channels exists in _BUILTIN_ENDPOINTS dict
# Test: builtin-meta-channels risk level is "medium"
# Test: tool bridge routes to /api/internal/tools/meta-channels
```

---

## Implementation Guidance

### Tool Definition in `listTools` (agency.ts)

Add to the builtin tools array in the `listTools` procedure:

```typescript
{
  id: "builtin-meta-channels",
  name: "Meta Channels",
  description: "Send messages, publish posts, read inbox, and manage comments on connected Facebook Pages",
  toolType: "builtin",
  riskLevel: "medium",
  icon: "share-2",
  category: "social",
  requiresApproval: false,
  configSchema: {
    fields: [
      {
        key: "pageId",
        label: "Connected Page",
        type: "select",
        required: true,
        optionsEndpoint: "/api/v1/social/connected-pages",
      },
      {
        key: "allowedActions",
        label: "Allowed Actions",
        type: "multiselect",
        required: true,
        options: [
          { label: "Read Inbox", value: "read_inbox" },
          { label: "Send Reply", value: "send_reply" },
          { label: "Publish Post", value: "publish_post" },
          { label: "Read Comments", value: "read_comments" },
          { label: "Reply to Comments", value: "reply_comment" },
        ],
        default: ["read_inbox"],
      },
      {
        key: "requireApproval",
        label: "Require Approval for Outbound",
        type: "toggle",
        default: true,
      },
    ],
  },
}
```

### Python Registration (`agency_tools.py`)

Add to `_BUILTIN_ENDPOINTS`:
```python
"builtin-meta-channels": "/api/internal/tools/meta-channels",
```

Add to `_BUILTIN_RISK_LEVELS`:
```python
"builtin-meta-channels": "medium",
```

### Internal Endpoint: `internalSocialTool.ts`

Express handler registered at `POST /api/internal/tools/meta-channels`.

**Auth**: Verify `X-Internal-Token` via `crypto.timingSafeEqual()`.

**Input schema** (Zod):
```typescript
z.object({
  action: z.enum(["read_inbox", "send_reply", "publish_post", "read_comments", "reply_comment"]),
  pageId: z.number(),
  conversationId: z.number().optional(),
  messageBody: z.string().optional(),
  contentText: z.string().optional(),
  contentLink: z.string().optional(),
  commentId: z.number().optional(),
  // Tool config (injected by agency_tools.py)
  allowedActions: z.array(z.string()).optional(),
  requireApproval: z.boolean().optional(),
})
```

**Action routing:**

1. **Validate**: Check `action` is in `allowedActions` config. If not, return `{ error: "Action not permitted by tool configuration" }`.

2. **`read_inbox`**: Query `socialConversations` WHERE `pageId`, limit 10, return `[{customerName, lastMessage, status, unreadCount}]`.

3. **`send_reply`**: If `requireApproval`, return `{ status: "approval_needed", message: "Outbound actions require human approval" }`. Otherwise, use `socialInboxService.sendMessageViaPythonBackend()` to send.

4. **`publish_post`**: Same approval check. Call publish flow from `socialPublishing` service.

5. **`read_comments`**: Query `socialComments` WHERE `pageId`, limit 20, return recent comments.

6. **`reply_comment`**: Same approval check. Call comment reply via python-backend.

**Response format**: Always JSON `{ success: boolean, data?: any, error?: string }`.

### Security (CRITICAL FIX from review)

- **Config injection prevention:** `allowedActions` and `requireApproval` are **NOT accepted from the request body**. They are loaded from `agencyAgentTools.toolConfig` in the database using the `X-Agent-Tool-Id` header (set by `agency_tools.py`, trusted). The LLM cannot inject `requireApproval: false`.
- `requireApproval` defaults to `true` — the LLM agent cannot send messages or publish without explicit opt-out by the agency builder
- `allowedActions` restricts what the agent can do, preventing scope creep
- Approval enforcement happens BEFORE any call to python-backend — if approval required, return `{ status: "approval_needed" }` without making any outbound call
- All operations are tenant-scoped via the page's tenantId
- Token decryption happens in python-backend only, never in Node.js
- `contentLink` validated as HTTPS-only with RFC 1918 blocking (SSRF prevention)
