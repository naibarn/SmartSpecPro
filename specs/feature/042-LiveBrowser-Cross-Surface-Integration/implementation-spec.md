# Implementation Spec - Feature 042

## Overview

Feature 042 turns the Feature 036 live-browser runtime into a shared product capability called `Browser Session`. The implementation extends three surfaces that already exist in SmartSpecPro:

1. Chat
2. Agency Swarm
3. Virtual Workflow

The feature does not rebuild the runtime. It adds product-level contracts for navigation, status language, browser-session summaries, and human control handoff so the same runtime can be opened and understood from different surfaces.

## Functional Requirements

### 1. Shared Browser Session Contract

- Define `Browser Session` as the product-facing concept everywhere the user can start, reopen, or inspect live browser work.
- Standardize user-facing action labels and state labels across frontend surfaces.
- Keep internal protocol fields available for code, but map them through a single product-language layer before rendering.
- Define one additive shared contract for:
  - `browserSessionSummary`
  - `browserSessionLaunchContext`
  - `browserSessionReturnContext`
  - shared state-to-copy mapping

#### 1.1 Required Shared Shapes

`browserSessionSummary`
- `sessionId: string`
- `title: string`
- `status: string`
- `nextAction: string | null`
- `originSurface: "automation" | "chat" | "agency" | "workflow"`
- `currentUrl?: string`
- `updatedAt: string`
- `canReopen: boolean`
- `canTakeControl: boolean`
- `reviewState?: string | null`
- `userInputState?: string | null`

`browserSessionLaunchContext`
- `originSurface`
- `originRoute`
- `originEntityType`
- `originEntityId`
- optional `conversationId`, `agencyId`, `workflowId`, `executionId`
- `returnLabel`

`browserSessionReturnContext`
- `returnTo`
- `fallbackTo`
- optional restore state for thread, panel, tab, or execution focus

#### 1.2 Required Product State Mapping

The mapping layer must produce one consistent product vocabulary for:
- running
- review required
- needs user input
- person in control
- AI in control
- reconnecting
- session ended

#### 1.3 Required Default Copy

Preferred default copy:
- `AI is working in this Browser Session.`
- `Review Required before AI can continue.`
- `Needs Your Input before AI can continue.`
- `You are controlling this Browser Session.`
- `AI is controlling this Browser Session.`
- `Reconnecting to this Browser Session.`
- `This Browser Session has ended.`
- `Manual control is unavailable on this screen size.`

### 2. Shared Navigation Contract

- Every Browser Session launch must carry origin metadata.
- Closing the workspace must return the user to the source surface when possible.
- Deep-link resume must remain supported through `/automation/live/:sessionId`.
- Origin metadata must be safe when the parent surface is unavailable or stale.
- The chosen Chat launch model is the existing full-page Browser Session route with origin-aware return, not a new side-panel implementation.

### 3. Chat Integration

- Chat must expose a first-class way to open a Browser Session.
- Chat thread state must be able to represent an existing Browser Session without leaking low-level transport terms.
- Users must be able to reopen an active or recent Browser Session from the same conversation context.
- Chat entrypoints must reuse the shared Browser Session route and return contract.

### 4. Agency Swarm Integration

- Agency Builder must expose a browser collaboration primitive with user-facing naming.
- Agency Chat must surface browser-session state as structured UI, not only as text messages.
- Agency approval and waiting states must be able to reference the active browser-session context when present.
- The chosen builder direction is a dedicated `browser_session` primitive rather than overloading generic `skill_call`.

### 5. Virtual Workflow Integration

- Workflow semantics must support at least:
  - start browser session
  - wait for user input or review
  - send another browser instruction
  - resume after the human step completes
- Existing `web_automation` behavior must remain backward-compatible or be automatically adapted.
- The chosen workflow direction is an additive browser-session node family while preserving legacy `web_automation`.

#### 5.1 Preferred Additive Workflow Nodes

- `browser_session_start`
- `browser_session_instruction`
- `browser_session_wait_for_user`
- `browser_session_review_gate`

Legacy `web_automation` remains for one-shot browser automation and existing saved workflows.

Recommended baseline node contracts:

`browser_session_start`
- inputs: `goal`, `startUrl`, `launchContext`
- outputs: `browserSessionId`, `sessionStatus`, `browserSessionSummary`

`browser_session_instruction`
- inputs: `browserSessionId`, `instructionText`
- outputs: `browserSessionId`, `sessionStatus`, `browserSessionSummary`

`browser_session_wait_for_user`
- inputs: `browserSessionId`, `waitReason`, `timeoutSeconds`
- outputs: `browserSessionId`, `sessionStatus`, `pendingUserStep`

`browser_session_review_gate`
- inputs: `browserSessionId`, `reviewReason`, `reviewSummary`
- outputs: `browserSessionId`, `sessionStatus`, `reviewState`

