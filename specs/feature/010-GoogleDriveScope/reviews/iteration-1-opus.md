# Implementation Plan Review: Google Drive & Google Workspace Integration

## Reviewer: Claude Opus (Subagent)
## Date: 2026-02-14

---

## Critical Issues

### 1. `library_links` Unique Index Will Break Multi-Tenant Deduplication

**Section 9 (Virtual Document References)** states: "Uses dedup via `library_links` to prevent duplicate references for the same Drive file." However, the current `library_links` table has a global unique index on `(linkType, linkId)`:

```
/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts:1542
  uniqueIndex("library_links_source_unique").on(t.linkType, t.linkId),
```

The `library_links` table has no `tenantId` column at all. This means if User A in Tenant 1 and User B in Tenant 2 both have the same Google Drive file (same `driveFileId`), the second insert will fail with a unique constraint violation. Even within the same tenant, two users sharing the same Drive file cannot both create virtual references.

**Action required:** The plan must either (a) add `tenantId` and `userId` columns to `library_links` and change the unique index to `(linkType, linkId, tenantId, userId)`, or (b) document that dedup is per-system (not per-user) and clarify the conflict resolution strategy. This is a blocking schema design problem.

### 2. `creditTransactions` Table Lacks `idempotencyKey` Column

**Section 4** proposes: "add `idempotencyKey` support to `deductCredits()` with Redis dedup cache (24h TTL) + UNIQUE DB constraint." The current `creditTransactions` table at `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts:170-203` has no `idempotencyKey` column and no unique constraint for it.

This requires a schema migration to add the column plus a unique index. The plan should explicitly list this as a database schema change in Section 3, not bury it inside the billing section. Per the project's Database Safety Protocol, this needs backup procedures and risk classification.

**Action required:** Move the `idempotencyKey` schema change into Section 3 (Database Schema). Also clarify: is the UNIQUE constraint on `(tenant_id, idempotency_key)` or just `(idempotency_key)` globally? The `creditTransactions` table has no `tenantId` column either, so this needs careful thought.

### 3. `tenantId` Type Inconsistency Across Schema

Examining the existing schema, `tenantId` is inconsistently typed:
- Some tables use `integer("tenantId")` (e.g., `galleryItems` at line 274)
- Library tables use `varchar("tenant_id", { length: 36 })` (e.g., `libraryItems` at line 1506)
- The `tenants.id` PK is `varchar("id", { length: 36 })`

The plan proposes new tables `google_drive_sync_state` and `google_drive_edit_sessions` with a `tenantId` column but does not specify the type. If the implementer follows the integer pattern from older tables, it will fail because `tenants.id` is a varchar. The plan must specify `varchar("tenant_id", { length: 36 })` to match library-related tables.

### 4. OAuth Token Storage Architecture Conflict

**Section 2** says tokens are stored encrypted in `oauth_connections`. Looking at `/home/dev/projects/SmartSpecPro/python-backend/app/models/oauth.py`, the `OAuthConnection` model stores `access_token` and `refresh_token` as `Text` columns, with a comment saying "encrypted in production." However, the model currently has no `scopes` field, no `connection_status` field (needed for the "expired" state from Section 2), and no `tenant_id` field.

The plan references updating connection status to "expired" when `invalid_grant` occurs, but there is no `status` column on `oauth_connections`. The plan also does not mention adding scopes tracking to `oauth_connections`, even though Section 15 says "verify that access tokens have required scopes before making API calls."

**Action required:** Add explicit schema changes for `oauth_connections` to Section 3: a `status` column (enum: active/expired/revoked), a `scopes` column (text/array storing granted scopes), and a `tenant_id` column if multi-tenant isolation is needed at the OAuth level.

## Significant Design Concerns

### 5. Webhook Endpoint Security Is Underspecified

**Section 11** proposes a webhook handler at `https://smartaihub.app/api/webhooks/gdrive`. The plan says Section 15 will handle CSRF protection by "validating `x-goog-channel-token`." However:

