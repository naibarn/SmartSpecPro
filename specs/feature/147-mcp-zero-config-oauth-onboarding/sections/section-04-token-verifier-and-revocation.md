# Section 04 — Token verifier and revocation

## Objective

Complete token exchange/refresh/revoke and connect first-party asymmetric OAuth tokens to the existing Feature 146 MCP principal, scope, tenant, device, and object ACL layers.

## Ownership

- `/oauth/token`, `/oauth/revoke`
- `authz.ts`, `mcpOAuthJwks.ts`, `mcpPublicServer.ts`
- grant/revocation services and tests

## Acceptance

- authorization-code exchange enforces client, redirect, resource, and PKCE;
- refresh rotation/reuse/family revoke is atomic and audited;
- access validation rejects wrong issuer, signature, `kid`, algorithm, audience/resource, tenant/user, scope, JTI, and expiry;
- missing MCP auth returns HTTP 401 with `WWW-Authenticate`; insufficient scope returns 403;
- current Library, Media History/R2, and Remotion object ACLs are rechecked after OAuth authentication;
- user/device/tenant revoke blocks access within the documented bound;
- static token, API key, browser session, delegated worker, and Feature 145 pairing regressions pass.

## Gate

Local end-to-end OAuth fixture must authenticate modern `server/discover`, `tools/list`, `resources/list/read`, and safe read tools while denying unapproved writes/downloads/renders.
