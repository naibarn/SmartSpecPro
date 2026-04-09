# Section 07: Control-Plane UI Surfaces

## Overview

This section implements the operator-facing web surfaces for Feature 079. Its job is to make the workpack lifecycle legible in the existing control plane without creating a separate product island or a second monitoring system.

The surfaces in this section should expose the workpack lifecycle end to end:

1. case intake and draft review
2. workpack detail and lifecycle state
3. simulation replay and diff inspection
4. exception inbox and remediation actions
5. connector schema studio and scope posture
6. ROI, readiness, and promotion visibility
7. playbook library and benchmark discovery

These surfaces must be built on top of the contracts, simulation output, connector validation, and promotion readiness produced by Sections 02, 04, 05, and 06. They should provide clear entrypoints from chat, workflow gallery, team/agency areas, and desktop-host/local-file contexts while continuing to link back into the existing workflow, browser, agency, and desktop runtime surfaces.

## Dependencies

- `section-02-intake-and-playbook-drafting`
- `section-04-simulation-replay-and-exceptions`
- `section-05-connector-mapping-and-boundary-control`
- `section-06-learning-benchmarks-and-promotion`

## Blocks

- `section-08-telemetry-rollout-and-gating`

## Scope

Build a cohesive workpack control-plane experience that:

- surfaces intake drafts with provenance, confidence, and clarification state
- shows workpack lifecycle state, autonomy mode, policy posture, and current run history
- renders replay diffs, drift markers, and artifact references in a readable comparison layout
- groups exceptions by reason code, risk class, and next action
- shows connector mapping state, validation results, auth scope posture, and side-effect class
- exposes ROI and promotion readiness metrics without duplicating the existing run monitor
- supports library browsing for playbook starters and benchmark packs with lineage and trust labels
- provides deep links into the existing workflow, browser, desktop, and monitoring surfaces instead of reimplementing them

The section should not:

- invent a new execution or monitoring stack
- duplicate the admin monitoring dashboard or workflow gallery
- hide low-confidence, blocked, or tainted states behind optimistic UI
- require a full end-to-end journey to inspect one workpack artifact
- create a separate design system for workpack pages

## Files to Create or Modify

