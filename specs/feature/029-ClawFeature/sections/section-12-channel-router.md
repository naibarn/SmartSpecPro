I now have everything needed. Let me produce the section content.

# Section 12: F10 -- Channel Router

## Overview

This section implements the Channel Router feature (F10), which provides configurable rule-based routing for inbound channel messages. When a message arrives through any channel adapter (Telegram, WhatsApp, LINE, Slack, Discord, Widget), the router evaluates tenant-specific rules to determine an override routing target such as a specific agency, persona, or workflow. Rules are priority-ordered, first-match-wins, cached in Redis, and limited to safe string operators (no regex, preventing ReDoS attacks).

**Feature Flag:** `channelRouter` (default: `false`). When disabled, the router is skipped entirely and messages route through normal processing.

**Depends on:**
- **section-01-database** -- The `channel_routing_rules` table must exist before this section can be implemented.
- **section-05-channel-adapter** -- The `ChannelAdapter` interface, `ChatIngressEvent` type, and `channelGateway.ingest()` function must be in place.
- **section-14-feature-flags** -- The feature flag system must be implemented so `channelRouter` can gate this feature.

## Database Schema (Reference)

The `channel_routing_rules` table is created in section-01-database. For implementer reference, the expected schema is:

- `id` -- VARCHAR(36) PK, generated UUID
- `tenant_id` -- VARCHAR FK to tenants(id), NOT NULL, ON DELETE CASCADE
- `name` -- TEXT NOT NULL (human-readable rule name)
- `description` -- TEXT (optional)
- `priority` -- INTEGER NOT NULL (higher = evaluated first; rules ordered DESC)
- `is_active` -- BOOLEAN NOT NULL DEFAULT true
- `conditions` -- JSONB NOT NULL (array of condition objects)
- `action` -- JSONB NOT NULL (routing action: target type + target ID)
- `total_matches` -- INTEGER NOT NULL DEFAULT 0
- `last_matched_at` -- TIMESTAMP (nullable)
- `created_at` / `updated_at` -- TIMESTAMP defaults

The Drizzle schema reference name is `channelRoutingRules` in `apps/web/drizzle/schema.ts`.

## File Listing

| File | Action |
|------|--------|
| `apps/web/server/services/__tests__/channelRouterService.test.ts` | CREATE |
| `apps/web/server/services/channelRouterService.ts` | CREATE |
| `apps/web/server/services/channelGateway.ts` | MODIFY |
| `apps/web/server/routers/channelRouter.ts` | CREATE |
| `apps/web/server/routers/index.ts` (or wherever routers are merged) | MODIFY |
| `apps/web/client/src/pages/AdminChannelRouter.tsx` | CREATE |
| `apps/web/client/src/App.tsx` | MODIFY (add route) |

---

## Tests (Write First)

### Test File: `apps/web/server/services/__tests__/channelRouterService.test.ts`

All tests use the Vitest conventions established in the project: `vi.hoisted()` for mock setup, module-level `vi.mock()`, and Drizzle ORM operators mocked as spy functions.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mocks ---
const { mockSelect, mockGetRedisClient } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockGetRedisClient: vi.fn(),
}));

vi.mock("../../db", () => ({
  db: { select: mockSelect },
}));

vi.mock("../redis", () => ({
  getRedisClient: mockGetRedisClient,
}));

vi.mock("../../../drizzle/schema", () => ({
  channelRoutingRules: {
    tenantId: "crr.tenantId",
    isActive: "crr.isActive",
    priority: "crr.priority",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: any, val: any) => ({ _type: "eq", val })),
  and: vi.fn((...args: any[]) => ({ _type: "and", args })),
  desc: vi.fn((col: any) => ({ _type: "desc", col })),
}));

import { evaluateRules } from "../channelRouterService";
import type { ChatIngressEvent } from "@shared/channelTypes";

// --- Helpers ---

function makeEvent(overrides: Partial<ChatIngressEvent> = {}): ChatIngressEvent {
  return {
    eventId: "evt-1",
    eventType: "user_message",
    tenantId: "tenant-1",
    userId: 42,
    conversationId: "conv-1",
    conversationType: "chat",
    channel: { type: "telegram", connectionId: "conn-1" },
    message: { text: "hello world", attachments: [] },
    idempotencyKey: "tg:bot1:100",
    ...overrides,
  };
}

function makeRule(overrides: any = {}) {
  return {
    id: "rule-1",
    tenantId: "tenant-1",
    name: "Test Rule",
    priority: 100,
    isActive: true,
    conditions: [
      { field: "message.text", operator: "contains", value: "hello" },
    ],
    action: { type: "agency", targetId: "agency-1" },
    totalMatches: 0,
    lastMatchedAt: null,
    ...overrides,
  };
}

