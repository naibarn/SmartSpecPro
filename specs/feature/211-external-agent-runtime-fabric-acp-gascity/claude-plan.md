# Spec 211 Implementation Plan

**Goal:** Add ACP and Gas City as governed runtime providers behind the Spec 210,
200, 206, 197, 195 and 207 boundaries.

**Architecture:** A provider-neutral `AgentProtocolAdapter` and
`SessionRuntimeProvider` resolve a certified route. ACP framing/session logic
and Gas City process/store logic remain adapters; SmartSpecPro owns admission,
tenant/auth/economic policy, Job correlation, receipt finality and UI state.

**Tech Stack:** TypeScript web services, optional Python protocol helpers,
Runner Rust protocol, Drizzle only for proven subordinate attempt/session
records, Vitest/pytest/Cargo tests.

**Spec:** `specs/feature/211-external-agent-runtime-fabric-acp-gascity/spec.md`

## Global Constraints

- ACP/Gas City do not create a second Job/queue/settlement authority.
- Spec 210 is the route/session bridge; Spec 197 is the Runner boundary.
- Spec 200/206/207 retain external-agent, A2A and economic ownership.
- Every control decision uses fresh authoritative runtime/store evidence.
- Provider child uniqueness, workspace isolation, credentials and process
  cleanup are fail-closed.
- Managed dependencies are pinned, licensed and rollbackable.

## Review Focus

- JSON-RPC batches, malformed frames and unknown update variants must not desync.
- Permission responses must bind to the exact request/session/turn.
- Resume must validate history/configuration epochs and not replay stale effects.
- Store projections cannot authorize destructive adoption decisions.
- Background task stop semantics must not promise unsupported per-task cancel.

## Section 1: ACP adapter and protocol framing

Create a versioned ACP adapter contract, JSON-RPC framing/size/backpressure
guard, initialization/capability negotiation, session prompt/update/cancel and
permission mapping. Unknown variants are preserved as safe normalized events or
explicit unsupported states. Test malformed/batch/duplicate/out-of-order frames.

## Section 2: Session identity, resume and process custody

Implement session origin/provenance, configuration fingerprint/epoch, resume
preflight, auth epoch and provider child uniqueness. Supervise stdio/process
lifecycles via Spec 210/Runner, fence stale generations and clean up children.
Test crash, reconnect, resume mismatch, duplicate provider child and shutdown.

## Section 3: Gas City provider bridge

Add a managed registry/profile and provider interface for runtime/session/store
capabilities. Pin Gas City, Beads and Dolt or a certified file provider in a
manifest; verify executable attestation, workspace isolation, store endpoint and
backup/restore. Do not shell out from request handlers or silently default to a
different store. Test missing dependency, version/license mismatch and recovery.

## Section 4: Routing, Job and economic integration

Resolve direct ACP, Gas City, Orca or other certified route using readiness and
policy. Admit canonical Job/attempts, map phases/events/receipts, require Spec
207 authorization for paid effects, and keep ACP/Gas City IDs as metadata. Test
mixed-version, stale event, duplicate receipt, denial and reconciliation.

## Section 5: UI/observability and user-input semantics

Project real session/turn/activity/permission/background-task/stop states into
the existing Workflow Studio right inspector and bottom debug drawer language.
Preserve mockup hierarchy, show authoritative-read freshness and distinguish
transport accepted from effect completed. Add loading/empty/error/blocked/
approval/focus/selected states, responsive and keyboard acceptance; do not
create a novel ACP dashboard.

## Section 6: Conformance, operations and rollout

Build a conformance harness, provider matrix, soak/resume-churn, process-custody,
store backup/restore, rollback and feature-off checks. Generate a release report
that names missing proof. Enable only after protocol, dependency, security,
Runner, Job, economic, license and rollback gates pass.

