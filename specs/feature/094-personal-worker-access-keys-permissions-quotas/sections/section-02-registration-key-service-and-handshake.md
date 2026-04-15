# Section 02 - Registration Key Service and Handshake

## Ownership

Build the backend service that issues, hashes, revokes, and redeems worker access keys, then extend the worker registration handshake to use that key.

## Target files

- `apps/web/server/services/workerAccessKeyService.ts` or equivalent new service
- `apps/web/server/routes/workerRuntime.ts`
- `apps/web/server/services/workerAuthService.ts`
- `apps/web/server/services/workerRegistryService.ts`
- `apps/web/server/services/__tests__/...`
- `apps/web/server/routes/__tests__/workerRuntime.test.ts`

## TDD expectations

- Add failing tests for create/list/revoke/redeem.
- Add failing tests for expiry and tenant/user mismatches.
- Add failing tests for runtime-family allowlist validation.

## Acceptance checks

- A runtime can redeem a valid key and register a worker successfully.
- A revoked or expired key cannot be redeemed.
- The registration flow binds the worker to the creating user and tenant.

## Risks

- Keep the raw secret out of logs and persistent stores.
- Do not widen the existing worker execution token model; only the bootstrap flow changes here.
