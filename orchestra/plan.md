# Orchestra Plan

## Task
Reduce confusing duplicate controls between Marketplace Capture Auto advanced overrides and Standard Order custom controls on the selected product page.

## Classification
- scope: small
- risk: low
- affected_domains: frontend UI
- estimated_file_count: 3
- chosen_route: direct-standard-light after design approval
- task_summary: Make Auto and Standard controls mode-scoped so users do not think they must configure the same choices in two places.
- bug_route: false
- parallel_default: false
- planned_agents: []
- dispatch_preference: direct-standard-light

## Skill Activation
- orchestra: explicitly requested by user; used for repo-local task state, impact preflight, and gates.
- brainstorming: required before modifying UI behavior; running a bounded design approval pass before implementation.

## SocratiCode Preflight
- status: green index, active watcher
- relevant files narrowed:
  - apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx
  - apps/web/client/src/components/marketplaceCapture/AutoStoryboardAdvancedOverrides.tsx
  - apps/web/client/src/components/marketplaceCapture/hyperframesUiCopy.ts
  - apps/web/client/src/components/marketplaceCapture/__tests__/AutoStoryboardAdvancedOverrides.test.tsx
- impact: AutoStoryboardAdvancedOverrides has no detected callers in graph, but grep shows it is imported by Product Detail and tested directly.

## Proposed UX Decision
- Auto mode: show Auto plan summary and an optional collapsed Advanced Auto section. Advanced Auto should be framed as optional tuning for the Auto plan, not as required setup.
- Standard mode: show the existing Standard Order custom controls. Keep output mode, frame strategy, image model, shot count, audio/text policy, and anchors here because this is the explicit manual/custom flow.
- When Auto mode is selected, collapse or hide the full Standard custom controls behind the launch switch / Standard button so the two overlapping control sets are not visible at the same time.
- When Standard mode is selected, hide Advanced Auto controls and show Standard custom controls as the active working area.

## Candidate Implementation
- Gate the Standard Order section in Product Detail by `effectiveAutoReviewLaunchMode === "standard_order"` when Auto Storyboard Review is available.
- Keep Standard controls always visible when Auto Storyboard Review is unavailable, preserving existing behavior.
- Update section copy/tests so the page proves Auto mode does not show Standard custom controls simultaneously.

## Blast Radius
- directly changed files: Product Detail UI and focused component/page tests
- dependent files/tests: Marketplace HyperFrames/Product Detail focused tests and TypeScript check
- risk-sensitive surfaces: none; frontend display/state only, no auth/API/schema changes
- confidence: medium-high
