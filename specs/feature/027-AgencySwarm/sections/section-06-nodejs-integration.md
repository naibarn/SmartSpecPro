Now I have all the context needed. Let me compose the section content.

# Section 06: Node.js Integration Layer

## Overview

This section implements the Node.js side of the agency-swarm integration: a tRPC router for agency CRUD and conversation management, an HTTP bridge service to communicate with the Python backend, an internal credits endpoint for multiplier markup, and minor additions to the sandbox and credit service enums. It also wires rate limiting into agency-specific procedures.

**Phase:** 2
**Depends on:** section-02-database-schema (Drizzle tables must exist), section-05-python-router (Python FastAPI endpoints must be running)
**Blocks:** section-07-sse-streaming, section-08-frontend-chat

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/server/routers/agency.ts` | tRPC router for agency CRUD, conversations, templates, admin ops |
| `apps/web/server/services/agencyBridge.ts` | HTTP bridge between Node.js and Python agency service |
| `apps/web/server/routers/__tests__/agency.test.ts` | Vitest tests for the tRPC agency router |
| `apps/web/server/services/__tests__/agencyBridge.test.ts` | Vitest tests for the agency bridge |

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/server/routers.ts` | Import and mount `agencyRouter` in `appRouter` |
| `apps/web/server/services/creditService.ts` | Add `"agency"` to `CreditSourceType` union |
| `apps/web/server/routers/sandbox.ts` | Add `"agency"` to `featureType` enum in `createJob` input |
| `apps/web/server/_core/index.ts` | Register internal `/api/internal/credits/agency-markup` Express endpoint; add `"agency"` to `VALID_SOURCE_TYPES` set |

---

## Tests (Write First)

### tRPC Router Tests

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/agency.test.ts`

These tests use Vitest with mocked database calls. The existing test patterns in the codebase mock the `db` module and call router procedures directly via a test caller.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Test: list -- returns agencies filtered by tenant
// Test: create -- creates agency with valid input, returns ID
// Test: create -- rejects when rate limit exceeded (10/day)
// Test: update -- updates agency, rejects if not owner
// Test: delete -- soft-deletes agency (sets status=archived)
// Test: sendMessage -- dispatches to Python bridge, returns result
// Test: sendMessage -- rejects when rate limit exceeded (60/min)
// Test: listTemplates -- returns available templates
// Test: createFromTemplate -- clones template into new agency
// Test: adminToggleTenant -- requires admin role
// Test: adminKillRun -- sends cancel to Python bridge
```

Each test should:
1. Mock the Drizzle `db` import to return canned query results
2. Mock `agencyBridge` methods for any procedures that delegate to Python
3. Create a test tRPC caller with a synthetic user context (including `tenantId`, `user.id`, `user.role`)
4. Assert the correct return shape and side effects

For rate limit tests, the test should invoke the procedure more times than the limit allows and assert that a `TRPCError` with code `TOO_MANY_REQUESTS` is thrown.

### Agency Bridge Tests

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/agencyBridge.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Test: executeRun -- calls Python POST /api/v1/agencies/{id}/run with correct body
// Test: executeRun -- passes auth headers (Authorization + Cookie)
// Test: executeRun -- throws on non-2xx response from Python
// Test: cancelRun -- calls Python POST /api/v1/agencies/{id}/runs/{runId}/cancel
// Test: listRuns -- calls Python GET /api/v1/agencies/{id}/runs with query params
// Test: listRuns -- handles empty result set
```

Mock `fetch` (global or via `vi.fn()`) to return canned responses. Verify correct URL construction, headers, and body serialization.

### CreditSourceType Tests

```typescript
// Test: "agency" is valid CreditSourceType
// Test: deductCredits with sourceType="agency" records correctly
```

These can be small inline tests in the existing credit service test file, or stand-alone. The key assertion is that `"agency"` is accepted without runtime errors by `deductCredits()`.

### Multiplier Markup Endpoint Tests

```typescript
// Test: POST /api/internal/credits/agency-markup -- requires internal auth (gateway token)
// Test: POST /api/internal/credits/agency-markup -- correctly calculates and deducts markup
// Test: POST /api/internal/credits/agency-markup -- rejects external requests (no user JWT accepted)
// Test: POST /api/internal/credits/agency-markup -- returns 400 for invalid body
```

These use supertest or direct Express app testing, following the same pattern as the existing `/api/internal/credits/charge` endpoint tests.

---

## Implementation Details

### 1. CreditSourceType Addition

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/creditService.ts`

