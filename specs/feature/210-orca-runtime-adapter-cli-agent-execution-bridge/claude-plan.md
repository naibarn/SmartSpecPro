# Spec 210 Implementation Plan

**Goal:** Add a fail-closed, Runner-mediated Orca adapter without creating a
second execution control plane.

**Architecture:** A provider-neutral route contract resolves only certified
readiness, admits a canonical Job attempt, sends commands through the existing
Runner control protocol, and normalizes receipts/events back into Feature 195.
The adapter is feature-gated until installation, provider, OS, credential and
rollback certification pass.

**Tech Stack:** TypeScript web services/routes, Rust Runner protocol, Drizzle
additive migration only where shared route-attempt persistence is missing,
Vitest and Cargo tests.

**Spec:** `specs/feature/210-orca-runtime-adapter-cli-agent-execution-bridge/spec.md`

## Global Constraints

- `sah-runner-v1` is the only Runner boundary.
- Feature 195 is the only durable Job lifecycle.
- Spec 200/206/207 retain external-agent, A2A and economic authority.
- Credentials are server-side and never serialized into Job/UI payloads.
- `orca.v1` remains disabled until certification and rollback gates pass.

## Review Focus

- False readiness must never start a process.
- Stale runner/session/attempt events must not settle the current route.
- ACK must not be treated as effect receipt.
- Cancel/kill/reconnect must be idempotent and fenced.
- Provider output must be redacted and bounded.

## Section 1: Runtime contract and readiness

Create `apps/web/server/services/orcaRuntimeContracts.ts` and a readiness
resolver using existing Runner inventory patterns. Define route, provider,
workspace, capability, session and receipt types. Tests cover version/OS/tool
readiness, missing auth, disabled flag and stale capability snapshots.

## Section 2: Runner admission and session lifecycle

Extend `runnerGateway.ts`, `runnerControl.ts` and the Runner Rust protocol only
through existing authenticated command/sequence/fencing patterns. Add create,
attach, prompt, observe, cancel and kill semantics. Tests cover identity,
sequence, idempotency, fencing and no public direct provider channel.

## Section 3: Job/attempt persistence and normalization

Reuse `createControlPlaneJob` and existing attempts/events/dispatch/outbox. Add
only subordinate route-attempt fields/migration if source audit proves they are
missing. Normalize phase detail to canonical Job status and record receipts,
provider child identity and session generation. Test stale/duplicate/late event
handling and restart recovery.

## Section 4: Auth, approvals and economics

Require server-derived actor/tenant, capability policy and Spec 207 economic
intent for paid/effectful operations. Bind approval context to the exact
attempt/command, redact secrets, and map expired auth to an explicit blocker.
Test tenant isolation, secret rejection, policy denial, approval expiry and
reserve/release correlation.

## Section 5: Operations/UI projection

Expose readiness, route status, session activity, receipt evidence and
reconciliation state through existing operational projections. If shown inside
Workflow Studio, use the Spec 209 right inspector/bottom run drawer language;
do not create a standalone redesign. Add loading, empty, blocked, error and
recoverable states plus focused UI tests.

## Section 6: Certification and rollout

Add conformance fixtures for installed provider/OS combinations, soak/reconnect
checks, process cleanup, rollback and feature flag behavior. Document the
external proof required before enabling `orca.v1`; keep the local path safe and
disabled when proof is absent.

