# Section 05 — Job Execution and Adapters

## Goal

Implement the provider-neutral execution envelope for local Runner Jobs,
including process supervision, workspace confinement, adapter integration,
canonical progress/events/artifacts and safe recovery.

## Ownership and file boundary

Create or extend apps/runner-app/src/leasing.rs, src/supervisor.rs,
src/workspace.rs and src/adapters/. Keep Feature 200 authoritative for
Agent Task/session/turn/event/result semantics and Feature 199 authoritative
for MCP grants/upstream transport. Use the backend Job Control Plane from
section 02 and the protocol from section 01.

## Required design

The execution flow is:

approved Job -> validated offer/lease/fence -> isolated workspace/process
scope -> bounded normalized events -> artifact/result verification ->
canonical terminal transition.

The supervisor owns process trees, timeouts, cancellation, optional
pause/resume/steer, exit/crash collection and orphan cleanup. It reports
command delivery separately from observed effect. Terminating a process is not
evidence that external side effects were undone.

Workspace access resolves only server-authorized opaque references under local
policy. Absolute paths, traversal, symlink escape and unapproved roots fail
closed. Event payloads, diagnostics and artifact metadata are bounded and
redacted. Completion requires active attempt/fence validation and independent
result/artifact verification.

Adapter modules for Codex, Claude Code, Google Antigravity, DeepSeek Harness,
Hermes Agents and OpenClaw-compatible runtimes implement a common host
interface, starting only where a supported local transport exists. They do
not create their own queue, control channel, credential store or ledger. The
Runner is the gateway for SmartAIHub-dispatched launch/control/evidence, but
it must not claim to mediate private internal agent tools that the adapter does
not expose. MCP calls require scoped Feature 199 gateway grants; direct
arbitrary MCP URLs are rejected.

External provider waits persist provider task identity and return control to
the canonical durable Job/Workflow path. The Runner must not stay alive only
to poll a remote provider, and must not repeat an irreversible submission
because a response was lost.

## TDD tasks

1. Valid lease/fence starts exactly one process scope; stale/expired/mismatched
   ownership cannot start or complete.
2. Workspace traversal, symlink escape, absolute path and unapproved root are
   rejected.
3. Process-tree cancellation and supported/unsupported pause/resume/steer
   behavior are explicit.
4. Adapter events are normalized, bounded, redacted and tied to attempt/fence.
5. MCP grant absence or arbitrary upstream URL is rejected.
6. Provider task handoff persists identity before external-wait state.
7. Duplicate/late events cannot overwrite a newer fenced attempt.
8. Artifact verification is required before terminal success.
9. Reclaim, backend restart, Runner restart and lost-response scenarios produce
   an explicit recovery state.
10. Each of the six initial agent adapters is registered only when its transport,
    version and health/auth probe is valid; a discovered-but-unapproved tool
    cannot execute.

Use fake process/clock/control-plane adapters for deterministic tests. Add one
vertical-slice real adapter only after the host contract tests pass.

## Implementation steps

1. Add lease/attempt/fence validation and supervisor lifecycle interfaces.
2. Add workspace policy and safe artifact/reference boundaries.
3. Add normalized event/result/artifact reporters.
4. Implement one adapter vertical slice with native evidence preservation.
5. Add remaining adapters only when capability probes and transports exist.
6. Connect recovery/reconciliation to section 04 and Feature 195.

## Acceptance

An authorized local Job can execute inside a confined process scope and report
verified evidence through the canonical Job control plane. Stale ownership,
unsafe paths, ungranted MCP and provider-response loss fail closed without
false terminal success.

## Dependencies and handoff

Depends on sections 01–04. Blocks shared Container execution and the complete
Task Control projection.

## UI/UX Contract

### Target User / JTBD

N/A for this section: it implements a non-visual contract/runtime boundary.
The user-facing projection is specified in section 07.

### Surface Inventory

N/A; no browser surface is created or changed here.

### Component Map

N/A; this section exposes protocol/runtime contracts consumed by section 07.

### State Matrix

N/A for direct UI. Runtime states are exposed as typed status data to section 07.

### Responsive Matrix

N/A; no layout or viewport behavior is implemented here.

### Accessibility Acceptance

N/A for the non-visual layer. Any status exposed to UI must remain semantic and
localized by section 07.

### Copy Contract

N/A; no user-facing copy is introduced in this section.

### Browser Evidence Required

N/A for direct implementation. Section 07 must prove the corresponding
projection and redaction behavior.
