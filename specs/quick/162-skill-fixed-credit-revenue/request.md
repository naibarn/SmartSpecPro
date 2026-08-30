# Request

Implement the approved fixed-credit skill revenue billing contract.

## Repository assumptions

- `skills` already has tenant and creator ownership fields.
- `tenants.ownerId` is the tenant owner account.
- `creditTransactions` is the user-visible credit ledger and supports metadata/idempotency.
- Existing skill execution paths are heterogeneous; billing must be centralized and integrated at authoritative completion points.

## Constraints

- Preserve unrelated dirty worktree changes.
- Fail closed when an owner required by the approved contract cannot be resolved.
- Do not double-charge existing media/provider flows or auto-refund paths.
- Do not claim live browser/deployment/database proof unless run.
