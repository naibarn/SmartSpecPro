---
name: Feature 043 — Quota System Implementation Quick Reference
description: Step-by-step guide to wire credit quotas into the middleware chain for feature-043
type: reference
---

# Feature 043: Quota System Implementation Guide

## What Exists vs. What's Missing

### ✅ Already Built
- Database schema: `apiKeys.creditLimit` column exists
- Service function: `checkDailyCreditLimit()` implemented
- Service function: `incrementDailyCredits()` implemented
- Audit logging: `publicApiAuditLog.creditsUsed` recorded
- Admin UI: Can set `creditLimit` when creating/viewing keys
- Redis infrastructure: Daily credit counters persist correctly

### ❌ Missing
1. **Middleware enforcement**: No call to `checkDailyCreditLimit()`
2. **Credit incrementing**: No call to `incrementDailyCredits()`
3. **Credit cost definitions**: No per-endpoint cost matrix
4. **Route integration**: Handlers don't track/enforce credits

---

## Implementation Steps

### Step 1: Define Credit Costs (30 min)

**File to create**: `apps/web/server/services/creditCostMatrix.ts`

```typescript
/**
 * Credit cost per API endpoint.
 * Costs represent computational and resource consumption.
 */

export const CREDIT_COSTS: Record<string, number> = {
  // Skills
  "POST /v1/skills/{skillId}/execute": 10,

  // Agencies
  "POST /v1/agencies/{agencyId}/invoke": 50,

  // Presentations
  "POST /v1/presentations": 30,

  // Video
  "POST /v1/video-projects": 100,

  // Media
  "POST /v1/media/generate": 100,
  "POST /v1/media/callback/*": 0, // Webhook, no cost

  // LLM
  "POST /v1/llm/chat": 5,

  // MCP
  "POST /v1/mcp": 10,

  // Jobs
  "POST /v1/jobs": 20,
  "GET /v1/jobs": 0,

  // Webhooks
  "POST /v1/webhooks": 1,
  "DELETE /v1/webhooks/{webhookId}": 0,

  // Events
  "GET /v1/events": 0,
};

/**
 * Get credit cost for endpoint.
 * Returns 0 if not found (safe fallback, logs warning).
 */
export function getCreditCost(method: string, path: string): number {
  const key = `${method} ${path}`;
  const cost = CREDIT_COSTS[key];

  if (cost === undefined) {
    console.warn(`[CreditCost] Unknown endpoint: ${key}, defaulting to 0`);
    return 0;
  }

  return cost;
}
```

**Decision**: Adjust costs based on your resource model. Consider:
- LLM endpoints: high (token-based)
- Media/video: very high (GPU/transcoding)
- Read endpoints: free or minimal

---

### Step 2: Add Quota Enforcement to Middleware (20 min)

**File to modify**: `apps/web/server/_core/index.ts`

**Around line 434-436**, change from:

```typescript
app.use(
  "/v1",
  publicApiCorsMiddleware,
  publicApiHeadersMiddleware,
  apiKeyAuthMiddleware,
  publicApiFeatureGuard,
  rateLimitMiddleware(),
  idempotencyMiddleware(),
  publicApiAuditMiddleware,
);
```

To:

```typescript
import { quotaEnforcementMiddleware } from "../middleware/quotaEnforcement"; // ADD THIS

app.use(
  "/v1",
  publicApiCorsMiddleware,
  publicApiHeadersMiddleware,
  apiKeyAuthMiddleware,
  publicApiFeatureGuard,
  rateLimitMiddleware(),           // RPM check
  quotaEnforcementMiddleware(),    // ADD: Credit limit check
  idempotencyMiddleware(),
  publicApiAuditMiddleware,
);
```

---

### Step 3: Create Quota Enforcement Middleware (30 min)

**File to create**: `apps/web/server/middleware/quotaEnforcement.ts`

