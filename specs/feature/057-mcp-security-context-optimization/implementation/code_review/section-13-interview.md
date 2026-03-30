# Section 13 — Code Review Interview

## Auto-fixes Applied

### C1/C2/C4 — IDOR: Add tenantId to all UPDATE/DELETE WHERE clauses
**Decision:** Auto-fix applied.
All UPDATE and DELETE statements now include `eq(mcpServers.tenantId, ctx.user.tenantId)` in the WHERE clause, making them safe by construction regardless of guard SELECT.

### R4 — Cross-tenant targetId validation in assignToTarget
**Decision:** Auto-fix applied.
Added tenant ownership verification for all target types:
- `tenant`: must equal `ctx.user.tenantId`
- `agency`: verified via `agencies.tenantId`
- `agent`: verified via `agencies.tenantId` through inner join

### R5 — oauthClientSecret max-length constraint
**Decision:** Auto-fix applied.
Added `.max(1024)` to both occurrences of `oauthClientSecret` in create and update schemas.

### R7 — Apply sanitizeUri before assertPublicIp
**Decision:** Auto-fix applied.
Both `testConnection` and `listDiscoveredTools` now call `sanitizeUri(url)` before `assertPublicIp`, stripping credentials and enforcing HTTPS.

## Deferred Items

### C5 — z.union vs z.discriminatedUnion
**Decision:** Let go for now.
The current `z.union` with `.strict()` on each variant is functionally correct since unknown keys are rejected. The `_transport` discriminator field approach requires a schema migration to store that field in the config JSON. Will revisit if transport-specific configs diverge.

### OAuth revocation on delete
**Decision:** Deferred to section-18 (OAuth support).
The spec requires RFC 7009 token revocation, but the OAuth client infrastructure doesn't exist yet. Section-18 will implement the full OAuth flow including revocation.

### R1/R2/R3/R6/R8/R9 — Documentation and test coverage
**Decision:** Let go.
These are comments, documentation suggestions, and integration test gaps. Not blocking.
