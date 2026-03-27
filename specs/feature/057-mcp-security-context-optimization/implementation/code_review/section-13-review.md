## Section 13 Code Review

**File reviewed:** `apps/web/server/routers/mcpServers.ts`
**Spec:** `sections/section-13-trpc-router-mcp.md`
**Reviewer:** CMD-6 tRPC Security Auditor
**Date:** 2026-03-24

---

### Critical Issues

#### C1 — IDOR: `update` DELETE path uses single-clause WHERE (TOCTOU risk)

**File:** `mcpServers.ts:327–331`

```typescript
const [updated] = await getDb()
  .update(mcpServers)
  .set(updates)
  .where(eq(mcpServers.id, input.id))   // ← tenantId missing
  .returning();
```

The ownership check at lines 276–287 does a correct `and(eq(id), eq(tenantId))` SELECT, but the subsequent UPDATE WHERE clause is scoped only by `id`. This is the same TOCTOU pattern flagged in previous audits (e.g., `teamService.ts` `archiveTeam`, `automationCopilot.ts` `useTemplate`). In normal operation the SELECT guard prevents exploitation; however, the correct defensive pattern is to include `tenantId` in the UPDATE WHERE clause itself so the mutation is safe regardless of whether the guard SELECT is bypassed:

```typescript
.where(and(eq(mcpServers.id, input.id), eq(mcpServers.tenantId, ctx.user.tenantId)))
```

**Severity: HIGH (IDOR — update path)**

#### C2 — `delete` mutation: UPDATE WHERE also uses single clause

**File:** `mcpServers.ts:355`

```typescript
await getDb().delete(mcpServers).where(eq(mcpServers.id, input.id));
```

Same pattern as C1. The SELECT guard above it is correctly scoped to `tenantId`, but the DELETE itself is not. Fix:

```typescript
.where(and(eq(mcpServers.id, input.id), eq(mcpServers.tenantId, ctx.user.tenantId)))
```

**Severity: HIGH (IDOR — delete path)**

#### C3 — `testConnection` and `listDiscoveredTools` use stored URL without re-validating headers

**File:** `mcpServers.ts:378–407` and `495–504`

Both endpoints reconstruct the outbound request from the stored `server.config` JSON blob but apply `assertPublicIp` only to the URL hostname. The stored `config` object may also contain `headers` (for `http` and `streamable_http` transport types). Those headers are forwarded directly in neither endpoint right now — the fetch calls only send `Content-Type: application/json` — so this is not an active leak. However, the server-stored headers (including any that slipped past the initial `validateHeaders` call during create/update) are never applied to the live test connection. This is actually the safer behavior, but it means the test result does not reflect actual runtime behavior if the MCP client layer applies stored headers. The inconsistency should be documented or made explicit.

More concretely: if a future maintainer naively threads `...(config.headers)` into the fetch call, stored smuggled headers would propagate. The comment in the code should warn against this.

**Severity: MEDIUM (latent risk, not currently exploitable)**

#### C4 — `testConnection` health-status UPDATE uses single-clause WHERE

**File:** `mcpServers.ts:428–434` and `447–452`

```typescript
await getDb()
  .update(mcpServers)
  .set({ healthStatus: "healthy", lastHealthCheck: new Date() })
  .where(eq(mcpServers.id, input.id));   // ← tenantId missing
```

The outer SELECT already confirmed ownership, so this is lower-risk than C1/C2, but the defensive pattern requires tenantId in every UPDATE WHERE. Add `and(eq(mcpServers.id, input.id), eq(mcpServers.tenantId, ctx.user.tenantId))`.

**Severity: MEDIUM**

#### C5 — `config` union is not discriminated; strict mode cannot distinguish http vs streamable_http

**File:** `mcpServers.ts:146`

```typescript
config: z.union([httpConfigSchema, stdioConfigSchema, streamableHttpConfigSchema]),
```

The spec instructs using `z.discriminatedUnion("_transport", [...])` with a `_transport` literal discriminator field. The implementation uses `z.union()` instead. Because `httpConfigSchema` and `streamableHttpConfigSchema` are structurally identical (`{url, headers}`), `z.union` will always match the first variant and never validate against the correct branch. This means:

1. There is no schema-level enforcement that `transportType` and `config` agree. A caller can set `transportType: "stdio"` but pass `{url: "https://..."}` — Zod will accept it.
2. Unknown keys in `httpConfigSchema` will still be rejected (`.strict()` is on both), but only because both schemas are the same shape. If the two HTTP variants diverge in future (e.g., `streamable_http` gains `sessionId`), the union ordering becomes load-bearing in a non-obvious way.

The spec's `discriminatedUnion` pattern solves both problems cleanly. The missing `_transport` field on the stored `config` also means the application layer cannot reliably decode which schema to apply on read.