```typescript
import type { Request, Response, NextFunction } from "express";
import { checkDailyCreditLimit } from "../services/apiKeyRateLimiter";

/**
 * Middleware that enforces daily credit quotas for API keys.
 * Runs after rate limit check, before idempotency.
 *
 * If key has creditLimit set and accumulated credits >= limit:
 * - Returns 429 Too Many Requests
 * - Sets X-Daily-Credits-Remaining: 0
 * - Sets Retry-After: seconds until midnight UTC
 */
export function quotaEnforcementMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as any).auth;

    // Only check API key mode (session/bearer have implicit unlimited access)
    if (!auth || auth.mode !== "api_key" || !auth.apiKeyId) {
      return next();
    }

    // Skip if no credit limit set (unlimited)
    if (!auth.creditLimit) {
      return next();
    }

    // Check if quota exceeded
    const result = await checkDailyCreditLimit(auth.apiKeyId, auth.creditLimit);

    // Set remaining header for all responses
    res.set("X-Daily-Credits-Remaining", String(result.remaining ?? 0));

    if (!result.allowed) {
      res.set("Retry-After", String(result.retryAfterSeconds ?? 3600));
      return res.status(429).json({
        error: {
          code: "daily_credit_limit",
          message: "Daily credit quota exceeded. Resets at midnight UTC.",
          type: "quota_error",
          retryAfterSeconds: result.retryAfterSeconds,
        },
      });
    }

    next();
  };
}
```

---

### Step 4: Add Credit Tracking to Route Handlers (1-2 hours)

Each route handler needs to:
1. Estimate credit cost before execution
2. Check sufficiency: `checkDailyCreditLimit()`
3. Execute request
4. Call `incrementDailyCredits(actualCost)` after success
5. Set `X-Credits-Used` header (read by audit middleware)

**Pattern for skill execution** (example):

```typescript
// File: apps/web/server/routes/publicSkillsApi.ts

import { getCreditCost } from "../services/creditCostMatrix";
import { checkDailyCreditLimit, incrementDailyCredits } from "../services/apiKeyRateLimiter";

router.post("/:skillId/execute", async (req, res) => {
  const auth = (req as any).auth;
  const estimatedCost = getCreditCost("POST", "/v1/skills/{skillId}/execute"); // 10 credits

  // Pre-check: do they have enough credits?
  if (auth.creditLimit) {
    const quotaCheck = await checkDailyCreditLimit(auth.apiKeyId, auth.creditLimit);
    if (!quotaCheck.allowed) {
      // Quota middleware would have caught this, but double-check for safety
      return res.status(429).json({
        error: { code: "daily_credit_limit", message: "Quota exceeded" }
      });
    }
    if ((quotaCheck.remaining ?? 0) < estimatedCost) {
      return res.status(429).json({
        error: {
          code: "insufficient_credits",
          message: `Insufficient credits. Need ${estimatedCost}, have ${quotaCheck.remaining}`,
        }
      });
    }
  }

  try {
    // Execute skill
    const result = await executeSkill(skillId, input);

    // Charge actual cost (could differ from estimate if skill cached, etc.)
    const actualCost = estimatedCost; // Or recalculate based on result
    await incrementDailyCredits(auth.apiKeyId, actualCost);

    // Set header for audit logging
    res.set("X-Credits-Used", String(actualCost));

    return res.json(result);
  } catch (error) {
    // Error: charge at least the estimated cost (attempted to use)
    await incrementDailyCredits(auth.apiKeyId, estimatedCost);
    res.set("X-Credits-Used", String(estimatedCost));

    throw error;
  }
});
```

---

### Step 5: Update AuthContext Type (10 min)

**File to modify**: `apps/web/shared/publicApiTypes.ts`

Around line 30-39, add `creditLimit` to AuthContext:

```typescript
export interface AuthContext {
  userId: number;
  tenantId: string;
  mode: "session" | "api_key" | "bearer";
  apiKeyId?: string;
  scopes?: string[];
  rateLimit?: number;
  creditLimit?: number | null;  // ADD THIS
}
```

And update `validateKey()` to return it:

**File**: `apps/web/server/services/apiKeyService.ts` around line 122-130

```typescript
return {
  userId: row.userId,
  tenantId: row.tenantId,
  mode: "api_key",
  apiKeyId: row.id,
  scopes: row.scopes as string[],
  rateLimit: row.rateLimit,
  creditLimit: row.creditLimit,  // ADD THIS
};
```

---

### Step 6: Test Quota Enforcement (1 hour)

**Integration test pattern**:

