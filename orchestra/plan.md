# Orchestra Plan

## Media Studio Marketplace Story Planning — 2026-05-24

### Task
Make Media Studio's "Plan / Suggest 4 concepts" action generate product-aware plans from marketplace insight storyOptions, synthesize and persist missing storyOptions when needed, and support regeneration with varied storytelling structures, tones, and hooks.

### Classification
- scope: large
- risk: medium
- affected_domains: frontend Media Studio workflow, shared marketplace insight payload usage, skills prompt contract, tRPC marketplace insight sync, tests
- estimated_file_count: 5
- chosen_route: multi-agent-waves with inline execution fallback
- task_summary: Use marketplace storyOptions as product truth-aware planning inputs, fall back to LLM concept synthesis when incomplete, persist synthesized handoff data, and let users regenerate varied concept sets.
- bug_route: false
- parallel_default: true
- planned_agents: []
- dispatch_preference: inline-fallback because the available sub-agent tool requires explicit sub-agent/delegation permission beyond the Orchestra invocation.

### Activation Decision
- Explicit skill requested: orchestra.
- SocratiCode status: active/green and used before targeted code reads.
- Additional product references provided by user: common story structures, emotional tones, short-video hook techniques and formulas.

### Impact Preflight
- Direct change candidates:
  - /home/dev/projects/SmartSpecPro/apps/web/client/src/pages/MediaStudio.tsx
  - /home/dev/projects/SmartSpecPro/apps/web/client/src/features/media-production/components/ProductionWorkspace.tsx
  - /home/dev/projects/SmartSpecPro/apps/web/client/src/features/media-production/production-director.e2e.test.tsx
  - /home/dev/projects/SmartSpecPro/apps/web/skills/media-production-storyboard-planner/skill.md
- Risk-sensitive surfaces:
  - Existing `marketplaceCapture.syncInsight` mutation is reused to persist synthesized `storytelling_handoff` payloads; no new auth surface planned.
  - Planner must not override verified product truth or invent unsupported claims.
- Sequential workstreams:
  - Extend concept/taxonomy contract before UI and planner call updates.
  - Update option synthesis before workflow generation consumes selected concepts.
  - Update UI/test after behavior is stable.
- Confidence: medium-high. Unknowns are limited to exact LLM output shape from `executeCustomSkill`; deterministic fallback will remain available.

### Wave Plan
- Wave 1: Extend story concept types and local taxonomy-driven generation.
- Wave 2: Add LLM concept synthesis fallback and sync synthesized storytelling handoff back through existing marketplace insight sync.
- Wave 3: Add regenerate UI and tests; update planner skill instructions.
- Wave 4: Run targeted tests/typecheck gates; no build unless explicitly requested.

## Task
Close the important Feature 116 Production Director implementation gaps found in the audit and update the spec/plans so MVP vs full-scope acceptance is aligned.

## Classification
- scope: large
- risk: high
- affected_domains: shared contracts, backend tRPC/services, tenant/permission tests, frontend Production UI, feature specs/plans, verification evidence
- estimated_file_count: 12
- chosen_route: multi-agent-waves with security-gate overlay
- task_summary: Add downstream import contract/route coverage, strengthen release-gate tests and UI planning affordances, and reconcile Feature 116 spec/plan artifacts.
- bug_route: false
- parallel_default: true
- planned_agents: backend-test-security explorer, frontend-spec explorer, conductor implementation/integration
- dispatch_preference: parallel read-only explorers plus conductor-owned implementation

## Activation Decision
- Explicit skill requested: orchestra.
- Intent signals: "ปรับปรุงแก้ไขช่องว่างที่สำคัญทั้งหมด", "แก้ไข spec", "แก้ไขแผนให้สอดคล้อง" indicate multi-step cross-domain implementation and planning alignment.
- SocratiCode status: active/green and used before targeted reads.

