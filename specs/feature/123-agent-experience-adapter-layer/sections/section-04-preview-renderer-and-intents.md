# Section 04: Preview Renderer And Intents

## Objective

Build a fixture-only Agent Experience preview renderer that consumes canonical events and emits typed intents without binding to live streams or backend mutations.

## Dependencies

- section-01-shared-contracts-and-flags
- section-02-agency-and-team-adapters
- section-03-golden-fixtures-and-negative-tests

## Scope

- Add fixture-only preview UI.
- Add minimal renderer components using SmartSpec React conventions.
- Prove renderer receives canonical events only.
- Prove renderer emits typed intents only.
- Add accessibility, responsive, i18n, and state coverage for preview UI.

## Candidate Files

Exact location should follow app conventions after inspecting nearby preview/dev routes. Candidate additions:

- `apps/web/client/src/components/agent-experience/AgentExperienceShell.tsx`
- `apps/web/client/src/components/agent-experience/AgentTimeline.tsx`
- `apps/web/client/src/components/agent-experience/AgentApprovalCard.tsx`
- `apps/web/client/src/components/agent-experience/AgentArtifactPane.tsx`
- `apps/web/client/src/components/agent-experience/__tests__/*.test.tsx`

Do not make this preview the default UI.

## UI/UX Contract

### Target User / JTBD

- internal developers/admins validating fixture behavior.

### Surface Inventory

- Fixture-only Agent Experience preview route or dev-only panel.
- Timeline list.
- Artifact pane.
- Approval card.
- Debug drawer/inspector when enabled.
- Disabled, loading, empty, and safe error states.

### Component Map

- `AgentExperienceShell` owns layout and state composition.
- `AgentTimeline` renders accepted canonical events.
- `AgentArtifactPane` renders artifact references.
- `AgentApprovalCard` emits approval intents.
- Debug inspector consumes redacted diagnostics only.

### State Matrix

- loading fixture;
- empty fixture;
- successful event list;
- malformed fixture;
- partial parse with dropped events;
- debug denied;
- flag disabled;
- safe error.

### Responsive Matrix

- mobile: timeline first, artifact/debug drawer;
- tablet: timeline plus collapsible side panel;
- desktop: timeline plus side panel.

### Accessibility Acceptance

- keyboard reachable approval/artifact/debug controls;
- visible focus;
- accessible labels for icon-only buttons;
- no focus stealing during event updates;
- reduced-motion compatible timeline.

### Copy Contract

- Thai and English for user-visible errors and fallback states.
- Debug labels may remain English.
- Do not use `Persona` in user-facing copy.

### Browser Evidence Required

- required before any live preview.
- capture mobile 390x844, tablet 768x1024, desktop 1440x900.

## Tests First

- Test fixture preview renders canonical events.
- Test raw source payloads are not passed into renderer.
- Test approval/artifact/workflow/debug actions emit typed intents.
- Test no renderer direct mutation imports exist.
- Test loading/empty/error/disabled states.
- Test keyboard and accessible labels.
- Test mobile drawer state.

## Acceptance Criteria

- Preview is fixture-only.
- No live stream binding.
- No backend mutation calls.
- Existing Chat, Agency Chat, and Team Room defaults remain unchanged.