| File | Action | Purpose |
|---|---|---|
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/WorkpackIntakeStudio.tsx` | Create | Case intake surface for source review, normalization output, and clarification prompts |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/WorkpackDetail.tsx` | Create | Primary workpack detail view with lifecycle state, policy, history, fixtures, and links |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/WorkpackReplayLab.tsx` | Create | Replay and diff surface for expected-vs-actual comparison and drift inspection |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/WorkpackExceptionInbox.tsx` | Create | Exception triage surface grouped by reason, risk, and remediation path |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/WorkpackConnectorStudio.tsx` | Create | Connector mapping review and validation surface for workpack boundary control |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/WorkpackRoiDashboard.tsx` | Create | ROI, readiness, intervention, and promotion summary surface |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/WorkpackDiscovery.tsx` | Create | Playbook library and benchmark discovery surface with lineage and trust class |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/workpack/WorkpackSummaryHeader.tsx` | Create | Shared header with lifecycle state, autonomy mode, and readiness badges |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/workpack/WorkpackStatusRail.tsx` | Create | Compact status rail for draft, simulation, supervised, autonomous, and blocked states |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/workpack/WorkpackSourcePanel.tsx` | Create | Intake provenance and confidence panel for source artifacts |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/workpack/WorkpackHistoryTimeline.tsx` | Create | Run, exception, and promotion timeline component |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/workpack/WorkpackDiffViewer.tsx` | Create | Replay comparison viewer for expected and actual steps, approvals, and artifacts |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/workpack/WorkpackConnectorMatrix.tsx` | Create | Connector map and scope posture grid |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/workpack/WorkpackMetricCards.tsx` | Create | KPI cards for completion, intervention, exception, throughput, and promotion readiness |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/lib/workpackNavigation.ts` | Create | Shared deep-link helpers and entrypoint targets for workpack surfaces |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/App.tsx` | Modify | Register routes for the new workpack pages |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Chat.tsx` | Modify | Add workpack entrypoints from chat-originated cases and drafts |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/WorkflowGallery.tsx` | Modify | Add workpack links for workflow-derived drafts and starter packs |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Teams.tsx` | Modify | Add team and agency entrypoints into workpack surfaces where appropriate |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/DesktopOpen.tsx` | Modify | Support local-file and desktop-host entrypoints into intake and replay |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Dashboard.tsx` | Modify | Surface a compact workpack entry card without replacing the existing dashboard |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/__tests__/WorkpackIntakeStudio.test.tsx` | Create | Intake surface rendering and clarification state tests |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/__tests__/WorkpackDetail.test.tsx` | Create | Detail surface state, links, and metadata rendering tests |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/__tests__/WorkpackReplayLab.test.tsx` | Create | Replay diff and artifact rendering tests |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/__tests__/WorkpackExceptionInbox.test.tsx` | Create | Exception grouping and remediation action tests |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/__tests__/WorkpackConnectorStudio.test.tsx` | Create | Connector matrix and validation state tests |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/__tests__/WorkpackRoiDashboard.test.tsx` | Create | KPI and promotion readiness tests |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/__tests__/WorkpackDiscovery.test.tsx` | Create | Library and benchmark discovery tests |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/lib/__tests__/workpackNavigation.test.ts` | Create | Deep-link helper and entrypoint mapping tests |

## Implementation Plan

### 1. Define the workpack navigation model first

Create a small shared navigation layer before building the pages. This layer should centralize:

- canonical route names for each workpack surface
- deep-link targets from chat, workflow gallery, team views, and desktop-host contexts
- route parameters for workpack id, version id, run id, exception id, connector id, and benchmark pack id
- return-link behavior so operators can move between detail, replay, exceptions, and connector views without losing context

Keep the navigation helpers thin. They should format links and preserve IDs, not decide business logic.

### 2. Build the Case Intake Studio as the first operator touchpoint

Implement the intake surface so operators can review draft artifacts produced by Section 02 before the workpack moves forward.

The intake page should render:

- source list with provenance, capture time, and file or trace references
- confidence cues for normalized fields
- clarification-needed prompts as an actionable checklist
- draft playbook summary and draft workpack summary
- links back to the source material or local file context where available

The intake experience should be explicit about what was inferred, what remains ambiguous, and what the user can correct. It should not imply execution readiness.

### 3. Build the Workpack Detail page as the primary control surface

The detail page should be the default page for inspecting a workpack. It should expose:

- lifecycle state and autonomy mode
- policy profile and approval posture
- connector requirements and validation summary
- fixture and replay coverage
- exception history
- promotion state and benchmark lineage
- links to the underlying workflow, browser, or desktop surfaces

This view should be the operator's stable home base. Other workpack pages may focus on a narrower task, but the detail page must show the full story at a glance.

### 4. Build Replay Lab around diffs, not raw logs

The replay surface should present the expected-vs-actual comparison in a way operators can inspect quickly.

Show:

- planned step versus actual step
- approval checkpoints and where they changed
- connector responses and side effects
- drift, schema mismatch, permission gaps, and layout changes
- artifact references and remediation pointers

The viewer should favor comparison tables, grouped diffs, and compact summaries over log dumps. Operators should be able to move from a failed step to the originating run or exception without searching through unrelated telemetry.

### 5. Build the Exception Inbox as a triage surface

The exception surface should group items by workpack, reason code, and risk class, then present a narrow next action for each group.

It should support:

- blocked versus reviewable states
- remediation pointers from replay and connector services
- grouping by root cause where multiple runs share the same failure pattern
- direct links to the relevant replay, detail, or connector pages

Keep the inbox operational, not decorative. It should help an operator decide whether to fix a connector, refine a draft, inspect replay evidence, or route the case back to intake.

### 6. Build the Connector Studio as a boundary tool

The connector surface should make the mapping boundary visible, not hidden in generic settings.

Render:

- source and target field mappings
- auth scope posture and expiry warnings
- read/write or other side-effect class
- validation state and blockage reasons
- the workpack version that owns the mapping

The studio should explain why a connector is safe, stale, or blocked. It should also link back to the workpack detail page so operators can see the connector in the broader lifecycle context.

### 7. Build the ROI and readiness dashboard slice

The ROI surface should present the operational health of the workpack layer without duplicating the existing run monitor.

Show:

- completion rate
- intervention rate
- exception rate
- throughput
- cost per completed item
- estimated time saved
- promotion readiness
- trust-taint or blocked states that prevent rollout

Keep the view summary-first. Operators should be able to scan whether the workpack layer is improving or regressing, then drill into detail views when something changes.

### 8. Build the Playbook Library and Benchmark Discovery surface

The discovery surface should help operators find reusable starting points and stable benchmark packs.

It should show:

- playbook starters for common operational work
- benchmark packs with lineage and trust class
- source workpack version and last-known-good state
- promotion or rollback history where available
- links to detail, replay, and outcome metrics

Discovery should feel like a library and not a configuration screen. It exists so operators can reuse proven packs and inspect their history, not so they can manage the system internals.

### 9. Wire in existing product entrypoints

Every surface in this section should be reachable from the existing product paths that already matter to users.

Required entrypoint behavior:

- chat-originated cases should land in intake or detail with the right workpack context
- workflow gallery entries should open the corresponding workpack or starter pack
- team and agency surfaces should link to workpack detail, exceptions, or discovery when relevant
- desktop-host and local-file flows should deep-link into intake or replay with the local source context preserved

Do not create a new top-level shell for workpacks. Integrate these pages into the existing navigation and cross-linking patterns.

### 10. Keep the UI thin and data-driven

The client should consume stable server payloads from the lifecycle, replay, connector, and promotion services. UI code should not recompute workpack logic or classify state on its own.

Use shared helpers for:

- status label formatting
- confidence display
- lineage breadcrumbs
- deep-link generation
- empty, loading, and error state copy

When data is missing, the UI should say so plainly rather than synthesizing a richer state.

## TDD Expectations

Write tests before or alongside the implementation for the following behaviors:

- Case Intake Studio renders source provenance, confidence cues, and clarification-needed prompts
- Workpack Detail shows lifecycle state, policy, connectors, fixtures, run history, and promotion state
- Replay Lab renders expected-vs-actual differences and makes remediation links available
- Exception Inbox groups items by reason code and risk class and exposes next-action affordances
- Connector Studio renders field mappings, scope posture, expiry warnings, and validation outcomes
- ROI dashboard widgets render metrics, intervention rate, and promotion readiness signals
- Discovery surface renders benchmark packs and playbook starters with lineage and trust information
- entrypoint links from chat, workflow gallery, team, and desktop views resolve to the correct workpack pages
- empty, loading, and error states remain readable and do not hide the workpack state
- blocked, low-confidence, or tainted states stay visually distinct from healthy states

Prefer focused client tests with mocked data over large end-to-end tests. Page-level tests should verify the shape and content of the surface, while helper tests should verify deep-link generation and route parameter handling.

## Acceptance Criteria

This section is complete when:

- an operator can move from intake to detail, replay, exceptions, connector review, ROI, and discovery without losing workpack context
- each workpack surface exposes the data needed for safe review without inventing new runtime semantics
- the UI makes confidence, blockage, trust-taint, and promotion readiness obvious
- deep links from chat, workflow gallery, team surfaces, and desktop-host contexts land on the right workpack view
- the surfaces reuse existing navigation, layout, and monitoring patterns instead of creating a second control plane
- no page in this section performs execution, simulation, or promotion side effects

## Coordination Notes

- Section 02 owns intake drafting and clarification; this section should only render and explain those outputs.
- Section 04 owns replay and exception data; this section should present it, not reinterpret it.
- Section 05 owns connector validation; this section should visualize validation outcomes and boundary posture.
- Section 06 owns learning and promotion readiness; this section should surface those results in operator-friendly form.
- Section 08 will add telemetry and rollout gating; keep the UI payloads and state labels stable so those metrics can be wired in later.
- Preserve compatibility with the existing workflow, browser, agency, desktop-host, and monitoring surfaces.