- Google Drive push notifications are unauthenticated POST requests to your endpoint. The only validation mechanism is the `X-Goog-Channel-Token` header (a secret you set during `changes.watch()`). The plan does not specify how this token is generated, what entropy it has, or where it is stored.
- The webhook endpoint is an Express route, not a tRPC procedure, so it bypasses all existing tRPC auth middleware. The plan lists `apps/web/server/routes/webhooks.ts` as a new file but does not explain how it integrates with the Express app in `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts`.
- The webhook must also validate `X-Goog-Channel-ID` and `X-Goog-Resource-ID` against stored values in `google_drive_sync_state` to prevent spoofing.
- Google requires the webhook to return 200 within a few seconds, or it will stop sending notifications. The plan should explicitly state that the webhook handler must be non-blocking (enqueue work, do not process inline).

**Action required:** Add a dedicated subsection to Section 11 or Section 15 specifying webhook token generation (cryptographically random, at least 32 bytes), request validation (channel_id + resource_id + token triple), response time requirements, and body parsing behavior.

### 6. `drive.file` Scope Is Insufficient for the Stated Use Cases

**Section 15** suggests: "Consider starting with `drive.file` only and adding `drive.readonly` after verification." However, `drive.file` scope only provides access to files that the application has created or opened. This makes the following features impossible:

- **Section 11 (Incremental Sync):** Cannot list or index any existing Drive files. Only files uploaded via the "Edit in Google" feature (Section 6) would be visible.
- **Section 7 (MCP Server):** `search_drive_files` and `list_drive_folder` would return essentially nothing -- only app-created temp files.
- **Section 10 (Federated Search):** The Drive API search leg would return no useful results.

The plan should clearly state that Phase 1 with `drive.file` only would support just Section 6 (Edit in Google). All of Sections 7, 9, 10, and 11 require `drive.readonly` and are blocked until Google verification completes. The implementation order should reflect this reality.

### 7. Edit Session Cleanup Has a Data Loss Risk

**Section 6** states: "Auto-expire stale edit sessions after 24 hours via a periodic Celery task." If a user is actively editing in Google Docs but does not click "Save back" within 24 hours, the system will:
1. Delete the temp Drive file (destroying their work)
2. Mark the session as expired

There is no warning before expiry, no extension mechanism, and no "last modified" check on the Drive file. If the user spent hours editing a complex document, this is data loss.

**Action required:** Before auto-expiring, the cleanup task should check `files.get(fileId, fields='modifiedTime')` to see if the file has been modified. If it was modified recently (within the last 2 hours), extend the expiry. Also, send a notification to the user 2 hours before expiry giving them a chance to save back.

### 8. Federated Search Latency Concerns

