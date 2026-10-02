# Section 06 implementation record — versioned node adapters and preflight

Status: partial / in progress.

## Implemented locally

- Added `WorkflowNodeAdapterRegistry` keyed only by exact `typeId`, `typeVersion`, and manifest digest; there is no latest-version or digest fallback.
- Missing adapter resolution returns an explicit unavailable reason.
- Dispatcher factory checks loaded compiled-node identity against the worker payload, runs preflight, asserts the physical lease before and after execution, and requires a result artifact reference plus SHA-256 content digest.
- Adapter preflight/execution context now receives tenant and actor identity from the canonical worker job context, never from the workflow payload.
- Workflow run admission checks that a dispatcher has actually been configured; the generic registered wrapper no longer counts as adapter readiness.

## Verification

- Adapter registry tests cover exact match, version/digest mismatch, explicit missing-adapter outcome, trusted principal propagation, lease assertions, and output evidence.
- Latest focused suite: 6 files, 70 tests passed.

## Remaining acceptance gaps

- No manifest-bound adapters are registered/configured by an application bootstrap. Workflow admission therefore fails closed in the current runtime.
- Tenant grant, provider/catalog readiness, secret resolution, residency, revocation, and live adapter effects require owning integration code and environments.
