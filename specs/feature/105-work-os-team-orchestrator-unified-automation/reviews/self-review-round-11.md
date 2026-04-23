# Self Review Round 11

## Scope

Reviewed the plan after the completeness/security pass that identified remaining gaps in lifecycle, API contracts, budget units, runtime dispatch, observability, actor context, learning proposal governance, and UI accessibility.

## Findings Addressed

| Finding | Resolution |
|---|---|
| `PreflightApprovalBundle` lifecycle was not explicit enough for implementation. | Added lifecycle states, allowed transitions, bundle fields, state metadata, idempotency, compare-and-set launch, and API contracts. |
| Preflight APIs were only implied by preview/launch behavior. | Added preview, regenerate, approve, get, invalidate, and launch procedure contracts with inputs, outputs, and error codes. |
| Budget enforcement lacked stable units and overrun behavior. | Added budget dimensions, accounting units, reservation/reconciliation rules, failure codes, and runtime outcomes. |
| Long-running dispatch lacked retry, timeout, cancel, and dead-letter policy. | Added `RuntimeDispatchPolicy`, side-effect classes, timeout/cancel/dead-letter rules, and test expectations. |
| Tenant/RBAC/private-vault actor context was not explicit across source resolution. | Added server-derived `WorkIntakeActorContext` requirements and propagation through Sections 01 and 02. |
| Observability events lacked a shared taxonomy. | Added event envelope, event names, payload minimums, ownership, redaction rules, and taxonomy tests. |
| Learning proposal lifecycle was underspecified. | Added proposal states, transition service contract, terminal-state behavior, and lifecycle tests. |
| UI safety did not cover accessibility, i18n, and progressive disclosure. | Added preflight UI acceptance for keyboard/screen-reader behavior, translation-key mapping, and requester/admin diagnostic separation. |

## Consistency Check

- `spec.md`, `claude-spec.md`, `claude-plan.md`, `claude-plan-tdd.md`, section files, appendices, and decision log now reference the new contracts.
- Section 01 owns actor-context derivation and explicit source linkage.
- Section 03 owns preflight lifecycle and API contracts.
- Section 04 owns runtime dispatch policy consumption.
- Section 05 owns learning proposal lifecycle.
- Section 06 owns stable reason-code and security semantics.
- Section 07 owns observability taxonomy consumption, UI accessibility, i18n, and progressive disclosure.

## Remaining Risk

Implementation will need disciplined shared-schema ownership. The plan now makes the missing contracts explicit, but code work should still begin with shared schemas and focused failing tests to avoid divergent service-local shapes.