Add `"agency"` to the `CreditSourceType` union type.

Current code at line 14:

```typescript
export type CreditSourceType =
  | "chat" | "skill" | "media_image" | "media_video" | "media_audio"
  | "indexing" | "rag" | "stt" | "translation" | "brainstorm"
  | "scheduler" | "admin" | "other";
```

Change to:

```typescript
export type CreditSourceType =
  | "chat" | "skill" | "media_image" | "media_video" | "media_audio"
  | "indexing" | "rag" | "stt" | "translation" | "brainstorm"
  | "scheduler" | "admin" | "agency" | "other";
```

This is a type-only change -- no runtime behavior changes for existing code paths.

### 2. VALID_SOURCE_TYPES Update

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts`

Add `"agency"` to the `VALID_SOURCE_TYPES` set at approximately line 362:

```typescript
const VALID_SOURCE_TYPES = new Set([
  "chat", "skill", "media_image", "media_video", "media_audio",
  "indexing", "rag", "stt", "translation", "brainstorm",
  "scheduler", "admin", "agency", "other",
]);
```

This ensures that when Python sends `sourceType: "agency"` to the existing `/api/internal/credits/charge` endpoint, it is recognized as valid.

### 3. Sandbox featureType Addition

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/sandbox.ts`

In the `createJob` procedure input schema (line 49), add `"agency"` to the `featureType` enum:

```typescript
featureType: z.enum([
  "chat", "skill", "workflow", "library", "media", "presentation", "connector",
  "agency",
]),
```

This allows agency tool calls that require sandbox execution (risk level "high") to dispatch via the existing sandbox infrastructure.

### 4. Agency Bridge Service

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/agencyBridge.ts`

HTTP bridge that communicates with the Python FastAPI agency endpoints. Follows the same pattern as the existing MCP routes in `_core/mcpRoutes.ts` which call Python via `fetch()`.

```typescript
/**
 * AgencyBridge -- HTTP client for Python agency service.
 *
 * All methods construct requests to the Python backend's
 * /api/v1/agencies/* endpoints and return parsed responses.
 */

import { ENV } from "../_core/env";

const PYTHON_BACKEND_URL = ENV.pythonBackendUrl || "http://localhost:8000";
const PROXY_TOKEN = ENV.webGatewayToken;

interface RunParams {
  agencyId: string;
  conversationId: string;
  message: string;
  userToken: string; // Bearer token for the user (passed through to Python)
  tenantId: string;
  userId: number;
}

interface RunResult {
  runId: string;
  status: string;
  response: string;
  creditsUsed: number;
  durationMs: number;
}

interface RunFilters {
  status?: string;
  limit?: number;
  offset?: number;
}

interface RunListResult {
  runs: Array<{
    id: string;
    status: string;
    totalCreditsUsed: number;
    startedAt: string;
    completedAt: string | null;
    durationMs: number | null;
  }>;
  total: number;
}

export class AgencyBridge {
  async executeRun(params: RunParams): Promise<RunResult> {
    /** POST /api/v1/agencies/{agencyId}/run
     * Sends message to Python, which constructs agency-swarm Agency
     * and runs it synchronously. Returns the final result.
     */
  }

  async cancelRun(agencyId: string, runId: string): Promise<void> {
    /** POST /api/v1/agencies/{agencyId}/runs/{runId}/cancel */
  }