describe("channelRouterService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("evaluateRules", () => {
    // Test: rules evaluated in priority DESC order
    it("evaluates rules in priority DESC order (highest first)", async () => {
      /** 
       * Setup: two rules, low-priority matches but high-priority checked first.
       * High-priority rule does NOT match, low-priority rule DOES match.
       * Verify correct rule is returned.
       */
    });

    // Test: first matching rule wins (short-circuit)
    it("returns first matching rule and stops evaluation", async () => {
      /**
       * Setup: two rules that both match. Verify only the higher-priority
       * rule is returned (short-circuit behavior).
       */
    });

    // Test: all conditions must match for rule to fire
    it("requires ALL conditions to match for a rule to fire", async () => {
      /**
       * Setup: rule with 2 conditions. Event matches condition 1 but not 
       * condition 2. Verify rule does NOT match (AND semantics).
       */
    });

    // Test: returns null when no rules match
    it("returns null when no rules match the event", async () => {
      /**
       * Setup: rules exist but none match the event content.
       * Verify evaluateRules returns null.
       */
    });

    // Test: no regex operator accepted (ReDoS prevention)
    it("rejects regex operator during condition evaluation", async () => {
      /**
       * Setup: rule with operator: "regex".
       * Verify it is skipped or treated as non-matching (never executed).
       */
    });

    // Test: string operators work correctly
    it("supports eq, contains, startsWith, endsWith, in operators", async () => {
      /**
       * Verify each operator:
       * - eq: exact string match
       * - contains: substring match
       * - startsWith: prefix match
       * - endsWith: suffix match
       * - in: value exists in comma-separated list
       */
    });

    // Test: rules cached in Redis with 30s TTL
    it("loads rules from Redis cache when available", async () => {
      /**
       * Setup: Redis GET returns cached rules JSON.
       * Verify DB is NOT queried.
       */
    });

    // Test: falls back to DB when cache miss
    it("loads rules from DB on cache miss and populates cache", async () => {
      /**
       * Setup: Redis GET returns null. DB returns rules.
       * Verify rules loaded from DB and SET called with 30s TTL.
       */
    });

    // Test: cache invalidated on rule create/update/delete
    it("invalidateCache deletes the Redis key for a tenant", async () => {
      /**
       * Verify invalidateCache calls Redis DEL with correct key pattern.
       */
    });
  });
});
```

### Test File: `apps/web/server/routers/__tests__/channelRouter.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * tRPC router tests for channelRouter.
 * Follow existing router test patterns (e.g., agency-admin.test.ts).
 */

describe("channelRouter router", () => {
  // Test: conditions validated against Zod schema on save
  it("rejects rule with invalid condition operator", async () => {
    /**
     * Call create mutation with condition operator: "regex".
     * Expect Zod validation error.
     */
  });

  // Test: max 50 rules per tenant enforced
  it("rejects creation when tenant already has 50 rules", async () => {
    /**
     * Mock DB count query returning 50.
     * Call create mutation.
     * Expect PRECONDITION_FAILED error.
     */
  });

  // Test: domain_admin can manage own tenant's rules
  it("allows domain_admin to create rules for own tenant", async () => {
    /**
     * Context: user role=domain_admin, tenantId=tenant-1.
     * Call create with tenantId=tenant-1.
     * Expect success.
     */
  });

  // Test: cache invalidated on rule create/update/delete
  it("invalidates Redis cache after rule creation", async () => {
    /**
     * Call create mutation successfully.
     * Verify invalidateCache was called for the tenant.
     */
  });

  // Test: testRule endpoint evaluates a sample message against rules
  it("testRule returns matching rule for a sample message", async () => {
    /**
     * Setup: tenant has rules. Call testRule with sample message text.
     * Verify response includes matched rule ID and name.
     */
  });
});
```

---

## Implementation Details

### 12.1 Channel Router Service

**File:** `apps/web/server/services/channelRouterService.ts`

This is the core routing engine. It loads rules from Redis cache (falling back to DB), evaluates conditions against a `ChatIngressEvent`, and returns the first matching rule's action or `null`.

**Key types and functions:**

```typescript
// --- Condition types ---

/** Allowed string operators (NO regex -- ReDoS prevention) */
type ConditionOperator = "eq" | "contains" | "startsWith" | "endsWith" | "in";

interface RuleCondition {
  /** Dot-path field on ChatIngressEvent (e.g., "message.text", "channel.type") */
  field: string;
  /** String comparison operator */
  operator: ConditionOperator;
  /** Value(s) to compare against. For "in", a comma-separated string or array. */
  value: string | string[];
}

