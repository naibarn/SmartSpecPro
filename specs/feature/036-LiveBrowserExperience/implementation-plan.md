# Implementation Plan

## Objective

Implement Phase 1 of Live Browser Experience by extending the existing Automation Copilot flow with a persistent, user-owned live browser session. The system must let a user launch browser automation in live mode, watch the browser in real time through a managed live-browser provider, continue the task over multiple turns on the same browser state, pause the agent, take control manually, return control to the agent, and handle assist or approval requests in the same workspace. The implementation must remain under the current tenant browser-policy model, approval model, and audit model rather than introducing a parallel security path.

## Phase 1 Product Shape

Phase 1 should be delivered as an extension of the current automation entry flow, not as a net-new standalone product surface. The primary entry point is the existing automation modal, which gains a `Run in Live Mode` action. That action provisions a live session first and only then starts automation execution. If live provisioning or stream readiness fails, the request must fail closed with an explicit live-mode error state rather than silently reverting to blind automation.

The live workspace itself should still be implemented as a dedicated UI composition behind that entry point: a viewport panel backed by the managed provider, a chat/command rail for same-session commands, an assist and approval rail, a timeline of durable session events, and a takeover toolbar. The modal can hand off to a route-backed workspace when the session is created, but the launch flow should stay attached to the existing automation surface so adoption friction stays low.

## Architecture Direction

### Frontend

Extend [AutomationChatModal](/home/dev/projects/SmartSpecPro/apps/web/client/src/components/automation/AutomationChatModal.tsx) and related automation page flows to support a second execution path that creates a live session and transitions the user into a live workspace state. The frontend needs a new session-aware state model instead of the current polling-only task status machine. It should keep the current analyze and preview behavior where useful, but once the live path begins it should bind to a `sessionId`, `sessionVersion`, `controlMode`, live stream token state, reconnect status, pending assist state, and pending approval state.

The live UI should be decomposed into dedicated components so the first delivery can still enter through the modal without coupling all logic to one file. The core components are a managed viewport wrapper, command panel, assist rail, approval rail, timeline, and takeover toolbar. Accessibility support belongs in these controls, not in the remote canvas, which should expose textual labels for current URL, page title, and ownership status while the timeline provides the text alternative for visual browser activity.

### Node Gateway

Add a new live-browser router surface in the web application that handles create, read, command, pause, takeover, return-control, assist-response, approval, reject, cancel, list-events, and stream-token operations. Node should remain responsible for authentication, tenant isolation, feature-flag checks, live-specific release-gate checks, effective policy resolution, rate limiting, and short-lived token issuance for observer and controller access.

Node must not become the live runtime authority. All non-terminal state mutations should be proxied to Python with the current `sessionVersion`, `idempotencyKey`, and actor metadata intact. Node should also centralize integration with the managed provider so frontend code never receives provider credentials broader than a short-lived session-bound viewer or controller token.

### Python Runtime

Create a new live-browser runtime surface in Python centered on a `LiveBrowserSessionManager`. This service becomes the sole authority for session status, control ownership, pause reason, pending assist/approval references, takeover leases, and session version increments. It should sit beside the existing Copilot and raw browser tool flows, not replace them.

The manager needs to coordinate four concerns that are separate today: browser runtime control, policy enforcement, human approval/assist handling, and durable event emission. It should reuse the existing Playwright execution core and browser-policy client patterns where those already fit, but it should stop relying on one-shot task semantics. The live manager needs its own command queue, its own transition rules, and explicit recovery behavior when the process, provider session, or control connection is lost.

Phase 1 should implement this manager as a dedicated long-lived Python runtime component rather than as Celery task orchestration. The current Celery model is well suited to finite analysis and execution jobs, but interactive live sessions need always-available authority for lease renewal, immediate command acceptance, reconnect handling, provider callbacks, stale-lock cleanup, and recovery transitions. The recommended deployment shape is a dedicated live-session process or service within the Python backend stack that persists authoritative state to the database, uses Redis only for ephemeral coordination, and can survive independently of Copilot task workers. Celery can still be used for background cleanup, non-interactive follow-on work, and periodic maintenance, but it should not own the canonical live session state machine.