**Severity: MEDIUM (schema correctness / future divergence risk)**

---

### Recommendations

#### R1 — Add `oauthClientId` plaintext storage warning

`oauthClientId` is stored in a `text` column unencrypted (line 254, schema line 7420). This is correct for a non-secret public identifier. However, `oauthClientId` is returned verbatim in `toResponse` (line 88 implicitly, since `toResponse` spreads no OAuth fields but `oauthClientId` is not in the explicit blocklist). Confirm: is `oauthClientId` absent from `toResponse`? Reviewing `toResponse` (lines 79–102), it does not include `oauthClientId` — this is correct and intentional. However, there is no comment explaining this omission, which could lead a future maintainer to add it back accidentally. Add a comment in `toResponse`:

```typescript
// oauthClientId intentionally omitted — not needed by UI, reduces attack surface
// oauthClientSecretEncrypted: NEVER returned
// oauthAccessTokenEncrypted: NEVER returned
// oauthRefreshTokenEncrypted: NEVER returned
```

#### R2 — `sanitizeDescription` HTML strip is insufficient for stored-then-rendered context

`sanitizeDescription` strips tags via `/<[^>]*>/g` (line 68). This removes the tag markup but preserves inner text, so `<script>alert('xss')</script>` becomes `alert('xss')`. This is adequate if descriptions are only ever rendered as text nodes. But the test at diff line 256 documents this behaviour as expected. If these descriptions are ever injected into tool metadata rendered as HTML (e.g., markdown in the agency chat UI), the stripped-but-retained content is still a stored XSS risk. Recommend documenting that downstream renderers must treat these as untrusted text, and consider a stricter sanitizer (`DOMPurify` server-side or `sanitize-html` with an empty allowlist) rather than a raw regex.

#### R3 — `listDiscoveredTools` passes raw `inputSchema` presence as `hasInputSchema: boolean` but does not validate schema depth or size

**File:** `mcpServers.ts:542`

The spec says `inputSchema` depth limit 5, size limit 64KB. The implementation records only `hasInputSchema: !!t.inputSchema` and discards the schema value. This is safe because the raw schema is not stored or forwarded here. However, if the intention is to cache discovered tools for use by the agency orchestrator, a future refactor that stores the inputSchema would bypass these limits. A comment should mark this explicitly.

#### R4 — `assignToTarget` does not validate that `targetId` actually belongs to the caller's tenant

**File:** `mcpServers.ts:558–597`

The procedure confirms the `mcpServerId` belongs to the tenant (line 560–572) but performs no verification that `targetId` (an agency ID, agent ID, or tenant ID string) belongs to the same tenant. An admin of tenant A could assign their MCP server to an agency that belongs to tenant B by supplying that agency's UUID as `targetId`. The assignment record itself would have no tenantId column, so it would be silently accepted.

