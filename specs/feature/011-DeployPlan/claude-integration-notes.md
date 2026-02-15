# Integration Notes — Opus Review Feedback

## Integrating (changes to claude-plan.md)

### 1. BullMQ migration gap (Critical) — INTEGRATE
The reviewer correctly identified that BullMQ is heavily used (33 files, scheduler, admin queues) and the plan ignores it entirely. Upstash Redis is indeed incompatible with BullMQ's blocking-pop pattern. **Action:** Add a new Section 4.5 covering BullMQ migration. The recommended approach is to migrate BullMQ scheduled tasks to Cloud Tasks/Cloud Scheduler and keep a dedicated Memorystore Redis instance (not Upstash) for any remaining pub/sub and queue features that cannot be trivially replaced.

### 2. Upstash Redis pub/sub incompatibility (Critical) — INTEGRATE
The reviewer correctly identified that Upstash doesn't support traditional Redis pub/sub needed for SSE progress streaming. **Action:** Update Section 10 to use a split Redis strategy: Upstash for rate limiting/locks/dedup (stateless HTTP calls), and Google Memorystore for pub/sub and BullMQ (connection-oriented features). This adds cost but is the only reliable path.

### 3. Media-job-runner architecture confusion (High) — INTEGRATE
The three-hop pattern (Cloud Tasks → Service → Admin API → Job) is unnecessarily complex. **Action:** Simplify Section 7 — media-job processing runs inline in the Python Cloud Run Service handler (not a separate Cloud Run Job). Reserve Cloud Run Jobs only for video rendering (Section 8) where CPU/memory requirements justify it.

### 4. Node.js enqueue path details (High) — INTEGRATE
The reviewer correctly noted the plan lacks file-level migration details for the Node.js side. **Action:** Add specific file change details to Section 4 showing which files in `apps/web/server/` need Cloud Tasks client integration and which existing dispatch functions are replaced.

### 5. Cloud Tasks OIDC validation details (High) — INTEGRATE
Security-critical and underspecified. **Action:** Add implementation details to Section 4 for OIDC token validation (library, audience, expected SA email, error handling).

### 6. setInterval incompatibility with Cloud Run (High) — INTEGRATE
Valid concern — setInterval runs per-instance and stops at scale-to-zero. **Action:** Add note in Section 4/5 to migrate all setInterval-based cleanup to Cloud Scheduler endpoints.

### 7. Celery rollback strategy (High) — INTEGRATE
Big-bang migration is risky. **Action:** Add a phased approach to Section 4: deploy Cloud Tasks alongside Celery first (dual-write), validate in staging, then remove Celery in a subsequent release.

### 8. Workload Identity Federation for GitHub Actions (Medium) — INTEGRATE
The reviewer correctly recommends WIF over service account JSON keys. **Action:** Update Section 16 to use Workload Identity Federation.

### 9. DNS/domain configuration (Medium) — INTEGRATE
Valid omission. **Action:** Add a brief section on Cloud Run custom domain mapping and DNS configuration.

### 10. Graceful shutdown (Medium) — INTEGRATE
Important for Cloud Run. **Action:** Add graceful shutdown requirements to Section 2 Docker images.

### 11. Dual-ORM migration ordering (Medium) — INTEGRATE
Valid concern. **Action:** Add a table ownership map and migration ordering to Section 3.

### 12. Production seed data (Medium) — INTEGRATE
Fresh prod DB needs initial data. **Action:** Add seed data strategy to Section 3.

### 13. Connection pooling math (Medium) — INTEGRATE
The math is fragile with multiple services. **Action:** Update Section 3 with conservative per-service pool sizes and monitoring.

### 14. Health check details (Low) — INTEGRATE
Simple but important. **Action:** Add health check endpoint specification to Section 2.

## NOT Integrating (and why)

### 9. Control Plane service (Medium) — NOT INTEGRATING
The control plane is a separate deployment concern that is out of scope for this spec. It can be deployed separately as a Phase 2 item. The plan is already long enough.

### 16. WebSocket migration (Medium) — NOT INTEGRATING
WebSockets are used for the chat/skill system but are not critical for the media generation MVP. Cloud Run supports WebSockets natively with `--session-affinity`. A brief note will be added but no dedicated section.

### 21. File upload path through Cloudflare (Medium) — NOT INTEGRATING
The plan already uses presigned URLs for R2 uploads (Section 9), which bypass Cloudflare entirely. The upload endpoint is a fallback for small files. Not a critical gap.

### 22. Environment variable inventory (Low) — NOT INTEGRATING
A complete env var inventory is a deployment checklist item, not an implementation plan item. It would make the plan excessively long. The Secret Manager section already lists the critical secrets.

### 24. Vectorize architecture (Low) — NOT INTEGRATING
The reviewer suggests deferring to Phase 2. However, the spec explicitly requires it. The plan already provides sufficient detail. The indexing will happen via REST API calls from Cloud Run to Cloudflare — this is straightforward HTTP.

### 26. Cost estimation (Low) — NOT INTEGRATING
Cost estimation belongs in a budget document, not an implementation plan. The plan already includes cost control levers (max instances, lifecycle rules, sampling rates).

### 8. renders/final lifecycle (Medium) — NOT INTEGRATING
The 12-day retention matches the spec requirement. User notification of expiration is a UX feature that can be added later. The "promote to gallery" flow is already described.

### 23. RenderSpec type mismatch (Minor) — NOT INTEGRATING
The implementation will handle serialization details. The plan correctly describes the intent.

### 15. FFmpeg Alpine performance (Low) — NOT INTEGRATING
This is an implementation detail best resolved during Docker image testing. Not a plan-level concern.

### 14. Admin dashboard query caching (Low) — NOT INTEGRATING
The plan already mentions caching for R2 queries. Extending caching to all queries is an optimization that can be done during implementation.
