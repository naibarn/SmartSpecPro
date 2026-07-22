# Section 02: Auth Classifier and Verification

## Ownership

- `apps/web/server/services/mcpMediaAdapter.ts`
- `apps/web/server/services/__tests__/mcpMediaAdapter.test.ts`

## TDD Expectations

Change tests first so quota and bare `403` errors are non-auth failures. Preserve
positive cases for 401, explicit invalid/expired tokens, unauthorized, and
reauthentication-required messages.

## Acceptance

- Quota errors preserve connected state.
- Definitive credential failures still demote the connection.
- Targeted service tests pass.
- Web type checking passes.

## Coordination

Production status repair occurs only after code verification and a fresh
metadata-only DB check confirms the token is still unexpired.

## Implemented

- Modified `apps/web/server/services/mcpMediaAdapter.ts`.
- Updated `apps/web/server/services/__tests__/mcpMediaAdapter.test.ts` so bare
  and quota-related 403 failures are non-auth errors, while 401 and explicit
  expired-token failures remain auth errors.
- Restored the identified production Higgsfield connection only after checking
  tenant, status, token expiry, revocation, encrypted-token presence, and the
  quota-specific previous error.
- Restarted `smartspec-web.service`; `/healthz` returned `{"status":"ok"}`.

Verification: 35 targeted tests passed across resolver, adapter, and connection
service; web TypeScript type checking passed.
