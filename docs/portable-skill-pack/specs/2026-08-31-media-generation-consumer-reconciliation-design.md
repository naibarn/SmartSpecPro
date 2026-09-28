# Media generation consumer reconciliation

## Problem

Provider tasks can complete and appear in Media History while the feature that
requested the task fails during the final consumer-link step. The current
Vertical Drama path re-imports an already-managed URL through the generic
attachment importer, which can create a `pending` duplicate instead of using
the existing ready asset. Presentation has a related risk when its builder job
loses the provider task identity and remains `processing` indefinitely.

## Approved approach

- Make the authoritative media-task polling boundary return the domain-specific
  durable projection once; do not wrap it in a second generic artifact pass.
- Prefer the ready asset id returned in the completed task projection. For old
  tasks without that id, make managed-URL import idempotently recover the
  owner-scoped ready asset (or re-register the existing storage object).
- On Vertical Drama page load, repair a persisted `sync` failure by re-reading
  the existing task and linking it to the shot. This is non-paid and guarded so
  one browser session cannot duplicate the repair.
- Keep Presentation's existing durable-result path and make missing provider
  tasks terminal/retryable instead of silently retrying forever. Never guess a
  different completed task when the authoritative task identity is gone.

## Safety and acceptance

- No provider retry or credit charge is performed by reconciliation.
- Tenant/user/series/deck ownership checks remain in the existing routers and
  asset services.
- A managed result is linked only when its storage object exists and the asset
  is ready; expired/missing results remain retryable.
- Regression tests cover the domain-aware task projection, managed URL reuse,
  Vertical Drama sync repair guard, Presentation durable completion, and
  Presentation task-not-found handling.
