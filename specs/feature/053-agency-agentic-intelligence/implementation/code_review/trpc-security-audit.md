# tRPC Security Audit — Feature 053: Agency Agentic Intelligence

**Auditor:** CMD-6 tRPC Security Auditor (automated)
**Date:** 2026-03-23
**Branch:** codex/feature-044-multimodal-chat-memory
**Scope:** `apps/web/server/routers/agency.ts` (memory CRUD + saveBuilder agentic validation) + `apps/web/drizzle/schema.ts` (`agencyAgentMemories` table)

---

## Findings Table

| ID  | Severity | File:Line | Anti-Pattern | Description | Recommended Fix |
|-----|----------|-----------|--------------|-------------|-----------------|
| A01 | HIGH | agency.ts:4333, 4375, 4401 | IDOR — domain_admin cross-tenant read/delete | `isDomainAdmin` removes the `userId` WHERE clause from all three memory procedures. A `domain_admin` can list, soft-delete, or reset **any user's memories within their own tenant** without verifying they have a legitimate reason (no per-agency ownership check). More critically, `tenantId` is derived from `ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "")` — if `ctx.tenantId` is null (unenrolled user) this collapses to an empty string, and a `domain_admin` with that broken state would see `tenantId = ""` matched against zero rows (not a data leak, but logic is fragile). | For domain_admin paths: still require tenantId to be non-empty (throw if blank). Add an explicit agency membership check — verify the agencyId belongs to the calling user's tenant before granting the admin bypass. Document the intentional admin override. |
| A02 | HIGH | agency.ts:4324, 4395–4396 | Missing Zod validation — no max-length or UUID on agencyId / agentNodeId in memory procedures | `listAgentMemories` and `resetAgentMemories` accept `agencyId: z.string().min(1)` and `agentNodeId: z.string().min(1)` with no upper bound and no UUID format constraint. All other agency procedures in the same file use `z.string().uuid()` for `agencyId` (lines 1753, 1793, 1841, etc.). Sending an arbitrarily long `agencyId` or `agentNodeId` is a minor DoS vector (Postgres index scan on oversized string). More importantly the inconsistency with every other procedure in the file suggests missing copy-paste from the validated pattern. | Change `agencyId: z.string().min(1)` to `agencyId: z.string().uuid()` in `listAgentMemories` and `resetAgentMemories`. Add `agentNodeId: z.string().min(1).max(100)` (or match whatever node ID format is used). |
| A03 | MEDIUM | agency.ts:4328 | Pagination abuse — `pageSize` capped at 100 but unbounded `page` | `pageSize` is correctly bounded at `max(100)`. However `page` has only `min(1)` with no upper limit. A caller can set `page: 99999999` which computes `offset = 99999998 * pageSize` — Postgres will execute the query scanning no rows (returns empty) but still builds a full sequential plan on large tables. Additionally the parallel `count()` query has no `LIMIT`, so a `domain_admin` with the userId bypass removed could trigger a full-table count across millions of rows. | Add `page: z.number().int().min(1).max(10000).default(1)` or enforce a max-offset guard. The count query is acceptable, but verify it benefits from the `agent_memories_lookup_idx` index. |
| A04 | MEDIUM | agency.ts:1490 | Auth middleware bypass — `isAdmin` in `saveBuilder` excludes `domain_admin` | `saveBuilder` resolves `const isAdmin = ctx.user!.role === "admin"` (line 1490). This means a `domain_admin` is treated as a regular user — they cannot edit agencies they didn't personally create, even within their own tenant. This is the inverse of the memory procedures which give `domain_admin` elevated access. The inconsistency means the two privilege models conflict: a `domain_admin` who is not the creator of an agency cannot save it, but CAN delete any user's memories inside it. Whether the saveBuilder restriction is intentional is unclear, but the divergence is a security design mismatch that warrants explicit documentation or correction. | Decide the intended role model. If `domain_admin` should be able to manage all tenant agencies, add `|| ctx.user!.role === "domain_admin"` to the `isAdmin` check in `saveBuilder`. If not, remove the `domain_admin` bypass in the memory procedures. Codify the decision in a comment. |
| A05 | MEDIUM | agency.ts:1183 | Missing Zod validation — `nodeConfig: z.record(z.unknown())` is an unbounded open object | The `nodeConfig` field on every agent in `saveBuilder` accepts `z.record(z.unknown())` with no depth limit, no size limit, and no key-count limit. The `.superRefine()` validators check only the specific fields they know about; all other keys pass through silently and are stored to the database as JSON. A caller can store an arbitrarily large object (megabytes of deeply nested data) per agent, repeated across up to the agent array limit, as a storage DoS. | Add a pre-`superRefine` check: reject `nodeConfig` objects whose JSON-serialized length exceeds a reasonable threshold (e.g., 64 KB). Alternatively, add `z.string().max(65536)` at the JSON-serialization boundary or use a fixed-depth Zod `z.object()` for each node type rather than an open record. |
| A06 | MEDIUM | agency.ts:4401–4402 | IDOR — `resetAgentMemories` allows `domain_admin` to reset any tenant-member's memories by supplying `input.userId` | A `domain_admin` can pass any `userId` in `input.userId` and the procedure will reset that user's memories (within the same tenant). There is no check that the supplied `userId` actually belongs to the calling admin's tenant. The tenantId filter on `agencyAgentMemories.tenantId` provides partial protection (memories are scoped to the tenant), but an admin could still reset another tenant-member's memories for a different agency than one they control — including memories in agencies they did not create. | Add a tenant-membership check for the target `userId` when `isDomainAdmin && input.userId` is true. Use a DB query: `SELECT id FROM users WHERE id = input.userId AND tenantId = tenantId` before proceeding. Alternatively restrict domain_admin to resetting memories only within agencies they have ownership over. |
| A07 | LOW | agency.ts:4331, 4373, 4400 | Fragile tenantId resolution — null-coalescing to empty string | All three memory procedures resolve tenantId with `ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "")`. If both values are null/undefined the result is the empty string `""`. Since `tenantId` in the DB is `varchar(36) NOT NULL` (line 5008 of schema.ts), a WHERE clause `eq(agencyAgentMemories.tenantId, "")` will match zero rows — the procedure silently succeeds but operates on no data. This is the same fragile pattern documented in project memory (resolveTenantIdVarchar calling convention). Unlike that bug, no data is leaked here, but the operation fails silently (delete returns `success: false`, list returns empty). | Add an explicit guard: `if (!tenantId) throw new TRPCError({ code: "UNAUTHORIZED", message: "No tenant context" })` at the top of each handler, consistent with the established convention in other routers. |
| A08 | LOW | agency.ts:1236–1238 | Misleading entry-point error message for `autonomous_agent` | The `isEntryPoint` superRefine error message reads: `"Only agent/supervisor nodes can be entry points, not ${data.nodeType}"` (line 1237). This message is factually wrong when `nodeType` is `autonomous_agent`, which is now a valid entry point (the condition on line 1236 allows it). A user who tries to set a different node type as an entry point will see a confusing message that doesn't mention `autonomous_agent` as a valid option. | Update the error message to: `"Only agent, supervisor, or autonomous_agent nodes can be entry points, not ${data.nodeType}"`. |
| A09 | LOW | agency.ts:1183, 1413–1445 | Missing `nodeConfig` validation scope for `autonomous_agent` — agentic fields not re-checked | The new `autonomous_agent` superRefine block (lines 1413–1445) validates `autonomous_agent`-specific fields (`maxPlanDepth`, `maxTotalIterations`, `delegationMode`, `qualityThreshold`, `decompositionStrategy`, `enableLongTermMemory`). However, the earlier agentic field block (lines 1194–1218) that validates `executionMode`, `maxReflectionCycles`, `planningStrategy`, and `showReasoning` is gated on `["agent", "supervisor"].includes(data.nodeType)` only. If an `autonomous_agent` node also includes these fields in `nodeConfig`, they pass through **unvalidated** (the block that checks them doesn't run for `autonomous_agent`). | Either add `"autonomous_agent"` to the `["agent", "supervisor"]` check at line 1194, or duplicate the executionMode / planningStrategy / maxReflectionCycles / showReasoning validation inside the `autonomous_agent` block. |
| A10 | LOW | schema.ts:5014–5016 | No max-length on `agentNodeId` and `content` text columns — open to large-payload storage | The `agentNodeId` column is `text` (unbounded) and `content` is `text` (unbounded) in `agencyAgentMemories`. These are written by the autonomous agent system (not directly by user input via the tRPC layer), so this is lower risk. However if any code path allows agent-generated memory content to flow through a user-controlled LLM prompt without size capping, a prompt-injection attack could cause the agent to write a multi-megabyte memory record. | Add application-level checks in the memory-write service layer to cap `agentNodeId` at 255 characters and `content` at a reasonable maximum (e.g., 10 000 characters). Add these as server-side guards, not just Zod on the tRPC input side. |

---

## Checklist Summary

| # | Check | Result |
|---|-------|--------|
| 1 | IDOR on memory delete — can user A delete user B's memory? | **PASS** for regular users (userId filter). **CONCERN** for domain_admin (no userId filter, see A01/A06) |
| 2 | IDOR on memory list — can user A list user B's memories? | **PASS** for regular users. **CONCERN** for domain_admin (see A01) |
| 3 | Domain admin bypass — consistent with rest of router? | **FAIL** — memory procedures use `domain_admin` bypass; `saveBuilder` uses `admin`-only bypass. Inconsistent (see A04) |
| 4 | Missing Zod validation on new nodeConfig fields | **PARTIAL PASS** — agentic fields validated for agent/supervisor; not for autonomous_agent (see A09). nodeConfig unbounded (see A05) |
| 5 | SQL injection via Drizzle | **PASS** — all queries use Drizzle parameterized builders, no raw SQL or string interpolation observed |
| 6 | Pagination abuse — pageSize dump | **PASS** — pageSize capped at 100. page unbounded (minor concern, see A03) |
| 7 | Mass deletion across tenants via resetAgentMemories | **PASS** — tenantId always in WHERE. domain_admin can supply foreign userId within tenant (see A06) |
| 8 | Input sanitization — memory content XSS | **PASS** — memory content is written by the server-side agent system, not directly by user tRPC input. No XSS surface at this layer. tRPC memory procedures return raw DB content but rendering is a client responsibility |
| 9 | Authentication — all three procedures require auth | **PASS** — all three use `protectedProcedure` |
| 10 | Tenant isolation — tenantId in all queries | **PASS** — tenantId always included. Fragile resolution pattern noted (see A07) |

---

## Critical Path Notes

### On domain_admin bypass design (A01, A04, A06)

The most significant design inconsistency in this feature is that the three new memory procedures grant `domain_admin` the ability to view and delete **any user's memories** within the tenant, while `saveBuilder` (the write path) explicitly restricts `domain_admin` to **only their own agencies** (`isAdmin = ctx.user!.role === "admin"` — no `domain_admin`).

This creates an asymmetry: a `domain_admin` cannot edit an agency they don't own, but they can delete all the memory records accumulated by agents running inside that agency. This is likely unintentional. The memory procedures appear to have borrowed the `isDomainAdmin` pattern from a different context without auditing whether it fits the agency ownership model.

**Recommended resolution:** Align both checks on the same role model. If `domain_admin` should have full tenant-scoped admin access, update `saveBuilder`'s `isAdmin` accordingly. If not, remove the userId-bypass from the memory procedures.

### On `autonomous_agent` as entry point (A08)

The entry-point guard correctly allows `autonomous_agent` at the Zod superRefine level (line 1236). The downstream validation at lines 1515–1522 checks exactly one entry point exists but does not re-validate the type — it relies on the superRefine check. This is fine. The only issue is the misleading error message (A08, LOW).

### On nodeConfig open record (A05, A09)

`nodeConfig: z.record(z.unknown())` is a pragmatic choice for a system with 14+ node types. The superRefine approach is correct in principle. The two gaps are: (1) no size cap on the total serialized payload, and (2) the agentic-fields block not applying to `autonomous_agent`. Both are fixable without restructuring the schema.

---

## Files Audited

- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts` — lines 1147–1522 (saveBuilder), 4319–4416 (memory CRUD)
- `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` — lines 5001–5034 (agencyAgentMemories table definition)
