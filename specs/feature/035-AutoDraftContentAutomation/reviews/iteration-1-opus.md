# Opus Review

**Model:** claude-opus-4
**Generated:** 2026-03-11T00:00:00Z

---

## Overall Assessment

This is a well-structured plan with clear section boundaries, a correct dependency graph, and good security awareness (SSRF, formula injection, ZIP bombs). However, there are several significant issues that range from architectural mismatches with the existing codebase to missing error handling scenarios and a potentially dangerous synthetic JWT pattern.

---

## Critical Issues

### 1. Synthetic JWT Minting is a Security Anti-Pattern (Section 2, Step 7)

The plan proposes minting a "synthetic user JWT" to pass to `generateAIDraft()`. Looking at the actual function signature at `aiPresentationService.ts:4282`, it takes `(input, actor, userToken, taskId)`. The `userToken` is forwarded downstream to `mediaGenerationService` calls and credit deduction.

**Problems:**
- Minting a JWT that impersonates the user server-side is a privilege escalation risk. If this code path has any bug, it creates a user-forgeable token factory.
- The plan says "short-lived (15 min)" but does not specify scope restrictions. The agency stream proxy already mints scoped tokens (`scopes: ["agency:run"]`) at `agencyStreamProxy.ts:117-118`. The plan should follow the same pattern with a restricted scope like `["auto-draft:execute"]`.
- There is no mention of audit logging that this is a synthetic JWT, not a real user session.

**Recommendation:** Use the existing `signBearerToken` from `_core/tokens.ts` with an explicit scope. Add an `origin: "auto-draft-agent"` claim to the JWT payload so credit deduction and audit logs can distinguish agent-initiated actions.

### 2. Scheduler Architecture Mismatch (Section 5)

The plan says "Extend existing `scheduler.ts` to also read `auto_draft_schedules` on 1-minute interval." However, the existing scheduler uses **Cloud Tasks**, not BullMQ polling. `scheduler.ts` imports `enqueueTask` from `./cloudTasks` and checks `USE_CLOUD_TASKS`.

**Recommendation:** Decide between: (a) using Cloud Tasks consistently (preferred, matches existing pattern), or (b) creating a separate BullMQ-based scheduler specifically for auto-draft schedules.

### 3. `generateAIDraft()` Returns `void` (Section 2)

The function signature is `async function generateAIDraft(...): Promise<void>`. It writes progress to Redis keys and updates database records directly. The handler would need to:
- Read the progress key from Redis (`ai_draft_progress:{taskId}`) after completion
- Query the database for the created deck
- Calculate credits from `creditTransactions` or `providerUsageLog`

**Recommendation:** Add explicit steps for post-completion data gathering.

---

## High-Priority Issues

### 4. Missing Concurrency Control Conflict (Section 2)

The existing `generateAIDraft()` has a Redis-based user lock (`ai_draft_lock:{userId}`). The plan adds its own concurrent semaphore (max 3). These will conflict.

**Recommendation:** Clarify how the rate limiter semaphore interacts with the existing lock.

### 5. `builtin-skill-discovery` Missing from Tool Registration (Section 6 vs 7)

Section 7 assigns `builtin-skill-discovery` to the agent, but Section 6 only lists 4 new tools. The skill-discovery endpoint needs to be registered too.

### 6. No Error Recovery for Partial Batch Failures (Section 2, Section 4)

When a batch fails mid-way, the plan does not address retry logic, partial results, credit tracking for successful items, or batch status querying.

### 7. Missing Webhook HMAC for `schedule-draft` (Section 5)

The `auto_draft_schedules` table has no `webhookSecretEncrypted` column for signing outgoing webhooks.

---

## Medium-Priority Issues

### 8. Shared Types Location (Section 1)

Should clarify whether `apps/web/shared/` or `packages/shared/` is the correct location.

### 9. Feature Flag Client Exposure (Section 1, Section 9)

No tRPC endpoint defined to expose the feature flag to the React frontend.

### 10. No Graceful Degradation for Agent Timeout (Section 2)

No cleanup behavior for timeout/abort scenarios (zombie deck, partial credit deduction).

### 11. Agent Template Seed Idempotency (Section 7)

Should use idempotent upsert, not plain insert.

### 12. Row Limit Clarification (Section 4)

100 data rows + 1 header vs 100 total rows.

### 13. `PresentationActor` Construction (Section 2)

Should specify the DB query and what fields are needed, plus fail-fast for deactivated users.

---

## Low-Priority Issues

### 14. Missing npm Dependencies

`xlsx` (SheetJS) and `papaparse` need to be added as dependencies.

### 15. Rate Limiting Pattern

Consider reusing existing `createRateLimitMiddleware` instead of custom Lua scripts.

### 16. `canvas_preset` Default

Should explicitly state default is "16:9".

---

## Missing Considerations

1. **Credit estimation before execution** — Pre-flight check to avoid mid-way failure
2. **Observability** — Structured logging, traceId propagation, audit events for new endpoints
3. **Rollback strategy** — Database Safety Protocol for schema changes
4. **Multi-tenancy isolation** — All queries must filter by tenantId
5. **API versioning** — `builtin-skill-discovery` stub contract must match Spec 034's planned interface
