# UI/UX Review — Feature 116 Production Director

Date: 2026-05-23
Scope: read-only review of Media Studio / Production Director UI after recent layout and canvas-scroll fixes.
Route: orchestra visual-ui-flow.

## Evidence Used

- SocratiCode status: green; codebase search used before targeted reads.
- Reviewer agents:
  - visual-ux-reviewer: inherited/default retry after Spark quota.
  - accessibility-reviewer: inherited/default retry after Spark quota.
  - responsive-reviewer: inherited/default retry after Spark quota.
- Existing artifacts:
  - `apps/web/test-results/production-director/browser-evidence-summary.json`
  - `apps/web/test-results/production-director/*-production.png`
  - `apps/web/test-results/production-director/*-media-studio-live-auth.png`
- Target files:
  - `apps/web/client/src/pages/MediaStudio.tsx`
  - `apps/web/client/src/features/media-production/components/ProductionWorkspace.tsx`
  - `apps/web/client/src/features/media-production/components/ProductionFlowCanvas.tsx`
  - `apps/web/client/src/features/media-production/components/ContextAssetBoard.tsx`
  - `apps/web/client/src/features/media-production/components/NodeConfigPanel.tsx`
  - `apps/web/tests/e2e/production-director-browser.spec.ts`

## Findings

### High

1. Duplicate command hierarchy makes the primary workflow unclear.
   - Evidence: `MediaStudio.tsx` has search/save/new/archive/restore/delete around line 12858, while `ProductionWorkspace.tsx` has save/search/new/create-plan/open-video-shot around line 340.
   - Impact: user cannot quickly identify whether the next action is save, plan, open project, or lifecycle action.
   - Recommended fix: consolidate production command bar; make `Create Plan + Verify` the contextual primary action, keep save as secondary/status, and move archive/restore/delete into an overflow/lifecycle menu with destructive styling for delete.

2. Node Drawer is too dense and competes with the canvas.
   - Evidence: `ProductionFlowCanvas.tsx` renders the full catalog with deferred nodes in the drawer around line 186; live mobile screenshot shows the drawer dominating the page before the canvas.
   - Impact: the UI reads as a node catalog browser rather than a flow builder.
   - Recommended fix: group/collapse node kinds, add search/filter, show recommended next nodes first, and move deferred nodes into a `Later` section.

3. Browser evidence passes without proving the real live UI quality.
   - Evidence: exhaustive responsive/a11y checks run against `fixtureHtml` in `production-director-browser.spec.ts`, while live route checks only assert console/no page errors/workspace visible/tab active. Live screenshots are blocked by `WelcomeLanguagePicker`.
   - Impact: visual regressions in real React/Tailwind/React Flow can pass.
   - Recommended fix: dismiss or preseed the language modal, then collect live-route overflow/overlap, axe/focus, canvas wheel/touch scroll, and post-dismiss screenshots.

### Medium

4. Node List fallback duplicates the canvas workflow and exposes too many equal-weight actions.
   - Evidence: `ProductionFlowCanvas.tsx` node list around line 295 shows Open, Configure, Run, Delete, Start link, Connect here for every node.
   - Recommended fix: convert to a compact selected-node inspector or table; make Configure primary, gate Run, move Delete to destructive/overflow, and centralize link mode in one toolbar.

5. Node Config is still a developer JSON editor.
   - Evidence: `NodeConfigPanel.tsx` uses `Config JSON` around line 131 and generic adapter previews.
   - Recommended fix: provide adapter-specific form sections for prompt, model/settings, references, output target; move raw JSON behind an advanced disclosure.

6. Context Asset actions are ambiguous.
   - Evidence: asset card click triggers both add-to-canvas and assign-to-node behavior; selected node is shown as raw id; `Add first asset to node` is non-specific.
   - Recommended fix: show selected node title/status; split `Add to canvas` from `Attach to selected node`; remove the first-asset shortcut or make it explicit.

7. Accessibility state communication is incomplete.
   - Evidence: invalid edge warning lacks `role="alert"`/`aria-live`; JSON error lacks `aria-invalid`/`aria-describedby`; stepper/node/zone selected states rely on color.
   - Recommended fix: add live regions for errors, field error relationships, `aria-current="step"`, and `aria-pressed`/`aria-selected` where appropriate.

8. Active tab contrast is below WCAG AA for small text.
   - Evidence: active tabs use `sky-600`, `emerald-600`, `blue-500`, and `orange-500` on white text.
   - Recommended fix: use darker active colors such as `sky-700/800`, `emerald-700/800`, `blue-700`, `orange-700/800`, or tokenized variants with verified contrast.

9. Missing dense/canvas viewport coverage.
   - Evidence: viewports include 390x844, 768x1024, 1280x800, 1440x900; missing 360x800 and 1024x768.
   - Recommended fix: add 360x800 and 1024x768 to browser evidence, especially because the `lg` breakpoint opens both the MediaStudio 3-column layout and canvas drawer split.

10. Canvas touch scroll/pan behavior is not proven.
    - Evidence: current gate checks mouse wheel only; mobile/touch drag over the 440px canvas can still be a scroll trap.
    - Recommended fix: add Playwright mobile touch drag tests over canvas; if trapped, disable pan-on-drag on touch/mobile or require controls/modifier.

### Low

11. Some mobile touch targets are small for dense operation.
    - Evidence: asset chips `px-2 py-1 text-xs`, planning selects `h-9`, many `size="sm"` node actions.
    - Recommended fix: use `min-h-10`/`h-11` on mobile and keep compact density for desktop.

12. Reduced-motion evidence is shallow.
    - Evidence: gate checks `matchMedia`, but spinners still use direct `animate-spin`.
    - Recommended fix: use `motion-safe:animate-spin motion-reduce:animate-none` and add computed-style assertion under reduced motion.

13. Copy/status labels still expose machine terms or mixed language.
    - Evidence: raw `plan_ready_for_review`, mixed `Planning Skill / Model Context`, and Thai `บล็อกเกอร์`.
    - Recommended fix: map statuses to human labels and establish a Thai/English glossary for status, node, adapter, edge, and blocker terms.

## Priority Fix Order

1. Fix live browser evidence first: dismiss language modal, add live route layout/a11y/canvas checks, and add missing viewports.
2. Consolidate command hierarchy and lifecycle actions.
3. Redesign Node Drawer density and mobile behavior.
4. Simplify node list fallback into an inspector/table pattern.
5. Add accessibility semantics for alerts, selected states, progress, and JSON errors.
6. Improve Context Asset action clarity.
7. Move Node Config JSON into advanced mode.
8. Polish contrast, touch targets, reduced-motion, and copy glossary.

## Fix Pass Status - 2026-05-23

- All HIGH/MEDIUM/LOW findings above were addressed in the Feature 116 Production surface.
- Verification passed:
  - `npm --prefix apps/web test -- client/src/features/media-production/production-director.e2e.test.tsx` — 13/13.
  - `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check` — passed.
  - `npm --prefix apps/web run e2e:production-director-browser` — 24/24, including 360x800 and 1024x768 plus authenticated `/media-studio` axe/layout/canvas-scroll checks.