## Impact Preflight
- Directly changed candidates:
  - /home/dev/projects/SmartSpecPro/apps/web/shared/mediaProduction.ts
  - /home/dev/projects/SmartSpecPro/apps/web/server/services/productionSpaceService.ts
  - /home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaProduction.ts
  - /home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/productionSpaceService.test.ts
  - /home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/mediaProduction.execution.test.ts
  - /home/dev/projects/SmartSpecPro/apps/web/shared/mediaProduction.test.ts
  - /home/dev/projects/SmartSpecPro/apps/web/client/src/features/media-production/components/ProductionWorkspace.tsx
  - /home/dev/projects/SmartSpecPro/apps/web/client/src/features/media-production/components/ContextAssetBoard.tsx
  - /home/dev/projects/SmartSpecPro/apps/web/client/src/features/media-production/components/ProductionFlowCanvas.tsx
  - /home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/spec.md
  - /home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/sections/section-12-mvp-scope-and-acceptance-traceability.md
  - /home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/sections/section-16-deep-implement-work-packets.md
- SocratiCode impact:
  - shared mediaProduction.ts impacts productionLegacyCompatibilityService.ts and shared tests.
  - mediaProduction router has no static callers, but it is a public tRPC surface and security-sensitive.
- Risk-sensitive surfaces:
  - tRPC procedure additions and router tests.
  - tenant/user ownership and collaborator permissions.
  - downstream import should not overwrite locked shots/node configs.
  - export redaction must continue excluding sensitive data.
- Parallelizable workstreams:
  - backend/test/security read-only analysis.
  - frontend/spec read-only analysis.
  - conductor implementation over shared/backend, then UI/spec integration.
- Sequential workstreams:
  - shared contract changes before router/service/UI consumers.
  - backend import service before router and tests.
  - UI consumes shared contract after contract settles.
  - spec/plan alignment after implementation shape is known.
- Confidence: medium-high. Unknowns are limited to existing test helper behavior and exact compile fallout.

## Wave Plan

### Wave 1: Contract + Backend Foundation
- Add downstream import input/result contracts.
- Add first-class planning selector/context pack and deferred node catalog metadata.
- Implement downstream import service and tRPC procedure.
- Add service/router tests for conflict, locked configs, and access guard paths.

### Wave 2: Frontend + Spec Alignment
- Expose project header search/open/new affordances and planning skill/model panel.
- Make context asset board clearly support character/provider search.
- Add deferred/full node catalog metadata in UI without enabling full adapters.
- Update spec/Section 12/Section 16/implementation plan notes to align MVP vs full scope.

### Wave 3: Gates + Convergence
- Run targeted Feature 116 tests.
- Run TypeScript check if feasible.
- Run post-completion review convergence and security-sensitive route review.

---

## UI/UX Review Session — 2026-05-23

### Task
Audit remaining visual quality, standards consistency, and UX gaps in the Feature 116 Production Director / Media Studio UI after the latest canvas and layout polish.

### Classification
- scope: medium
- risk: low
- affected_domains: frontend React UI, Tailwind/shadcn styling, responsive browser evidence, accessibility evidence
- estimated_file_count: 6
- chosen_route: visual-ui-flow
- task_summary: Review the Production Director UI for remaining visual polish, UX consistency, responsive, accessibility, and canvas workflow gaps.
- bug_route: false
- parallel_default: true
- planned_agents: visual-ux-reviewer, accessibility-reviewer, responsive-reviewer
- dispatch_preference: parallel read-only reviewer agents plus conductor browser/code evidence integration

### Impact Preflight
- SocratiCode status: active/green and used before targeted shell reads.
- Direct review targets:
  - /home/dev/projects/SmartSpecPro/apps/web/client/src/pages/MediaStudio.tsx
  - /home/dev/projects/SmartSpecPro/apps/web/client/src/features/media-production/components/ProductionWorkspace.tsx
  - /home/dev/projects/SmartSpecPro/apps/web/client/src/features/media-production/components/ProductionFlowCanvas.tsx
  - /home/dev/projects/SmartSpecPro/apps/web/client/src/features/media-production/components/ContextAssetBoard.tsx
  - /home/dev/projects/SmartSpecPro/apps/web/client/src/features/media-production/components/NodeConfigPanel.tsx
  - /home/dev/projects/SmartSpecPro/apps/web/tests/e2e/production-director-browser.spec.ts
