# Section 07: MCP Selection, Security, and Ops

## Goal

Define the secure operating boundary for delegated worker access, especially where MCP, recursion, replay protection, and operator controls intersect.

## Why this section exists

This feature makes workers much more powerful. That power is useful only if the platform can explain, constrain, revoke, and observe what the worker is doing.

## Scope

1. Implement replay protection and session misuse defenses.
2. Add recursion-depth or hop-count tracking for worker-triggered downstream execution.
3. Add operator kill switch behavior for delegated worker access.
4. Define which MCP paths are real and allowed in this feature phase.
5. Ensure audit and diagnostics data are sufficient for operators.
6. Lock down untrusted-content, provider/model policy, and delegated concurrency controls.
7. Keep capability discovery truthful across HTTP contracts, delegated manifests, and MCP availability.

## Suggested files

- worker auth and registry services
- delegated-session service
- `apps/web/server/_core/mcpPublicServer.ts`
- feature-flag services
- monitoring routes and admin visibility layers

## MCP positioning

This section should keep MCP truthful:

- allow MCP where there is already real execution value
- deny or hide MCP paths that are only placeholders for this feature phase
- enforce both scopes and grants for worker-MCP use
- ensure delegated manifests do not advertise MCP abilities that are still unavailable

## Security controls

Required controls:

- short-lived delegated sessions
- explicit audience and token-use separation
- replay protection
- recursion-depth enforcement
- provider and model allowlists where applicable
- delegated concurrency and rate ceilings
- grant enforcement
- callback rate limiting
- URL safety policy
- audit records that explain who acted, on whose behalf, and why
- untrusted-content boundaries so tool output, browser output, and prompts cannot widen authority

## Operator controls

Operators should be able to:

- disable delegated worker access globally or by feature flag
- observe active delegated sessions
- inspect grant and budget context
- understand revoked-session failures

Default retention expectations:

- delegated-session records retained for at least 30 days after expiry or revocation
- worker-job grants retained for at least 30 days after job finalization
- denied high-risk actions retained under audit policy for incident review

## Design rules

- Do not treat MCP as automatically safe because it is a tool protocol.
- Do not let recursion or chain-calling create uncontrolled worker loops.
- Keep kill-switch behavior fail-closed wherever practical.
- Do not let browser output, MCP tool output, or worker-local tool output act as policy authority for later delegated actions.
- Do not let public docs or worker manifests drift away from the real availability of owner-library, owner-RAG, upload, or MCP functions.

## Testing first

- replay-protection tests
- recursion-depth enforcement tests
- kill-switch denial tests
- delegated-worker MCP grant tests
- audit visibility tests
- provider/model allowlist tests
- delegated concurrency-limit tests
- untrusted-content boundary tests
- retention and cleanup policy tests where implemented
- capability-manifest truthfulness tests

## Handoff to later sections

- Section 08 documents the operational and security posture for rollout.
