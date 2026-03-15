# TDD Plan

## Objective

- Test that live-mode entry from the automation flow creates a session-backed execution path and fails closed when provisioning or stream readiness fails.
- Test that non-live automation and raw browser-tool paths remain unchanged when live mode is not selected.

## Phase 1 Product Shape

- Test: launching `Run in Live Mode` from the automation modal creates a live session before any agent execution starts.
- Test: live-mode creation errors surface explicit live-mode failure UI and do not silently fall back to blind execution.
- Test: user-owned sessions are the only supported Phase 1 attachment model.
- Test: admin or domain-admin attach is blocked in Phase 1 with the expected product and API error states.

## Architecture Direction

### Frontend

- Test: live workspace state tracks `sessionId`, `sessionVersion`, `controlMode`, reconnect state, pending assist state, and pending approval state correctly across normal transitions.
- Test: ownership badges, blocked banners, and reconnect states render correctly for `agent_running`, `waiting_for_human`, `human_controlling`, `stream_unavailable`, and `session_expired`.
- Test: mobile and tablet layouts suppress takeover while preserving read-only status, command, and approval/assist interactions.
- Test: accessibility announcements fire for ownership changes, approval requests, assist requests, and reconnect/recovery states.

### Node Gateway

- Test: live-browser routes enforce auth, tenant isolation, feature flags, and live-specific release gates.
- Test: stream token issuance returns observer and controller tokens with the expected scope and expiry rules.
- Test: rate limits apply to create, command, takeover, return-control, approval, assist, and cancel routes.
- Test: Node proxies `sessionVersion`, `idempotencyKey`, and actor identity unchanged to Python.

### Python Runtime

- Test: `LiveBrowserSessionManager` enforces the session state machine and increments `sessionVersion` on every valid mutation.
- Test: invalid state transitions return the expected error code without mutating session state.
- Test: dedicated live-runtime ownership survives independently from Copilot/Celery task workers.
- Test: background maintenance tasks handle cleanup and expiry without becoming the authoritative state owner.
- Test: multi-replica deployment preserves one logical writer per session.
- Test: conflicting writers or duplicate ownership attempts are rejected deterministically.

### Managed Browser Transport Adapter

- Test: the adapter exposes required capabilities for observer token issuance, controller token issuance, reconnect, disconnect signaling, and evidence-handle capture.
- Test: provider capability gaps fail closed with `stream_unavailable` or provider-capability errors.
- Test: token refresh updates the session transport state without changing session ownership.
- Test: provider disconnect callbacks do not mutate ownership without manager-approved lease/recovery logic.
- Test: tab listing, active-tab reporting, and tab switching behave consistently through the adapter.
- Test: tab-cap failures are explicit and do not desynchronize frontend and backend tab state.

## Data Model and Persistence

- Test: live-session schema migrations create all required tables, indexes, and constraints.
- Test: `(session_id, idempotency_key)` uniqueness prevents duplicate state transitions.
- Test: durable events persist the correct `session_version_at`, actor metadata, and cursor values.
- Test: assist requests and control transfers link to the correct session and preserve tenant isolation.
- Test: provider evidence handles are persisted in redacted form and participate in retention cleanup.

## API and Contract Implementation

- Test: create-session returns provisioning state and only exposes `stream_ready` after runtime and transport are both usable.
- Test: stale `sessionVersion` values return conflict responses with the current session version.
- Test: duplicate commands with the same idempotency key return the cached prior response.
- Test: command queue depth is enforced and over-capacity requests return `command_queue_full`.
- Test: queued commands are invalidated explicitly when takeover or context revalidation changes the applicable session state.
- Test: tab-targeted commands execute against the intended active or named tab and reject ambiguous targets.

## Automation Copilot Integration

- Test: live-mode Copilot execution uses the create-session path before the first command is queued.
- Test: subsequent user commands reuse the existing browser context rather than creating a new blind execution.
- Test: unrecoverable or terminal live sessions require explicit new-run behavior.
- Test: non-live Copilot execution still uses the current job-oriented path.

