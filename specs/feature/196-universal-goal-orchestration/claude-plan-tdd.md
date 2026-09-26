# Feature 196 TDD Plan

Use focused Web Vitest and Python pytest contracts. Tests precede implementation; do not run whole-repository typecheck.

## section-01-contracts-and-command

Test command normalization, channel identity, Goal/Plan/Capability schemas, revision/hash and Feature 195 Job handoff.

## section-02-goal-plan-persistence

Test additive schema constraints, tenant isolation, immutable revisions, stale approvals, retention and replay.

## section-03-capability-resolution

Test retired filtering, ACL, entitlement/cost/quality/topology ranking, stale snapshots and user-owned tool policy.

## section-04-planner-policy-and-approval

Test clarification, alternatives, policy deny, unknown cost, approval races, recursion/deadlock, quality evaluator and executor switch.

## section-05-gateway-and-ui

Test gateway route shapes, preview/approve/cancel/replan, Chat state matrices, keyboard/responsive states and browser evidence.

## section-06-cross-spec-release

Test event correlation, plan idempotency, Job handoff, Runner/MCP/Agent attenuation, context/assets provenance and mixed-version compatibility.

