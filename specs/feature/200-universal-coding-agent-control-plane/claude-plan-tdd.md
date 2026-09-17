# Feature 200 TDD Plan

Use focused Web Vitest/jsdom, Python pytest, Rust/Cargo and browser tests. Tests precede implementation; no whole-repository typecheck.

## section-01-agent-contracts-and-job-handoff

Test manifest/session/event/result schemas, tenant scope, idempotent Job handoff, sequence/dedupe and stale result rejection.

## section-02-provider-adapters

Test provider capability negotiation, malformed/empty output, timeout, duplicate/out-of-order events, cancellation and adapter errors.

## section-03-runner-and-runtime

Test eligibility, stale snapshots, control ACK/replay, process restart/hang, workspace confinement, cancellation and no second Runner channel.

## section-04-context-skills-assets-mcp

Test context freshness/ACL, asset authorization, skill lifecycle, large payloads, revocation and MCP direct-bypass rejection.

## section-05-verification-and-ui

Test workspace/result verification, native evidence, live task/approval/result state matrices, responsive/accessibility and browser evidence.

## section-06-migration-tests-and-acceptance

Test provider matrix, mixed versions, cost/retention/audit, failure drills, rollback, security/load and full source acceptance checklist.

