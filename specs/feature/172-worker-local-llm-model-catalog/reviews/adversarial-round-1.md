# Deep-plan adversarial review — round 1

## Threats checked

- A Worker inventory attempts to inject credentials, endpoints, prompts, or arbitrary JSON.
- A user guesses a model reference across tenants or selects a disabled/stale model.
- A selected Group is cross-tenant, deleted, ownered by another user, or has a removed member.
- Heartbeat metadata overwrites server-owned sharing policy.
- A Worker claims an LLM job with empty capabilities, an old revision, wrong model binding,
  expired lease, or missing token scope.
- A provider acceptance is followed by lease expiry and duplicate inference.
- A Worker model accidentally enters cloud provider mapping or health/circuit-breaker state.
- The new protocol changes the existing browser/device-local Local AI behavior.

## Result

All threats have explicit controls in the plan: strict schemas and bounded payloads, opaque
server-issued refs, tenant/owner/active-membership checks, server-owned sharing policy,
assignment/revision/lease validation, atomic event identity, pre-acceptance-only retry,
explicit `sourceType=worker_app` routing, and a protected local-client boundary.

No unresolved security tradeoff requires user input at the planning stage.