  async listRuns(agencyId: string, filters: RunFilters): Promise<RunListResult> {
    /** GET /api/v1/agencies/{agencyId}/runs */
  }

  async getRunDetails(agencyId: string, runId: string): Promise<RunResult> {
    /** GET /api/v1/agencies/{agencyId}/runs/{runId} */
  }
}

export const agencyBridge = new AgencyBridge();
```

Key implementation notes:
- Authentication: Pass both `Authorization: Bearer {proxyToken}` (for Python service-level auth) and `X-User-Token: {userToken}` (for credit deduction context) headers. Also include `X-Tenant-Id` and `X-User-Id` headers.
- Error handling: On non-2xx responses, parse the JSON error body and throw a descriptive error. Map HTTP 402 to credit-insufficient errors, 404 to not-found, and 429 to rate-limit exceeded.
- Timeout: Set a fetch timeout of 120 seconds for run execution (agencies may take longer than typical LLM calls due to multi-step agent runs).
- The bridge does NOT handle streaming -- that is covered in section-07-sse-streaming.

### 5. tRPC Agency Router

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts`

Follows the existing router patterns (e.g., `chatRouter`, `skillsRouter`). Uses `protectedProcedure` from `_core/trpc.ts` for authenticated endpoints and `adminProcedure` for admin operations.

