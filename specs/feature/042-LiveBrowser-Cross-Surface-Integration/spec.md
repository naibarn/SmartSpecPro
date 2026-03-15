# Spec 042 - Live Browser Cross-Surface Integration

Version: 1.0
Date: 2026-03-12
Status: Proposed
Audience: Product, UX, Frontend, Node Backend, Python Backend
Related Features: 017-VirtualWorkflowExam, 027-AgencySwarm, 032-Browser-Automation-Copilot, 033-Browser-Automation-Policy, 036-LiveBrowserExperience

---

## 1. Executive Summary

Feature 036 delivered a working live-browser experience on the dedicated automation surface. The next gap is product integration: the live browser is still isolated from the main chat experience, Agency Swarm, and the virtual workflow system.

This feature upgrades live browser from a specialized automation screen into a shared product capability that users can start, resume, and understand from the three main surfaces where they already work:

1. Chat
2. Agency Swarm
3. Virtual Workflow

The feature also standardizes user-facing names, actions, and status language so the experience reads clearly from a user perspective rather than an internal implementation perspective.

---

## 2. Problem Statement

### 2.1 Current State

SmartSpecPro already has the runtime pieces for live browser collaboration:

- dedicated route: `/automation` and `/automation/live/:sessionId`
- session creation, resume, stream token issuance, command queueing
- human takeover, approval, assist, and readiness gates
- security hardening for takeover and sensitive pages

### 2.2 Current Product Gaps

The system still has four major gaps:

1. **Chat does not treat live browser as a first-class action**
   Users cannot naturally move from a chat task into a browser session and back without leaving the chat experience.

2. **Agency Swarm does not understand browser sessions**
   Agency conversations and agency node types do not expose a structured live-browser session state, human control handoff, or browser-aware approval UX.

3. **Virtual Workflow cannot model live-browser collaboration**
   The current `web_automation` node behaves like a one-shot execution block. It cannot express "start a browser session", "wait for human input", "resume after approval", or "send another command to the same browser".

4. **User-facing language is inconsistent**
   Terms such as "live mode", "takeover", "controller", "viewer token", and "assist request" are implementation-oriented. The product needs clearer wording that tells the user what will happen.

### 2.3 Why It Matters

If live browser stays isolated:

- users will treat it as a side tool instead of part of the core workflow
- Chat and Agency experiences will continue to lose context when real browser work begins
- Workflow automation will stop at one-shot browser actions instead of collaborative browser journeys
- UX language will remain harder to trust because the product exposes system vocabulary instead of user intent

---

## 3. Goals

1. Make live browser startable and resumable directly from Chat.
2. Make Agency Swarm capable of creating, surfacing, and resuming browser sessions with human control handoff.
3. Extend Virtual Workflow so browser collaboration is modeled as explicit node semantics, not inferred from one-shot automation output.
4. Standardize user-facing labels, commands, statuses, and call-to-action text across all surfaces.
5. Preserve Feature 036 runtime, security, readiness, and policy controls without duplicating the live-browser stack.
6. Keep all integrations route-safe and context-safe so users return to the screen they came from.

---

## 4. Non-Goals

1. Rebuilding the live-browser runtime from scratch
2. Replacing the existing approval or policy engines
3. Supporting multiple humans controlling the same browser session simultaneously
4. Turning Agency Swarm into a separate browser IDE
5. Shipping a brand-new browser streaming transport in this feature

---

## 5. Product Language Standards

This feature must prefer user-facing language that describes intent and outcome.

### 5.1 Primary User-Facing Terms

| Internal / unclear term | Preferred user-facing term |
|---|---|
| live mode | Browser Session |
| launch live mode | Open Browser Session |
| resume live mode | Reopen Browser Session |
| takeover | Take Control |
| return control | Return to AI |
| controller | Person in Control |
| viewer | Observer |
| assist request | Needs Your Input |
| approval request | Review Required |
| natural language command | Browser Instruction |
| live workspace | Browser Session Workspace |

### 5.2 Text Rules

1. Labels must describe the user action, not the transport or implementation.
2. Status text must explain what the system is waiting for.
3. Actions that change control must be explicit and reversible.
4. If the user must authenticate again, the message must say why in product terms.
5. Avoid exposing terms like `sessionId`, `scope`, `lease`, `token`, `viewer`, or `controller` in primary UI text.

### 5.3 Required Cross-Surface Commands

The following commands or CTA labels must be reused unless there is a strong surface-specific reason not to:

- `Open Browser Session`
- `Continue in Browser`
- `Reopen Browser Session`
- `Take Control`
- `Return to AI`
- `Needs Your Input`
- `Review Required`
- `Browser Instruction`
- `Session Ended`

