# Verification timing policy

## Before integration: FAST INTEGRATION GATE

Confirm only that the changed scope has no syntax/compile error, unresolved merge conflict, damaged patch, or accidental secret. Use the cheapest available checks that establish these facts. Do not make full-repository or resource-heavy checks a prerequisite for recording safe valuable implementation progress in the configured canonical ref.

If the gate fails, preserve the exact task changes durably and report the failure, owner, and next action. Do not report completion.

## After integration

Run targeted tests, full typecheck/build, integration/UAT, provider/rights validation, and production gates after the integrated SHA is reachable from the configured canonical ref. Select CI, a dedicated runner, or a resource-admitted local window. Record each result against that SHA; unavailable or canceled checks remain `PENDING`/`NOT_RUN`.

If a post-integration check finds a regression, make a repair task from current canonical state, pass the fast gate, and promote the repair as a new commit to the configured canonical ref.

## Resource safety

Avoid starving shared sessions with global checks. Resource admission governs when and where post-integration checks run; it does not determine whether fast-gate-passing implementation is integrated.
