# Integration Notes: Opus Review Feedback

## Date: 2026-02-14
## Review Source: reviews/iteration-1-opus.md (22 issues)

---

## Issues INTEGRATING (with rationale)

### 1. `library_links` Unique Index Fix (Issue #1 — BLOCKING)
**Integrating.** The reviewer correctly identified that `library_links` has a unique index on `(linkType, linkId)` without tenant/user scoping. Since Google Drive files can be shared across users and even tenants, we must add `libraryItemId` to the unique index to scope dedup per library-item, or change to `(linkType, linkId, tenantId)`. I'll update Section 3 to add `tenantId` column to `library_links` and change the unique index to `(linkType, linkId, tenantId)` — this allows per-tenant dedup while letting multiple tenants reference the same Drive file. Within a tenant, the same Drive file maps to one virtual reference (shared).

### 2. Scope Clarity — `drive.readonly` Required for Phases 3-5 (Issue #6 — BLOCKING)
**Integrating.** The reviewer is correct that `drive.file` only sees app-created files. The plan's Section 15 suggestion to "start with `drive.file`" was misleading — it would cripple Sections 7, 9, 10, 11. I'll update the plan to:
- Clearly state that `drive.readonly` is required for RAG/sync/MCP features
- Add a "Phased Deployment" note: Phase 1 (Sections 1-6) can ship with `drive.file` only, Phases 3-5 are blocked until Google verification approves `drive.readonly`
- Remove the misleading suggestion from Section 15

### 3. `oauth_connections` Schema Extensions (Issue #4 — HIGH)
**Integrating.** The `oauth_connections` model needs `status`, `scopes`, and a unique constraint on `(user_id, provider)`. I'll add this to Section 3 as an Alembic migration since `oauth_connections` is a Python/SQLAlchemy table.

### 4. `creditTransactions.idempotencyKey` in Section 3 (Issue #2 — HIGH)
**Integrating.** The idempotencyKey column addition should be listed as an explicit schema change in Section 3, not buried in Section 4. I'll add it with nullable `varchar(256)` and a unique index. Scoped globally (not per-tenant) because `creditTransactions` already has `userId` which is globally unique.

### 5. `tenantId` Type Specification (Issue #3 — HIGH)
**Integrating.** I'll explicitly specify `varchar("tenant_id", { length: 36 })` in all new tables to match the library tables pattern (which uses varchar because `tenants.id` is varchar).

### 6. Disconnect Cleanup Ordering (Issue #16 — HIGH)
**Integrating.** Excellent catch. Token revocation must happen AFTER Drive file cleanup. I'll reorder Section 14's steps: cleanup temp Drive files first, then revoke token.

### 7. Webhook Security Details (Issue #5 — MEDIUM)
**Integrating.** I'll add webhook security details to Section 11: crypto-random channel token (32 bytes hex), triple validation (channel_id + resource_id + token), must return 200 within 3s (enqueue work only), Express route registration in `_core/index.ts`.

### 8. Budget Tracking Scope Clarification (Issue #9 — MEDIUM)
**Integrating.** Budget tracking should be per-user across ALL credit operations, not just Drive. I'll move budget fields from `google_drive_sync_state` to a new section in the `users` table (or a separate `user_credit_budgets` table) in Section 3.

### 9. MCP Tool Integration Architecture (Issue #10 — MEDIUM)
**Integrating.** I'll add a clear integration flow to Section 7 explaining how Python MCP tools are discovered and invoked. The existing pattern: Node.js chat system → Python `mcp_adapter.py` calls Node.js MCP routes. For Drive tools: register them as Python-native FastAPI endpoints that the `mcp_adapter.py` can invoke directly (same process, no HTTP round-trip).

### 10. Edit Session Expiry Protection (Issue #7 — MEDIUM)
**Integrating.** I'll update Section 6 to check Drive file `modifiedTime` before auto-expiry and extend the session if recently modified. Also add a user notification 2 hours before expiry.

### 11. Federated Search Timeout Strategy (Issue #8 — MEDIUM)
**Integrating.** I'll add per-leg timeouts to Section 10: 3s timeout for Drive API leg, return local results immediately with a `driveResultsPending` flag, append Drive results when available.

### 12. `credit_pricing` Category in Settings Enum (Issue #17 — LOW)
**Integrating.** Simple but important to not miss. I'll add to Section 4's notes.

### 13. Nginx Config for Webhook URL (Issue #18 — LOW)
**Integrating.** I'll add `nginx/conf.d/dev-host.conf` to the affected files list in Section 11.

### 14. `oauth_connections` Unique Constraint (Issue #15 — MEDIUM)
**Integrating.** Will add to the Alembic migration in Section 3 alongside the status/scopes columns.

### 15. Google API Client Library Recommendation (Issue #20 — LOW)
**Integrating.** I'll add a note to Section 8 recommending `google-api-python-client` + `google-auth` for all Google API interactions (Drive, Docs, Sheets, Slides APIs).

---

## Issues NOT Integrating (with rationale)

### Issue #11: No Testing Strategy
**Not integrating into claude-plan.md.** Testing strategy will be covered separately in `claude-plan-tdd.md` (Step 16 of the deep-plan workflow). This is by design — the deep-plan process generates a dedicated TDD plan file.

### Issue #12: No Rollback Strategy
**Not integrating.** Rollback strategy is an operational concern, not an implementation plan concern. The plan's Section 4 already notes that credit billing fixes can be deployed independently. Feature flags are an orthogonal concern that the project can address at deployment time. Adding rollback details to every section would bloat the plan without adding implementation value.

### Issue #13: No Migration Path for Existing Data (billing transition)
**Not integrating.** This is a product/business decision (communication, grace periods) rather than an implementation concern. The code implementation is the same regardless of rollout strategy. The team can decide rollout timing post-implementation.

### Issue #14: Content Extraction Memory/CPU Concerns
**Partially integrating.** I'll add concrete size guard defaults to Section 8 (max file size: 50MB, max sheet cells: 500K, extraction timeout: 60s). However, detailed memory profiling is an operational optimization, not a plan-level concern.

### Issue #19: Chunking Parameter Inconsistency
**Not integrating.** The existing pipeline uses 500 char/80 char overlap. The plan's "200-500 tokens" is the target for Drive content, which is intentionally different because Google structured APIs provide better semantic boundaries. The vector store handles mixed chunk sizes fine since embeddings are dimension-normalized. I'll add a brief note clarifying this is intentional.

### Issue #21: `library_links.linkId` Length Constraint
**Not integrating.** Google Drive file IDs are ~44 chars, well within varchar(128). We will NOT use composite identifiers in `linkId` — the `linkType` field already discriminates the source. No change needed.

### Issue #22: Alert Threshold Tiers
**Not integrating.** The spec says 80% default, the plan implements 80% + 100%. This is sufficient for v1. Four-tier alerts add complexity without clear user value. Can be enhanced later based on feedback.