### 5.4 Required Status Copy

The following short status lines are the preferred defaults unless a surface has a stronger contextual reason:

- running: `AI is working in this Browser Session.`
- review required: `Review Required before AI can continue.`
- needs user input: `Needs Your Input before AI can continue.`
- person in control: `You are controlling this Browser Session.`
- AI in control: `AI is controlling this Browser Session.`
- reconnecting: `Reconnecting to this Browser Session.`
- session ended: `This Browser Session has ended.`
- compact observe-only: `Manual control is unavailable on this screen size.`

---

## 6. Scope

### 6.1 Chat Integration

Add a first-class entry path from Chat into Browser Session Workspace.

Required outcomes:

- a chat message, tool result, or side panel can open a browser session
- Chat preserves origin context when the user opens and closes the browser session
- users can reopen an existing browser session from the same chat thread
- browser-session state can be represented in chat artifacts or thread state without exposing low-level transport details

### 6.2 Agency Swarm Integration

Add browser-session-aware agency semantics to both the builder and runtime-facing chat UI.

Required outcomes:

- Agency UI can surface when an agency run creates a browser session
- Agency chat can show browser-related waiting states, review states, and control states
- Agency builder has a clear primitive for browser collaboration instead of forcing everything through generic `skill_call`
- human approval can reference the active browser session context when applicable

### 6.3 Virtual Workflow Integration

Upgrade workflow semantics from one-shot web automation to reusable browser collaboration flows.

Required outcomes:

- `web_automation` is either extended or split into clearer node types
- workflow nodes can represent start, wait, resume, review, and command continuation behavior
- node inputs and outputs use meaningful names and are stable enough for downstream nodes
- workflow execution logs and node status communicate browser collaboration state clearly

### 6.4 Shared Navigation and Return Context

All surfaces that open the browser session must preserve where the user came from and how to return.

Required outcomes:

- no hardcoded return to `/dashboard` when origin context is available
- route or navigation state can reopen a session without losing the parent surface
- deep links can reopen the same session from a copied URL

### 6.5 Shared UX Vocabulary and State Mapping

All surfaces must use the same human-readable state language for:

- running
- waiting for review
- waiting for user input
- person in control
- AI in control
- reconnecting
- ended or expired

---

## 7. Architectural Direction

### 7.1 One Runtime, Multiple Surfaces

The dedicated live-browser runtime remains the single source of truth. Chat, Agency Swarm, and Workflow must integrate with it rather than create parallel browser-session systems.

### 7.2 Browser Session as a Product Capability

The product-level abstraction is `Browser Session`, not `live mode`.

Every surface should treat it as a reusable capability with:

- an origin surface
- a session summary
- a human-readable status
- resumable navigation
- structured handoff states

### 7.3 Workflow as a Semantic Model

Workflow must model browser collaboration explicitly. If a flow requires starting a browser session, pausing for a person, and resuming after input, that must be visible in the node contract and in execution state.

### 7.4 Agency as a Conversation Surface

Agency chat should remain a conversation surface, but it must be able to show browser-session events as structured UI states rather than burying them inside plain text messages.

---

## 8. Key Design Decisions To Resolve In Planning

Planning resolves the following architecture choices:

1. **Chat launch model**
   Chat uses the existing full-page Browser Session route with origin-aware return metadata.
   The product does not introduce a second right-panel browser implementation in this phase.

2. **Agency builder model**
   Agency gets a dedicated `browser_session` primitive instead of overloading `skill_call`.
   Existing `skill_call` remains valid for generic tools.

3. **Workflow model**
   Workflow keeps legacy `web_automation` for one-shot behavior and adds an additive browser-session node family for collaborative flows.

4. **Session summary model**
   Chat and Agency both render a shared `browserSessionSummary` contract instead of free-text-only browser state.

5. **Copy ownership**
   User-facing labels are centralized in one shared Browser Session presentation contract reused by all surfaces.

### 8.1 Shared Contract Shapes

The implementation plan must define and reuse these additive contracts:

- `browserSessionSummary`
  - `sessionId`
  - `title`
  - `status`
  - `nextAction`
  - `originSurface`
  - `currentUrl`
  - `updatedAt`
  - `canReopen`
  - `canTakeControl`
  - optional review and user-input hints

- `browserSessionLaunchContext`
  - `originSurface`
  - `originRoute`
  - `originEntityType`
  - `originEntityId`
  - optional conversation, agency, workflow, or execution identifiers
  - `returnLabel`

- `browserSessionReturnContext`
  - `returnTo`
  - `fallbackTo`
  - optional UI restore state such as selected thread, selected panel, or execution tab

