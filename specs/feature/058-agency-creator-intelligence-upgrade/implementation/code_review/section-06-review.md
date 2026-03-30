# Section 06 Review — Template Save

**Feature:** 058 Agency Creator Intelligence Upgrade
**Reviewer:** SmartSpecPro Reviewer Agent (CMD-8)
**Date:** 2026-03-24

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `agency.ts:4908–4920` | `mcpServers` (server URLs) and `mcpServerTokensEncrypted` (AES-256 ciphertext) are **never read** in the agent select, but the full row is fetched. If any future column projection change re-exposes these fields through the `agentDefinitions` object, encrypted tokens would be stored verbatim in the template's `jsonb`. The current build is safe only by omission — there is no explicit exclusion guard. | Add an explicit exclusion: comment in the `agentDefinitions` builder that `mcpServers` and `mcpServerTokensEncrypted` are intentionally omitted, OR use a `db.select({ name: ..., nodeType: ..., ... })` projection that cannot accidentally include them if the spread operator is ever used. |
| HIGH | `agency.ts:4875–4881` | Agent and flow selects at lines 4875 and 4879 use only `agencyId` as the filter condition — they do not re-verify `tenantId`. Although the outer agency lookup at lines 4855–4864 confirms the agency belongs to the tenant, a race condition (agency re-assigned between the two queries) or a future code path that calls the inner selects independently could leak agents across tenants. This is a defence-in-depth gap. | Add `.where(and(eq(agencyAgents.agencyId, input.agencyId), eq(agencyAgents.tenantId, tenantId)))` if `agencyAgents` carries a `tenantId` column; otherwise add an in-query JOIN on `agencies.tenantId = tenantId` so the agent rows are never trusted in isolation. |
| MEDIUM | `drizzle/0117_modern_patriot.sql:191` | `ADD COLUMN "status" varchar(20) DEFAULT 'draft' NOT NULL` — PostgreSQL will backfill existing rows with `'draft'` before enforcing the NOT NULL constraint, so data integrity is preserved. However the migration file contains **11 unrelated social-channel table creations** (lines 7–187) in the same transaction. If any social table creation fails (e.g., due to an existing partial migration from a prior attempt), the `agency_templates` column additions on lines 188–193 are also rolled back. The `agency_templates` schema fix is a blocker for section-06; coupling it to social DDL is fragile. | Either confirm the social tables are from the same migration batch (in which case document it) or split section-06's `agency_templates` ALTER statements into their own migration file so they can be applied independently. |
| MEDIUM | `agency.ts:4884–4888` | When `agentIds` is empty the `tools` query is skipped (correct). However the `inArray` call at line 4888 uses `agencyAgentTools.agentId` without a `tenantId` constraint. The `agencyAgentTools` table has no tenant column by design (it is keyed by `agentId`), but there is no comment documenting this. If `agencyAgentTools` ever gains a tenant column the query will break silently. | Add a comment: `// agencyAgentTools has no tenantId — isolation is guaranteed by agentIds being scoped above`. |
| MEDIUM | `agency.test.ts:35085–35099` | The "allows admin" test mocks only 3 selects (`agency`, `agents=[]`, `flows=[]`) but the production code always performs a 4th select for tools when `agentIds` is non-empty. Because `agents=[]` here, the tools query is correctly skipped. However the test provides no assertion that `agentDefinitions` is an empty array — it only checks that `templateId` is present. If the production code accidentally emitted agent data from a prior test's shared mock state, this test would still pass. | Add `expect(result.templateId).toBeTruthy()` AND `expect(insertCalls[0].values.agentDefinitions).toHaveLength(0)` (capture insert calls in the admin test the same way as the first test). |
| MEDIUM | `agency.ts:4903–4905` | When `agents` is empty, `firstPos` is `null`, `refX` and `refY` are both `0`. The code is correct. But if a single-agent agency is saved as a template, the only agent gets `relativePosition: { x: 0, y: 0 }`. On instantiation from the template, all agents will be stacked at the same canvas coordinate. This is not a bug in this section (instantiation is out of scope) but the spec does not mention a minimum-spread guarantee. | Low priority — document as a known limitation in the schema type comment: "single-agent templates will always have relativePosition `{x:0,y:0}`." |
| LOW | `agency.ts:4937` | `description: input.description ?? agency.description ?? ""` — when neither the caller nor the agency has a description, the template row gets an empty string `""` rather than `null`. The column is `text("description")` which is nullable. An empty string is semantically different from no description and may cause UI issues if the template gallery checks for description presence. | Use `input.description ?? agency.description ?? null` (or `undefined` which Drizzle maps to omit). |
| LOW | `agency.ts:4866–4871` | The `userRole` fallback `ctx.user?.role ?? "user"` at line 4866 is reached after the `!userId` guard at line 4850, so `ctx.user` is guaranteed non-null by this point. The optional chaining `?.` is harmless but slightly misleading — suggests `ctx.user` could still be undefined. | Use `ctx.user!.role ?? "user"` or restructure to `const userRole = ctx.user.role ?? "user"`. Minor clarity only. |
| LOW | Spec §Tests | Spec lists 5 test cases: `saveAsTemplate creates template record`, `requires agency ownership`, `strips UUIDs`, `preserves nodeConfig and modelRequirements`, `preserves toolIds`. Implementation has only 3 tests. "Strips UUIDs" is partially verified by checking `fromIndex`/`toIndex`, but there is no explicit assertion that `id` fields are absent from `agentDefinitions` objects. Similarly there is no test asserting `nodeConfig` and `modelRequirements` round-trip correctly when they are non-null. | Add assertions: `expect(templateValues.agentDefinitions[0]).not.toHaveProperty("id")` and `expect(templateValues.agentDefinitions[0].nodeConfig).toEqual({ executionMode: "agentic" })`. |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| `protectedProcedure` used | PASS | JWT enforced via `protectedProcedure` |
| Tenant isolation on agency lookup | PASS | `agencies.tenantId = tenantId` filter applied |
| Ownership check matches spec F04 | PASS | `createdBy === userId OR role IN ('admin', 'domain_admin')` |
| `tenantId` written to template row | PASS | `tenantId` from context stored in insert |
| `createdBy` written to template row | PASS | `userId` from context stored |
| `status: "draft"` default | PASS | Correct — template needs approval for public use |
| UUID stripping from `agentDefinitions` | PASS | Only name/nodeType/instructions/modelRequirements/nodeConfig/toolIds written — no `id` field |
| UUID stripping from `communicationFlows` | PASS | `fromIndex`/`toIndex` array-index pattern used |
| `mcpServerTokensEncrypted` stripped | CONDITIONAL PASS | Omitted by explicit field selection in builder, but no guard comment; see HIGH-1 |
| `mcpServers` (plain URLs) stripped | CONDITIONAL PASS | Same as above — omitted but no explicit exclusion; should be documented |
| Schema migration: all new columns nullable (except `status`) | PASS | `tenantId`, `createdBy`, `sourceAgencyId`, `agentDefinitions`, `communicationFlows` all nullable |
| `status` NOT NULL + DEFAULT safe for existing rows | PASS | PostgreSQL applies DEFAULT before enforcing NOT NULL — no data loss |
| FK constraints on new columns | PASS | `tenantId` → `tenants`, `createdBy` → `users` (SET NULL), `sourceAgencyId` → `agencies` (SET NULL) |
| Index on `tenantId` | PASS | `agency_templates_tenant_idx` created |
| `sourceAgencyId` FK uses SET NULL on agency delete | PASS | Template persists after source agency is deleted |
| `createdBy` FK uses SET NULL on user delete | PASS | Template persists after creator account is deleted |
| Spec test count (5 required) | FAIL | 3 tests implemented; 2 spec-required tests missing (see LOW-3) |

---

### Summary

The core logic is correct: ownership check is multi-role-aware, tenant isolation is applied to the agency lookup, and the portable template structure (array indices, no UUIDs) is implemented accurately. The most significant gap is the absence of an explicit exclusion guard for `mcpServerTokensEncrypted` and `mcpServers` in the agent definition builder — the current code is safe by omission, but a future refactor that spreads the full agent row would silently embed encrypted blobs or server URLs in publicly-readable template JSON. The test suite covers the primary ownership and admin paths well but falls two spec-required cases short and leaves a subtle defence-in-depth gap on the admin test's insert assertions. All schema migration columns are either nullable or `NOT NULL DEFAULT 'draft'`, so migration safety is not a concern.