```typescript
// File: apps/web/server/__tests__/quotaEnforcement.test.ts

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createKey, incrementDailyCredits, checkDailyCreditLimit } from "../services/apiKeyRateLimiter";

describe("Daily Credit Quotas", () => {
  it("blocks key when daily quota exceeded", async () => {
    // Create key with 100-credit limit
    const { id, rawKey } = await createKey(tenantId, userId, "test", ["skills:execute"], {
      creditLimit: 100,
    });

    // Accumulate 100 credits
    await incrementDailyCredits(id, 100);

    // Next check should fail
    const result = await checkDailyCreditLimit(id, 100);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets quota at midnight UTC", async () => {
    // This is hard to test in unit tests — consider integration test or time-mocking
    // Mockable: use a seam in `todayUTC()` function or inject date
  });

  it("allows key under quota", async () => {
    const { id } = await createKey(tenantId, userId, "test", ["skills:execute"], {
      creditLimit: 100,
    });

    await incrementDailyCredits(id, 50);

    const result = await checkDailyCreditLimit(id, 100);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(50);
  });
});
```

---

## Critical Configuration

**Environment**:
```bash
# .env (already exists)
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
API_KEY_HMAC_SECRET=...
```

**No new env vars needed** — credit limits are per-key in DB.

---

## Validation Checklist

- [ ] `creditCostMatrix.ts` created with all endpoints
- [ ] `quotaEnforcement.ts` middleware created
- [ ] Middleware registered in `index.ts` (after rateLimitMiddleware)
- [ ] `AuthContext.creditLimit` added to type
- [ ] `validateKey()` returns creditLimit
- [ ] All route handlers call `incrementDailyCredits()`
- [ ] All route handlers set `X-Credits-Used` header
- [ ] Tests pass: quota enforcement, reset at midnight, insufficient credits
- [ ] AdminAPIKeys.tsx UI still works (displays/edits creditLimit)
- [ ] Audit log captures creditsUsed

---

## Response Headers After Implementation

**Successful request (under quota)**:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 30
X-RateLimit-Reset: 1678886400
X-Daily-Credits-Remaining: 850
X-Credits-Used: 10
```

**Rate limit exceeded (429)**:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1678886400
Retry-After: 45
```

**Quota exceeded (429)**:
```
X-Daily-Credits-Remaining: 0
Retry-After: 3600
```

---

## Rollout Plan

1. **Phase 1** (Day 1-2): Implement steps 1-5, add basic tests
2. **Phase 2** (Day 3): Deploy to staging, run integration tests
3. **Phase 3** (Day 4): Review audit logs, adjust credit costs if needed
4. **Phase 4** (Day 5): Deploy to production with monitoring
5. **Phase 5** (Ongoing): Monitor quota usage patterns, adjust costs quarterly

---

## Future Enhancements

1. **Rolling windows**: 7-day or 30-day quotas (not just daily)
2. **Quota pools**: Multi-key shared quotas (team budgets)
3. **Burst allowance**: Allow 10% overage with penalty multiplier
4. **Admin reset**: Endpoint to manually reset daily counter
5. **Webhooks**: `quota.daily_exceeded` event for external monitoring
6. **Dashboard**: Real-time quota usage charts in `/admin/api-keys`

---

## Files Modified/Created

| File | Action | Purpose |
|------|--------|---------|
| `services/creditCostMatrix.ts` | **CREATE** | Credit cost per endpoint |
| `middleware/quotaEnforcement.ts` | **CREATE** | Quota enforcement middleware |
| `_core/index.ts` | **MODIFY** | Register middleware |
| `shared/publicApiTypes.ts` | **MODIFY** | Add creditLimit to AuthContext |
| `services/apiKeyService.ts` | **MODIFY** | validateKey() returns creditLimit |
| `routes/publicSkillsApi.ts` | **MODIFY** | Add credit tracking |
| `routes/publicAgencyApi.ts` | **MODIFY** | Add credit tracking |
| `routes/publicMediaApi.ts` | **MODIFY** | Add credit tracking |
| `routes/publicVideoApi.ts` | **MODIFY** | Add credit tracking |
| `routes/publicJobsApi.ts` | **MODIFY** | Add credit tracking |
| `__tests__/quotaEnforcement.test.ts` | **CREATE** | Integration tests |

**Total files**: 11 modified/created
**Estimated effort**: 4-6 hours with testing
