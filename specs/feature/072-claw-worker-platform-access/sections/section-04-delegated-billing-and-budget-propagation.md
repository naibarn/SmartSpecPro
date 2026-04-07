# Section 04: Delegated Billing and Budget Propagation

## Goal

Make delegated worker platform usage charge credits correctly while preserving both the parent worker-job context and the real downstream service type.

## Why this section exists

The user explicitly requires correct credit charging when the worker calls platform resources. The platform already has a `worker_runtime` reservation model, but this feature needs delegated budget enforcement and downstream service-accurate credit records.

## Scope

1. Add a delegated budget envelope tied to the worker job.
2. Decrement delegated budget when downstream calls succeed.
3. Preserve idempotency for retries.
4. Propagate worker-origin metadata into downstream credit and audit records.
5. Reconcile delegated usage with the parent worker reservation cleanly.
6. Enforce optional worker spending guardrails over rolling time windows.

## Suggested files

- `apps/web/server/services/workerBillingService.ts`
- `apps/web/server/services/creditService.ts`
- downstream route and service files that write credit usage
- audit logging services

## Billing model

Two truths must remain visible:

- the parent worker assignment remains `worker_runtime`
- the actual downstream action remains its real source type such as `api_chat`, `api_skill`, `api_agency`, `api_media`, `api_video_project`, or `api_mcp`

The implementation should therefore add worker-origin metadata to downstream transactions rather than replacing the downstream source type.

## Budget rules

- delegated budget must be bound to the worker job
- downstream success should decrement remaining delegated budget
- downstream retry with the same idempotency identity must not double-charge
- budget exhaustion must reject further delegated actions deterministically
- parent worker reservation overflow policy must be explicit rather than accidental

Default overflow policy:

- deny delegated execution that would exceed the parent reservation unless an explicit operator policy allows controlled overflow reconciliation

## Worker spending guardrails

This section should add optional per-worker rolling credit caps for SmartSpecPro-billed usage across:

- hourly
- five-hour
- daily
- weekly
- monthly

Rules:

- each window may be unset, which means unlimited for that window
- configured windows must be evaluated before permitting another delegated SmartSpecPro-billed action
- the denial reason must identify the exhausted window clearly
- SmartSpecPro credit charging still uses the acting user's balance
- there is no separate worker wallet or tenant wallet in this feature
- the default model is a personal worker, so the acting user for delegated charging should be the worker owner
- worker calls to external APIs outside SmartSpecPro billing surfaces are not part of these caps

## Metadata expectations

Downstream credit and audit events should include:

- worker ID
- worker job ID
- delegated-session ID
- acting user ID
- runtime type
- trace ID
- lease or session fingerprint where useful

## Design rules

- Do not flatten all worker-driven actions into `worker_runtime`.
- Do not let downstream services invent different worker-origin metadata shapes.
- Keep the budget ledger observable so operators can understand why later actions were denied.

## Testing first

- service tests for delegated budget decrementing
- idempotency tests that retries do not double-charge
- route or service tests that downstream records preserve the real source type
- overflow and exhaustion tests
- audit metadata propagation tests
- parent-reservation overflow-default tests
- rolling-window worker budget tests

## Handoff to later sections

- Section 05 uses billing metadata to build user-facing completion context.
- Section 08 uses this work to document operator-visible credit truth and release behavior.
