# Research Notes

## Codebase Recon

### Existing architecture and module boundaries

- The current browser automation surface is split between a Node gateway and Python execution services.
- Raw browser actions enter through [apps/web/server/routes/browserTool.ts](/home/dev/projects/SmartSpecPro/apps/web/server/routes/browserTool.ts), which enforces the feature flag, release gate, domain validation, Redis concurrency, and credit reservation before proxying to Python.
- Python raw browser execution is handled by [python-backend/app/api/browser.py](/home/dev/projects/SmartSpecPro/python-backend/app/api/browser.py) and [python-backend/app/services/tools/browser_tool.py](/home/dev/projects/SmartSpecPro/python-backend/app/services/tools/browser_tool.py). This path is request-scoped and action-list based, not session-oriented.
- Automation Copilot is a second path: [apps/web/client/src/components/automation/AutomationChatModal.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/components/automation/AutomationChatModal.tsx) drives analyze and execute via [apps/web/server/routers/automationCopilot.ts](/home/dev/projects/SmartSpecPro/apps/web/server/routers/automationCopilot.ts), which proxies to [python-backend/app/api/automation_copilot.py](/home/dev/projects/SmartSpecPro/python-backend/app/api/automation_copilot.py) and Celery tasks in [python-backend/app/tasks/automation_copilot_task.py](/home/dev/projects/SmartSpecPro/python-backend/app/tasks/automation_copilot_task.py).
- Runtime Playwright execution for Copilot uses [python-backend/app/services/browser_pool.py](/home/dev/projects/SmartSpecPro/python-backend/app/services/browser_pool.py) and [python-backend/app/services/self_healing_executor.py](/home/dev/projects/SmartSpecPro/python-backend/app/services/self_healing_executor.py). This gives a reusable execution core, but today it creates a headless context per run and closes it at the end.
- Workflow streaming is already implemented separately via SSE. The backend stream path lives in [python-backend/app/api/workflows.py](/home/dev/projects/SmartSpecPro/python-backend/app/api/workflows.py) with translation and replay support in [python-backend/app/orchestrator/stream_translator.py](/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/stream_translator.py) and the ring buffer store. The frontend consumer is [apps/web/client/src/hooks/useSSEWorkflowStream.ts](/home/dev/projects/SmartSpecPro/apps/web/client/src/hooks/useSSEWorkflowStream.ts).

### Integration touchpoints for this feature

- The current automation UI is poll-based. `AutomationChatModal` polls status every 2 seconds and has no persistent execution attachment, live viewport, or takeover state.
- Existing approval UX already exists in workflow execution: [apps/web/client/src/components/workflow/execution/ApprovalPanel.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/components/workflow/execution/ApprovalPanel.tsx) and [apps/web/server/routers/approvals.ts](/home/dev/projects/SmartSpecPro/apps/web/server/routers/approvals.ts). This is the closest reusable surface for structured assist and approval rails.
- Browser policy evaluation already spans Node and Python. Node builds the effective policy context in [apps/web/server/services/browserPolicyRuntime.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/browserPolicyRuntime.ts); Python enforces it during Playwright execution in [python-backend/app/services/browser_policy_node_client.py](/home/dev/projects/SmartSpecPro/python-backend/app/services/browser_policy_node_client.py).
- Approval gating for browser actions already stores DOM fingerprint, action digest, screenshot hash, and correlation keys through [python-backend/app/services/approval_db_service.py](/home/dev/projects/SmartSpecPro/python-backend/app/services/approval_db_service.py) and [python-backend/app/models/approval.py](/home/dev/projects/SmartSpecPro/python-backend/app/models/approval.py). That is useful for live approval context and post-takeover revalidation.

### Current behavior that conflicts with the spec target

