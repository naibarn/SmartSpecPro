# Opus Review

**Model:** claude-opus-4
**Generated:** 2026-03-14T12:00:00Z

---

## Plan Review: 043-PublicAPI-ExternalAgentGateway

### CRITICAL: Tenant ID Type Mismatch

The plan's database schema in Section 3.1 specifies `api_keys.tenantId` as `FK -> tenants.id (integer)`. This is wrong. The `tenants` table uses `varchar("id", { length: 36 })` as its primary key, not an integer. The plan also declares `AuthContext.tenantId` as `number` (Section 4.3). This type mismatch would cause runtime FK violations on every insert and break every tenant-scoped query.

The same error propagates to `api_audit_events.tenantId`, `api_webhook_endpoints.tenantId`, and `automation_jobs.tenantId` -- all declared as integer FKs but must be `varchar(36)`.

Meanwhile, `api_keys.userId` referencing `users.id` as integer is correct.

The `DeductCreditsParams.tenantId` is already typed as `string | undefined` in creditService.ts (line 40), which further confirms that tenant IDs are strings throughout the codebase.

**Action required:** Fix all `tenantId` references in the schema design to `varchar(36)`, and fix `AuthContext.tenantId` to `string`.

### HIGH: conversations Table Has No tenantId Column

The plan (Section 6.3) says `getOrCreateChatApiConversation(userId, tenantId)` will use the `conversations` table which "Has `tenantId` column directly." Looking at the schema, the `conversations` table has `userId` but no `tenantId` column. Tenant isolation for conversations currently works through the user's tenant assignment, not a direct column.

This means either:
1. The plan needs to add `tenantId` to `conversations` (which it does not list in Section 3.2), or
2. The conversation creation logic needs to derive tenant from the user rather than relying on a direct column.

**Action required:** Clarify whether `tenantId` is being added to `conversations` or whether tenant isolation is via user lookup. If the latter, update Section 6.3 to reflect that.

### HIGH: BullMQ May Not Exist Anymore

Line 60 of index.ts contains a comment: "BullMQ scheduler/queue init removed -- migrated to Cloud Tasks (Section 05)". The plan references BullMQ extensively in Section 10 (Job Automation -- "BullMQ queue `automation-jobs`") and the spec mentions reusing "existing BullMQ infrastructure." If BullMQ has been migrated to Cloud Tasks, the job automation design needs to either use Cloud Tasks or re-introduce BullMQ specifically for this feature.

**Action required:** Verify whether BullMQ is still available in the runtime. If migrated to Cloud Tasks, update Section 10 to use the current queue infrastructure.

### HIGH: AuthResult Type Incompatibility

The current `AuthResult` type in authz.ts returns `{ ok: true; mode: "bearer"; sub: string; scopes: string[] }` for bearer tokens. The plan proposes returning `{ ok: true, mode: 'api_key', sub: userId, tenantId, scopes, apiKeyId }` which introduces a new mode value and new fields (`tenantId`, `apiKeyId`) not present in the current type.

This is a breaking change to `AuthResult`. Every consumer of `authorizeRequest()` that does `if (result.mode === "bearer")` will need to handle the new `"api_key"` mode. The plan does not list these downstream consumers or specify how they should handle the new mode.

**Action required:** Enumerate all call sites of `authorizeRequest()` and specify the behavior for each when `mode === "api_key"`. Consider whether `"api_key"` should be a subtype of `"bearer"` for backward compatibility.

### MEDIUM: CreditSourceType Is a Union Type, Not an Enum

Section 3.4 says "Add new source types to the TypeScript union." The actual `CreditSourceType` is indeed a string literal union. However, the plan proposes 8 new source types. This should be verified against any database constraints or enum types that may validate these values.

### MEDIUM: Missing CORS Configuration

The plan exposes REST endpoints to external agents and platforms. There is no mention of CORS policy configuration. External JavaScript clients (browser-based agents, embedded widgets) would be blocked by same-origin policy.

**Action required:** Add a section on CORS policy.

### MEDIUM: Idempotency Cache Stores Full Response Bodies

Section 4.7 stores `{ statusCode, body }` in Redis with 24h TTL. For large responses, this could consume significant Redis memory.

**Action required:** Add a size limit on idempotency cache entries (e.g., skip caching if response body > 1MB) or use a shorter TTL for large payloads.

### MEDIUM: SSE Event Stream Scalability Design

Section 11.3 uses Redis Pub/Sub per tenant. Redis Pub/Sub is fire-and-forget -- if the client disconnects and reconnects, it misses events. The plan does not mention it or offer `Last-Event-Id` support.

**Action required:** Document at-most-once delivery semantics, or add `Last-Event-Id` support.

### MEDIUM: Webhook Delivery Service Implementation Unclear

Section 11.2 describes webhook delivery with retry. But there is no specification of what queues or dispatches these retries. If BullMQ is gone, how are delayed retries scheduled?

**Action required:** Specify the retry mechanism infrastructure.

### MEDIUM: api_audit_events Table Growth

The `api_audit_events` table will grow unboundedly. No retention policy, no partitioning strategy, no cleanup job.

**Action required:** Add a retention policy (e.g., 90 days) with a scheduled cleanup job.

### MEDIUM: MCP Session State Machine Lacks Error Handling

Section 9.3 defines states `initializing -> ready -> closed` but does not describe error transitions.

### LOW: API Key Prefix Contains Tenant Short ID

Section 4.1 generates keys as `sk-ssp_{tenantShortId}_{random}`. This leaks tenant identity in the key prefix.

### LOW: Missing automation_jobs Self-Referential FK

The `automation_jobs` table specifies `parentJobId` but does not define a self-referential FK constraint.

### LOW: Pipeline Template Variable Injection

Section 10.2 describes template variables with "restricted substitution" but no depth limits or cycle detection.

**Action required:** Add max depth limit and cycle detection.

### LOW: Swagger UI Exposes API Surface

Section 13.2 mounts Swagger UI at `/v1/docs`. This is publicly accessible.

### OBSERVATION: Scope for Existing Endpoints

The plan says API keys work on ALL endpoints. But existing code uses `sub` as a string. For API key auth, `sub` would be a userId number. This assumption should be verified.

### OBSERVATION: Large Scope of AuthContext Refactor

Section 4.3 lists 6+ service functions that need refactoring. This should be treated as the highest-risk part of the implementation.

### Summary of Priority Actions

1. **Fix tenant ID types** -- varchar(36), not integer (CRITICAL)
2. **Verify conversations.tenantId** -- column may not exist (HIGH)
3. **Verify BullMQ availability** -- may need Cloud Tasks instead (HIGH)
4. **Define AuthResult backward compatibility** -- enumerate all call sites (HIGH)
5. **Add CORS policy section** (MEDIUM)
6. **Add audit event retention policy** (MEDIUM)
7. **Specify webhook retry infrastructure** (MEDIUM)
8. **Add idempotency cache size limits** (MEDIUM)
