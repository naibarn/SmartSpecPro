# Section 13 — tRPC Router: MCP Server Management

## Section ID
`section-13-trpc-router-mcp`

## Dependencies
- **section-03**: Node.js auth fixes applied
- **section-04**: Scope/IDOR fixes applied
- **section-12**: `mcp_servers` and `mcp_server_assignments` tables exist

## Overview

Creates `mcpServers.ts` tRPC router with CRUD endpoints for MCP server management. All endpoints require admin role. Strict Zod validation per transport type with `.strict()` on nested objects. Encrypted fields never returned in responses — only `oauthConfigured: boolean`. Tool name validation, description sanitization, response size limits, and SSRF-oracle-safe `testConnection`.

## File to Create

`apps/web/server/routers/mcpServers.ts`

---

## TDD Specification

See claude-plan.md Section 12.1 for full endpoint list. Key tests:

```
# Test: list returns servers for current tenant only
# Test: list returns oauthConfigured:boolean, never encrypted values
# Test: create validates transport type with strict Zod schema
# Test: create rejects unknown keys in config (strict mode)
# Test: create sets riskLevel='high' by default
# Test: update recalculates configHash
# Test: delete revokes OAuth token if configured
# Test: testConnection rate limited to 5/min
# Test: testConnection returns only {reachable, toolCount, latencyMs}
# Test: listDiscoveredTools namespaces as mcp.{slug}.{toolName}
# Test: listDiscoveredTools rejects tool names with invalid chars
# Test: listDiscoveredTools limits to 100 tools per server
# Test: assignToAgency creates mcp_server_assignments row
# Test: non-admin users cannot access any endpoint
```

---

## Implementation Guidance

### Zod Input Schemas

```typescript
// Transport-specific config validation
const httpConfigSchema = z.object({
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
}).strict();

const stdioConfigSchema = z.object({
  command: z.enum(["npx"]),  // Only npx allowed
  args: z.array(z.string().max(256)).max(10),
  env: z.record(z.string()).optional(),
  packageIntegrityHash: z.string().optional(),
}).strict();

const streamableHttpConfigSchema = z.object({
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
}).strict();

const createMcpServerSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().regex(/^[a-z0-9-]+$/).min(1).max(100),
  description: z.string().max(500).optional(),
  transportType: z.enum(["http", "streamable_http", "stdio"]),
  config: z.discriminatedUnion("_transport", [
    httpConfigSchema.extend({ _transport: z.literal("http") }),
    streamableHttpConfigSchema.extend({ _transport: z.literal("streamable_http") }),
    stdioConfigSchema.extend({ _transport: z.literal("stdio") }),
  ]),
  oauthConfig: z.object({
    tokenUrl: z.string().url(),
    grantType: z.enum(["client_credentials", "authorization_code"]),
    scope: z.string().optional(),
  }).optional(),
  oauthClientId: z.string().optional(),
  oauthClientSecret: z.string().optional(),  // Encrypted before storage
  timeoutSeconds: z.number().int().min(5).max(120).default(30),
  riskLevel: z.enum(["low", "medium", "high"]).default("high"),
  dataClassification: z.enum(["public", "internal", "confidential"]).default("internal"),
  creditPerCall: z.number().min(0).max(100).default(1),
});
```

### Response Shape (list/getById)

```typescript
// Never return encrypted fields — only boolean indicators
const mcpServerResponse = {
  id: server.id,
  name: server.name,
  slug: server.slug,
  transportType: server.transportType,
  enabled: server.enabled,
  config: server.config,  // Non-secret transport config
  oauthConfigured: !!server.oauthAccessTokenEncrypted,  // Boolean only
  riskLevel: server.riskLevel,
  healthStatus: server.healthStatus,
  toolCount: discoveredToolCount,
  // oauthClientSecretEncrypted: NEVER RETURNED
  // oauthAccessTokenEncrypted: NEVER RETURNED
};
```

### Key Patterns

- Use `adminProcedure` from existing tRPC setup
- `assertPublicIp()` in `testConnection` before outbound request
- Tool name sanitization via `fewShotSanitizer` for descriptions
- `inputSchema` depth limit 5, size limit 64KB
- Response size limit 1MB for tool discovery
- OAuth token revocation (RFC 7009) on `delete` — call provider's revocation endpoint before removing DB row
- `configHash` recalculated on every `update` via `SHA256(JSON.stringify(config))`
- HTTP headers allowlist: reject `Host`, `X-Forwarded-*`, `Cookie`, `Set-Cookie` in `config.headers`

### Security Considerations

1. **SSRF oracle**: `testConnection` makes outbound requests — use `assertPublicIp`, return only `{reachable, toolCount, latencyMs}`, never raw response bodies or error details
2. **Encrypted fields**: Use same pattern as `llmProviders` — return `configured: boolean`, never ciphertext
3. **HTTP headers allowlist**: Block `Host`, `X-Forwarded-*`, `Cookie`, `Set-Cookie` in stored config headers

---

## Actual Implementation Notes

### Files Created/Modified
- **Created**: `apps/web/server/routers/mcpServers.ts` — Full CRUD router with 9 endpoints
- **Created**: `apps/web/server/routers/__tests__/mcpServersRouter.test.ts` — 33 tests
- **Modified**: `apps/web/server/routers.ts` — Registered `mcpServersRouter`

### Deviations from Plan
1. **`z.union` instead of `z.discriminatedUnion`**: Used `z.union([httpConfigSchema, stdioConfigSchema, streamableHttpConfigSchema])` because `_transport` discriminator field would require a DB migration to store in config JSONB. Each variant uses `.strict()` so unknown keys are still rejected.
2. **OAuth revocation on delete**: Deferred to section-18 (OAuth support). The OAuth client infrastructure doesn't exist yet.
3. **`inputSchema` depth/size limits**: Not implemented as `inputSchema` is not stored — only `hasInputSchema: boolean` is returned.

### Review-Driven Fixes Applied
- All UPDATE/DELETE WHERE clauses include `tenantId` for defense-in-depth (IDOR prevention)
- Cross-tenant `targetId` validation added to `assignToTarget` (verifies agency/agent belongs to tenant)
- `sanitizeUri()` applied before `assertPublicIp()` in `testConnection` and `listDiscoveredTools`
- `oauthClientSecret` capped at `.max(1024)` to prevent oversized encrypted payloads

### Test Count
33 tests covering Zod schemas, header validation, description sanitization, tool name regex, and blocked headers constants.
