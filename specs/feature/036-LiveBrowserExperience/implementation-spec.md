# Implementation Specification

## Summary

Feature 036 introduces a live browser collaboration mode on top of the existing browser automation stack. Phase 1 extends the current Automation Copilot entry flow in [AutomationChatModal](/home/dev/projects/SmartSpecPro/apps/web/client/src/components/automation/AutomationChatModal.tsx) with a `Run in Live Mode` path that creates a persistent live browser session, attaches a managed live browser viewport, and allows the same user to continue the task through a mix of agent control, approvals, structured assist, and direct takeover.

The implementation must reuse the existing browser policy, approval, tenant isolation, and audit foundations instead of creating a second security model. The live session stack becomes additive: the raw `browserTool` batch path remains for non-live/internal use cases, while live requests must route through a new authoritative live-session manager.

## Phase 1 Decisions

- Entry surface: extend the existing automation modal rather than launch a new standalone workspace first.
- Transport: use a managed live browser provider rather than building a self-hosted noVNC stack in Phase 1.
- Scope: support only user-owned live sessions in Phase 1.
- Persistence: create DB-backed live-session state now; use Redis only for cache, leases, and queue/runtime coordination.
- Admin attach: disabled in Phase 1.

## In Scope

- Create, inspect, command, pause, takeover, return-control, assist-response, approval, reject, cancel, and event-list APIs for live browser sessions.
- A new Python live-session runtime that owns authoritative session state and mediates all non-terminal transitions.
- Durable storage for live sessions, events, assists, control transfers, and idempotency keys.
- A managed live-browser stream integration that issues short-lived viewer and controller tokens through Node.
- Automation Copilot integration that starts a live session first, then runs Copilot commands against the active session instead of a blind one-shot run.
- Same-session multi-turn commands from the frontend.
- Structured assist requests, approval requests, and timeline events surfaced in the same live workspace.
- Phase 1 recovery/reconnect behavior for browser refresh, stream disconnect, and expired takeover leases.
- Browser policy parity between live and non-live modes, including approval semantics, tamper evidence, domain restrictions, and user policy narrowing.

## Out of Scope

- Native desktop automation.
- Multi-user simultaneous editing or cross-user attach.
- Cross-tenant sharing.
- Mobile takeover.
- Full-session video recording by default.
- Silent fallback from live mode to blind automation when live session creation or transport setup fails.
- Admin/domain-admin observe or takeover in Phase 1.

## Required Runtime Model

### Authoritative ownership

Python `LiveBrowserSessionManager` is the authoritative owner of runtime state. Node remains the authenticated gateway, token issuer, and policy context resolver, but cannot directly mutate live session state outside manager commands.

### Session states

The runtime must support:

- `created`
- `provisioning`
- `ready`
- `agent_running`
- `waiting_for_human`
- `human_controlling`
- `waiting_for_runtime_recovery`
- `failed_recovery_required`
- `completed`
- `cancelled`
- `failed`
- `expired`

### Control modes

- `observe`
- `approve_only`
- `takeover`
- `agent_control`

### Mutation contract

Every mutating command must include:

- `sessionId`
- `sessionVersion`
- `idempotencyKey`
- actor identity

The manager must:

- enforce compare-and-swap session version checks
- deduplicate repeated commands by `(session_id, idempotency_key)`
- persist the response for duplicate replay
- use a controller lease for human takeover
- downgrade control safely when the lease expires or the controller disconnects beyond grace time

## Backend Requirements

### Node responsibilities

- add a `liveBrowser` tRPC/router surface that mirrors the session lifecycle APIs described in the source spec
- authenticate the user and tenant
- enforce feature flag and a separate live-browser release gate
- resolve effective browser policy and user policy narrowing
- issue short-lived viewer/controller stream tokens scoped to the session and requested mode
- proxy commands to Python without becoming the state authority

### Python responsibilities

- create a new live-browser API surface under `/api/live-browser`
- implement `LiveBrowserSessionManager`, `LiveBrowserEventBus`, `LiveBrowserAssistService`, and a managed-browser integration adapter
- maintain durable state transitions and emit durable business events
- integrate existing Playwright/self-healing/policy enforcement primitives where possible
- re-check policy, URL/origin, DOM fingerprint, and approval freshness after human takeover before resuming agent execution

### Integration boundaries

- `Automation Copilot`: `Run in Live Mode` must provision a live session first; if provisioning fails, the request fails closed.
- `browserTool`: remains available for non-live batch actions, but any live-designated action must be rejected unless routed through the live manager.
- Workflow/agency attached live sessions are deferred beyond Phase 1.

## Data Model

New durable tables are required:

- `live_browser_sessions`
- `live_browser_idempotency_keys`
- `live_browser_events`
- `live_browser_assist_requests`
- `live_browser_control_transfers`

The schema must support:

- per-session CAS versioning
- replayable session events with cursors
- assist and approval correlation
- takeover lease metadata
- browser context/provider references
- durable end-state and end-reason tracking

The implementation must align live approval, assist, and control-transfer audit semantics with the existing browser policy audit chain.

## Frontend Requirements

Phase 1 extends the automation entry surface and adds a live workspace experience composed from:

- managed viewport embed with explicit observer vs controller state
- chat panel for same-session commands
- status and ownership indicators
- assist/approval rail
- structured timeline
- takeover toolbar

The UX must:

- make control ownership explicit at all times
- support reconnect after refresh
- disable live entry when feature flag, policy, release gate, or stream readiness blocks it
- degrade to desktop-first observe/approve on tablet and no viewport/takeover on mobile
- keep the assist/approval/timeline controls fully accessible even though the remote canvas itself is not screen-reader navigable

## Security and Compliance Requirements

- live mode must reuse tenant baseline browser policy and per-user narrowing
- viewer and controller tokens must be short-lived and separate
- takeover must require the same authenticated tenant user who owns the session
- step-up auth is required for sensitive takeover classes
- sensitive fields and secrets remain redacted in audit/event payloads
- no direct public sandbox port exposure
- direct human input is auditable as human action, not treated as agent approval

## Recovery and Reliability Requirements

- refresh or viewer disconnect must not change ownership by itself
- controller disconnect starts a grace period, then expires to `waiting_for_human`
- session recovery uses durable state plus runtime/provider metadata; auto-resume is forbidden when recovery is incomplete
- live business events support replay through cursor-based event listing/reconnect
- transport frame updates are best-effort and are not the durable source of truth

## Testing Requirements

Phase 1 must add coverage for:

- session state machine transitions
- session version conflicts and idempotency replay
- takeover lease expiry and reconnect
- policy parity between live and non-live paths
- tenant isolation and user ownership
- assist lifecycle and approval lifecycle
- frontend degraded/reconnect states
- managed-browser stream token issuance and failure handling

## Rollout Requirements

- launch behind a separate live-browser gate, not the existing plain browser automation gate alone
- keep rollout scoped to user-owned sessions only
- collect provisioning, reconnect, takeover, approval, and abandonment metrics before expanding scope
- do not enable admin attach until policy, audit, and privacy controls are proven in production-like environments
