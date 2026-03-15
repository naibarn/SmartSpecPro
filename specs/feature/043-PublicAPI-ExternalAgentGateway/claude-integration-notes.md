# Integration Notes — Opus Review Feedback

## Findings Integrated

### 1. CRITICAL: Tenant ID Type — varchar(36), not integer
**Integrating:** YES — All `tenantId` references fixed to `varchar(36)` and `AuthContext.tenantId` to `string`.
**Why:** Confirmed `tenants.id` is `varchar("id", { length: 36 })`. This affects all new tables and the AuthContext type.

### 2. HIGH: conversations has no tenantId column
**Integrating:** YES — Updated `getOrCreateChatApiConversation()` to derive tenant from user lookup, not direct column.
**Why:** Confirmed conversations table only has `userId`, no `tenantId`. Tenant isolation is through the user's tenant assignment.

### 3. HIGH: BullMQ partially migrated
**Integrating:** YES — Updated to use queue-agnostic language. Chat Bridge and Webhook Dispatch queues still use BullMQ, so it's available for job automation. Added note about partial migration status.
**Why:** Confirmed BullMQ is still used for some queues (Chat Bridge, Webhook Dispatch) but LLM scheduler migrated to Cloud Tasks.

### 4. HIGH: AuthResult type backward compatibility
**Integrating:** YES — Added section on enumerating `authorizeRequest()` call sites and backward-compatible handling.
**Why:** Valid concern — downstream consumers expect specific AuthResult shape.

### 5. MEDIUM: CORS policy
**Integrating:** YES — Added CORS section. The spec already mentions `origin: "*"` with security caveats.

### 6. MEDIUM: Idempotency cache size limit
**Integrating:** YES — Added 1MB size limit for cached responses.

### 7. MEDIUM: SSE at-most-once semantics
**Integrating:** YES — Documented semantics. `Last-Event-Id` deferred to v2.

### 8. MEDIUM: Audit event retention
**Integrating:** YES — Added 90-day retention policy with scheduled cleanup.

### 9. MEDIUM: Webhook retry infrastructure
**Integrating:** YES — Clarified: use BullMQ delayed jobs (still available for webhook dispatch queue).

### 10. MEDIUM: MCP session error handling
**Integrating:** YES — Added error state and timeout transitions.

## Findings NOT Integrated

### LOW: API key prefix tenant ID leak
**Not integrating.** The tenant short ID in the prefix is by design for fast routing without DB lookup. This is documented in the spec and is an accepted trade-off. The prefix is visible in key management UI anyway.

### LOW: automation_jobs self-referential FK
**Not integrating.** Intentional — no FK constraint to avoid cascade complexity. Documented as design decision.

### LOW: Pipeline template depth/cycle limits
**Integrating:** YES — Added max depth (5) and cycle detection.

### LOW: Swagger UI public access
**Not integrating.** API documentation is intentionally public for developer discovery. The spec describes this as a feature, not a vulnerability. Endpoints still require auth.