```typescript
/**
 * Agency tRPC Router
 *
 * CRUD for agencies, agent configs, communication flows.
 * Conversation management for agency chat sessions.
 * Template listing and cloning.
 * Admin operations (toggle tenant, kill run).
 */

import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { createRateLimitMiddleware } from "../_core/rateLimitedProcedure";
import { db } from "../db";
import {
  agencies,
  agencyAgents,
  agencyAgentTools,
  agencyCommunicationFlows,
  agencyConversations,
  agencyTools,
} from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { agencyBridge } from "../services/agencyBridge";

// Rate-limited procedures specific to agencies
const agencyCreateProcedure = protectedProcedure.use(
  createRateLimitMiddleware({ namespace: "agency-create", limit: 10, windowMs: 86_400_000 }) // 10/day
);
const agencyMessageProcedure = protectedProcedure.use(
  createRateLimitMiddleware({ namespace: "agency-message", limit: 60, windowMs: 60_000 }) // 60/min
);
const agencyTemplateProcedure = protectedProcedure.use(
  createRateLimitMiddleware({ namespace: "agency-template", limit: 5, windowMs: 86_400_000 }) // 5/day
);

export const agencyRouter = router({
  // --- CRUD ---

  list: protectedProcedure
    .input(z.object({
      status: z.enum(["draft", "published", "archived"]).optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      /** List agencies for the current tenant. Filters by status if provided. */
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      /** Get agency by ID with agents, tools, and communication flows.
       *  Enforces tenant isolation. */
    }),

  create: agencyCreateProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
      description: z.string().optional(),
      systemPrompt: z.string().optional(),
      creditMultiplier: z.number().min(1).max(10).default(1),
      maxAgents: z.number().min(1).max(20).default(10),
      maxRunTimeSeconds: z.number().min(30).max(3600).default(600),
      isFallbackSafe: z.boolean().default(false),
      agents: z.array(z.object({
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        instructions: z.string(),
        model: z.string().max(100),
        modelSettings: z.object({
          max_tokens: z.number().optional(),
          temperature: z.number().min(0).max(2).optional(),
          top_p: z.number().min(0).max(1).optional(),
        }).optional(),
        isEntryPoint: z.boolean().default(false),
        isOptional: z.boolean().default(false),
        position: z.object({ x: z.number(), y: z.number() }).optional(),
        toolIds: z.array(z.string().uuid()).optional(),
      })).min(1),
      communicationFlows: z.array(z.object({
        fromAgentName: z.string(),
        toAgentName: z.string(),
        flowType: z.enum(["delegation", "handoff"]),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      /** Create agency with agents, tool assignments, and communication flows
       *  in a single transaction. Generates UUIDs. Validates exactly one
       *  entry point agent. Returns the new agency ID. */
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      systemPrompt: z.string().optional(),
      creditMultiplier: z.number().min(1).max(10).optional(),
      maxRunTimeSeconds: z.number().min(30).max(3600).optional(),
      isFallbackSafe: z.boolean().optional(),
      status: z.enum(["draft", "published", "archived"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      /** Update agency fields. Verifies ownership (createdBy) or admin role.
       *  Enforces tenant isolation. */
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      /** Soft-delete: sets status to "archived". Does NOT cascade-delete data.
       *  Verifies ownership or admin role. */
    }),

  // --- Conversations ---

  listConversations: protectedProcedure
    .input(z.object({
      agencyId: z.string().uuid(),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      /** List conversations for the current user + agency.
       *  Ordered by updatedAt desc. */
    }),

  createConversation: protectedProcedure
    .input(z.object({
      agencyId: z.string().uuid(),
      title: z.string().max(255).default("New Agency Chat"),
    }))
    .mutation(async ({ ctx, input }) => {
      /** Create a new conversation. Validates agency exists and belongs
       *  to the user's tenant. Returns conversation ID. */
    }),

  // --- Run (delegates to Python) ---

  sendMessage: agencyMessageProcedure
    .input(z.object({
      agencyId: z.string().uuid(),
      conversationId: z.string().uuid(),
      message: z.string().min(1).max(10000),
    }))
    .mutation(async ({ ctx, input }) => {
      /** Validates agency/conversation ownership, then delegates to
       *  AgencyBridge.executeRun(). Returns the run result. */
    }),

  // --- Templates ---

  listTemplates: protectedProcedure
    .query(async ({ ctx }) => {
      /** Returns the 4 starter templates (Research, Content Writer,
       *  Spec Writer, Code Review). Templates are loaded from JSON
       *  files in apps/web/skills/agency-templates/. */
    }),

  createFromTemplate: agencyTemplateProcedure
    .input(z.object({
      templateId: z.string(),
      name: z.string().min(1).max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      /** Clone a template definition into a new agency for the user.
       *  Uses the create logic internally. */
    }),

  // --- Admin ---

  adminListAgencies: adminProcedure
    .input(z.object({
      tenantId: z.string().optional(),
      status: z.enum(["draft", "published", "archived"]).optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      /** Admin: list agencies across all tenants or filtered by tenantId. */
    }),

  adminToggleTenant: adminProcedure
    .input(z.object({
      tenantId: z.string(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      /** Admin: enable/disable agency feature for a specific tenant.
       *  Updates the AGENCY_SWARM_ENABLED feature flag override
       *  in system_settings for the given tenant. */
    }),

  adminKillRun: adminProcedure
    .input(z.object({
      agencyId: z.string().uuid(),
      runId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      /** Admin: immediately cancel a running agency run.
       *  Delegates to AgencyBridge.cancelRun(). */
    }),
});
```

Key design decisions:

- **Tenant isolation:** Every query includes `WHERE tenantId = ctx.user.tenantId`. The `getById` and `update`/`delete` procedures verify the agency belongs to the user's tenant before returning or modifying data.
- **Ownership checks:** For `update` and `delete`, verify that `ctx.user.id === agency.createdBy` OR `ctx.user.role === "admin"`.
- **Rate limiting:** Uses `createRateLimitMiddleware` from `_core/rateLimitedProcedure.ts` with per-IP sliding window. Agency creation is limited to 10/day, messages to 60/minute, template creation to 5/day.
- **Validation:** The `create` procedure validates that exactly one agent has `isEntryPoint: true`. If zero or more than one, throw `TRPCError` with `BAD_REQUEST`.
- **Feature flag gating:** Each procedure should check that the `AGENCY_SWARM_ENABLED` feature flag is enabled. If not, throw `TRPCError` with code `NOT_FOUND` (hiding the feature entirely from disabled tenants). The check reads from system_settings via the existing settings service.

