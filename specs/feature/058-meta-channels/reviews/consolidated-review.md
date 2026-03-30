# Consolidated Review — Feature 058: Meta Channels

**Date:** 2026-03-23
**Reviewers:** ssp-reviewer (completeness), ssp-security (security), ssp-architect (architecture)
**Verdict:** APPROVE_WITH_FIXES — 8 CRITICAL items must be resolved before implementation

---

## CRITICAL (Must fix before implementation)

### 1. Dedup Key Collision (Architecture DC-01)
**Issue:** Dedup key uses `entry.id + timestamp` but Meta batches multiple messages per entry. Same-timestamp messages produce the same key → second message silently dropped.
**Fix:** Use `entry.id + "_" + messaging[i].message.mid` (Meta's per-message unique ID).

### 2. Real-time Trigger Has No Valid Runtime Host (Architecture IC-02)
**Issue:** Plan says "workflow runtime has a background listener" but Celery workers can't maintain persistent Redis pub/sub subscriptions.
**Fix:** Run pub/sub subscriber as a FastAPI `lifespan` background task that fans out events to Celery dispatches, OR use Redis Streams with `XREADGROUP`.

### 3. Duplicate Approval System (Architecture IC-03)
**Issue:** Plan creates `SocialApprovalGateExecutor` + `socialHumanApprovals` parallel to the existing `ApprovalExecutor` + `approval_requests` system. Two approval dashboards/notification paths.
**Fix:** Reuse existing `ApprovalExecutor` for workflow-level approval. Keep `socialHumanApprovals` for audit/queue UI only.

### 4. Embedding Batch Endpoint Missing (Architecture IC-01)
**Issue:** Section-13 calls `POST /api/internal/embeddings/batch` which doesn't exist — only single-text endpoint exists.
**Fix:** Add `/batch` route to `internal_embeddings.py` or rewrite archival to loop single calls.

### 5. META_APP_SECRET in Plaintext .env (Security CRIT-01)
**Issue:** Python `.env` stores app secret in plaintext while Node.js uses encrypted storage.
**Fix:** Store via `upsertSystemSetting()` with `isSensitive: true`. Python decrypts via `smartspecweb_crypto`.

### 6. OAuth CSRF Validation Client-Side Only (Security CRIT-02)
**Issue:** State validation relies on `sessionStorage` (client-controlled). Python backend has no independent nonce.
**Fix:** Generate state server-side, store in Redis with 10min TTL, validate+delete on callback.

### 7. Decrypted Tokens Passed Over HTTP (Security HIGH-03)
**Issue:** Node.js decrypts page token then POSTs it to python-backend in request body — exposed to logging/APM.
**Fix:** Pass only `page_id`. Python backend decrypts from DB directly before Meta API call.

### 8. Agency Tool Config Injectable by LLM (Security HIGH-05)
**Issue:** `allowedActions` and `requireApproval` in Zod input schema — LLM can inject `requireApproval: false`.
**Fix:** Remove from Zod input. Load from DB (`agencyAgentTools.toolConfig`) only.

---

## HIGH (Must fix before first PR)

| # | Source | Issue | Fix |
|---|--------|-------|-----|
| H-01 | Arch S-01 | Webhook handler dispatches one Celery task per entry (25 in a burst) delaying 200 response | Dispatch single task per delivery, unpack entries in worker |
| H-02 | Arch S-03 | No index on `socialMessages.workflowTriggerStatus` — sequential scan on batch trigger poll | Add composite index `(pageId, workflowTriggerStatus)` |
| H-03 | Arch R-01 | Scheduled post publisher has no idempotency guard — double-publish on Celery beat restart | Atomic `UPDATE SET status="publishing" WHERE status="scheduled"`, check rowcount |
| H-04 | Arch R-02 | No dead-letter path after 3 Celery retries — failed events silently dropped | Add `social_dlq` queue, route after max retries |
| H-05 | Arch R-03 | Token refresh doesn't cascade to `socialPages.status` on error 190 | On 190: mark page `needs_reauth` + emit notification |
| H-06 | Arch DC-02 | `providerMessageId` UNIQUE index blocks retry of partially-processed events | Handle `UniqueViolation` as idempotent success, continue processing |
| H-07 | Arch DC-03 | Auto-send race: another agent/user may reply between confidence check and send | Optimistic lock: check `lastOutboundAt` unchanged before auto-send |
| H-08 | Arch IC-04 | Internal tool endpoint in tRPC router — existing pattern uses Express routes | Register as Express route in `_core/index.ts` |
| H-09 | Arch IC-05 | Workflow `ClassifyIntentExecutor` bypasses LLM gateway credit accounting | Route through unified client or Node.js gateway with X-Internal-Token |
| H-10 | Compl | Schema code blocks missing `aiActionMode`, `autoSendConfidenceThreshold`, `workflowTriggerStatus` columns | Add columns to Drizzle TypeScript code blocks |
| H-11 | Compl | Skills integration (`meta-messenger`, `meta-page-manager`) in spec but not planned | Add section-15 or explicitly scope out |
| H-12 | Compl | `social_cleanup_task.py` in spec but not planned — raw events grow unboundedly | Add cleanup beat task: delete processed events > 30 days |
| H-13 | Sec HIGH-01 | `access_token` in query params lands in structlog output | Add `scrub_access_tokens` log processor |
| H-14 | Sec HIGH-02 | Webhook signature stored in DB headers — enables replay attacks | Strip `X-Hub-Signature-256` before persisting |
| H-15 | Sec HIGH-04 | No tenant isolation guard on webhook processing for unknown pages | Mark unknown page events as "skipped" + audit |
| H-16 | Sec HIGH-06 | Prompt injection via customer message bypasses blocked-category detection | Add keyword pre-scan + strict enum validation + HumanMessage-only role |
| H-17 | Arch M-02 | No GDPR deletion path for pgvector social embeddings on page disconnect | Add `delete_social_tenant_data` cleanup task |
| H-18 | Arch M-03 | `poll_social_workflow_triggers` beat task not registered in `celery_app.py` | Add to beat schedule explicitly |
| H-19 | Arch M-05 | `meta_webhooks` router not registered in `main.py` | Add `app.include_router()` to section-05 file list |
| H-20 | Arch MP-01 | No provider abstraction — Facebook-specific logic prevents future Instagram/WhatsApp | Define `SocialProviderClient` interface |

---

## MEDIUM (Fix during implementation)

| # | Issue | Fix |
|---|-------|-----|
| M-01 | Redis unread counters not implemented (interview Q2 decision) | Add Redis counter pattern to section-06 |
| M-02 | Real-time trigger rate limiter described but not implemented | Add Redis counter + test in section-11 |
| M-03 | No health check endpoint `/api/health/social` | Add FastAPI endpoint |
| M-04 | `socialWebhookEventsRaw` grows without retention policy | Add daily cleanup beat task |
| M-05 | No webhook subscription health degradation alerting | Sweep failed subscriptions in daily task |
| M-06 | No circuit breaker on Meta API calls | Redis-backed circuit breaker per page |
| M-07 | RAG archival batch size fixed at 50 — backlog risk | Dynamic batch sizing |
| M-08 | `verifyPageAccess()` helper not specified — risk of inconsistent checks | Create shared service function |
| M-09 | Blocked-category enforcement mechanism unspecified | Define in `policyConfig` schema |
| M-10 | No `completeOAuth` rate limit (brute-force codes) | Add rate limiter |
| M-11 | Stored XSS risk in approval queue (LLM output rendered) | Sanitize before render |
| M-12 | `contentLink` not validated for SSRF (RFC 1918 blocked) | Add URL validation |
| M-13 | `customerDisplayName` stored plaintext (GDPR PII) | Document as policy decision |
| M-14 | No admin dashboard for social health | Integrate into `AdminQueueDashboard.tsx` |
| M-15 | Celery worker concurrency not specified for `social` queue | Document `--concurrency=4 -Q social` |
| M-16 | Meta API version hardcoded — use env var | Use `META_GRAPH_API_VERSION` everywhere |
| M-17 | No fallback for webhook delivery gaps during downtime | Add `sync_missing_messages` polling task |

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 8 |
| HIGH | 20 |
| MEDIUM | 17 |
| LOW | 5 |
| INFO | 3 |

**Recommended action:** Resolve all 8 CRITICAL items in the plan before running `/deep-implement`. HIGH items can be addressed during implementation per section.

### Top 5 Priorities
1. Fix token flow: Python decrypts from DB, not from Node.js HTTP body
2. Fix dedup key: use `message.mid` not timestamp
3. Fix real-time trigger: FastAPI lifespan background task or Redis Streams
4. Fix approval system: reuse existing `ApprovalExecutor`
5. Fix OAuth CSRF: server-side Redis nonce, not client sessionStorage
