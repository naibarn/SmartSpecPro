I now have all the context I need. Let me generate the section content.

# Section 14: Feature Flags & Tenant Configuration

## Overview

This section implements a tenant-scoped feature flag system that gates all 10 Claw features (F01-F10). Feature flags are stored in the existing `tenants.settings` JSONB column under a `featureFlags` sub-key. A dedicated tRPC mutation with server-side allowlist validation ensures only recognized flag keys are persisted, preventing privilege escalation through arbitrary key injection. RBAC rules allow `domain_admin` to toggle flags for their own tenant, while `admin` can modify flags for any tenant. Enforcement happens at three levels: tRPC middleware, Express route guards, and conditional UI rendering.

**Depends on:** Section 01 (Database Foundation) -- the `tenants` table and its `settings` JSONB column must exist. No schema migration is needed for this section since `tenants.settings` already supports `[key: string]: any`.

---

## Tests (Write First)

All tests use Vitest with the existing project conventions. Create the test file before any implementation code.

### Test File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/tenantFeatureFlags.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for TenantFeatureFlags allowlist, validation, and RBAC.
 *
 * Covers:
 * - Allowlist validation strips unrecognized keys
 * - Default values applied for missing flags
 * - Merge preserves existing settings keys
 * - RBAC: domain_admin own-tenant-only, admin any tenant
 */

