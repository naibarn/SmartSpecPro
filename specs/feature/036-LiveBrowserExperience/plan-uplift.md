# Plan Uplift

## Item 1

- Severity: high
- Impact: high-impact
- Rationale: The plan defines an adapter around the managed browser provider, but it does not yet force a provider capability contract for multi-tab support, reconnection, token rotation, controller-mode switching, and evidence capture. Without that contract, Phase 1 can drift into provider-specific assumptions that later block self-hosting or workflow-attached sessions.
- Concrete plan delta to apply: add a dedicated provider-capability section that defines the minimum adapter contract, required capabilities, failure modes, and the exact fallback behavior when the provider lacks a needed capability or loses control state.

## Item 2

- Severity: high
- Impact: high-impact
- Rationale: The plan mentions command queuing and idempotency, but it does not spell out command serialization rules between chat commands, approvals, assist resolution, cancelation, and takeover. That leaves room for split-brain behavior when a user submits a command while the agent is already running or while approval is pending.
- Concrete plan delta to apply: add an explicit command-processing model covering queue depth, serialization, rejection rules, cancel precedence, approval/assist blocking behavior, and how queued commands are invalidated when session version or page context changes materially.

## Item 3

- Severity: medium
- Impact: low-impact
- Rationale: The plan references step-up auth and blocked states, but it does not define where recent-auth freshness is checked or how the frontend obtains and retries a step-up challenge without losing session context.
- Concrete plan delta to apply: add a narrow step-up flow subsection describing the handoff from live workspace to re-auth challenge and back, including post-auth retry behavior for takeover requests.

## Item 4

- Severity: medium
- Impact: low-impact
- Rationale: The plan calls for metrics and cleanup jobs, but it does not explicitly include provider health/readiness probes as part of live-mode release readiness. That weakens the `stream_unavailable` and rollout-gate story.
- Concrete plan delta to apply: add a live-provider readiness check and health telemetry subsection that feeds the live release gate and user-facing `stream_unavailable` state.

## Item 5

- Severity: medium
- Impact: low-impact
- Rationale: The plan keeps audit parity with browser policy, but it does not yet define retention handling for screenshots and evidence objects when the managed provider produces artifacts outside the core database.
- Concrete plan delta to apply: add an evidence retention subsection that states how screenshot/evidence handles are stored, redacted, retained, and cleaned up in parity with `evidenceRetentionDays`.