- Risk-sensitive surfaces: none for read-only review; no auth, server, DB, or provider-credit behavior changes planned in this review pass.
- Parallelizable workstreams:
  - Visual hierarchy / workflow clarity review.
  - Accessibility / focus / labeling review.
  - Responsive / overflow / canvas scroll review.
- Sequential workstreams:
  - Browser evidence command after reviewers and local code inspection, so final findings can reference current runtime artifacts.
- Confidence: medium-high. Unknowns are limited to whether the deterministic browser fixture fully reflects the live route visual density.

### UI/UX Contract
- Target User / JTBD: media operator creating an AI production plan, reviewing node flow, configuring nodes, and moving safely to downstream media tools without spending generation credits early.
- Surface Inventory: Media Studio header/tab shell; Production workspace project header; planning/model context panel; journey/forms/metrics; React Flow canvas/drawer/list fallback; Node Config panel; Context Asset/Product Evidence surfaces; History/Library side rail interaction with the workspace.
- Component Map: ProductionWorkspace owns page composition and task actions; ProductionFlowCanvas owns canvas, drawer, node list fallback, and edge mode; ContextAssetBoard owns reference/search attachment; NodeConfigPanel owns node field editing and save-to-node workflow.
- State Matrix: loading, empty, planner failed, partial, schema invalid, conflict, permission denied, disabled/deferred, selected, hover, focus states must remain visible and non-color-only where practical.
- Responsive Matrix: required mobile 390x844, tablet 768x1024, desktop 1440x900; extended dense/canvas viewports 360x800, 1024x768, 1280x800.
- Accessibility Acceptance: keyboard path reaches title, goal, primary actions, canvas list fallback, node actions, config panel, and browser evidence icon controls; focus is visible; labels/accessible names are present; dark/light readability and reduced motion are verified where tests support them.
- Visual Direction: Enterprise Calm / Technical Precision; dense operational UI, restrained surfaces, semantic tokens where possible, one clear primary action per state, no marketing hero treatment.
- Copy Contract: Thai/English labels should stay concise and action-oriented; internal/provider framework details should be hidden from normal users; warnings must state user action where possible.
- Browser Evidence Required: `npm --prefix apps/web run e2e:production-director-browser` plus component gate if code changes follow.

### Wave Plan
- Wave 1: Parallel read-only review agents for visual UX, accessibility, and responsive/canvas behavior.
- Wave 2: Conductor integrates agent findings with targeted code inspection and browser evidence artifacts.
- Wave 3: Produce severity-ranked UI/UX review report and backlog-ready recommendations; no code edits unless user requests a fix pass.

---

## UI/UX Fix Pass — 2026-05-23

### Task
Implement the UI/UX review recommendations for Feature 116 Production Director and align browser evidence/spec notes with the completed fixes.

### Completed Waves
- Wave 1: Workspace command hierarchy and copy cleanup in `MediaStudio.tsx` / `ProductionWorkspace.tsx`.
- Wave 2: Canvas, node drawer/list, Context Asset, and Node Config UX/accessibility improvements.
- Wave 3: Browser evidence expansion for 360x800 and 1024x768 plus scoped live-route axe/layout/canvas-scroll gates.
- Wave 4: Verification and documentation alignment.

### Acceptance
- Production surface keeps one clear primary action, lifecycle actions are secondary/overflow, and project picker is no longer a duplicate command panel.
- Canvas viewport does not trap page scrolling, including authenticated `/media-studio` route evidence.
- Raw JSON node config is advanced-only, while operator-facing settings remain visible.
- Browser evidence passes 24/24 across fixture and live-route coverage.