- Raw `BrowserSession` is explicitly ephemeral: max 300 seconds, max 50 actions, max 5 pages, max 5 screenshots. It executes a finite list and returns results, so it cannot back a multi-turn collaborative session.
- `BrowserPool` launches headless Chromium only. The spec requires a headed browser plus an interactive remote surface.
- Copilot execution runs inside Celery and only exposes coarse task statuses (`analyzing`, `generating`, `running`, `success`, `failed`). There is no authoritative session state machine for `ready`, `agent_running`, `waiting_for_human`, `human_controlling`, or recovery states.
- Cancelation today is a Redis flag checked by the executor. There is no compare-and-swap session versioning, no idempotent command model, and no controller lease ownership.
- Existing SSE streaming is for workflow graph events, not browser viewport transport. It can likely cover timeline/status events, but not remote keyboard/mouse/browser canvas control by itself.

### Existing tests and coverage gaps

- Raw browser action coverage exists in [python-backend/tests/test_browser_session_real.py](/home/dev/projects/SmartSpecPro/python-backend/tests/test_browser_session_real.py), including SSRF validation, per-session caps, and sandbox dispatch wiring.
- Policy hook coverage exists in [python-backend/tests/test_self_healing_executor_policy_hooks.py](/home/dev/projects/SmartSpecPro/python-backend/tests/test_self_healing_executor_policy_hooks.py), covering prompts, popup/iframe transitions, and fail-closed behavior.
- Browser policy contract, rollout, audit, and approval behavior already have broad coverage across Node and Python test suites.
- Workflow SSE translation and replay are tested in [python-backend/tests/test_streaming.py](/home/dev/projects/SmartSpecPro/python-backend/tests/test_streaming.py) and [python-backend/tests/test_sse_execution.py](/home/dev/projects/SmartSpecPro/python-backend/tests/test_sse_execution.py).
- Frontend automation modal coverage is shallow. Existing tests around `AutomationChatModal` are mostly shape/export checks, so the future live workspace UI will need substantial new behavior tests.
- There is no current coverage for long-lived browser session persistence, takeover/return-control, interactive stream token issuance, reconnect recovery, or same-session multi-turn chat control.

### Database and migration dependencies

- Existing durable tables already relevant to this feature:
- [apps/web/drizzle/schema.ts](/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts) defines `tenant_browser_policy_config`, `tenant_browser_policy_rules`, `browser_workflow_entitlements`, `browser_policy_decisions`, and `sandbox_jobs`.
- [python-backend/app/models/approval.py](/home/dev/projects/SmartSpecPro/python-backend/app/models/approval.py) defines `approval_requests` and `approval_responses`.
- There is no live browser session table, no durable session event/history table, no controller lease/state snapshot table, and no tab-level persistence model.
- Migration risk is additive rather than destructive if the implementation creates new tables and reuses existing approval and policy tables. This should be planned as expand-first, with no in-place replacement of current browser policy or approval data.

### Tenant attribution, permission checks, and security controls

- Tenant isolation is already enforced in the workflow SSE endpoint by checking the execution’s tenant before streaming.
- Approval request creation requires `tenant_id`, which is a good base invariant for live session approvals and assists.
- Browser policy enforcement already supports tenant baseline policy, user-level narrowing, domain allowlists, transfer restrictions, approval TTLs, release gates, and tamper-evident audit records.
- Node routes for raw browser access and Automation Copilot already gate usage with tenant feature flags and browser policy rollout readiness.
- Current concurrency limits are inconsistent with the feature spec target: raw browser route enforces 1 active session per user and 2 per tenant in Redis, while the spec proposes configurable defaults of 1 per user and 3 per tenant. A live-session design must centralize these limits rather than layering separate counters.
- Current approval waiting is implemented as DB polling every 2 seconds from Python. That works for today’s approval gate but is too primitive for a live collaboration model that also needs assist requests, controller leases, reconnect handling, and visual context freshness.

### Recon summary

- The repo already has reusable pieces for policy enforcement, approval storage, workflow/event streaming, and Playwright execution.
- The missing parts are the core of this feature: a durable live-session model, authoritative runtime ownership, headed interactive browser transport, same-session command routing, takeover/return-control semantics, and UI composition that unifies viewport, approvals, assists, and timeline.
- The cleanest implementation direction is additive: preserve the existing raw browser tool and current Automation Copilot path, then introduce a dedicated live browser session stack that reuses browser policy, approval, sandbox, and streaming primitives where they already match the target behavior.