The runtime topology should be explicit as well. Phase 1 should use a single authoritative live-session service tier with one logical writer per session. If this tier runs with multiple replicas for availability, ownership must still resolve to one active writer for any given `sessionId`, using durable coordination rather than optimistic in-memory routing. Node should route live-session mutations into that service tier, and no separate FastAPI handler path, provider callback, or maintenance worker should be allowed to mutate live state outside the manager’s single-writer rules. If later scale requires sharding, shard by `sessionId` while preserving the same single-writer invariant.

### Managed Browser Transport Adapter

Because Phase 1 chooses a managed live-browser provider, implement the viewport/control transport through an adapter abstraction rather than embedding provider assumptions into the session manager. The adapter should provision or attach to a live browser session, return viewer/control references, refresh short-lived access tokens, surface disconnect signals, and expose just enough metadata for recovery and audit.

The adapter must remain transport-only. Ownership state, agent pause/resume semantics, assist state, and approval state stay in the live-session manager and the database. A viewer reconnect cannot imply takeover. A controller reconnect cannot regain authority unless the current controller lease and session version still allow it.

The adapter contract should be explicit before implementation starts. Phase 1 requires support for multi-tab session metadata, short-lived observer and controller token issuance, token refresh, observer-to-controller mode switching, disconnect signaling, session termination, and evidence handles for screenshots or equivalent captures. The contract must also define provider capability failures up front. If the provider cannot satisfy an essential Phase 1 capability such as controller-mode switching, reconnect-safe session attachment, or evidence handle retrieval, the live request should fail closed with a `stream_unavailable` or provider-capability error rather than degrading into a partially interactive session. Keep provider-specific fields behind the adapter boundary so a future self-hosted transport can implement the same contract.

Multi-tab behavior should be part of that contract instead of an implied capability. The adapter must support listing open tabs, identifying the active tab, switching the active tab, surfacing new tabs opened by agent actions, enforcing the configured tab cap, and restoring active-tab identity across reconnect when the provider supports it. Policy evaluation, assist prompts, and timeline entries should remain attributable to the specific active tab or page where the action occurs, while takeover still applies to the shared browser context.

## Data Model and Persistence

Create dedicated live-browser tables now instead of trying to stretch Redis into the system of record. The minimum durable set is `live_browser_sessions`, `live_browser_events`, `live_browser_assist_requests`, `live_browser_control_transfers`, and `live_browser_idempotency_keys`. The session row should carry authoritative status, control mode, session version, controller lease metadata, pending assist and approval references, provider/browser references, active tab count, timestamps, and end-state information.

The event table should be the durable business-event log for session creation, stream readiness, agent execution, approvals, assists, takeovers, resumptions, failures, expiry, and terminal states. Transport frame updates remain best-effort and should not be treated as audit-grade events. Assist rows and control-transfer rows should support supportability, audit parity, and future admin features without requiring the session row to hold historical detail.

Redis should still be used where it already fits operationally: rate limits, short-lived runtime caches, replay buffers, temporary command queues if needed, and takeover lease heartbeats. Redis should not be the only source of truth for control ownership or recovery eligibility.

## Cost And Budget Enforcement

Live mode changes the cost profile from short request-bound runs to long-lived interactive sessions, so the plan needs explicit budget controls. Session creation should reserve a minimum live-session budget before provisioning begins, using the same general reservation philosophy as the existing automation flows. During the session, the system should track incremental spend from managed-browser provider usage, LLM/tool execution, and any fixed session overhead the product needs to account for internally.

The live path should enforce both budget and quota. Budget exhaustion should block new commands and surface a clear, auditable blocked state in the workspace rather than silently ending or continuing the session. Concurrent live-session quotas should be evaluated separately from endpoint rate limits so one user or tenant cannot hold long-lived capacity indefinitely. If provisioning fails before the session becomes usable, the reserved budget should be fully released or refunded according to the current credit model. If a session ends early, unused reserved budget should be reconciled the same way. This model should be visible in rollout instrumentation so finance and support can distinguish provider-cost failures from user-cancelled sessions.

## API and Contract Implementation

Implement the Node and Python live-browser APIs described in the source spec with a strict command contract. Every mutating request must include `sessionId`, `sessionVersion`, `idempotencyKey`, and actor identity. Python must reject stale `sessionVersion` values with a conflict response that includes the current version. Duplicate commands with the same idempotency key must return the stored prior response rather than re-running the transition.