#### 5.2 Branch-Oriented Output Semantics

All additive browser-session workflow nodes should expose explicit branch-friendly fields:

- `sessionStatus`
  - baseline values: `running`, `waiting_for_user`, `review_required`, `completed`, `failed`, `expired`

- `reviewState`
  - baseline values: `not_required`, `pending`, `approved`, `rejected`

- `pendingUserStep`
  - object with `type`, `reason`, `expiresAt`, `resolved`

- `outcome`
  - baseline values: `continue`, `wait`, `approve`, `reject`, `fail`

Downstream flow-control nodes should branch on these fields instead of parsing text.

### 6. Shared State Mapping

- The system must provide one mapping layer for:
  - AI running
  - waiting for review
  - needs user input
  - person in control
  - AI in control
  - reconnecting
  - ended or expired
- That mapping must drive:
  - buttons
  - badges
  - banners
  - workflow node statuses
  - agency activity cards

### 7. Rollout And Gating

- The feature must support per-surface rollout flags:
  - `chatBrowserSessionEntry`
  - `agencyBrowserSessionUi`
  - `workflowBrowserSessionNodes`
- Flags should be tenant-aware so rollout can proceed incrementally.
- If a surface flag is off, that surface falls back to existing behavior without blocking Feature 036.
- Flags must be added to the existing tenant feature flag stack:
  - `apps/web/shared/featureFlags.ts`
  - `apps/web/server/services/tenantFeatureFlagService.ts`
  - `apps/web/server/routers/tenantFeatureFlags.ts`
  - `apps/web/client/src/components/admin/TenantFeatureFlagsPanel.tsx`

Recommended admin labels:
- `Chat Browser Session`
- `Agency Browser Session`
- `Workflow Browser Session Nodes`

### 8. Observability

- Emit metrics and logs for:
  - browser-session opened and reopened by origin surface
  - return navigation failures
  - stuck `Needs Your Input` states
  - blocked `Take Control` attempts, including policy or step-up reasons
  - legacy workflow fallback usage
- Client product analytics should use the existing PostHog helper pattern with a dedicated Browser Session analytics module.
- Server or runtime operational signals should reuse the project’s existing metrics, incident, or structured-log patterns rather than inventing an isolated telemetry sink.

#### 8.1 Recommended Browser Session Analytics Events

Client-side events:
- `browser_session_opened`
- `browser_session_reopened`
- `browser_session_return_navigation_failed`
- `browser_session_take_control_blocked`
- `browser_session_mobile_observe_only_seen`

Runtime or server-side signals:
- `browser_session_launch_total`
- `browser_session_waiting_for_user_stale_total`
- `browser_session_take_control_blocked_total`
- `workflow_browser_session_legacy_fallback_total`
- `agency_browser_session_render_failure_total`

#### 8.2 Client Analytics Payload Baseline

`browser_session_opened`
- `originSurface`
- `originEntityType`
- `compactLayout`
- `launchKind`

`browser_session_reopened`
- `originSurface`
- `compactLayout`
- `sessionAgeBucket`

`browser_session_return_navigation_failed`
- `originSurface`
- `intendedReturnTo`
- `fallbackTo`

`browser_session_take_control_blocked`
- `originSurface`
- `compactLayout`
- `reasonCategory`

`browser_session_mobile_observe_only_seen`
- `originSurface`
- `sessionStatus`

#### 8.3 Operational Signal Label Guidance

Recommended low-cardinality labels:
- `origin_surface`
- `reason_category`

Recommended `reason_category` values:
- `policy`
- `step_up`
- `state`
- `navigation`
- `render`
- `legacy_fallback`
- `unknown`

#### 8.4 Alert Intent

The feature should define alert thresholds or release-gate thresholds for:
- return-navigation failures above baseline
- stale `Needs Your Input` states beyond the chosen time window
- legacy workflow fallback remaining elevated after rollout
- blocked control attempts from unexpected non-policy causes

#### 8.5 Optional Infra Follow-Up

Optional post-implementation infra hardening may include:

- environment-specific alert thresholds
- dashboard or query templates for Browser Session telemetry
- explicit alert routing to web, Agency, and workflow owners
- runbook pointers for investigating return failures, stale waits, blocked control attempts, and workflow fallback

Recommended starting baselines:

- return-navigation failure rate
  - canary: alert above 2 percent over 15 minutes
  - broader rollout: alert above 1 percent over 30 minutes

- stale `Needs Your Input`
  - warning above 5 stale sessions older than 10 minutes
  - critical above 15 stale sessions older than 15 minutes

- workflow legacy fallback
  - warning above 20 percent after rollout week 1
  - critical above 10 percent after the stabilization window

- non-policy blocked control attempts
  - warning above 5 events in 15 minutes
  - critical above 20 events in 15 minutes

Recommended dashboard or query slices:

- opens and reopens by origin surface
- return-navigation success versus fallback
- stale `Needs Your Input` count over time
- blocked `Take Control` attempts by reason
- legacy workflow fallback rate
- agency browser-session render failures

### 9. Mobile And Compact Layout Behavior

- Browser Session remains observe-first on compact layouts.
- `Take Control` stays unavailable on compact layouts and the UI must say why in user-facing language.
- Chat and Agency entrypoints may open Browser Session on mobile, but should not imply manual control is available there.
- Workflow authoring remains desktop-first; no new mobile authoring scope is added in this feature.
- Mobile and compact-layout wording should reuse the shared presentation contract rather than hardcoding surface-specific variants.

## Constraints

- Feature 036 route-backed resume remains canonical.
- No sensitive-page security downgrade is allowed.
- Prefer migration-free extension using existing JSON contracts and registry-driven UI where possible.
- Saved workflows and saved agencies need a compatibility story if new node semantics are introduced.
- Feature flags must allow surface-by-surface rollout and rollback.
- The rollout plan must name the concrete files that hold feature flag defaults, validation, and admin controls.

## Verification Expectations

- UI regression tests for navigation and wording
- Chat integration tests for open/reopen flows
- Agency UI tests for browser-session state rendering
- Workflow contract tests for new node semantics
- Backward-compatibility tests for existing automation flows
- Telemetry verification for return failures, stuck waits, and blocked control attempts
- Mobile or compact-layout tests for observe-only behavior
- Feature flag validation and admin-panel rendering tests for the new per-surface flags
- Copy-snapshot or equivalent tests for the required default Browser Session status text

## Follow-Up Expansion Scope

### 10. Agency Runtime Browser Session Execution

- Agency `browser_session` must become executable runtime behavior, not builder-only metadata.
- The Agency orchestrator must add an explicit executor path for `browser_session` nodes instead of falling through to unknown-node handling.
- A running agency must be able to:
  - create a Browser Session
  - persist the active `browserSessionId` in agency-run context
  - emit structured session summaries and handoff states back to Agency Chat
  - resume the same session on later agency turns when the graph is designed to continue browser work
- The runtime contract should support handoff modes such as:
  - `continue_running`
  - `review_required`
  - `needs_user_input`
  - `take_control`

### 11. Browser Session Workspace Renderer

- The Browser Session workspace should render the live remote browser stream, not only a summary shell.
- The renderer must consume existing `viewerToken` and `controllerToken` contracts while preserving current route, control, and policy behavior.
- Required outcomes:
  - observe mode shows the current browser viewport
  - takeover mode upgrades the stream to an interactive controller experience
  - reconnect and token refresh states remain explicit
  - compact layouts stay observe-only unless policy changes in a later feature

### 12. Chat And Agency Natural Browser Invocation

- Chat and Agency should support a structured Browser Session invocation path from conversation-driven intent, not only toolbar entry buttons.
- The first release should prefer a safe invocation contract:
  - assistant proposes Browser Session launch with a structured action card
  - user explicitly confirms launch from Chat or Agency
  - the system creates the Browser Session and persists the resulting artifact automatically
- Required launch metadata:
  - origin surface
  - triggering message or run identifier
  - launch reason or intent class
  - whether launch was `suggested`, `approved`, or `direct`

### 13. Research, Comparison, And Booking-Oriented Semantics

- The product should add structured support for browse-heavy research tasks that compare multiple options before a human commits.
- The baseline normalized comparison contract should support fields such as:
  - `vendor`
  - `optionTitle`
  - `price`
  - `currency`
  - `distance`
  - `locationSummary`
  - `availabilityState`
  - `refundable`
  - `bookingLink`
  - `evidence`
  - `capturedAt`
- The first implementation should optimize for evidence capture, structured comparison, and human review before commitment rather than unattended purchase.

### 14. Explicit Login, Captcha, And Commitment Gates

- Browser Session state mapping should expand beyond generic `needs user input` to support explicit high-friction states:
  - `login_required`
  - `captcha_required`
  - `payment_review_required`
  - `booking_confirmation_required`
- Required rules:
  - login or MFA barriers may require takeover or secure assist input
  - captcha barriers must pause AI progress and request human completion
  - payment and booking confirmation barriers must require an explicit human confirmation step before final submit
  - irreversible actions must not proceed from AI-only state after the system has entered a commitment gate

### 15. Advanced Rollout And Verification

- The advanced automation uplift should add scenario-level verification beyond the current cross-surface smoke coverage.
- Minimum added scenarios:
  - Chat launches Browser Session from a suggested action card
  - Agency run reaches an executable `browser_session` node and returns a resumable session summary
  - Browser Session stream renderer reconnects successfully after token refresh
  - login or MFA barrier triggers explicit human handoff copy
  - captcha barrier pauses execution without silent failure
  - booking or payment commitment requires explicit confirmation before submit
  - multi-option comparison output is normalized and reviewable