// Mock the database module
const mockDb = vi.hoisted(() => ({
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  returning: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

describe("validateFeatureFlags", () => {
  it("strips unrecognized keys from input", async () => {
    // Import the validation function
    // validateFeatureFlags should remove keys not in the ALLOWED_FEATURE_FLAGS list
    // Input: { canvas: true, hackerMode: true }
    // Expected output: { canvas: true } (hackerMode stripped)
  });

  it("preserves all recognized keys", async () => {
    // All 10 keys from TenantFeatureFlags should pass through
    // multiChannel, chatWidget, browserTool, canvas, voiceChat,
    // webhookTriggers, costDisplay, personaSystem, crossAgency, channelRouter
  });

  it("rejects non-boolean values", async () => {
    // Input: { canvas: "yes" } should be rejected or coerced
  });
});

describe("getFeatureFlagDefaults", () => {
  it("returns correct defaults for all 10 flags", () => {
    // costDisplay and personaSystem default to true
    // All others default to false
  });
});

describe("mergeFeatureFlags", () => {
  it("preserves existing settings keys when updating featureFlags", async () => {
    // Existing settings: { enableBlog: true, googleAnalyticsId: "UA-xxx" }
    // Update featureFlags: { canvas: true }
    // Result settings: { enableBlog: true, googleAnalyticsId: "UA-xxx", featureFlags: { ...defaults, canvas: true } }
  });

  it("merges with existing featureFlags preserving unchanged flags", async () => {
    // Existing: { featureFlags: { canvas: true, voiceChat: false } }
    // Update: { voiceChat: true }
    // Result featureFlags: { canvas: true, voiceChat: true, ...other defaults }
  });
});
```

### Test File: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/tenantFeatureFlags.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the updateFeatureFlags tRPC mutation and
 * the requireFeatureFlag middleware.
 *
 * Covers:
 * - Allowlist validation at mutation level
 * - RBAC: domain_admin own tenant only, admin any tenant
 * - Feature flag false -> tRPC endpoint returns FORBIDDEN
 * - Existing settings preserved during update
 * - Generic settings mutation cannot overwrite featureFlags
 */

describe("updateFeatureFlags mutation", () => {
  it("validates keys against allowlist and strips unrecognized", async () => {
    // Call mutation with { canvas: true, unknownFlag: true }
    // Only canvas should be saved
  });

  it("domain_admin can only toggle own tenant flags", async () => {
    // domain_admin with registeredDomain matching tenant -> succeeds
  });

  it("domain_admin cannot toggle another tenant flags", async () => {
    // domain_admin with registeredDomain NOT matching target tenant -> FORBIDDEN
  });

  it("admin can modify any tenant flags", async () => {
    // admin role -> succeeds regardless of tenant
  });

  it("preserves existing settings keys when updating featureFlags", async () => {
    // Tenant has settings { enableBlog: true, stripePublicKey: "pk_xxx" }
    // After updateFeatureFlags({ canvas: true })
    // settings should still contain enableBlog and stripePublicKey
  });
});

describe("requireFeatureFlag middleware", () => {
  it("allows request when feature flag is true", async () => {
    // Tenant settings: { featureFlags: { canvas: true } }
    // Middleware for 'canvas' -> next() called
  });

  it("returns FORBIDDEN when feature flag is false", async () => {
    // Tenant settings: { featureFlags: { canvas: false } }
    // Middleware for 'canvas' -> throws TRPCError FORBIDDEN
  });

  it("returns FORBIDDEN when featureFlags sub-key is missing", async () => {
    // Tenant settings: {} (no featureFlags at all)
    // Middleware checks against defaults; if default is false -> FORBIDDEN
  });

  it("allows request when flag is missing but default is true", async () => {
    // costDisplay and personaSystem default to true
    // Tenant settings: {} -> middleware for 'costDisplay' -> passes
  });
});

describe("generic settings mutation audit", () => {
  it("strips featureFlags from generic updateTenantSettings payload", async () => {
    // If a generic settings mutation exists, it must NOT allow
    // overwriting the featureFlags sub-key directly
  });
});
```

### Test File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/__tests__/FeatureFlagGate.test.tsx`

```typescript
import { describe, it, expect, vi } from "vitest";

/**
 * Tests for the FeatureFlagGate React component.
 *
 * Covers:
 * - Renders children when flag is true
 * - Renders nothing (or fallback) when flag is false
 * - Handles missing featureFlags gracefully using defaults
 */

describe("FeatureFlagGate", () => {
  it("renders children when feature flag is enabled", () => {
    // Provide tenant context with featureFlags.canvas = true
    // <FeatureFlagGate flag="canvas"><div>Canvas</div></FeatureFlagGate>
    // Expect "Canvas" to be in the document
  });

  it("does not render children when feature flag is disabled", () => {
    // Provide tenant context with featureFlags.canvas = false
    // Expect "Canvas" NOT to be in the document
  });

  it("renders fallback when flag is disabled and fallback provided", () => {
    // <FeatureFlagGate flag="canvas" fallback={<div>Upgrade</div>}>
    // Expect "Upgrade" to be in the document
  });

  it("uses default value when featureFlags is undefined", () => {
    // costDisplay defaults to true -> should render children
    // browserTool defaults to false -> should not render children
  });
});
```

---

## Implementation Details

### 14.1 Feature Flag Type Definition and Constants

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/shared/featureFlags.ts`

This shared module defines the `TenantFeatureFlags` interface, the allowlist of valid keys, and defaults. It is importable by both server and client code.

```typescript
/**
 * Tenant-scoped feature flags for gating Claw features.
 * 
 * Stored in tenants.settings.featureFlags (JSONB sub-key).
 * All flags default to false unless specified otherwise.
 */
export interface TenantFeatureFlags {
  multiChannel: boolean;     // F01 — Multi-channel adapters
  chatWidget: boolean;       // F02 — Embeddable chat widget
  browserTool: boolean;      // F03 — Browser automation tool
  canvas: boolean;           // F04 — Canvas / AI artifacts
  voiceChat: boolean;        // F05 — Voice chat mode
  webhookTriggers: boolean;  // F06 — Inbound webhook triggers
  costDisplay: boolean;      // F07 — Per-response cost display
  personaSystem: boolean;    // F08 — AI persona system
  crossAgency: boolean;      // F09 — Cross-agency communication
  channelRouter: boolean;    // F10 — Channel routing rules
}

export type FeatureFlagKey = keyof TenantFeatureFlags;

/**
 * Server-side allowlist of valid feature flag keys.
 * Used for validation — any keys not in this set are stripped before saving.
 */
export const ALLOWED_FEATURE_FLAGS: ReadonlySet<string> = new Set<FeatureFlagKey>([
  "multiChannel",
  "chatWidget",
  "browserTool",
  "canvas",
  "voiceChat",
  "webhookTriggers",
  "costDisplay",
  "personaSystem",
  "crossAgency",
  "channelRouter",
]);

/**
 * Default values for each feature flag.
 * costDisplay and personaSystem default to true (low-risk, high-value).
 * All others default to false (opt-in for new features).
 */
export const FEATURE_FLAG_DEFAULTS: Readonly<TenantFeatureFlags> = {
  multiChannel: false,
  chatWidget: false,
  browserTool: false,
  canvas: false,
  voiceChat: false,
  webhookTriggers: false,
  costDisplay: true,
  personaSystem: true,
  crossAgency: false,
  channelRouter: false,
};
```

### 14.2 Feature Flag Service

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/tenantFeatureFlagService.ts`

This service provides utility functions for validating, reading, and writing tenant feature flags. It uses a read-modify-write pattern against the `tenants.settings` JSONB column.

Key functions:

- **`validateFeatureFlags(input: Record<string, unknown>): Partial<TenantFeatureFlags>`** -- Strips unrecognized keys by intersecting with `ALLOWED_FEATURE_FLAGS`. Rejects non-boolean values via Zod validation.

- **`resolveFeatureFlags(settings: Record<string, any> | null): TenantFeatureFlags`** -- Given a tenant's `settings` JSON, extracts the `featureFlags` sub-key and merges with `FEATURE_FLAG_DEFAULTS` to produce a complete flag set. Missing or undefined flags fall back to their defaults.

- **`updateTenantFeatureFlags(tenantId: string, flagUpdates: Partial<TenantFeatureFlags>): Promise<TenantFeatureFlags>`** -- Implements the read-modify-write pattern:
  1. Read current `tenants.settings` from DB for the given `tenantId`
  2. Extract existing `featureFlags` sub-key (or empty object)
  3. Merge `flagUpdates` into existing flags (preserving unchanged flags)
  4. Apply defaults for any missing keys
  5. Write back the full `settings` object with only the `featureFlags` sub-key updated
  6. All other settings keys (e.g., `enableBlog`, `googleAnalyticsId`, `stripePublicKey`) remain untouched

- **`isFeatureEnabled(settings: Record<string, any> | null, flag: FeatureFlagKey): boolean`** -- Convenience function that checks a single flag with default fallback.

### 14.3 tRPC Mutation: `updateFeatureFlags`

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers.ts` (add a new sub-router or extend an existing one)

Alternatively, create a dedicated router file.

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/tenantFeatureFlags.ts`

This router exposes:

1. **`getFeatureFlags` query** (protectedProcedure) -- Returns the resolved feature flags for the caller's current tenant. Uses `resolveFeatureFlags()` with the tenant's settings from DB.

2. **`updateFeatureFlags` mutation** (domainAdminProcedure) -- Accepts a partial `TenantFeatureFlags` object and an optional `tenantId`. RBAC logic:
   - If caller is `domain_admin`: they can only update their own tenant (determined by matching `ctx.user.registeredDomain` against the target tenant's `primaryDomain`, or by matching `ctx.tenantId`). If `tenantId` is provided and does not match their tenant, throw `FORBIDDEN`.
   - If caller is `admin`: they can update any tenant. `tenantId` parameter is required.

   Input Zod schema:
   ```typescript
   z.object({
     tenantId: z.string().optional(),
     flags: z.record(z.string(), z.boolean()),
   })
   ```

   Processing steps:
   1. Validate `flags` keys against the `ALLOWED_FEATURE_FLAGS` allowlist, strip unrecognized keys
   2. Enforce RBAC (domain_admin own-tenant-only, admin any-tenant)
   3. Call `updateTenantFeatureFlags()` service function
   4. Clear any tenant cache (`clearTenantCache()` from `server/_core/tenant`)
   5. Return the updated full `TenantFeatureFlags` object

3. **Register the router** in `/home/dev/projects/SmartSpecPro/apps/web/server/routers.ts` by importing and adding it to the `appRouter` definition:
   ```typescript
   import { tenantFeatureFlagsRouter } from "./routers/tenantFeatureFlags";
   // ...
   export const appRouter = router({
     // ... existing routers
     tenantFeatureFlags: tenantFeatureFlagsRouter,
   });
   ```

### 14.4 Feature Flag Enforcement Middleware

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/server/middleware/requireFeatureFlag.ts`

A reusable tRPC middleware factory that checks whether a specific feature flag is enabled for the current tenant. If the flag is disabled, the middleware throws a `TRPCError` with code `FORBIDDEN`.

```typescript
/**
 * Creates a tRPC middleware that checks a tenant feature flag.
 * 
 * Usage in a router:
 *   protectedProcedure
 *     .use(requireFeatureFlag("canvas"))
 *     .query(async ({ ctx }) => { ... })
 * 
 * When the flag is false or missing (and default is false),
 * throws TRPCError { code: "FORBIDDEN", message: "Feature 'canvas' is not enabled for this tenant" }
 */
```

Implementation approach:
1. Extract `tenantId` from `ctx.tenantId`
2. Query the tenant's `settings` from DB (or use a cached tenant object if available on the request)
3. Call `isFeatureEnabled(settings, flagKey)` from the service
4. If false, throw `TRPCError` with code `FORBIDDEN`
5. If true, call `next()` to continue the procedure chain

For Express routes (webhooks, WebSocket upgrades), provide a similar Express middleware factory:

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/server/middleware/requireFeatureFlagExpress.ts`

```typescript
/**
 * Express middleware factory for feature flag enforcement.
 * 
 * Usage:
 *   app.post("/api/webhooks/trigger/:triggerId",
 *     requireFeatureFlagExpress("webhookTriggers"),
 *     webhookHandler
 *   );
 * 
 * Reads tenant from req.tenant (TenantRequest) and checks the flag.
 * Returns 403 JSON response if flag is disabled.
 */
```

### 14.5 Generic Settings Mutation Audit

**File to modify (if exists):** Any existing mutation that updates `tenants.settings` generically.

The existing admin tenant update route at `/home/dev/projects/SmartSpecPro/apps/web/server/routers/adminTenants.ts` (the `PUT /api/admin/tenants/:id` endpoint) currently accepts a `settings` field in the request body and writes it directly to the tenant row. This must be audited to ensure it does not allow overwriting the `featureFlags` sub-key.

Modification required:
- In the update handler, if the incoming `settings` object contains a `featureFlags` key, strip it before saving. Only the dedicated `updateFeatureFlags` mutation should be able to modify feature flags.
- Add a comment explaining why: `// featureFlags must only be modified via the dedicated updateFeatureFlags mutation to enforce allowlist validation`

### 14.6 Frontend: FeatureFlagGate Component

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/FeatureFlagGate.tsx`

A React component that conditionally renders children based on a feature flag value.

```typescript
/**
 * Conditionally renders children based on a tenant feature flag.
 * 
 * Props:
 *   flag: FeatureFlagKey — which flag to check
 *   fallback?: ReactNode — optional content to render when flag is disabled
 *   children: ReactNode — content to render when flag is enabled
 * 
 * Uses the tenant context (from /api/tenant/current or a tRPC query)
 * to read the current tenant's feature flags.
 * 
 * Falls back to FEATURE_FLAG_DEFAULTS when the tenant context
 * or featureFlags sub-key is unavailable.
 */
```

Implementation approach:
- Use a hook (e.g., `useFeatureFlag(flag: FeatureFlagKey): boolean`) that reads the tenant settings from the existing tenant context or a dedicated tRPC query
- The hook merges tenant's `featureFlags` with `FEATURE_FLAG_DEFAULTS` for missing keys
- The `FeatureFlagGate` component calls this hook and conditionally renders

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/hooks/useFeatureFlag.ts`

```typescript
/**
 * Hook to check if a feature flag is enabled for the current tenant.
 * 
 * Returns boolean indicating whether the flag is enabled.
 * Uses FEATURE_FLAG_DEFAULTS as fallback for missing flags.
 * 
 * Usage:
 *   const canvasEnabled = useFeatureFlag("canvas");
 *   if (canvasEnabled) { ... }
 */
```

### 14.7 Frontend: Admin Feature Flags Panel

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/admin/TenantFeatureFlagsPanel.tsx`

An admin panel component for toggling feature flags on a per-tenant basis. This component is used within the tenant management UI.

Features:
- Displays all 10 feature flags with descriptive labels and toggle switches
- Groups flags by category (Channels: multiChannel/chatWidget/channelRouter, AI Tools: browserTool/canvas/voiceChat/crossAgency/personaSystem, Integration: webhookTriggers/costDisplay)
- Shows the current state of each flag (enabled/disabled)
- Calls the `updateFeatureFlags` mutation on toggle
- Disabled state for flags the current user cannot modify (RBAC enforcement)
- Optimistic updates via TanStack Query's `useMutation` with `onMutate`/`onError` rollback

---

## Integration Points with Other Sections

Each feature section (02-13) should use the enforcement middleware from this section at their respective entry points:

| Feature | tRPC Flag Middleware | Express Flag Middleware | UI Gate |
|---------|---------------------|------------------------|---------|
| F01 Multi-Channel (section 05) | `requireFeatureFlag("multiChannel")` on channel adapter procedures | On `/webhooks/:channelType/:connectionId` route | `<FeatureFlagGate flag="multiChannel">` |
| F02 Chat Widget (section 10) | On widget config procedures | On widget gateway WebSocket upgrade | `<FeatureFlagGate flag="chatWidget">` |
| F03 Browser Tool (section 07) | On browser tool procedures | N/A | `<FeatureFlagGate flag="browserTool">` |
| F04 Canvas (section 04) | On artifact procedures | N/A | `<FeatureFlagGate flag="canvas">` |
| F05 Voice Chat (section 06) | On voice session procedures | On voice WebSocket upgrade | `<FeatureFlagGate flag="voiceChat">` |
| F06 Webhooks (section 11) | On webhook trigger procedures | On `/api/webhooks/trigger/:triggerId` route | `<FeatureFlagGate flag="webhookTriggers">` |
| F07 Cost Display (section 03) | On cost query procedures | N/A | `<FeatureFlagGate flag="costDisplay">` |
| F08 Persona (section 02) | On persona procedures | N/A | `<FeatureFlagGate flag="personaSystem">` |
| F09 Cross-Agency (section 08) | N/A (Python-side check) | N/A | `<FeatureFlagGate flag="crossAgency">` |
| F10 Channel Router (section 12) | On routing rule procedures | N/A | `<FeatureFlagGate flag="channelRouter">` |

Each respective section is responsible for adding the middleware call. This section only provides the middleware factories and the admin management UI.

---

## Security Considerations

1. **Server-side allowlist prevents privilege escalation.** The `ALLOWED_FEATURE_FLAGS` set is the single source of truth. Any key not in this set is silently stripped before persistence. This prevents an attacker from injecting arbitrary settings keys (e.g., `isAdmin: true`) through the feature flags mutation.

2. **Read-modify-write pattern prevents data loss.** The `updateTenantFeatureFlags` function always reads the current `settings` first, then only modifies the `featureFlags` sub-key. Other settings like `enableBlog`, `stripePublicKey`, `googleAnalyticsId` are never touched.

3. **Generic settings mutation audit.** The admin tenant update route (`PUT /api/admin/tenants/:id`) must strip `featureFlags` from incoming `settings` payloads to prevent bypassing the allowlist validation.

4. **RBAC enforcement is server-side only.** The frontend `FeatureFlagGate` is a UX convenience. The actual security boundary is the tRPC/Express middleware that checks flags before executing any procedure.

5. **Boolean-only values.** Feature flags are strictly boolean. The Zod schema for the mutation rejects non-boolean values, preventing injection of complex objects or strings into the JSONB column.

---

## File Summary

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/shared/featureFlags.ts` | **Create** | TenantFeatureFlags type, allowlist, defaults |
| `apps/web/server/services/tenantFeatureFlagService.ts` | **Create** | Validation, resolution, read-modify-write logic |
| `apps/web/server/services/__tests__/tenantFeatureFlags.test.ts` | **Create** | Unit tests for service functions |
| `apps/web/server/routers/tenantFeatureFlags.ts` | **Create** | tRPC router with getFeatureFlags query and updateFeatureFlags mutation |
| `apps/web/server/routers/__tests__/tenantFeatureFlags.test.ts` | **Create** | Router-level tests (RBAC, validation, middleware) |
| `apps/web/server/middleware/requireFeatureFlag.ts` | **Create** | tRPC middleware factory for flag enforcement |
| `apps/web/server/middleware/requireFeatureFlagExpress.ts` | **Create** | Express middleware factory for flag enforcement |
| `apps/web/server/routers.ts` | **Modify** | Register tenantFeatureFlagsRouter in appRouter |
| `apps/web/server/routers/adminTenants.ts` | **Modify** | Strip featureFlags from generic settings update |
| `apps/web/client/src/hooks/useFeatureFlag.ts` | **Create** | React hook for checking feature flags |
| `apps/web/client/src/components/FeatureFlagGate.tsx` | **Create** | Conditional rendering component |
| `apps/web/client/src/components/__tests__/FeatureFlagGate.test.tsx` | **Create** | Frontend component tests |
| `apps/web/client/src/components/admin/TenantFeatureFlagsPanel.tsx` | **Create** | Admin UI for toggling flags per tenant |