Fix: for `targetType: "agency"`, verify `agencyAgents.tenantId = ctx.user.tenantId` (or the agency table's equivalent) before inserting. For `targetType: "tenant"`, verify `targetId === ctx.user.tenantId`.

**Severity: HIGH (cross-tenant assignment pollution)**

#### R5 — Missing `oauthClientSecret` max-length constraint

`oauthClientSecret: z.string().optional()` has no `max()`. An adversary could submit a multi-megabyte string to be encrypted and stored. Add `.max(1024)` or similar.

#### R6 — `rateLimitedAdminProcedure` rate limit window and count not visible in this file

The spec says `testConnection` should be rate limited to 5/min. The implementation uses `rateLimitedAdminProcedure` which exists in `_core/trpc.ts`. That procedure's current window and count should be documented in a comment at the call site so future maintainers understand the enforcement ceiling without reading another file. If `rateLimitedAdminProcedure` was originally defined for a different endpoint with a looser limit, the effective limit for `testConnection` may not meet the spec.

#### R7 — `testConnection` does not apply `sanitizeUri` before `assertPublicIp`

**File:** `mcpServers.ts:387`

```typescript
const parsed = new URL(url);
await assertPublicIp(parsed.hostname);
```

`assertPublicIp` checks IPs after DNS resolution but does not strip URL credentials (user:password). `sanitizeUri` (also exported from `ssrfValidation.ts`) strips credentials and enforces HTTPS. `testConnection` bypasses `sanitizeUri` and goes directly to `assertPublicIp`. If an adversary stored a config URL like `https://attacker:password@public-host/` during create (the Zod `.url()` check allows credentials in URLs), those credentials would be forwarded in the fetch. Apply `sanitizeUri` before `assertPublicIp` in both `testConnection` and `listDiscoveredTools`.

#### R8 — `listDiscoveredTools` does not limit description length before passing to `sanitizeDescription`

`sanitizeDescription` calls `.slice(0, MAX_DESCRIPTION_LENGTH)` after stripping tags. A description containing a very long string without any tags would still be passed to the regex engine in full before truncation. For large responses this is benign but worth noting. The 1MB response size cap provides an outer bound.

#### R9 — Test coverage gaps

The test file covers schema parsing and pure helper functions well. Missing integration-style test coverage noted in the TDD spec:

- `list` returns only tenant-scoped servers (no cross-tenant data)
- `testConnection` rate limited to 5/min (cannot be tested with unit tests alone — needs a mock of `rateLimitedAdminProcedure`)
- `assignToTarget` cross-tenant targetId rejection (R4 above is untested)
- OAuth revocation on delete (spec TDD item: "delete revokes OAuth token if configured" — not implemented, see Spec Compliance below)

---

### Spec Compliance

| Spec Requirement | Status | Notes |
|---|---|---|
| `list` returns only tenant-scoped servers | PASS | `eq(mcpServers.tenantId, tenantId)` in list query |
| `list`/`getById` returns `oauthConfigured:boolean`, no encrypted values | PASS | `toResponse` correctly omits all encrypted columns |
| `create` validates transport type with strict Zod | PARTIAL | `.strict()` on config objects is present; however `z.union` instead of `z.discriminatedUnion` means transport/config mismatch is not caught (C5) |
| `create` rejects unknown keys in config | PASS | `.strict()` on each config schema |
| `create` sets `riskLevel='high'` by default | PASS | `.default("high")` in schema |
| `update` recalculates `configHash` | PASS | `computeConfigHash` called when `input.config` is defined |
| `delete` revokes OAuth token (RFC 7009) | MISSING | The spec requires calling the provider's revocation endpoint if `oauthAccessTokenEncrypted` is set. The implementation skips this entirely; it only relies on cascade FK delete. |
| `testConnection` rate limited to 5/min | PARTIAL | `rateLimitedAdminProcedure` is used but the specific 5/min limit is not verifiable from this file alone (R6) |
| `testConnection` returns only `{reachable, toolCount, latencyMs}` | PASS | Response shape matches spec |
| `testConnection` SSRF protection via `assertPublicIp` | PASS | Called before outbound request |
| `listDiscoveredTools` namespaces as `mcp.{slug}.{toolName}` | PASS | `name: \`mcp.${server.slug}.${t.name}\`` |
| `listDiscoveredTools` rejects tool names with invalid chars | PASS | `mcpToolNameRegex.test(t.name)` filter |
| `listDiscoveredTools` limits to 100 tools per server | PASS | `.slice(0, MAX_TOOLS_PER_SERVER)` |
| `assignToAgency` creates `mcp_server_assignments` row | PASS | `onConflictDoUpdate` upsert pattern |
| Non-admin users cannot access any endpoint | PASS | All procedures use `adminProcedure` or `rateLimitedAdminProcedure`; both require admin role |
| HTTP headers allowlist (Host, X-Forwarded-*, Cookie, Set-Cookie) | PASS | `validateHeaders` with case-insensitive check and `x-forwarded-` prefix scan |
| `inputSchema` depth limit 5, size limit 64KB | NOT IMPLEMENTED | `inputSchema` is not stored; `hasInputSchema` boolean only. Spec requirement not met but current code does not introduce vulnerability |
| Response size limit 1MB for tool discovery | PASS | `text.length > 1_048_576` guard in both `testConnection` and `listDiscoveredTools` |
| `configHash` via `SHA256(JSON.stringify(config))` on update | PASS | `computeConfigHash` matches spec pattern |
| `oauthClientSecret` encrypted before storage | PASS | `encrypt()` called at lines 257 and 323 |

---

### Security Assessment

**CONDITIONAL PASS**

The router is structurally sound: `adminProcedure` is correctly applied to all endpoints, encrypted fields are correctly withheld from responses, `assertPublicIp` is applied before all outbound connections, and the header allowlist is case-insensitive and covers the required blocked names.

The issues that block an unconditional pass:

1. **C1/C2 — IDOR in update and delete**: The UPDATE and DELETE SQL statements use single-clause WHERE. These must include `tenantId` in the WHERE clause to be safe by construction, not only by guard.

2. **R4 — Cross-tenant assignment**: `assignToTarget` does not verify `targetId` belongs to the caller's tenant. An admin can attach their MCP server to another tenant's agency.

3. **Spec gap — OAuth revocation on delete**: The spec requires RFC 7009 token revocation before deleting a row with a live OAuth token. This is not implemented.

4. **C5 — `z.union` instead of `z.discriminatedUnion`**: Transport type and config can be mismatched without Zod error.

None of the four items allow unauthenticated access or plaintext secret exposure, so the router does not fail outright. All four must be addressed before merge.
