---
name: feature_057_mcp_trpc_router_audit
description: Feature 057 section-13 mcpServers.ts tRPC router security audit findings — 2026-03-24
type: project
---

## Feature 057 — Section 13: mcpServers.ts tRPC Router Audit

**Date:** 2026-03-24
**File:** `apps/web/server/routers/mcpServers.ts`
**Overall verdict:** CONDITIONAL PASS — 4 blocking issues before merge

### Blocking Issues

1. **C1 — IDOR in update**: `update` mutation SELECT guard uses `and(id, tenantId)` but the UPDATE SQL uses only `eq(mcpServers.id, input.id)`. Fix: add tenantId to UPDATE WHERE.

2. **C2 — IDOR in delete**: Same pattern — DELETE uses only `eq(mcpServers.id, input.id)`. Fix: add tenantId to DELETE WHERE.

3. **R4 — Cross-tenant assignment pollution**: `assignToTarget` verifies `mcpServerId` belongs to caller's tenant but does NOT verify `targetId` (agency/agent UUID) belongs to the same tenant. An admin can attach their MCP server to another tenant's agency. Fix: validate `targetId` against tenant for each `targetType`.

4. **C5 — z.union instead of z.discriminatedUnion**: `config` field uses `z.union([httpConfigSchema, stdioConfigSchema, streamableHttpConfigSchema])`. Since `http` and `streamable_http` are structurally identical, Zod always resolves to the first variant; `transportType` and `config` can be mismatched without error. Spec requires `z.discriminatedUnion("_transport", [...])` with literal discriminator.

5. **Spec gap — OAuth revocation missing**: Spec requires RFC 7009 token revocation call before deleting a row with `oauthAccessTokenEncrypted`. Not implemented.

### Non-blocking Findings

- `testConnection` and `listDiscoveredTools` call `assertPublicIp` but not `sanitizeUri` — stored URLs with credentials (user:pass@host) bypass credential stripping.
- `oauthClientSecret` has no `max()` length limit in Zod schema.
- `testConnection` health-status UPDATE uses single-clause WHERE (no tenantId) — lower risk since ownership was already confirmed but inconsistent with defensive pattern.
- `rateLimitedAdminProcedure` rate limit window/count not documented at call site — spec says 5/min.

### Clean / Pass Items

- `adminProcedure` on all endpoints — auth bypass not possible
- `toResponse()` correctly omits all four OAuth encrypted columns and `oauthRefreshTokenEncrypted`
- `validateHeaders` is case-insensitive and catches `x-forwarded-*` prefix variants — PASS
- `assertPublicIp` called before all outbound connections — SSRF protection in place
- `listDiscoveredTools` tool name regex + 100-tool limit + 1MB response size limit — all present
- Tenant isolation on `getById`, `testConnection`, `listDiscoveredTools`, `removeAssignment`, `listAssignments` — all correct
- `configHash` recomputed on every update

**Why:** IDOR in update/delete is the same recurring pattern across Feature 044-052 routers. The cross-tenant assignment is unique to this router's polymorphic `targetId` design.

**How to apply:** When auditing future polymorphic-target routers (anything with `targetType`/`targetId` pattern), always check that `targetId` is validated against the caller's tenant for each branch of `targetType`.
