# Section 07 — UI Task Control and Runner Connection

## Goal

Expose real local Runner and shared Container state through the existing
combined Feedback/Chat launcher and Universal Control Plane/Task Control
surfaces without creating a new page or bypassing the canonical control plane.

## Ownership and file boundary

Inspect existing:

- apps/web/client/src/components/guardian/FeedbackButton.tsx;
- apps/web/client/src/components/chat/UniversalControlPlanePanel.tsx;
- Chat and Task Control projection components;
- /workers/connect route/components;
- existing localization, responsive and accessibility tests.

Feature 198/200 owns shared presentation and group/step projection. Feature
205 supplies the Runner profile/status contract. Feature 204 supplies
Cloudflare lifecycle/health projection. UI components must call backend
contracts only; they must not write local Runner state or address a Container.

## User journey

From any page, the user opens the single Feedback/Chat launcher, chooses the
chat/control mode, types a request and sees the same Task Control group and
step tree while it runs. The user can see whether a local Runner, shared
Container or Worker App is selected, why a target is unavailable, which step
is active and whether the result is still awaiting verification. The flow
does not navigate to a separate Chat URL just to use the control surface.

The /workers/connect entry point handles local enrollment and clearly
distinguishes SmartAIHub Runner from the existing Worker App. /chat and the
inline panel use the same canonical Job/Runner projection, including waiting,
reconnecting and reconciliation states.

The connection/capability view may show the recognized tool inventory and
derived capability inventory for the selected Runner: tool name, kind, version,
adapter, readiness/auth/health state, capability IDs and safe reason codes.
It MUST NOT show executable absolute paths, credentials, raw configuration,
provider account secrets or claim that a discovered-but-unapproved tool is
available for execution. Cloudflare shared Runner entries show only
allowlisted image/runtime capabilities, never a user's local tool inventory.

## TDD tasks

Write focused Vitest/component tests before changes:

1. Runner and Worker App labels remain distinct.
2. Local and shared Container state render with the correct profile and safe
   health semantics.
3. All state-matrix variants render with disabled/allowed actions.
4. Expanded groups show active step, target, latest safe event, prerequisites
   and verification state.
5. Unauthorized groups, raw paths, tokens, prompts and provider payloads are
   not rendered.
6. Recognized tool inventory and derived capabilities render with safe
   readiness/auth/health states, while unapproved or stale tools cannot be
   selected.

Add focused Playwright tests for the journey and accessibility behaviors.

## Implementation steps

1. Map existing component state/query contracts and reuse the Task Control
   projection from Feature 200.
2. Add Runner/Worker/Container profile labels and connection status mapping.
3. Wire the combined launcher to the existing panel state.
4. Add /workers/connect Runner enrollment distinction.
5. Add localization, responsive and accessible state treatments.
6. Capture browser evidence and ensure /chat/panel projections match.

## Acceptance and dependencies

Depends on sections 01, 02, 04 and 05; it may proceed alongside section 06
once its status contract is stable. It is complete only when the shared UI
shows real canonical state without direct Container commands or invented
progress and focused browser evidence passes.

## UI/UX Contract

### Target User / JTBD

A user starts or monitors a multi-step task from the current page and
understands whether a local Runner, shared Container Runner or Worker App is
actually connected and progressing.

### Surface Inventory

The single combined Feedback/Chat launcher, Universal Control Plane panel,
/chat and /workers/connect are the complete Feature 205 surfaces. No new
standalone Runner page is allowed.

### Component Map

The launcher opens the existing panel. The panel renders connection summary,
execution target/profile, Task Control group/step tree and safe actions.
The connection form calls backend enrollment. Feature 198/200 owns shared
projection/presentation; Feature 205/204 supply typed status fields.

### State Matrix

Loading, no eligible Runner, connected/ready, waiting for lease, running,
provider running, waiting for external provider, reconnecting, reconciling,
paused, verification pending, completed, failed, revoked and permission denied
each require explicit copy, last-updated information and allowed/disabled
actions.

### Responsive Matrix

Mobile uses a compact launcher and stacked cards with expandable steps.
Tablet uses group/step expansion with target summary. Laptop and desktop may
show target, capability and safe diagnostics columns. No raw paths or secrets
appear at any viewport.

### Accessibility Acceptance

Launcher and disclosure controls are keyboard usable with visible focus and
stable focus after refresh. Step groups use semantic disclosure/tree
relationships. Status changes are announced without repetition storms. Labels,
contrast and reduced-motion behavior meet the existing application standard.

### Copy Contract

Thai is the default and English is the fallback. Copy distinguishes Runner,
Worker App and Cloudflare shared Runner, and never says a Job row proves that a
process is alive. Loading, empty, error, reconciling, verification and success
copy must be safe and localized.

### Browser Evidence Required

Playwright must prove launcher open-without-navigation, chat submission,
multi-step expansion, Runner-versus-Worker labels, reconnect/reconciling/
verification states, responsive layout, keyboard access and redacted output.
