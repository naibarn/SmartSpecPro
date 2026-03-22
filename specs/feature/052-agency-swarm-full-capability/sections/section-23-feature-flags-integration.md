There are no explicit TDD entries for section 23 in the TDD file. Now I have all the context needed.

# Section 23 — Feature Flags Integration

## Overview

This section adds 5 new feature flags to the existing tenant feature flag system so that each Agency Swarm capability phase can be independently gated. Each flag has a global default (all `false`) and supports per-tenant override via the `tenants.featureFlags` JSON column. The frontend uses the existing `useTenantFeatureFlag` hook; the backend uses the existing `requireFeatureFlag` tRPC middleware and `requireFeatureFlagExpress` Express middleware.

**Depends on**: section-01-database-migration (schema must be applied first, though flags themselves require no schema migration -- they are stored in an existing JSON column).

**Blocks**: No other sections. However, sections 02-22 should apply the appropriate flag guard to their new endpoints and UI surfaces.

---

## Feature Flags to Add

| Flag Key | Gating Scope | Default | Phase |
|----------|-------------|---------|-------|
| `agencyCustomTools` | Custom tool CRUD, OpenAPI import, standalone tool API | `false` | 1, 4 |
| `agencyGuardrails` | Guardrail CRUD, assignment, execution | `false` | 1 |
| `agencyStreaming` | SSE streaming endpoint, streaming UI | `false` | 2 |
| `agencyMcpBridge` | MCP server exposure, external MCP connections | `false` | 3 |
| `agencyToolApi` | Standalone tool API exposure (`/api/v1/agency-tools/*`) | `false` | 4 |

---

## Files to Modify

### 1. `/home/dev/projects/SmartSpecPro/apps/web/shared/featureFlags.ts`

Add 5 new entries to three locations in this file:

**`TenantFeatureFlags` interface** -- add after `unifiedSkillExecution`:
```typescript
agencyCustomTools: boolean;   // F30 — Agency custom tool creation & OpenAPI import
agencyGuardrails: boolean;    // F31 — Agency guardrail system
agencyStreaming: boolean;     // F32 — Agency SSE streaming
agencyMcpBridge: boolean;     // F33 — Agency MCP bridge integration
agencyToolApi: boolean;       // F34 — Agency standalone tool API
```

**`ALLOWED_FEATURE_FLAGS` set** -- add the same 5 string keys.

**`FEATURE_FLAG_DEFAULTS` object** -- add all 5 as `false`.

### 2. `/home/dev/projects/SmartSpecPro/apps/web/server/services/tenantFeatureFlagService.ts`

Add the 5 new flag keys to `REDIS_SYNCED_FLAGS` so that admin panel toggles propagate to Redis for backend route guards:
```
"agencyCustomTools",
"agencyGuardrails",
"agencyStreaming",
"agencyMcpBridge",
"agencyToolApi",
```

### 3. `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts`

Apply `requireFeatureFlag` middleware to the relevant tRPC procedures. This is where other sections wire in their guards. The pattern is:

```typescript
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";

// Example: custom tool procedures (section 02)
createCustomTool: protectedProcedure
  .use(requireFeatureFlag("agencyCustomTools"))
  .input(...)
  .mutation(...)

// Example: guardrail procedures (section 05)
createGuardrail: protectedProcedure
  .use(requireFeatureFlag("agencyGuardrails"))
  .input(...)
  .mutation(...)
```

This section does NOT add the procedures themselves (those come from sections 02, 05, etc.) but establishes the flag-to-procedure mapping table below for implementers of other sections to follow.

### 4. Express Route Guards

For the SSE streaming endpoint (section 09) and standalone tool API (section 16), use `requireFeatureFlagExpress`:

```typescript
import { requireFeatureFlagExpress } from "../middleware/requireFeatureFlagExpress";

// SSE streaming route (section 09)
app.post("/api/agency/:agencyId/stream",
  requireFeatureFlagExpress("agencyStreaming"),
  agencyStreamHandler
);

// Standalone tool API (section 16)
app.post("/api/v1/agency-tools/:toolId/execute",
  requireFeatureFlagExpress("agencyToolApi"),
  toolExecuteHandler
);
```

### 5. Frontend Guard Pattern

Components gated by feature flags should use `useTenantFeatureFlag` to conditionally render. No new component is created in this section -- the pattern is documented for other sections:

```typescript
import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";

function CustomToolCreator() {
  const enabled = useTenantFeatureFlag("agencyCustomTools");
  if (!enabled) return null;
  // ... render form
}
```

---

## Flag-to-Procedure Mapping (Reference for Other Sections)

| Flag Key | tRPC Procedures (section) | Express Routes (section) | Frontend Components (section) |
|----------|--------------------------|-------------------------|------------------------------|
| `agencyCustomTools` | createCustomTool, updateCustomTool, deleteCustomTool, listCustomTools, testCustomTool (02), importOpenAPITools, confirmOpenAPIImport (04) | -- | CustomToolCreator.tsx (03), OpenAPIImportModal.tsx (04) |
| `agencyGuardrails` | createGuardrail, updateGuardrail, deleteGuardrail, listGuardrails, testGuardrail, assignGuardrailToAgent, removeGuardrailFromAgent (05) | -- | GuardrailsPanel (06) |
| `agencyStreaming` | -- | POST /api/agency/:agencyId/stream (09), POST /api/agency/:agencyId/cancel (09) | AgencyChatStream.tsx (10) |
| `agencyMcpBridge` | mcpServerDiscover, mcpServerConnect (14) | MCP endpoint (14) | MCP config panel (14) |
| `agencyToolApi` | -- | POST /api/v1/agency-tools/:toolId/execute (16), GET /api/v1/agency-tools/openapi.json (16) | isExposedAsApi toggle (16) |