### 8.1.1 Tenant Flag Direction

This feature extends the tenant feature flag system already defined in `apps/web/shared/featureFlags.ts`.

Required additive flags:

- `chatBrowserSessionEntry`
- `agencyBrowserSessionUi`
- `workflowBrowserSessionNodes`

These flags must:

- default to `false`
- be included in validation and resolution logic
- sync through the existing tenant feature flag update flow
- appear in the tenant admin feature flag UI with user-facing labels

Recommended admin labels and descriptions:

- `chatBrowserSessionEntry`
  - label: `Chat Browser Session`
  - description: `Start and reopen Browser Session from Chat`

- `agencyBrowserSessionUi`
  - label: `Agency Browser Session`
  - description: `Show Browser Session nodes and session state in Agency`

- `workflowBrowserSessionNodes`
  - label: `Workflow Browser Session Nodes`
  - description: `Enable collaborative Browser Session nodes in Workflow`

### 8.2 Workflow Node Direction

The preferred additive node family is:

- `browser_session_start`
- `browser_session_instruction`
- `browser_session_wait_for_user`
- `browser_session_review_gate`

Legacy `web_automation` remains supported for saved workflows and one-shot automation use cases.

Recommended node semantics:

- `browser_session_start`
  - inputs: goal, start_url, launch_context
  - outputs: browser_session_id, session_status, browser_session_summary

- `browser_session_instruction`
  - inputs: browser_session_id, instruction_text
  - outputs: browser_session_id, session_status, browser_session_summary

- `browser_session_wait_for_user`
  - inputs: browser_session_id, wait_reason, timeout_seconds
  - outputs: browser_session_id, session_status, pending_user_step

- `browser_session_review_gate`
  - inputs: browser_session_id, review_reason, review_summary
  - outputs: browser_session_id, session_status, review_state

### 8.2.1 Workflow Branching Semantics

The additive workflow nodes must support predictable downstream branching through explicit output fields, not inferred text.

Required branch-oriented fields:

- `session_status`
  - allowed baseline values:
    - `running`
    - `waiting_for_user`
    - `review_required`
    - `completed`
    - `failed`
    - `expired`

- `review_state`
  - allowed baseline values:
    - `not_required`
    - `pending`
    - `approved`
    - `rejected`

- `pending_user_step`
  - object with:
    - `type`
    - `reason`
    - `expiresAt`
    - `resolved`

- `outcome`
  - allowed baseline values:
    - `continue`
    - `wait`
    - `approve`
    - `reject`
    - `fail`

These fields exist to let downstream flow-control nodes branch without parsing natural language.

### 8.3 Analytics And Operational Signals

This feature must define concrete event and signal names instead of leaving telemetry generic.

Client-side product analytics should follow the existing PostHog helper pattern and introduce a dedicated Browser Session analytics helper with additive event names such as:

- `browser_session_opened`
- `browser_session_reopened`
- `browser_session_return_navigation_failed`
- `browser_session_take_control_blocked`
- `browser_session_mobile_observe_only_seen`

Server-side and runtime observability should include counters or structured logs for:

- browser-session launch by origin surface
- stuck `Needs Your Input`
- blocked control attempts by reason
- workflow legacy fallback usage
- agency browser-session render or handoff failures

### 8.3.1 Client Analytics Payload Baseline

Recommended event payload fields:

- `browser_session_opened`
  - `originSurface`
  - `originEntityType`
  - `compactLayout`
  - `launchKind` (`new` | `resume`)

- `browser_session_reopened`
  - `originSurface`
  - `compactLayout`
  - `sessionAgeBucket`

- `browser_session_return_navigation_failed`
  - `originSurface`
  - `intendedReturnTo`
  - `fallbackTo`

- `browser_session_take_control_blocked`
  - `originSurface`
  - `compactLayout`
  - `reasonCategory` (`policy` | `step_up` | `state` | `unknown`)

- `browser_session_mobile_observe_only_seen`
  - `originSurface`
  - `sessionStatus`

### 8.3.2 Operational Signal Labels And Alert Intent

Recommended low-cardinality labels:

- `origin_surface`
  - `automation`
  - `chat`
  - `agency`
  - `workflow`

- `reason_category`
  - `policy`
  - `step_up`
  - `state`
  - `navigation`
  - `render`
  - `legacy_fallback`
  - `unknown`

Recommended alert intent:

- alert when return-navigation failures spike above a small baseline
- alert when `Needs Your Input` stale events exceed the chosen threshold
- alert when workflow legacy fallback remains high after workflow rollout
- alert when blocked control attempts from non-policy causes spike unexpectedly

