# Verification timing policy

## Before integration: FAST INTEGRATION GATE

First satisfy all repository-required and slice-required checks for the
checkpoint, selected with targeted change-impact analysis. This includes
impacted tests, security/authorization, and API/schema compatibility when
applicable. Do not rerun checks whose inputs and assumptions are unchanged,
and do not waive any required check. Then confirm the FAST INTEGRATION GATE:
no syntax/compile error in the changed scope, unresolved merge conflict,
damaged patch, or accidental secret. Full-repository or resource-heavy checks
may run after integration only when repository policy and the slice contract
permit it.

If the gate fails, preserve the exact task changes durably and report the failure, owner, and next action. Do not report completion.

## After integration

Run targeted tests, full typecheck/build, integration/UAT, provider/rights validation, and production gates after the integrated SHA is reachable from the configured canonical ref. Select CI, a dedicated runner, or a resource-admitted local window. Record each result against that SHA; unavailable or canceled checks remain `PENDING`/`NOT_RUN`.

If a post-integration check finds a regression, make a repair task from current canonical state, pass the fast gate, and promote the repair as a new commit to the configured canonical ref.

## Resource safety

Avoid starving shared sessions with global checks. Resource admission governs when and where post-integration checks run; it does not determine whether fast-gate-passing implementation is integrated.