The create-session API should provision the durable session row first, then orchestrate managed-browser allocation and runtime initialization, then emit `stream_ready` only when both the runtime and transport are actually usable. `sendCommand` should queue work against the active session rather than spawn a fresh automation task. `takeControl`, `returnControl`, and `pauseAgent` should be explicit state transitions with durable events and version increments. `approveAction`, `rejectAction`, and `submitAssistResponse` should resolve the corresponding pending records and trigger resume or remain paused according to the request semantics.

List-events and stream-token endpoints should support reconnect and replay. Cursor-based event replay should come from durable or buffered event history, while live stream tokens should be observer- or controller-scoped and short-lived.

The command-processing model needs to be serialized explicitly. At most one agent-owned command should execute at a time for a given session. Additional user commands should be accepted only up to the configured queue depth, then rejected with `command_queue_full`. Pending approvals or assist requests should block new agent work from starting, while still allowing the specific approval or assist resolution command plus cancelation. Cancelation should preempt queued work and move the session toward terminal shutdown. Takeover should pause or drain current agent execution before controller authority is granted. Queued commands must be invalidated if the relevant session version is no longer current or if the page context changes materially after human takeover or approval revalidation, and the user should see that invalidation as an explicit event rather than silent disappearance.

Commands that depend on browser location should also be tab-safe. A command should either target the current active tab explicitly or include a tab identifier when needed; the manager should not guess if tab focus has changed. Tab-open, tab-switch, and tab-cap failures should emit explicit business events so the frontend and backend do not diverge about which page the next command will affect.

## Automation Copilot Integration

Integrate live mode with the existing automation pipeline in a way that preserves current capability generation while changing the execution boundary. Analyze and planning can still reuse the Copilot intent flow, but execution in live mode must route through the live session manager instead of direct Celery-driven blind execution.

The initial create-and-run sequence should be:

1. analyze prompt using the current Copilot path as needed
2. create live session through the new Node and Python APIs
3. provision managed browser transport and runtime
4. attach the Copilot controller to the session
5. queue the first command against that session

Subsequent commands from the user must reuse the same session state and browser context. If the session becomes unrecoverable or terminal, the UI should require an explicit new live run instead of automatically restarting in the background.

## Policy, Approval, and Assist Integration

Reuse the existing browser-policy contract, user policy narrowing, approval payload model, and tamper-evident audit semantics. The live path should not create a second approval vocabulary or event taxonomy. Instead, live approvals and live assists should map onto the same durable approval chain concepts while being presented in the live workspace with richer context.

The Python live-session manager should invoke browser-policy evaluation before agent actions, after origin transitions, and again after human takeover resumes. When policy requires approval, the live session should enter a waiting state, emit a durable `approval_requested` event, and surface the approval in the live rail. When the approval resolves, emit `approval_resolved`, update the session version, and only resume the agent after context revalidation. Structured assist follows the same pattern with `assist_requested` and `assist_resolved`.

Human takeover must never be treated as policy bypass. The system should classify human direct input as user-originated action in audit records, enforce sensitive-page step-up authentication where configured, and keep secret-like field metadata redacted.

Sensitive takeover needs a concrete re-auth return flow. When the user requests takeover on a sensitive page class, the live workspace should preserve the `sessionId`, current `sessionVersion`, requested action, and return path, then redirect into the standard step-up authentication challenge. After successful re-auth, the frontend should re-fetch current session state, request a fresh controller token using the latest session version, and only then retry takeover. If the session state changed materially during re-auth, the retry should fail with the current state reflected in UI rather than assuming the earlier request is still valid.

## Session State Machine and Recovery

Model the live session as an explicit state machine with `created`, `provisioning`, `ready`, `agent_running`, `waiting_for_human`, `human_controlling`, `waiting_for_runtime_recovery`, `failed_recovery_required`, and terminal states. Each mutation increments `sessionVersion`. The manager should reject invalid transitions rather than silently coerce them.

Takeover needs a controller lease with expiry, heartbeat, and disconnect grace logic. When a user takes control, the agent must be paused first, the session enters `human_controlling`, and a controller token plus lease expiry are issued. If the controller disconnects and the lease expires without renewal, the session should move to `waiting_for_human` with a durable incident and takeover-ended event. Returning control must capture a checkpoint, current DOM fingerprint, screenshot or equivalent evidence handle, and re-run policy/context validation before resuming the agent.

