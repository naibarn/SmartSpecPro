# Synthesized Specification — Feature 058: Meta Channels

## What We're Building

A native Meta Channels subsystem for SmartSpecPro that enables tenants to connect Facebook Pages and manage Messenger conversations, content publishing, and comment moderation directly from the platform — with AI-assisted automation, workflow integration, and agency tool support.

## Why

SmartSpecPro tenants need to manage social customer interactions from the same platform they use for content generation, workflows, and AI agents. Exporting credentials to external tools is insecure and fragmented. This module brings Facebook Page and Messenger management inside SmartSpecPro with proper token encryption, tenant isolation, and audit logging.

## Key Design Decisions

1. **Self-service model**: All authenticated users can connect their own pages and manage inbox/posts/comments. No admin gating except tenant-level feature flag. Tenant scoping still isolates data.

2. **Enterprise scale**: Designed for 20+ pages per tenant, 1000+ messages/day. Partitioned webhook processing by page ID, cursor-based pagination, Redis-cached unread counters, connection pooling for Meta API.

3. **AI auto-send opt-in**: Default mode is `draft_only`. Tenants can enable `auto_send` per page with confidence threshold (default 0.95). Blocked categories (billing, legal, harassment) always force escalation regardless of confidence. Per-tenant kill switch available.

4. **RAG integration**: Resolved conversations are vectorized and archived into per-tenant pgvector collections (`social-conversations-{tenantId}`) for retrieval by agents and workflows.

5. **Dual workflow trigger mode**: `incoming_meta_message` node supports both real-time (Redis pub/sub on webhook) and batch (Celery beat polling every 30-60s) trigger modes, configurable per workflow. Batch is default for safety.

6. **Credential security**: Page access tokens stored in `socialPages.encryptedPageAccessToken` using AES-256-GCM (same key as LLM_ENCRYPTION_KEY). Python backend decrypts via `smartspecweb_crypto`. Tokens never reach frontend or LLM prompts.

## Constraints

- Feature gated by `META_CHANNELS_ENABLED` (default false)
- Meta Graph API v25.0 for all provider calls
- Webhook endpoint must validate X-Hub-Signature-256 HMAC on every POST
- OAuth callback URL: `https://smartaihub.app/auth/facebook/callback`
- All records tenant-scoped, all list queries cursor-paginated
- 80% test coverage for Python backend, Vitest for TypeScript

## Success Criteria

1. User connects a Facebook Page via OAuth from SmartSpecPro
2. Messenger webhook events are verified, deduplicated, normalized into inbox
3. User can reply from inbox (manual or AI-drafted)
4. User can publish Page posts (immediate or scheduled)
5. User can read/reply/hide/delete comments
6. Workflow nodes automate social operations (trigger → classify → draft → approve → send)
7. Agency agents use `builtin-meta-channels` tool for social actions
8. Resolved conversations are searchable via RAG
9. Audit logs for all connect/reply/publish/moderate actions
10. All data tenant-isolated with encrypted credentials

## Scope Boundaries

**In scope (MVP):** OAuth, page selection, webhook ingestion, inbox, manual reply, AI draft, post publishing, comment management, workflow nodes, agency tool, RAG archival, feature flag, audit logging.

**Out of scope (MVP):** Instagram/Threads channels, rich media attachments in messages, ad campaign management, conversation assignment/routing, SLA tracking, business hours rules, analytics dashboard.