**Section 10** runs three search backends in parallel: local DB, vector store, and Google Drive API. The Google Drive API search has high and variable latency (200ms-2000ms depending on query complexity and Google's load). The current library search likely completes in under 100ms.

The plan does not specify:
- A timeout for the Drive API leg (what happens if it takes 5+ seconds?)
- Whether partial results are returned if one leg fails/times out
- A fallback strategy (return local-only results with a "Drive results loading..." indicator?)

**Action required:** Add per-leg timeouts (e.g., 3 seconds for Drive API). Specify graceful degradation: return local results immediately, append Drive results when available (either via SSE/streaming or a "results may be incomplete" flag).

### 9. Budget Tracking Is Tied to `google_drive_sync_state` but Billing Applies to Non-Drive Operations Too

**Section 5 (Monthly Budget Protection)** puts budget tracking in `google_drive_sync_state.credits_used_this_month`. But Section 4 also fixes billing for existing operations (upload indexing, RAG queries) that have nothing to do with Google Drive. These existing operations should also respect budget caps, but the plan ties budget tracking exclusively to the Drive sync state table.

This creates confusion: does the budget cap apply only to Drive operations, or to all indexing/RAG operations? If only Drive, then the existing billing gaps are fixed but uncapped. If all operations, then the budget tracking should not be in a Google-Drive-specific table.

**Action required:** Clarify scope. If budgets should be per-user across all credit operations, create a separate `user_credit_budgets` table or extend the `users` table. If Drive-only, say so explicitly.

### 10. MCP Tool Authentication Flow Is Unclear

**Section 7** says: "Auth injection: tools receive `user_id` from request context (injected by existing MCP gateway auth). Use `GoogleTokenService` to get valid access token."

Looking at the actual MCP infrastructure, the Python `mcp_adapter.py` at `/home/dev/projects/SmartSpecPro/python-backend/app/tools/mcp_adapter.py` is a thin HTTP client that calls back to the Node.js MCP routes. The Node.js MCP routes at `/home/dev/projects/SmartSpecPro/apps/web/server/_core/mcpRoutes.ts` are file-system oriented (workspace files), not external API oriented.

The plan says to create `python-backend/app/mcp/google_drive_mcp.py` with FastMCP tools, but does not explain:
- How the LLM chat system discovers and invokes these new Python-native tools alongside the existing Node.js MCP tools
- Whether these tools are registered in the Node.js MCP registry or only in the Python side
- How user context (JWT, user_id, tenant_id) flows from chat -> LLM -> tool_use -> MCP gateway -> Python MCP tools
- Whether the existing MCP adapter pattern (Python calls Node.js) works in reverse (Node.js chat dispatches to Python tools)

**Action required:** Add a detailed integration diagram showing the tool invocation chain. Specify which process hosts the MCP tool registry, how tool discovery aggregates tools from both Node.js and Python, and how auth context is propagated through each hop.

## Missing Considerations

### 11. No Testing Strategy

The plan has 15 sections but zero mentions of tests. The codebase enforces 80% coverage for Python (`pytest`) and uses Vitest for TypeScript. Given the complexity (OAuth flows, credit billing, webhook handling, token refresh, content extraction), the plan should specify:

- Unit tests for `GoogleTokenService`, `GoogleContentExtractor`, credit billing formulas
- Integration tests for the OAuth flow, webhook validation, and federated search merging
- Edge case tests: expired tokens during sync, partial sync failures, concurrent edit sessions, idempotency key collisions
- Mock strategies for Google APIs (using `responses` or `httpx` mocking in Python)

### 12. No Rollback Strategy

A deployment of this size (12+ new files, 15+ modified files, 2 new DB tables, schema extensions) needs a rollback plan. What happens if the feature needs to be disabled after deployment? The plan should address:

- Feature flag to disable Google Drive integration without code deployment
- How to handle data already in the system (virtual references, vectors, edit sessions) if rolling back
- Whether the credit billing fixes (Section 4) can be deployed independently of the Drive integration

### 13. No Migration Path for Existing Data

When enabling credit billing for existing operations (Section 4), users who were previously not charged will suddenly start being charged. The plan should specify:

- Communication strategy (notify users before enabling billing)
- Grace period or phased rollout
- Whether billing applies retroactively to in-progress index jobs

### 14. Content Extraction Memory/CPU Concerns

**Section 8** describes extracting content from Google Drive files via Docs/Sheets/Slides APIs. For large spreadsheets (100K+ cells) or long documents (100+ pages), the extraction and chunking could consume significant memory in the Python worker process. The plan does not specify:

- Memory limits per extraction job
- Streaming/pagination for large Sheets
- Timeout per file extraction
- Maximum file size before declining to index

The "size guard" in Section 11's sync settings is mentioned briefly but not defined with concrete defaults.

### 15. `oauth_connections` Table Has No Unique Constraint on (user_id, provider)

Looking at `/home/dev/projects/SmartSpecPro/python-backend/app/models/oauth.py`, the `__table_args__` is an empty tuple. There is no unique constraint on `(user_id, provider)`. This means the code could create duplicate OAuth connections for the same user+provider combination, especially during race conditions in the OAuth callback.

**Action required:** Add a unique constraint on `(user_id, provider)` to `OAuthConnection` and add an Alembic migration. Also add upsert logic to the OAuth callback handler to handle reconnection without creating duplicates.

### 16. Disconnect Cleanup Ordering Problem

**Section 14** lists a 10-step cleanup sequence. Step 1 revokes the access token at Google. But Step 8 needs to "cleanup temp Drive files" from edit sessions, which requires a valid access token to call `files.delete()` on Google Drive. If the token is already revoked, the cleanup of temp Drive files will fail silently, leaving orphaned files in the user's Drive.

**Action required:** Reorder the cleanup: delete temp Drive files (Step 8) BEFORE revoking the access token (Step 1).

### 17. Missing `credit_pricing` Category in System Settings Enum

**Section 4** proposes storing pricing parameters under category `credit_pricing` in `system_settings`. The current `settingCategorySchema` at `/home/dev/projects/SmartSpecPro/apps/web/server/routers/systemSettings.ts:17` is:

```typescript
const settingCategorySchema = z.enum(["stripe", "invoice", "email", "general", "oauth", "ai", "telegram", "vectordb"]);
```

The plan does not mention adding `"credit_pricing"` to this enum. This is a simple fix but easy to miss.

### 18. Webhook URL Requires Nginx Configuration Update

The webhook endpoint `https://smartaihub.app/api/webhooks/gdrive` requires Nginx to proxy this path to the Node.js backend. The plan lists affected files but does not include `nginx/conf.d/dev-host.conf`. Per the project's deployment rules, Nginx is the only public-facing ingress point. If the webhook path is not explicitly proxied, Google's POST requests will return 404 or be misrouted.

## Minor Issues

### 19. Inconsistent Chunking Parameters

The plan states "200-500 token chunks with 50-100 token overlap" in Section 8, but the existing RAG pipeline (per research findings) uses "500 char chunks, 80 char overlap." These are different units (tokens vs. characters, roughly 1 token = 4 characters). The plan should specify whether to align with existing chunking parameters or explicitly justify the difference and handle the mixed-parameter vector store.

### 20. No Mention of Google API Client Library

The plan describes building raw HTTP calls for Google APIs (constructing OAuth URLs with string concatenation, as seen in the existing `oauth.py`). For the Drive API v3, Docs API, Sheets API, and Slides API, the plan should specify whether to use the `google-api-python-client` and `google-auth` libraries or continue with raw HTTP. Using the official client libraries provides automatic retry, pagination handling, and type-safe request building, significantly reducing implementation effort and bugs.

### 21. `library_links.linkId` Length Constraint

The `linkId` column is `varchar(128)`. Google Drive file IDs are typically 44 characters, so this should be fine. But if the plan includes storing composite identifiers (e.g., `gdrive:{tenantId}:{fileId}`), 128 characters may be tight with long tenant IDs. Worth confirming.

### 22. Spec vs Plan Inconsistency on Alert Thresholds

The spec (`claude-spec.md`) mentions a single 80% threshold for budget alerts. The research document (`claude-research.md`) recommends four tiers: 50%, 75%, 90%, 100%. The plan (`claude-plan.md`) Section 5 only implements the 80% and 100% thresholds. The plan should explicitly state which tier model is being implemented and why.

## Summary of Priority Actions

| Priority | Issue | Section Affected |
|----------|-------|-----------------|
| **BLOCKING** | `library_links` unique index prevents multi-user/multi-tenant dedup | Section 3, 9 |
| **BLOCKING** | `drive.file` scope makes Sections 7, 9, 10, 11 non-functional | Section 15, implementation order |
| **HIGH** | `oauth_connections` missing status, scopes, unique constraint | Section 2, 3 |
| **HIGH** | `creditTransactions` idempotencyKey schema change not in Section 3 | Section 3, 4 |
| **HIGH** | Disconnect cleanup order will orphan Drive files | Section 14 |
| **HIGH** | No testing strategy for a 15-section feature | All sections |
| **MEDIUM** | Webhook security underspecified | Section 11, 15 |
| **MEDIUM** | Budget tracking scope unclear (Drive-only vs. all operations) | Section 5 |
| **MEDIUM** | MCP tool integration architecture unclear | Section 7 |
| **MEDIUM** | Edit session auto-expire can destroy user work | Section 6 |
| **MEDIUM** | Federated search latency/timeout not specified | Section 10 |
| **LOW** | Missing `credit_pricing` in settings enum | Section 4 |
| **LOW** | Nginx config update not listed in affected files | Section 11 |
| **LOW** | Chunking parameter inconsistency | Section 8 |