Recovery should be conservative. Node restart should rehydrate from Python and the database. Python restart should attempt provider-backed session recovery only when authoritative session state and provider metadata can be reconstructed safely. If not, the session moves to `failed_recovery_required` or another explicit blocked state, never auto-resumes agent execution.

Tab state must be part of recovery acceptance criteria. A recovered session should restore tab inventory and active-tab identity before it accepts new browsing commands. If the provider can recover the context but not enough tab metadata to identify the correct target page safely, the session should remain blocked for human review instead of executing on ambiguous state.

## Frontend Experience Plan

The live workspace should expose four persistent zones on desktop: viewport, chat/commands, assist and approvals, and timeline. Ownership and blocked states should be explicit through badges and banners. The user should be able to see whether the agent is active, whether the session is waiting on them, whether takeover authority is live, and whether reconnect or re-auth is required.

The UI should handle degraded states directly in product language: feature disabled, tenant policy blocked, release gate blocked, stream unavailable, session expired, sensitive takeover requiring re-auth, and controller conflict. Refresh should return the user to observer mode first, then allow reacquiring control only if the lease and session state still permit it. Mobile and small-tablet layouts should not offer takeover; they should still expose commands, approvals, and assist responses.

## Operational and Release Plan

Gate Phase 1 behind a separate live-browser release control in addition to the current automation and browser-policy release gates. Instrument metrics for session creation success, transport readiness failures, reconnect success, takeover latency, approval wait duration, assist completion, policy deny rate, abandonment rate, and terminal outcome distribution.

Add cleanup jobs for expired sessions, provisioning failures, stale leases, and expired idempotency rows. Provisioning failures that never reach `stream_ready` should be failed automatically. Long-lived sessions that exceed configured idle or max-duration limits should expire with durable terminal events.

Adopt controlled rollout in this order: internal tenant testing, staging with reconnect and policy-abuse scenarios, limited production rollout to selected tenants, then broader enablement after SLOs and support signals are acceptable. Do not enable workflow-attached sessions or admin observation until the owner-user path is stable.

Because Phase 1 depends on a managed provider, release readiness must also include provider health. Add a provider readiness probe that verifies account/config validity, region/session allocation health, token issuance, and attach/reconnect capability in the deployment environment. Feed that readiness into the live-browser release gate and into user-facing `stream_unavailable` states so the product can disable live entry proactively instead of discovering failures only after session creation attempts. Telemetry should distinguish provider allocation failures, token-refresh failures, attach failures, and disconnect storms.

Live mode should also have a readiness gate for the dedicated Python live-session runtime itself. The product should not treat the standard Python backend health signal as sufficient if the authoritative live-session service tier is degraded, unreachable, or running without durable-state access. Release readiness and user-facing blocked states should therefore distinguish provider transport health from live-runtime service health.

Operational ownership should be explicit in rollout artifacts and alerting. Frontend ownership covers live workspace states, reconnect UI, and accessibility regressions. Web and Node ownership covers auth, feature gating, rate limiting, token issuance, and release-readiness integration. Python ownership covers session-state correctness, recovery logic, provider adapter behavior, and policy revalidation. Alerts for create-session failures, reconnect degradation, stale lease cleanup spikes, and provider health failures should route to the responsible tier while still rolling up to a shared live-browser dashboard.

## Impact Map

The existing features most likely to regress are:

- Automation Copilot launch and execute flow, because live mode changes the way sessions are created and the moment execution starts.
- Browser policy routing and approval lifecycle, because live mode reuses the same policy stack but introduces new state transitions and approval contexts.
- Approval panel and execution UI patterns, because live approvals and assists extend the current workflow approval conventions.
- Browser capacity and concurrency behavior, because current raw browser limits are request-oriented and live mode introduces longer-lived allocations.
- SSE/event replay expectations, because the live workspace will add another evented surface with reconnect semantics.

The implementation should preserve the raw `browserTool` path and current non-live Automation Copilot path as separate, stable code paths. Live mode should be additive and gated so regressions can be isolated quickly.

## Regression Prevention Strategy

Protect the rollout with a layered strategy:

