# Verification timing policy

## Before integration: FAST INTEGRATION GATE

Confirm only that the changed scope has no syntax/compile error, unresolved merge conflict, damaged patch, or accidental secret. Use the cheapest available checks that establish these facts. Do not make full-repository or resource-heavy checks a prerequisite for recording completed implementation in `origin/main`.

If the gate fails, preserve the exact task changes durably and report the failure, owner, and next action. Do not report completion.

## After integration

Run targeted tests, full typecheck/build, integration/UAT, provider/rights validation, and production gates after the integrated SHA is reachable from `origin/main`. Select CI, a dedicated runner, or a resource-admitted local window. Record each result against that SHA; unavailable or canceled checks remain `PENDING`/`NOT_RUN`.

If a post-integration check finds a regression, make a repair task from current `main`, pass the fast gate, and promote the repair as a new commit to `main`.

## Resource safety

Avoid starving shared sessions with global checks. Resource admission governs when and where post-integration checks run; it does not determine whether fast-gate-passing implementation is integrated.