---

## Python Backend Awareness

The Python backend does not read tenant feature flags directly. Instead, the Node.js layer acts as the gatekeeper: if a flag is disabled, the tRPC procedure or Express route returns 403 before the request ever reaches Python. No Python changes are needed for this section.

The existing `AGENCY_ORCHESTRATOR_ENABLED` environment variable in `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_orchestrator.py` (line 28) is a separate, Python-only process-level flag and is unaffected by this work.

---

## Tests (TDD)

### Test File: `/home/dev/projects/SmartSpecPro/apps/web/shared/__tests__/agencyFeatureFlags.test.ts`

Write these tests FIRST, before modifying the source files.

```
# Vitest: FEATURE_FLAG_DEFAULTS includes all 5 agency flags with false default
# Vitest: ALLOWED_FEATURE_FLAGS set includes all 5 agency flag keys
# Vitest: TenantFeatureFlagKey type accepts "agencyCustomTools" (compile-time, verified via assignment)
# Vitest: TenantFeatureFlagKey type accepts "agencyGuardrails"
# Vitest: TenantFeatureFlagKey type accepts "agencyStreaming"
# Vitest: TenantFeatureFlagKey type accepts "agencyMcpBridge"
# Vitest: TenantFeatureFlagKey type accepts "agencyToolApi"
# Vitest: validateFeatureFlags accepts the 5 new agency flag keys
# Vitest: validateFeatureFlags strips unknown keys (unchanged behavior after additions)
# Vitest: resolveFeatureFlags returns false for new agency flags when storedFlags is null
# Vitest: resolveFeatureFlags merges stored true value for agencyCustomTools
# Vitest: isFeatureEnabled returns false for agencyCustomTools when storedFlags is null (default)
# Vitest: isFeatureEnabled returns true for agencyCustomTools when storedFlags has { agencyCustomTools: true }
```

### Test File: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/agencyFeatureFlagGuards.test.ts`

```
# Vitest: requireFeatureFlag("agencyCustomTools") throws FORBIDDEN when flag is false
# Vitest: requireFeatureFlag("agencyCustomTools") passes when flag is true
# Vitest: requireFeatureFlag("agencyGuardrails") throws FORBIDDEN when flag is false
# Vitest: requireFeatureFlag("agencyStreaming") throws FORBIDDEN when flag is false
# Vitest: requireFeatureFlag("agencyMcpBridge") throws FORBIDDEN when flag is false
# Vitest: requireFeatureFlag("agencyToolApi") throws FORBIDDEN when flag is false
# Vitest: requireFeatureFlag throws FORBIDDEN when tenantId is missing (no tenant context)
```

### Test File: `/home/dev/projects/SmartSpecPro/apps/web/server/middleware/__tests__/agencyFeatureFlagExpress.test.ts`

```
# Vitest: requireFeatureFlagExpress("agencyStreaming") returns 403 when flag is false
# Vitest: requireFeatureFlagExpress("agencyToolApi") returns 403 when flag is false
# Vitest: requireFeatureFlagExpress calls next() when flag is true
# Vitest: requireFeatureFlagExpress returns 503 when DB is unavailable (fail closed)
```

---

## Implementation Guidance

1. **Start with tests.** Create the test files above. They will initially fail because the flag keys do not exist yet.

2. **Add the 5 flag keys** to `/home/dev/projects/SmartSpecPro/apps/web/shared/featureFlags.ts` in all three locations (interface, set, defaults). All tests from the shared test file should now pass.

3. **Add flag keys to REDIS_SYNCED_FLAGS** in `/home/dev/projects/SmartSpecPro/apps/web/server/services/tenantFeatureFlagService.ts`.

4. **Write the guard tests** that exercise `requireFeatureFlag` and `requireFeatureFlagExpress` with the new flag keys. These use the existing middleware -- no middleware code changes are needed, only the new flag keys in the shared module.

5. **No database migration is needed.** The flags are stored in the existing `tenants.featureFlags` JSON column. Adding new keys to the TypeScript interface and defaults object is sufficient.

6. **No admin UI changes in this section.** The existing admin settings panel at `/admin/settings` already renders all flags from `ALLOWED_FEATURE_FLAGS` dynamically. Adding new keys to the set will auto-surface them in the admin UI.

7. **Coordinate with other sections.** When implementing sections 02-22, each new tRPC procedure and Express route MUST apply the corresponding flag guard from the mapping table above. This is a cross-cutting concern -- each section is responsible for wiring its own guard, using the flag keys defined here.

---

## Verification Checklist

- [ ] All 5 flags appear in `TenantFeatureFlags` interface
- [ ] All 5 flags appear in `ALLOWED_FEATURE_FLAGS` set
- [ ] All 5 flags appear in `FEATURE_FLAG_DEFAULTS` with `false` value
- [ ] All 5 flags appear in `REDIS_SYNCED_FLAGS` set
- [ ] `pnpm test` passes with new test files
- [ ] `pnpm check` passes (TypeScript compilation)
- [ ] Admin settings page shows the 5 new flags (manual verification)
- [ ] `useTenantFeatureFlag("agencyCustomTools")` returns `false` by default (manual verification)