# Contracts

Contracts are proposed and remain unfrozen until implementation Wave 1 begins.

## Tenant media actor

```ts
type TenantMediaActor = {
  userId: number;
  tenantId: string;
};
```

- Authoritative request or run context resolves the actor.
- Managed provider references require the actor before submission.
- JWT claims are compatibility fallback, not the primary actor contract.
- Deferred/retry records preserve the same actor.
- No caller substitutes `"default"` for a missing tenant.

## Test boundary

- service tests: managed-reference authorization and broker URL conversion
- router tests: canonical tenant resolution reaches async submissions
- feature tests: background/staged/cross-feature callers preserve actor identity
- static audit: unexplained user-only media requests/tokens/mutations fail

## Impact boundary

- in-scope-now: confirmed media caller/token gaps and tenant-aware mutation paths
  whose canonical tenant is already available
- quality-gate-only: unchanged public-reference and status polling behavior
- out-of-scope: schema migrations, RLS, live provider runs, production data backfill