/** Routing action when a rule matches */
interface RouteAction {
  type: "agency" | "persona" | "workflow" | "conversation";
  targetId: string;
}

/** Full rule as stored in DB */
interface ChannelRoutingRule {
  id: string;
  tenantId: string;
  name: string;
  priority: number;
  isActive: boolean;
  conditions: RuleCondition[];
  action: RouteAction;
  totalMatches: number;
  lastMatchedAt: Date | null;
}

// --- Main functions ---

/**
 * Evaluate routing rules for a tenant against an inbound event.
 * Returns the action from the first matching rule, or null.
 *
 * Rules are loaded from Redis cache (key: `channel-router:${tenantId}`,
 * TTL: 30 seconds). On cache miss, loads from DB ordered by priority DESC,
 * populates cache, then evaluates.
 *
 * Evaluation is short-circuit: stops at the first matching rule.
 * All conditions in a rule must match (AND semantics).
 */
export async function evaluateRules(
  event: ChatIngressEvent,
  tenantId: string,
): Promise<{ rule: ChannelRoutingRule; action: RouteAction } | null>;

/**
 * Invalidate the Redis cache for a tenant's routing rules.
 * Must be called after any rule create/update/delete.
 */
export async function invalidateCache(tenantId: string): Promise<void>;
```

**Condition evaluation logic:**

The evaluator extracts a field value from the `ChatIngressEvent` using the dot-path in `condition.field`. Supported field paths include:
- `message.text` -- the message body
- `channel.type` -- the channel adapter type (telegram, whatsapp, etc.)
- `eventType` -- user_message, command, callback
- `conversationType` -- chat, agency

For each condition, the operator is applied:
- `eq` -- `fieldValue === condition.value` (case-insensitive)
- `contains` -- `fieldValue.toLowerCase().includes(condition.value.toLowerCase())`
- `startsWith` -- `fieldValue.toLowerCase().startsWith(condition.value.toLowerCase())`
- `endsWith` -- `fieldValue.toLowerCase().endsWith(condition.value.toLowerCase())`
- `in` -- The value is split by commas (if string) or treated as array. Returns true if `fieldValue` is in the list (case-insensitive).

Any unrecognized operator (including `regex`) is treated as a non-match and logged as a warning. This is the ReDoS prevention mechanism -- regex is never executed.

**Redis caching strategy:**

- Cache key format: `channel-router:rules:${tenantId}`
- TTL: 30 seconds (short enough to pick up changes quickly, long enough to avoid per-message DB queries)
- On cache hit: parse JSON and use directly
- On cache miss: query `channel_routing_rules` from DB where `tenantId = X AND isActive = true`, ordered by `priority DESC`. Serialize to JSON and SET with EX 30.
- `invalidateCache(tenantId)` calls `DEL channel-router:rules:${tenantId}`

**Lazy loading optimization:**

Only load and evaluate rules when the tenant has the `channelRouter` feature flag enabled. The caller (`channelGateway.ingest`) checks the flag before calling `evaluateRules`. This prevents any overhead for tenants that have not enabled the feature.

**Match statistics update:**

When a rule matches, increment `totalMatches` and set `lastMatchedAt` to `now()` using a fire-and-forget DB update (no await, catch errors silently). This avoids adding latency to the message processing hot path.

### 12.2 Channel Gateway Integration

**File:** `apps/web/server/services/channelGateway.ts` (MODIFY)

The `ingest()` function is modified to call the channel router before the existing routing logic. The integration point is after connection validation (step 2 in the current code) but before the conversation type routing (step 4).

**Modification approach:**

```typescript
// Inside ingest(), after validating the connection and before routing:

// --- NEW: Channel Router evaluation ---
// Check feature flag first (lazy loading)
const tenantSettings = await getTenantSettings(event.tenantId);
if (tenantSettings?.featureFlags?.channelRouter) {
  const routeResult = await evaluateRules(event, event.tenantId);
  if (routeResult) {
    // Override routing target based on matched rule action
    // The action specifies the target type and ID
    auditLogger.log({
      eventType: "channel_router_match",
      metadata: {
        ruleId: routeResult.rule.id,
        ruleName: routeResult.rule.name,
        actionType: routeResult.action.type,
        targetId: routeResult.action.targetId,
        tenantId: event.tenantId,
      },
    });
    // Apply the route override (e.g., redirect to a specific agency)
    // Implementation depends on action.type
  }
}
```

The route override logic applies the matched rule's action:
- `action.type === "agency"` -- Override the conversation routing to use the specified agency ID. This may involve creating or looking up an agency conversation for the user.
- `action.type === "persona"` -- Set a persona override on the conversation context before processing.
- `action.type === "workflow"` -- Trigger the specified workflow with the message as input.
- `action.type === "conversation"` -- Route to a specific existing conversation.

The override is applied as early as possible in the pipeline so that the correct target processes the message.

### 12.3 tRPC Router

**File:** `apps/web/server/routers/channelRouter.ts` (CREATE)

The router provides CRUD operations for channel routing rules plus a test endpoint. Uses `domainAdminProcedure` for all mutations (domain_admin can manage their own tenant's rules, admin can manage any tenant's rules).

**Procedures:**

```typescript
import { z } from "zod";
import { router, domainAdminProcedure, protectedProcedure } from "../_core/trpc";