## Web Research

### Topic 1 - Interactive remote browser transport for headed Chromium in containers

- Why this matters: the spec requires a live, interactive browser surface rather than screenshot polling.
- Findings:
- noVNC officially supports modern browsers, requires WebSockets support on the server side, and pairs naturally with `websockify` when the VNC server itself does not speak WebSockets. Source: https://novnc.com/noVNC/
- Playwright’s Docker documentation explicitly documents a noVNC viewer path for containerized environments and shows that a forwarded web port can expose the noVNC web viewer for remote interaction. Source: https://playwright.dev/docs/docker
- Playwright also documents that on Linux, headed execution requires Xvfb. Source: https://playwright.dev/docs/ci
- Browserbase’s `Live View` product docs describe an interactive live session where users can watch, click, type, and scroll in real time, and call out human-in-the-loop use cases such as iframe handling, delegated credentials, and uploads. Source: https://docs.browserbase.com/features/session-live-view
- Recommendation:
- Use a headed Chromium runtime behind a dedicated interactive transport layer instead of trying to extend the current headless-only pool.
- A pragmatic Phase 1 choice is `headed Chromium + virtual display + VNC/WebSocket transport + browser-only signed access token`, because it is directly compatible with Playwright container patterns and the spec’s takeover requirement.
- Keep the transport boundary separate from the application state machine. noVNC/websocket transport should remain a view/control channel, not the authority for ownership or workflow progression.

### Topic 2 - Session state machine and lease/versioning patterns for takeover

- Why this matters: the current codebase has task polling and approval polling, but not authoritative live-session ownership or same-session mutation safety.
- Findings:
- etcd’s transaction model uses explicit compare clauses so writes only apply when the store still matches the expected state. This is a strong reference pattern for `session_version` compare-and-swap semantics. Source: https://etcd.io/docs/v3.7/tasks/developer/how-to-transactional-write/
- etcd’s lease model is explicitly designed for client liveness detection: leases have TTLs, expire without keepalives, and can delete attached keys when the holder disappears. Source: https://etcd.io/docs/v3.6/learning/api/
- AWS’s Builders Library recommends caller-provided idempotency identifiers, retaining parameters for mismatch detection, and making token recording plus mutations atomic so retries do not create duplicate side effects. Source: https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/
- Recommendation:
- Model every mutating live-session command as `{session_id, expected_version, idempotency_key, actor, command}`.
- Back ownership with a short-lived controller lease plus heartbeat/keepalive. If the lease expires, downgrade deterministically to `waiting_for_human` or `ready` rather than silently preserving control.
- Persist the idempotency key and normalized command payload atomically with the state transition so retried `takeover`, `return_control`, `pause`, and `resume` commands return the prior result instead of re-executing.

### Topic 3 - Security controls for live browser control, re-auth, approvals, and secret-safe input

- Why this matters: the feature introduces direct human control and visual access to sensitive flows without allowing the agent to bypass existing policy boundaries.
- Findings:
- NIST SP 800-63B states that periodic reauthentication is required to confirm continued subscriber presence, and that sessions need overall and inactivity timeouts that terminate the session when they expire. Source: https://pages.nist.gov/800-63-4/sp800-63b.html
- NIST also recommends secure cookie/session-secret handling, minimum host/path scope, `HttpOnly`, `SameSite`, and not treating access-token presence as proof of active user presence. Source: https://pages.nist.gov/800-63-4/sp800-63b.html
- OWASP’s Authentication Cheat Sheet calls out reauthentication for suspicious activity, account recovery, and critical actions, and recommends adaptive authentication plus MFA for sensitive actions. Source: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP’s MFA guidance reinforces risk-based step-up authentication when context changes materially. Source: https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html
- Browserbase’s live-view docs explicitly position delegated credentials and manual uploads as human-in-the-loop tasks rather than agent-owned automation. Source: https://docs.browserbase.com/features/session-live-view
- Recommendation:
- Require recent re-auth or step-up authentication before elevated takeover on sensitive page classes (`auth`, `billing_admin`, `security`, `restricted_data`), not only before final commits.
- Separate `human_direct_input` from `agent_control` in both audit and policy evaluation. Human takeover should still be policy-mediated, not a bypass.
- Never persist reusable session secrets or delegated controller tokens beyond the live-session validity window; keep them short-lived and scoped to `observe` or `control`.

