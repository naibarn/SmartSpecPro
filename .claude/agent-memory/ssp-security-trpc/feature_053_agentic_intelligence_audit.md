---
name: Feature 053 Agency Agentic Intelligence — tRPC Security Audit
description: Security findings for agencyAgentMemories CRUD procedures and saveBuilder agentic validation — 2026-03-23
type: project
---

## Feature 053 — Agency Agentic Intelligence tRPC Audit (2026-03-23)

Audit covers: `agency.ts` lines 1147–1522 (saveBuilder agentic validation) and 4319–4416 (listAgentMemories, deleteAgentMemory, resetAgentMemories); `schema.ts` agencyAgentMemories table (lines 5001–5034).

### Confirmed Clean

- All three memory procedures use `protectedProcedure` (auth enforced)
- `tenantId` is always included in memory query WHERE clauses
- `deleteAgentMemory` uses soft-delete (`isActive: false`), not hard DELETE
- pageSize capped at 100 (no dump via pageSize)
- All Drizzle queries are parameterized — no raw SQL
- memoryType validated as z.enum (no injection surface)
- `autonomous_agent` correctly allowed as entry point at validation layer (line 1236)
- `maxPlanDepth`, `maxTotalIterations`, `qualityThreshold`, `delegationMode`, `decompositionStrategy`, `enableLongTermMemory` all validated with explicit bounds in autonomous_agent block

### Findings (see full report in specs/feature/053-agency-agentic-intelligence/implementation/code_review/trpc-security-audit.md)

- **A01 HIGH**: domain_admin removes userId filter in all 3 memory procedures — can view/delete any tenant member's memories without per-agency ownership check
- **A02 HIGH**: `agencyId` and `agentNodeId` in listAgentMemories / resetAgentMemories use `z.string().min(1)` only — every other agency procedure uses `z.string().uuid()` for agencyId; inconsistent, no max-length on agentNodeId
- **A03 MEDIUM**: `page` param unbounded (only min:1) — large offset triggers expensive Postgres plan; count() query also unbounded
- **A04 MEDIUM**: `saveBuilder` isAdmin check is `role === "admin"` only (excludes domain_admin); memory procedures use `role === "domain_admin"` bypass. Inconsistent privilege models in the same router
- **A05 MEDIUM**: `nodeConfig: z.record(z.unknown())` has no total-size cap — storage DoS via oversized per-agent config JSON
- **A06 MEDIUM**: `resetAgentMemories` allows domain_admin to supply any `input.userId` — no check that target userId belongs to caller's tenant
- **A07 LOW**: tenantId resolution falls back to empty string on null ctx — silent no-op rather than explicit error
- **A08 LOW**: isEntryPoint error message says "only agent/supervisor" but autonomous_agent is now also valid
- **A09 LOW**: executionMode/maxReflectionCycles/planningStrategy/showReasoning validation block (lines 1194–1218) gated on `["agent","supervisor"]` — autonomous_agent bypasses these checks if it carries those fields
- **A10 LOW**: `agentNodeId` and `content` columns are unbounded `text` in schema — no application-level size cap in service layer

### Key Design Issue

**Why:** The role model in the three new memory procedures (`isDomainAdmin = role === "domain_admin"`) conflicts with the established pattern in `saveBuilder` and all other agency procedures (`isAdmin = role === "admin"`). The new procedures appear to have been written with a different mental model of domain_admin scope. This creates an asymmetry where a domain_admin cannot save an agency they don't own, but can delete all its accumulated memories.

**How to apply:** In future audits of this router, treat `domain_admin` and `admin` bypass paths as separate concerns — always check that (1) the same role model is used consistently and (2) domain_admin bypasses still include a tenant-membership check on any user-supplied ID.