### 6. Internal Multiplier Markup Endpoint

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts`

Add a new Express endpoint after the existing `/api/internal/credits/charge` endpoint (approximately line 434). This endpoint is called by the Python backend at run completion to charge the agency credit multiplier markup.

```typescript
// Internal agency multiplier markup endpoint (Python backend -> Node.js)
app.post("/api/internal/credits/agency-markup", async (req, res) => {
  // Authenticate via gateway token (same pattern as /api/internal/credits/charge)
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ") || !ENV.webGatewayToken) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  const token = authHeader.slice(7);
  if (token !== ENV.webGatewayToken) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const { userId, agencyId, totalGatewayCost, multiplier } = req.body;

    // Validate inputs
    // userId: positive integer
    // agencyId: non-empty string
    // totalGatewayCost: non-negative number
    // multiplier: number >= 1.0

    // Calculate markup: (totalGatewayCost * multiplier) - totalGatewayCost
    // If multiplier is 1.0, markup is 0 -- no deduction needed
    // If markup > 0, deduct via deductCredits with sourceType: "agency"

    const { deductCredits } = await import("../services/creditService");

    const markupAmount = totalGatewayCost * (multiplier - 1);
    if (markupAmount <= 0) {
      return res.json({ success: true, markupCharged: 0 });
    }

    const result = await deductCredits({
      userId,
      amount: markupAmount,
      description: `Agency multiplier markup (${multiplier}x) for agency ${agencyId}`,
      sourceType: "agency",
      metadata: {
        agencyId,
        totalGatewayCost,
        multiplier,
        markupAmount,
        service: "agency.multiplier_markup",
      },
    });

    return res.json({
      success: true,
      markupCharged: markupAmount,
      creditsUsed: result.creditsUsed,
      transactionId: result.transactionId,
    });
  } catch (err: any) {
    const status = err.message?.includes("Insufficient credits") ? 402 : 500;
    return res.status(status).json({ success: false, error: err.message });
  }
});
```

Security:
- Protected by the `SMARTSPEC_WEB_GATEWAY_TOKEN` bearer token, same as all other internal endpoints.
- Does NOT accept user JWTs. Only the Python backend (which has the gateway token) can call this.
- Input validation prevents negative amounts and invalid multipliers.

### 7. Mount Agency Router in appRouter

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers.ts`

Add the import near the top with other router imports (around line 68):

```typescript
import { agencyRouter } from "./routers/agency";
```

Add to the `appRouter` object (after `sandboxRouter` or at the end, before the closing `}`):

```typescript
export const appRouter = router({
  // ... existing routers ...
  sandbox: sandboxRouter,
  agency: agencyRouter,  // NEW
});
```

---

## Feature Flag Gating Pattern

The tRPC router should check the feature flag at the start of each procedure. The recommended pattern:

```typescript
async function assertAgencyEnabled(tenantId: string): Promise<void> {
  // Read AGENCY_SWARM_ENABLED from system_settings
  // Check for tenant-level override first, then global default
  // Throw TRPCError({ code: "NOT_FOUND" }) if disabled
  // This hides the feature entirely from the API surface
}
```

Place this as the first call in each procedure body. This avoids leaking information about disabled features -- the client sees a 404 as if the endpoints don't exist.

---

## Dependency Notes

- **section-02-database-schema:** The Drizzle table definitions (`agencies`, `agencyAgents`, etc.) imported in the router must exist in `drizzle/schema.ts`. Those are created in section-02.
- **section-05-python-router:** The Python FastAPI endpoints that `AgencyBridge` calls (`/api/v1/agencies/{id}/run`, etc.) must be deployed. The bridge is designed to fail gracefully (with descriptive errors) if Python is unavailable.
- **section-07-sse-streaming:** The streaming proxy is NOT part of this section. The `sendMessage` procedure uses `AgencyBridge.executeRun()` which is the non-streaming path. Streaming is handled by a separate Express middleware in section-07.

---