### 8.3.3 Optional Infra Hardening

The following items are optional infra follow-up work after the core feature ships. They are not required to complete product implementation, but they should be planned now so operations work does not start from zero later.

Optional threshold baselines:

- return-navigation failure rate
  - canary baseline: alert above 2 percent of Browser Session exits over 15 minutes
  - broader rollout baseline: alert above 1 percent over 30 minutes

- stale `Needs Your Input`
  - warning when more than 5 sessions remain stale beyond 10 minutes in one tenant or environment
  - critical when more than 15 sessions remain stale beyond 15 minutes

- workflow legacy fallback
  - warning when legacy fallback remains above 20 percent of workflow browser-session executions after rollout week 1
  - critical when it remains above 10 percent after the agreed stabilization window

- unexpected blocked control attempts
  - warning when non-policy `Take Control` blocks exceed 5 events in 15 minutes
  - critical when non-policy blocks exceed 20 events in 15 minutes

Optional dashboard slices:

- Browser Session opens and reopens by origin surface
- Browser Session exits with return-navigation success versus fallback
- `Needs Your Input` stale count over time
- blocked `Take Control` attempts by reason category
- workflow legacy fallback rate
- agency browser-session render failures

Optional runbook pointers:

- assign Browser Session navigation alerts to the web or frontend on-call rotation
- assign workflow legacy fallback alerts to the workflow or Python orchestration owner
- assign Agency browser-session rendering alerts to the Agency owner
- document fallback actions for each alert in the environment runbook used by the team

---

## 9. Candidate Impacted Areas

### Frontend

- `apps/web/client/src/pages/Chat.tsx`
- `apps/web/client/src/components/chat/ChatView.tsx`
- `apps/web/client/src/pages/AutomationPage.tsx`
- `apps/web/client/src/components/automation/*`
- `apps/web/client/src/pages/AgencyChat.tsx`
- `apps/web/client/src/pages/AgencyBuilder.tsx`
- `apps/web/client/src/components/agency/*`
- `apps/web/client/src/pages/WorkflowEditor.tsx`
- `apps/web/client/src/components/workflow/*`

### Node backend

- shared live-browser contract and router surfaces
- chat-side artifact and navigation metadata handling
- workflow router or execution metadata plumbing
- agency bridge metadata plumbing where browser-session state must cross services

### Python backend

- workflow node registry and executor semantics
- agency runtime/browser-session state adapters if needed
- browser-session status mapping for workflow and agency outputs

---

## 10. Constraints

1. Existing Feature 036 behavior must remain working during the rollout.
2. Route-backed resume must remain supported.
3. Sensitive-page takeover policy and step-up checks must not be weakened by new UI paths.
4. Naming improvements must not break API compatibility without an explicit migration path.
5. Workflow changes must preserve backward compatibility or provide a safe migration story for existing saved workflows.
6. Agency changes must remain compatible with existing agency graphs wherever possible.
7. Mobile and compact layouts remain observe-first; manual control must continue to respect existing compact-viewport restrictions.
8. New product entrypoints must be gated per surface so rollout can proceed incrementally.

---

## 11. Acceptance Criteria

1. A user can start or reopen a Browser Session directly from Chat without losing chat context.
2. Closing the Browser Session returns the user to the correct origin surface rather than always returning to `/dashboard`.
3. Agency Chat can display structured browser-session states including at least:
   - running
   - needs user input
   - review required
   - person in control
   - reconnecting
   - ended
4. Agency Builder exposes a browser collaboration primitive with user-facing naming that is clearer than generic `skill_call`.
5. Workflow supports browser collaboration semantics beyond one-shot extraction, with at least one explicit path for waiting on human action and resuming.
6. User-facing labels for browser-session actions and statuses are consistent across Chat, Agency, Workflow, and Automation surfaces.
7. Existing dedicated automation entrypoints from Feature 036 continue to work.
8. Regression coverage includes navigation, status mapping, workflow node semantics, and browser-session resume behavior.
9. Per-surface rollout can be enabled independently for Chat, Agency, and Workflow.
10. The system emits enough telemetry to detect return-path failures, stuck waiting states, and blocked control attempts.

---

## 12. Recommended Planning Focus

The implementation plan should explicitly cover:

1. user-facing naming and copy contract
2. route and navigation model
3. Chat integration and browser-session artifact model
4. Agency Swarm node and chat integration
5. Virtual Workflow node semantics and backward compatibility
6. shared browser-session contract shapes and status mapping
7. feature-flag rollout matrix
8. observability and analytics for cross-surface usage
9. mobile and compact-layout behavior
10. regression prevention and rollout sequence
