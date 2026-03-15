# Research Notes

## Codebase Recon

### Existing Live-Browser Foundation

- Dedicated routes already exist at `/automation` and `/automation/live/:sessionId` in `apps/web/client/src/App.tsx`.
- `AutomationPage.tsx` is a thin wrapper over `AutomationChatModal`, so the runtime entrypoint is already centralized.
- `AutomationChatModal.tsx` already supports:
  - route-backed resume
  - session polling and hydration
  - live command queueing
  - approval and assist handling
  - step-up code entry for sensitive takeover
- `LiveBrowserWorkspace.tsx` already defines a consistent browser-session shell with status, control actions, and event timeline.

### Current Integration Gaps

#### Chat

- `Chat.tsx` exposes only the existing right-panel concepts: generate, skills, artifacts, schedule, memory, canvas.
- `ChatView.tsx` has no browser-session artifact, reopen action, or navigation handoff into `/automation`.
- Result: the live-browser capability is not first-class inside Chat.

#### Agency Swarm

- `AgencyChat.tsx` is a text-streaming conversation surface with an activity panel, but no browser-session UI state.
- Agency node types in `components/agency/nodes/types.ts` do not include a browser-session or live-browser primitive.
- Result: Agency can discuss or trigger work, but cannot model browser collaboration clearly.

#### Virtual Workflow

- Workflow editor is registry-driven and already capable of rendering new node input contracts through `DynamicNodeConfig.tsx`.
- `node_registry.py` exposes `web_automation`, but `web_automation_executor.py` is still a one-shot execution block.
- Result: UI infrastructure is extensible, but runtime node semantics do not yet support browser-session collaboration.

### Navigation Risk

- `AutomationPage.tsx` always redirects to `/dashboard` when closed.
- Result: if Browser Session starts from Chat, Agency, Workflow, or alerts, closing the workspace loses origin context.

### Naming and UX Risk

- Current code and copy still mix product language and implementation language:
  - live mode
  - takeover
  - controller
  - viewer
  - assist request
- Result: users are forced to interpret system terms instead of understanding outcome-oriented actions.

### Existing Test and Architecture Signals

- Live-browser logic already has targeted tests on web and Python sides, so incremental integration can piggyback on that foundation.
- Workflow editor and agency builder both already separate node metadata from rendering, which lowers UI-extension risk.
- The lowest-risk architectural move is to keep one live-browser runtime and add integration adapters rather than branching the runtime.
- Tenant-scoped rollout already follows a shared pattern through:
  - `apps/web/shared/featureFlags.ts`
  - `apps/web/server/services/tenantFeatureFlagService.ts`
  - `apps/web/client/src/components/admin/TenantFeatureFlagsPanel.tsx`
- Client-side product analytics already follow a reusable helper style via `apps/web/client/src/lib/posthog.ts` and domain-specific helper modules under `apps/web/client/src/lib/analytics/`.
- Compact-layout Browser Session behavior already exists in Automation UI, so the safest cross-surface plan is to reuse that observe-first rule and shared copy rather than redefining mobile control behavior per surface.

## Web Research

### Candidate topics considered

1. Route-backed workspace transitions for React single-page apps
2. Human-in-the-loop workflow modeling for long-running browser tasks
3. Shared status vocabulary across chat and workflow surfaces

### Decision

- External web research skipped for this pass

### Rationale

- The problem is dominated by local product integration, current code boundaries, and backward compatibility decisions rather than unstable third-party APIs or vendor guidance.
