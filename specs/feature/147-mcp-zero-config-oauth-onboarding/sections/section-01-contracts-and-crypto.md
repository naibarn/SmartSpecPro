# Section 01 — Contracts and crypto

## Objective

Freeze canonical issuer/resource/scope contracts and implement durable OAuth client, authorization transaction, grant, refresh-family, signing-key metadata, and audit primitives. Use asymmetric public MCP OAuth tokens; do not reuse HS256 desktop/pairing tokens as public OAuth credentials.

## Ownership

- `apps/web/drizzle/schema.ts` and migration/snapshot files
- new OAuth grant/client/crypto services under `apps/web/server/services/`
- existing revocation/audit primitives

## TDD acceptance

- schema constraints prevent duplicate client/code/refresh records;
- authorization codes and refresh tokens are stored only as hashes;
- PKCE S256 comparison is constant-time;
- access claims include issuer, resource/audience, tenant/user, scopes, client, JTI, and expiry;
- signing key rotation publishes overlapping public keys with distinct `kid` values;
- refresh rotation is atomic and reuse revokes the whole family;
- no secret/token/private key appears in logs or returned projections;
- migration preflight and focused service tests pass.

## Blocks

Sections 02–04. No public OAuth route should be enabled before this section passes.
