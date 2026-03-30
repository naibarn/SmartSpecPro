# Section 06: Template Save

## Goal
Allow users to save a newly created agency as a reusable template. Uses existing `agencyTemplates` table.

## Security Requirements (from audit F04)
- **F04 HIGH**: `agencyTemplates` table is missing `tenantId`, `createdBy`, `sourceAgencyId`, `status` columns. A schema migration is a **blocking pre-condition** before implementing this feature.
- Ownership check: `agencies WHERE id = agencyId AND tenantId = ctx.tenantId AND (createdBy = ctx.userId OR ctx.role IN ('admin', 'domain_admin'))`
- Template MUST strip sensitive content (API keys, encrypted fields)

## Files
- `apps/web/drizzle/schema.ts` — ADD columns to `agencyTemplates`: tenantId, createdBy, sourceAgencyId, status
- `apps/web/drizzle/` — new migration SQL
- `apps/web/server/routers/agency.ts` — new `saveAsTemplate` procedure

## Changes

### 1. New tRPC procedure: `saveAsTemplate`

```typescript
saveAsTemplate: protectedProcedure
  .input(z.object({
    agencyId: z.string().uuid(),
    name: z.string().min(1).max(255),
    description: z.string().max(2000).optional(),
  }))
  .mutation(async ({ input, ctx }) => { ... })
```

**Logic:**
1. Verify agency exists + belongs to tenant + user is owner or admin
2. Read agency + all agents + communication flows
3. Create `agencyTemplates` record with:
   - `name`: from input
   - `description`: from input or agency description
   - `topology`: agency topology field
   - `agentDefinitions`: JSON of agents (name, nodeType, instructions, model, modelRequirements, nodeConfig, toolIds) — strip IDs
   - `communicationFlows`: JSON of edges (strip IDs, use relative references)
   - `sourceAgencyId`: the original agency ID
   - `tenantId`: from context
   - `createdBy`: from context
   - `status`: "draft" (needs approval for public)
4. Return template ID

### 2. Template data structure

```typescript
agentDefinitions: [
  {
    name: "Researcher",
    nodeType: "agent",
    instructions: "...",
    modelRequirements: { strategy: "balanced", supportsWebSearch: true },
    nodeConfig: { executionMode: "agentic", planningStrategy: "react", enableLongTermMemory: true },
    toolIds: ["builtin-web-search"],
    isEntryPoint: true,
    relativePosition: { x: 0, y: 0 },  // relative to first node
  }
]
communicationFlows: [
  { fromIndex: 0, toIndex: 1, flowType: "delegation" }
]
```

Note: Use array indices instead of UUIDs for portability.

## Tests
```typescript
// test: saveAsTemplate creates template record
// test: saveAsTemplate requires agency ownership
// test: template agentDefinitions strips UUIDs
// test: template preserves nodeConfig and modelRequirements
// test: template preserves toolIds
```
