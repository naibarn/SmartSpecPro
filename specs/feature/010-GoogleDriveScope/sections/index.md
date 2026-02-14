<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-admin-config
section-02-database-schema
section-03-oauth-consent
section-04-credit-billing
section-05-budget-protection
section-06-content-extraction
section-07-edit-in-google
section-08-virtual-references
section-09-mcp-server
section-10-federated-search
section-11-sync-webhooks
section-12-dashboard-ui
section-13-rate-limiting
section-14-disconnect-cleanup
section-15-security-hardening
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable With |
|---------|------------|--------|-------------------|
| section-01-admin-config | - | 03 | 02 |
| section-02-database-schema | - | 03, 04, 05, 07, 08 | 01 |
| section-03-oauth-consent | 01, 02 | 06, 07, 09 | - |
| section-04-credit-billing | 02 | 05, 08 | 03 |
| section-05-budget-protection | 04 | - | 06, 07 |
| section-06-content-extraction | 03 | 08, 09 | 05, 07 |
| section-07-edit-in-google | 02, 03 | 14 | 05, 06 |
| section-08-virtual-references | 04, 06 | 10, 11, 14 | 09 |
| section-09-mcp-server | 03, 06 | - | 08 |
| section-10-federated-search | 08 | - | 11, 12 |
| section-11-sync-webhooks | 08 | 14 | 10, 12 |
| section-12-dashboard-ui | 03, 04, 05 | - | 10, 11 |
| section-13-rate-limiting | - (cross-cutting) | - | any |
| section-14-disconnect-cleanup | 08, 11 | 15 | - |
| section-15-security-hardening | 14 (cross-cutting) | - | - |

## Execution Order (Batched)

**Batch 1** (no dependencies — foundation):
1. section-01-admin-config
2. section-02-database-schema

**Batch 2** (depends on Batch 1):
3. section-03-oauth-consent (depends on 01, 02)
4. section-04-credit-billing (depends on 02)

**Batch 3** (depends on Batch 2):
5. section-05-budget-protection (depends on 04)
6. section-06-content-extraction (depends on 03)
7. section-07-edit-in-google (depends on 02, 03)

**Batch 4** (depends on Batch 3):
8. section-08-virtual-references (depends on 04, 06)
9. section-09-mcp-server (depends on 03, 06)

**Batch 5** (depends on Batch 4):
10. section-10-federated-search (depends on 08)
11. section-11-sync-webhooks (depends on 08)
12. section-12-dashboard-ui (depends on 03, 04, 05)

**Batch 6** (cross-cutting + cleanup):
13. section-13-rate-limiting (cross-cutting, can be built anytime)
14. section-14-disconnect-cleanup (depends on 08, 11)

**Batch 7** (final):
15. section-15-security-hardening (cross-cutting, finalized last)

## Section Summaries

### section-01-admin-config
Admin Settings UI for Google OAuth Client ID/Secret/Redirect URI. Extends `system_settings` with `oauth` category. Frontend form + backend mutations. Python config loader reads from DB.
**Plan Section:** Section 1: Admin Configuration — Google OAuth App Settings

### section-02-database-schema
New Drizzle tables: `google_drive_sync_state`, `google_drive_edit_sessions`, `user_credit_budgets`. Existing table modifications: `library_links` (add tenant_id, fix unique index), `credit_transactions` (add idempotency_key). Alembic migration for `oauth_connections` (add status, scopes, tenant_id, unique constraint).
**Plan Section:** Section 3: Database Schema — New Tables and Extensions

### section-03-oauth-consent
Per-user Google OAuth with incremental consent. `GoogleTokenService` for token management. `googleDriveRouter` tRPC procedures. Settings UI Integrations tab. Error handling for `invalid_grant`.
**Plan Section:** Section 2: Per-User Google OAuth — Incremental Consent

### section-04-credit-billing
Fix existing revenue leaks (upload indexing, RAG queries). Add Drive operation billing. Idempotent charging with Redis dedup + DB constraint. Service tags. Admin pricing config under `credit_pricing` category.
**Plan Section:** Section 4: Unified Credit Billing — Fix Gaps + New Operations

### section-05-budget-protection
Per-user monthly credit budget caps via `user_credit_budgets` table. Tiered alerts (80%, 100%). Budget reset on new month. Budget check before sync. UI for budget configuration.
**Plan Section:** Section 5: Monthly Budget Protection

### section-06-content-extraction
`GoogleContentExtractor` for Docs/Sheets/Slides/PDF/plaintext. Structure-aware chunking. Uses `google-api-python-client`. Size guards (50MB, 500K cells, 60s timeout).
**Plan Section:** Section 8: Content Extraction Service

### section-07-edit-in-google
Edit Word/Excel via Google Docs/Sheets. `openForEditing`, `saveBack`, `discardEditSession` mutations. Edit session status bar. Auto-expire with safety checks (modifiedTime, pre-expiry notification).
**Plan Section:** Section 6: Word/Excel Editing via Google Docs/Sheets

### section-08-virtual-references
Virtual references in library for Drive files. `createVirtualDriveReference` with per-tenant dedup. `processGoogleDriveIndexJob` Celery task. Vector store upsert. Post-deduct credit billing.
**Plan Section:** Section 9: Virtual Document References & Indexing

### section-09-mcp-server
FastMCP tools for Drive operations (search, read, list, info). Python-native tools with internal API endpoints. Tool discovery integration with Node.js MCP routes. Credit billing for read operations.
**Plan Section:** Section 7: Google Drive MCP Server

### section-10-federated-search
Unified search across local DB + vector store + Drive API. RRF merge with k=60. Per-leg timeouts (3s for Drive). Graceful degradation. Source badges and filter tabs UI.
**Plan Section:** Section 10: Federated Search

### section-11-sync-webhooks
Google Drive Changes API with webhook notifications. Initial sync with progress tracking. Channel renewal Celery task. Webhook security (crypto token, triple validation). Nginx proxy config. Sync settings UI.
**Plan Section:** Section 11: Incremental Sync & Webhooks

### section-12-dashboard-ui
Google Drive management dashboard in Settings. Overview, Files, Credit Usage, Pricing panels. Folder picker dialog with lazy-loading.
**Plan Section:** Section 12: Settings UI — Google Drive Dashboard

### section-13-rate-limiting
Per-user rate limits for Drive operations. Google API exponential backoff. Token error handling. Sync error handling (skip-and-continue). Webhook failure fallback. Audit logging.
**Plan Section:** Section 13: Rate Limiting & Error Handling

### section-14-disconnect-cleanup
Complete cleanup on disconnect. Correct ordering: cleanup Drive files → stop webhook → revoke token → delete local data. Background job. Confirmation dialog.
**Plan Section:** Section 14: Disconnect & Cleanup

### section-15-security-hardening
Token encryption validation. Scope verification. Input validation. Tenant isolation. Webhook CSRF protection. Content sanitization. Audit trail. Feature flag for `drive.readonly` scope gating.
**Plan Section:** Section 15: Security Hardening