## Policy, Approval, and Assist Integration

- Test: live and non-live browser-policy decisions share the same approval-state vocabulary, reason codes, and audit semantics.
- Test: approval-required actions move the session into the correct waiting state and emit durable approval events.
- Test: approval resolution resumes the agent only after context revalidation succeeds.
- Test: structured assist requests block agent progress until resolved and emit request/resolution events.
- Test: human direct input is audited as user action and keeps sensitive metadata redacted.
- Test: sensitive takeover requires successful step-up auth before controller authority is granted.
- Test: step-up auth retry flow re-fetches current session state before reattempting takeover.

## Session State Machine and Recovery

- Test: state transitions across `created`, `provisioning`, `ready`, `agent_running`, `waiting_for_human`, `human_controlling`, `waiting_for_runtime_recovery`, `failed_recovery_required`, and terminal states behave as defined.
- Test: controller lease expiry downgrades the session deterministically after disconnect grace passes.
- Test: refresh returns the user to observer mode first and requires explicit control reacquisition when appropriate.
- Test: Node restart rehydrates from Python and durable state without changing ownership.
- Test: Python restart only recovers sessions when provider/runtime metadata is sufficient; otherwise it moves them into recovery-required states.
- Test: transport disconnects do not imply ownership changes by themselves.
- Test: recovered sessions restore active-tab identity before accepting new browsing commands.

## Frontend Experience Plan

- Test: live workspace panels render correctly for viewport, chat, assist/approval, and timeline zones.
- Test: command, approval, assist, and takeover toolbar interactions update UI state from event-stream and fetch responses without desynchronization.
- Test: degraded states render the correct CTA behavior, including disabled entry when feature flag, policy, release gate, or provider readiness blocks live mode.
- Test: timeline entries deduplicate replayed business events by event identifier.

## Operational and Release Plan

- Test: provider readiness checks feed the live release gate and the user-facing `stream_unavailable` state.
- Test: stale provisioning sessions, expired sessions, stale controller leases, and expired idempotency keys are cleaned up by maintenance jobs.
- Test: metrics and alert hooks emit create-session failures, reconnect failures, lease expiries, provider health incidents, and abandonment signals.
- Test: alert routing metadata distinguishes frontend, Node, and Python ownership paths.
- Test: live-session budget reservation, incremental spend tracking, and refund or reconciliation paths behave correctly for failed provisioning and early termination.
- Test: budget exhaustion and quota exhaustion surface explicit blocked states and correct accounting results.

## Impact Map

- Test: introducing live mode does not regress non-live Automation Copilot launch/execute flow.
- Test: browser-tool batch execution remains available and unchanged for non-live use cases.
- Test: approval UI behavior outside live mode is not regressed by shared component or contract updates.

## Regression Prevention Strategy

- Test stub set for Python:
  - session manager unit tests
  - adapter unit tests
  - policy parity tests
  - API integration tests
  - recovery and lease-expiry tests
- Test stub set for web:
  - automation modal live-entry tests
  - live workspace state/render tests
  - reconnect/degraded-state tests
  - approval and assist interaction tests
- Test stub set for cross-boundary verification:
  - Node-to-Python live-session integration tests
  - shared contract fixture parity between backend and web
  - section completion checks that require both Python and `apps/web` verification when relevant

## Data Safety Strategy

- Test: additive migrations can be applied without mutating existing browser-policy or approval data.
- Test: post-migration checks confirm old automation paths and shared tables remain healthy.
- Test: evidence-retention cleanup handles provider-originated artifacts according to configured retention rules.
- Test: release-gate disablement cleanly prevents new live sessions while leaving existing non-live automation intact.

## Compatibility Notes

- Test: tenant browser-policy config and user preference narrowing remain compatible with live and non-live paths.
- Test: approval request storage and response flows remain compatible with existing approval routes.
- Test: workflow SSE infrastructure continues to operate for existing workflow execution views while live-browser replay uses its own event handling path.