### Topic 4 - UX patterns for collaborative browser workspaces

- Why this matters: the workspace has to unify viewport, approvals, assists, and history without confusing who currently owns control.
- Findings:
- Browserbase’s live-view documentation emphasizes a single interactive window with explicit read-only vs read/write embedding modes and human-in-the-loop use cases such as taking control, handling iframes, and delegating credentials. Source: https://docs.browserbase.com/features/session-live-view
- Browserbase’s observability docs pair live view with session metadata, status, event/page inspection, and recordings, which supports the spec’s timeline and evidence model. Source: https://docs.browserbase.com/features/observability
- MDN’s SSE guidance highlights named events, event IDs, and retry semantics, which fit a workspace rail/timeline that consumes explicit event types rather than opaque text logs. Source: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
- Inference from those sources: successful live-browser UX separates the control surface from the event log and makes read-only versus control-capable state explicit at the embed boundary.
- Recommendation:
- Design the workspace around an explicit control badge and blocking session state banner. The user should never need to infer whether the agent or human currently owns input.
- Treat approvals and assist requests as first-class queue items in a side rail, not transient toasts, so reconnects and long tasks remain auditable and resumable.
- Keep timeline events structured and typed from day one because these events will also power recovery, replay, and support tooling.

### Topic 5 - Recovery and reconnect patterns for live browser sessions and stream brokers

- Why this matters: the spec explicitly requires fail-closed behavior and clear recovery when stream/policy/session components break.
- Findings:
- MDN documents SSE event IDs and retry fields, plus comment-based keepalives, which are directly relevant for timeline/event-stream recovery even if the viewport itself uses a different transport. Source: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
- etcd leases provide a robust reference for expiring stale ownership when keepalives stop. Source: https://etcd.io/docs/v3.6/learning/api/
- AWS’s idempotency guidance recommends semantically equivalent responses for duplicate requests and parameter mismatch checks for reused identifiers with changed intent. Source: https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/
- Recommendation:
- Split recovery into two channels:
- viewport/control transport recovery
- authoritative session event recovery
- The viewport transport may reconnect independently, but it must not be allowed to reclaim controller ownership without validating the current session version and controller lease.
- Maintain a durable event/timeline stream with replay IDs so the UI can rebuild approvals, assists, and state banners after reconnect even if the interactive canvas reconnects later.

### Web research synthesis

- Recommended implementation direction:
- Use a Python-owned authoritative live-session state machine with explicit CAS versioning and idempotency keys.
- Use headed Chromium in an isolated container runtime with a distinct interactive transport channel.
- Reuse the existing Node policy/token gateway and approval infrastructure, but upgrade it from request/task semantics to session semantics.
- Use short-lived observe/control tokens, controller leases, and typed event replay for reconnect safety.
- Keep high-risk human actions under re-auth and policy gates instead of treating takeover as implicit approval.

### Sources

- noVNC: https://novnc.com/noVNC/
- Playwright Docker: https://playwright.dev/docs/docker
- Playwright CI / headed Linux guidance: https://playwright.dev/docs/ci
- Playwright BrowserContext: https://playwright.dev/docs/api/class-browsercontext
- Browserbase Live View: https://docs.browserbase.com/features/session-live-view
- Browserbase Observability: https://docs.browserbase.com/features/observability
- etcd transaction guide: https://etcd.io/docs/v3.7/tasks/developer/how-to-transactional-write/
- etcd Lease API: https://etcd.io/docs/v3.6/learning/api/
- AWS Builders Library on idempotent APIs: https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/
- MDN SSE guide: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
- NIST SP 800-63B: https://pages.nist.gov/800-63-4/sp800-63b.html
- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP MFA Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html