// --- Zod schemas ---

const conditionOperatorSchema = z.enum([
  "eq", "contains", "startsWith", "endsWith", "in"
]);

const ruleConditionSchema = z.object({
  field: z.string().min(1).max(100),
  operator: conditionOperatorSchema,
  value: z.union([z.string().max(500), z.array(z.string().max(100)).max(50)]),
});

const routeActionSchema = z.object({
  type: z.enum(["agency", "persona", "workflow", "conversation"]),
  targetId: z.string().min(1).max(100),
});

export const channelRouterRouter = router({
  /** List all routing rules for a tenant, ordered by priority DESC */
  list: domainAdminProcedure
    .input(z.object({ tenantId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      // Use input.tenantId if admin, otherwise ctx.user.currentTenantId
      // Return rules ordered by priority DESC
    }),

  /** Create a new routing rule */
  create: domainAdminProcedure
    .input(z.object({
      tenantId: z.string().optional(),
      name: z.string().min(1).max(200),
      description: z.string().max(1000).optional(),
      priority: z.number().int().min(0).max(9999),
      conditions: z.array(ruleConditionSchema).min(1).max(10),
      action: routeActionSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. Resolve tenantId (admin can specify, domain_admin uses own)
      // 2. Count existing rules -- enforce max 50 per tenant
      // 3. Insert rule
      // 4. Invalidate Redis cache for tenant
      // 5. Return created rule
    }),

  /** Update an existing rule */
  update: domainAdminProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(1000).optional(),
      priority: z.number().int().min(0).max(9999).optional(),
      isActive: z.boolean().optional(),
      conditions: z.array(ruleConditionSchema).min(1).max(10).optional(),
      action: routeActionSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. Verify rule belongs to user's tenant (or user is admin)
      // 2. Update fields
      // 3. Invalidate Redis cache
      // 4. Return updated rule
    }),

  /** Delete a routing rule */
  delete: domainAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // 1. Verify rule belongs to user's tenant (or user is admin)
      // 2. Delete rule
      // 3. Invalidate Redis cache
    }),

  /** Reorder rules by setting new priorities */
  reorder: domainAdminProcedure
    .input(z.object({
      tenantId: z.string().optional(),
      ruleIds: z.array(z.string()).min(1).max(50),
    }))
    .mutation(async ({ ctx, input }) => {
      // Set priority = (ruleIds.length - index) * 10 for each rule
      // Invalidate Redis cache
    }),

  /** Test a sample message against the tenant's rules */
  testRule: domainAdminProcedure
    .input(z.object({
      tenantId: z.string().optional(),
      sampleMessage: z.string().min(1).max(5000),
      channelType: z.string().optional().default("telegram"),
    }))
    .query(async ({ ctx, input }) => {
      // 1. Construct a synthetic ChatIngressEvent from the sample
      // 2. Call evaluateRules (bypassing cache for test accuracy)
      // 3. Return matched rule info or null
    }),
});
```

**Key enforcement rules in the router:**

1. **Max 50 rules per tenant:** Before inserting a new rule, count existing rules for the tenant. If count >= 50, throw `TRPCError({ code: "PRECONDITION_FAILED", message: "Maximum 50 routing rules per tenant" })`.

2. **Zod validation on conditions:** The `conditionOperatorSchema` uses `z.enum()` which rejects any operator not in the allowlist. The `regex` operator cannot pass validation. This is the compile-time prevention layer for ReDoS.

3. **Tenant isolation:** For `domain_admin` users, `tenantId` is forced to `ctx.user.currentTenantId`. Only `admin` role users can specify an arbitrary `tenantId`.

4. **Cache invalidation:** Every mutation (`create`, `update`, `delete`, `reorder`) calls `invalidateCache(tenantId)` after the DB operation succeeds.

### 12.4 Admin UI

**File:** `apps/web/client/src/pages/AdminChannelRouter.tsx` (CREATE)

This page provides a visual interface for managing channel routing rules. It is accessible to `domain_admin` and `admin` users.

**UI Components:**

1. **Rule List** -- Displays all rules for the tenant in priority order. Each rule card shows name, conditions summary, action target, match count, and last matched timestamp. Active/inactive toggle per rule.

2. **Rule Editor** -- Modal or side panel for creating/editing rules. Contains:
   - Name and description fields
   - Condition builder: each condition has a field dropdown (message.text, channel.type, eventType, conversationType), an operator dropdown (eq, contains, startsWith, endsWith, in), and a value input.
   - Action selector: type dropdown (agency, persona, workflow) and a target picker (e.g., agency selector combobox).
   - Add/remove condition rows (max 10 per rule).

3. **Drag-and-Drop Priority Ordering** -- Rules can be reordered by dragging. On drop, the `reorder` mutation is called with the new order. Use a library like `@dnd-kit/core` or the existing drag-drop patterns in the project.

4. **Rule Testing Sandbox** -- A text input where the admin can paste a sample message. A "Test" button calls the `testRule` query and displays which rule (if any) would match, along with the action that would be taken.

5. **Match Statistics** -- Each rule displays `totalMatches` count and `lastMatchedAt` timestamp for operational visibility.

**Route registration in `apps/web/client/src/App.tsx`:**

Add a route entry for `/admin/channel-router` that renders `AdminChannelRouter`. This should be gated behind `domain_admin` or `admin` role checks in the route guard, consistent with other admin pages.

**Menu integration:**

Add a "Channel Router" menu item under the admin section in the navigation. This should respect the `channelRouter` feature flag -- only show the menu item when the flag is enabled for the current tenant.

---

## Performance Considerations (from Section 20)

These constraints are critical to prevent the routing evaluation from becoming a bottleneck on the message processing hot path:

1. **Rule count cap:** Max 50 active rules per tenant. Enforced at the tRPC create mutation level. This bounds the worst-case evaluation time.

2. **Short-circuit evaluation:** Rules are priority-ordered DESC. The evaluator stops at the first matching rule. For tenants with well-designed rules, most messages will match early.

3. **Redis cache:** Rules are cached per tenant with 30-second TTL. Since the cache key is tenant-scoped, a rule change for one tenant does not invalidate other tenants' caches. Cache invalidation happens only on mutation.

4. **Lazy loading:** The channel router is only invoked when the tenant has `channelRouter: true` in their feature flags. Tenants without the flag incur zero overhead -- no Redis lookup, no DB query, no evaluation.

5. **Fire-and-forget statistics:** Match count and timestamp updates are non-blocking. They use `.catch(() => {})` to prevent statistics failures from affecting message delivery.

---

## Security Considerations

1. **No regex operators:** The `conditionOperatorSchema` Zod enum does not include `regex`. This is a hard block at the API validation layer. Even if a rule somehow got into the DB with a `regex` operator (e.g., manual SQL insert), the evaluator treats unrecognized operators as non-matching.

2. **Tenant isolation:** Rules are always scoped by `tenantId`. The service queries include `tenantId` in the WHERE clause. The tRPC router enforces tenant ownership before any mutation. A `domain_admin` can only manage rules for their own tenant.

3. **Input size limits:** Condition values are capped at 500 characters. The `in` operator's value array is capped at 50 entries. Rule names are capped at 200 characters. These prevent abuse via extremely large payloads.

4. **Condition field allowlist:** The evaluator should only allow access to safe fields on `ChatIngressEvent`. Fields like `message.text`, `channel.type`, `eventType`, and `conversationType` are explicitly supported. Arbitrary dot-path traversal should be restricted to a defined set of fields to prevent information leakage from internal event properties.

---

## Implementation Checklist

1. Write all test stubs in `apps/web/server/services/__tests__/channelRouterService.test.ts`
2. Write router test stubs in `apps/web/server/routers/__tests__/channelRouter.test.ts`
3. Implement `channelRouterService.ts` with `evaluateRules()` and `invalidateCache()`
4. Make tests pass
5. Implement `channelRouter.ts` tRPC router with all CRUD + test procedures
6. Make router tests pass
7. Modify `channelGateway.ts` `ingest()` to call `evaluateRules` when feature flag is enabled
8. Register the router in the tRPC app router merge
9. Build `AdminChannelRouter.tsx` with rule list, editor, drag-drop reorder, and test sandbox
10. Add route in `App.tsx` and menu entry for channel router admin page
11. Run full test suite: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test`
12. Run type check: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check`