- add unit tests for the new state machine, idempotency behavior, lease expiry, and policy revalidation
- add integration tests across Node and Python for create, command, approval, assist, takeover, reconnect, and cancel flows
- add parity tests proving that live and non-live policy decisions share approval state vocabulary, reason codes, and tamper-evident persistence behavior
- add frontend tests for reconnect, blocked states, and ownership transitions
- keep the feature behind a separate live gate for canary rollout
- assign ownership across frontend, Node, Python, and policy integration so incidents can be triaged quickly
- emit structured metrics and incidents for stream/provider failures, version conflicts, stale lease expiry, and recovery failures

Canary and rollout monitoring should focus on create success rate, reconnect success within target, takeover latency, approval render latency, policy-denied action spikes, and any rise in Copilot launch failures or raw browser tool failures after the live code lands.

Testing should follow the existing repository split rather than introducing a new harness. Python live-session manager, adapter, policy, and API tests should live under [python-backend/tests](/home/dev/projects/SmartSpecPro/python-backend/tests) and run through `uv run pytest ...`. Web client and Node gateway tests should live under [apps/web/client/src](/home/dev/projects/SmartSpecPro/apps/web/client/src) and [apps/web/server](/home/dev/projects/SmartSpecPro/apps/web/server), using the existing Vitest setup exposed by [apps/web/package.json](/home/dev/projects/SmartSpecPro/apps/web/package.json). The plan should keep fast unit coverage around state transitions and provider adapters, with targeted integration coverage for Node-to-Python live-session flows and frontend reconnect behavior.

Because the feature is polyglot, section completion should assume both test tracks are mandatory whenever a section changes shared contracts or web-facing behavior. Python-only green tests are not sufficient for gateway, workspace UI, or approval and assist orchestration sections, and web-only tests are not sufficient for runtime or contract changes.

## Data Safety Strategy

Database risk classification for this scope is `low`. The planned schema work is additive: new tables, indexes, and enums for live-browser state. No existing data path should be dropped or rewritten in Phase 1.

Because the risk is not `none`, take a pre-migration backup before production rollout. Use the project’s standard database snapshot or logical backup process immediately before applying the live-browser migration set. Validate that the snapshot can restore the browser-policy, approval, and workflow execution tables in addition to the new live tables.

Use a non-destructive migration-first approach:

- expand: add new live-browser tables, indexes, and any required enums or nullable references
- migrate/backfill: only seed defaults or metadata if required; do not rewrite existing browser-policy or approval rows
- contract: none in Phase 1, because no existing table or route is being retired

Automated migration and post-migration checks should verify:

- all new tables and indexes exist
- live-session unique constraints and foreign keys are valid
- policy and approval tables remain readable
- existing automation and raw browser flows still boot successfully

Rollback should be fail-open for old features and fail-closed for live mode. If the live migration or runtime causes issues, disable the live release gate first so existing blind automation remains available. Restore from the pre-migration backup only if the migration itself corrupts or materially destabilizes shared tables or database health. Trigger restore if additive schema changes cause unrecoverable application startup failure, severe DB errors affecting existing browser-policy/approval paths, or incorrect cross-tenant data visibility. Verification after rollback should confirm that browser policy routes, approval routes, non-live Copilot execution, and raw browser tool execution all function normally.

Evidence retention must cover managed-provider artifacts as well as database rows. Any screenshot hash, capture handle, or provider-side artifact reference attached to approvals, assists, control transfers, or incidents should be stored through the same retention policy boundary as browser-policy evidence. The plan should include redaction of sensitive metadata before persistence, periodic cleanup of expired provider artifacts when the provider supports deletion APIs, and fallback cleanup markers when the provider does not expose hard-delete semantics. Retention defaults should continue to align with `evidenceRetentionDays` unless a stricter live-session policy override is introduced later.

## Compatibility Notes

Phase 1 must preserve compatibility with:

- current tenant browser-policy configuration and user preference narrowing
- current approval request storage and response flows
- current non-live Automation Copilot behavior
- current raw `browserTool` behavior for internal and batch use cases
- current workflow SSE event infrastructure where it is not being replaced

Compatibility should be enforced by keeping the live feature behind explicit entry points, by never silently rerouting non-live requests into the live manager, and by reusing shared policy and approval contracts instead of introducing alternate semantics.
