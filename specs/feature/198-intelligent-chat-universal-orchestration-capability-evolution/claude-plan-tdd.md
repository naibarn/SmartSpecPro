# Feature 198 TDD Plan

Use focused React/jsdom/Vitest, Web service/router, Python runtime and browser tests. Tests precede implementation; no whole-repository typecheck.

## section-01-chat-contracts

Test request/page context normalization, event correlation, duplicate submit, reconnect hydration, unknown state and tenant scope.

## section-02-brokers-and-runtime

Test retrieval outage degradation, provenance/ACL, stale capability, lazy hydration, context freshness and provider fallback.

## section-03-task-state-and-provenance

Test event ordering/dedupe, cancellation, artifact ACL, cross-tab conflict, retention/deletion and evaluation holdouts.

## section-04-ui-surfaces

Test Chat/Assistant loading/empty/error/success/partial/approval/task/result states, responsive/accessibility and browser flows.

## section-05-evolution-and-governance

Test poisoned feedback, explicit pin precedence, learned-route invalidation, canary rollback, deletion and admin separation.

## section-06-browser-and-release-gates

Test 195–200 contract matrix, localization/a11y, performance/cardinality, degraded mode and rollback evidence.