## Checklist

1. Write tests for `agencyRouter` (all 11 test cases listed above)
2. Write tests for `AgencyBridge` (all 6 test cases listed above)
3. Write tests for the internal markup endpoint (4 test cases)
4. Add `"agency"` to `CreditSourceType` in `/home/dev/projects/SmartSpecPro/apps/web/server/services/creditService.ts`
5. Add `"agency"` to `VALID_SOURCE_TYPES` in `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts`
6. Add `"agency"` to `featureType` enum in `/home/dev/projects/SmartSpecPro/apps/web/server/routers/sandbox.ts`
7. Implement `AgencyBridge` class in `/home/dev/projects/SmartSpecPro/apps/web/server/services/agencyBridge.ts`
8. Implement `agencyRouter` in `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts`
9. Add internal markup endpoint in `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts`
10. Mount `agencyRouter` in `/home/dev/projects/SmartSpecPro/apps/web/server/routers.ts`
11. Run `pnpm check` to verify no TypeScript errors
12. Run `pnpm test` to verify all tests pass

---

## Implementation Notes (Post-Build)

### Files Actually Created

| File | Tests |
|------|-------|
| `apps/web/server/services/agencyBridge.ts` | 8 tests |
| `apps/web/server/routers/agency.ts` | 10 tests |
| `apps/web/server/services/__tests__/agencyBridge.test.ts` | |
| `apps/web/server/routers/__tests__/agency.test.ts` | |

### Files Actually Modified

| File | Change |
|------|--------|
| `apps/web/server/routers.ts` | Import + mount `agencyRouter` |
| `apps/web/server/_core/index.ts` | Added `"agency"` to `VALID_SOURCE_TYPES` + agency-markup endpoint |
| `apps/web/server/services/sandbox/dispatchService.ts` | Added `"agency"` to `SandboxDispatchRequest.featureType` |
| `apps/web/server/services/featureFlags.ts` | Added `getTenantFeatureFlag()` and `setTenantFeatureFlag()` |

### Deviations from Plan

1. **CreditSourceType already had "agency"** — Added in section-01 pre-validation. No change needed.
2. **creditSourceTypeEnum in schema.ts already had "agency"** — Added in section-02. No change needed.
3. **sandbox.ts featureType already had "agency"** — Modified `dispatchService.ts` instead (where the type is actually defined).
4. **ID generation: `crypto.randomUUID()` instead of `nanoid(36)`** — Code review found that nanoid strings fail `z.string().uuid()` validation. Switched to `crypto.randomUUID()`.
5. **Bridge auth: gateway token instead of user token** — User chose to use `Authorization: Bearer {GATEWAY_TOKEN}` with `X-User-Token` header instead of user JWT as Bearer.
6. **Feature flags: tenant-scoped** — User chose to implement tenant-scoped Redis keys (`feature-flag:{flagName}:{tenantId}`) with fallback to global flag. Added `getTenantFeatureFlag()` and `setTenantFeatureFlag()` to `featureFlags.ts`.
7. **Templates deferred** — `listTemplates` and `createFromTemplate` procedures not implemented in this section; deferred to section-12.
8. **Markup endpoint simplified** — Accepts `{ userId, agencyId, markupAmount, sourceType }` instead of computing from multiplier. Python backend pre-computes the markup.
9. **N+1 query fix** — getById uses `inArray()` for agent tool assignments instead of per-agent loop.
10. **sendMessage validates conversation+agency** — WHERE clause checks both `conversationId` AND `agencyId` to prevent cross-agency access.
11. **Update WHERE includes tenant** — Prevents IDOR by including `tenantId` in update WHERE clause.

### Test Summary

- **agencyBridge.test.ts**: 8 tests (executeRun body/headers, error handling, cancelRun, listRuns, singleton)
- **agency.test.ts**: 10 tests (exports, list, feature flag gating, sendMessage, adminToggleTenant x2, adminKillRun, create validation, create transaction, delete soft-delete)