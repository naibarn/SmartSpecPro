# TDD Plan: Production Director Node Canvas

This mirrors the implementation plan and defines tests to write before each implementation phase.

## Phase 0: Guardrails And Canonical Planning Artifacts

Test/check first:

- `uv run /home/dev/.codex/skills/deep-plan/scripts/checks/check-sections.py --planning-dir specs/feature/116-production-director-node-canvas` reports `complete`.
- `git diff --check -- specs/feature/116-production-director-node-canvas orchestra` reports no whitespace errors from touched files.

## Phase 1: Shared Contracts And Tests

Target files:

- `apps/web/shared/mediaProduction.ts`
- `apps/web/shared/mediaProduction.test.ts`
- `apps/web/shared/geminiOmni.ts`
- `apps/web/shared/geminiOmni.test.ts`

Test stubs:

- Test `validateProductionSpace` accepts a minimal project with one shot and one node.
- Test `validateProductionSpace` rejects duplicate shot IDs, duplicate node IDs, missing child nodes, and invalid edge references.
- Test graph validation detects cycles and invalid edge types.
- Test `computeProductionShotReadiness` blocks missing required script/audio/video/product evidence.
- Test `computeProductionNodeReadiness` blocks Gemini Omni over 7 reference units.
- Test Gemini Omni video node blocks more than one source video and more than three character IDs.
- Test source video uses provider key `video_list[].ends`.
- Test approval invalidation changes after material node config edits but not layout-only edits.
- Test product claim validation rejects evidence IDs in `claimIds`.
- Test idempotency key is stable for identical handoff/generation inputs and changes when config hash changes.

## Phase 2: Persistence And Services

Target files:

- `apps/web/drizzle/schema.ts`
- new migration under `apps/web/drizzle/`
- `apps/web/server/services/productionSpaceService.ts`
- `apps/web/server/services/productionLegacyCompatibilityService.ts`
- `apps/web/server/routers/mediaProduction.ts`
- router/service tests under `apps/web/server/routers/__tests__/`

Test stubs:

- Test `saveSpace` creates version 1 and returns full saved metadata.
- Test every mutating procedure rejects unauthenticated requests through protected procedure behavior.
- Test every mutating procedure rejects missing tenant context.
- Test `getSpace`, `saveSpace`, `saveBrief`, `saveShot`, `saveNodeConfig`, `saveCanvasLayout`, `archiveProductionProject`, `exportProductionProject`, `projectSpaceOutput`, `importDownstreamResultRecord`, and `scheduleProductionExecution` reject cross-tenant and cross-user access.
- Test forbidden or permission-denied actions return typed errors without mutating state.
- Test stale `expectedSpaceVersion` returns typed conflict and does not overwrite.
- Test `saveShot` updates one shot without mutating sibling shots.
- Test `saveNodeConfig` updates only the target node and increments target node version.
- Test `getNodeConfig` returns exactly the requested snapshot or a conflict/stale response.
- Test legacy run adapter converts existing goal/tabSnapshots into a valid draft ProductionSpace.
- Test admin/backfill migration preserves legacy run, goal, plan, verification, approval, asset plan, and projection records.
- Test rollback/read-safe mode opens legacy runs and hides new write actions without breaking standalone Image/Video/Audio.
- Test schema-version upgrade preserves brief, shots, nodes, config snapshots, output refs, product evidence, and downstream refs.
- Test unknown future schema version returns unsupported-version state rather than destructive downgrade.
- Test list/search returns thumbnails and summary fields from the latest ProductionSpace.
- Test archive/restore/delete/export state transitions preserve ownership and version data.

## Phase 3: Capability Registry And Skill Schemas

Target files:

- `apps/web/server/services/productionPlanningContextService.ts`
- `apps/web/server/services/productionSurfaceAdapterRegistry.ts`
- `apps/web/skills/media-production-storyboard-planner/schemas/*`
- `apps/web/skills/media-production-plan-verifier/schemas/*`
- planner/verifier fixtures and skill tests.

Test stubs:

- Test capability registry includes Image, Video, Audio, Storyboard Review, Video Edit, Gemini Omni Character, Gemini Omni Audio, Gemini Omni Video, and Seedance 2 where configured.
- Test Gemini Omni capability metadata includes reference units, max source videos, max character IDs, provider payload keys, and pricing branch rules.
- Test planner input schema requires production brief, context assets, tool capabilities, provider capabilities, downstream targets, previous canvas, and budget policy.
- Test planner output schema validates shots, shot sequence, canvas nodes, edges, node bindings, node config suggestions, product evidence manifests, and approval checklist.
- Test verifier input accepts full ProductionSpace.
- Test verifier output blocks product truth, provider feasibility, budget risk, and missing approvals.

## Phase 4: Production Workspace Shell

Target files:

- `apps/web/client/src/pages/MediaStudio.tsx`
- new feature components under `apps/web/client/src/features/media-production/`

Test stubs:

- Test selecting Production renders only Production workspace and no prompt composer/generate button.
- Test selecting Image/Video/Audio renders normal standalone tabs.
- Test project header shows title, status, save/open/new, and search input.
- Test project search cards show thumbnail/title/summary/status/platform.
- Test unsaved draft save calls `saveSpace` or compatibility save path and updates header state.
- Test feature flag off state preserves safe read/open behavior and hides live actions.
- Test planner failed, planner partial output, and planner schema-invalid states do not expose provider generate controls or save malformed output as approved/executable.

## Phase 5: Context Assets And Product Evidence

Target files:

- Production asset board components/hooks.
- `apps/web/server/routers/mediaProviderAssets.ts`
- Feature 115 handoff adapter code.

Test stubs:

- Test character provider assets appear in search results.
- Test click-to-add and drag/drop create the same typed context asset payload.
- Test product image payload preserves product identity, capture refs, image role, fidelity risk, claim IDs, evidence IDs, and approval state.
- Test unresolved Feature 115 readiness blocks product-related generation and downstream handoff.
- Test Product Evidence Tray shows block/warning/pass state.

## Phase 6: Video Shot Workspace

Target files:

- `VideoShotWorkspace`
- `ShotListPanel`
- `ShotBuilderPanel`
- shot mutation helpers in shared or client lib.

Test stubs:

- Test no-project state shows open/create/search actions and no provider generate button.
- Test no-shot state shows ordered shot list.
- Test stale shot ID shows reload/open-list/back actions and does not create a shot implicitly.
- Test reorder preserves child node configs and output refs.
- Test duplicate creates new shot ID, new node IDs, new config snapshot IDs, and clears outputs by default.
- Test split rewires sequence edges without dropping locked outputs.
- Test merge detects duplicate output roles and requires a decision.
- Test lock prevents replanner patches from overwriting shot/node configs.

## Phase 7: React Flow Canvas

Target files:

- `ProductionCanvas`
- `ProductionShotGroupNode`
- `ProductionNodeDrawer`
- canvas validation helpers.

Test stubs:

- Test fixture planner output renders nodes and edges.
- Test shot group nodes collapse/expand.
- Test double-clicking a shot group opens Video Shot tab with the selected shot.
- Test reconnecting an invalid edge shows warning and blocks approval.
- Test layout save updates layout version but not node config hashes.
- Test list fallback can open node drawer and shot workspace by keyboard/click.

## Phase 8: Node Config Mode MVP

Target files:

- `useProductionToolHandoff`
- `useProductionNodeConfig`
- Image/Video/Audio adapters.
- Media Studio tab shell.

Test stubs:

- Test image node opens Image tab in node config mode with the target snapshot.
- Test video node opens Video tab with source video/reference inputs restored.
- Test basic TTS node opens Audio tab in TTS mode.
- Test music, SFX, voice changer, STT, captions, and delivery variants stay disabled or preview-only in MVP unless full-matrix flag is enabled.
- Test missing route params open normal standalone tab and hide `Save to Node`.
- Test `Save to Node` sends expected versions and previous snapshot ID.
- Test stale save shows conflict and does not mutate local node.
- Test generated output attaches to active node only.
- Test two same-type nodes round-trip different configs without crossover.

## Phase 9: Handoff Payloads In Safe Mode

Target files:

- `productionHandoffProjectionService`
- shared `productionHandoffBuilders` module.
- Storyboard Review / Video Edit payload builders.
- Existing `storyboardVideoProject` integration tests.

Test stubs:

- Test Storyboard Review handoff payload preserves shot order.
- Test Video Edit handoff payload preserves shot order, clips, trims, audio, captions, cue sheet, transitions, and product manifests.
- Test shared handoff builder is server-safe and has no React/browser imports.
- Test Video Edit builder output is compatible with existing `VideoEditorProject` fixtures.
- Test incomplete media either creates explicit non-renderable placeholders or disables `Open in Video Edit`.
- Test provider task IDs are never used as clip URLs.
- Test repeated handoff with same source hash returns/open existing target.
- Test disabled target returns disabled state without modifying ProductionSpace.
- Test downstream result import returns conflict for stale source space version.
- Test result import updates selected takes/product warning state only as a new ProductionSpace version.

## Phase 10: Operational Gates

Target files:

- archive/export/observability services.
- feature flag checks.
- audit/metrics helpers.

Test stubs:

- Test export manifest excludes secrets, provider keys, private signed URLs, raw provider payloads, raw marketplace/OCR/review/comment text, and raw prompts.
- Test archive/restore keeps versions and output refs.
- Test stale output ref repair distinguishes relinkable refs from permanently missing refs.
- Test audit event payloads are redacted.
- Test kill switches disable live planner, node config, execution, and handoff independently.
- Test Feature 116 flag truth table covers Production Space UI, Video Shot tab, node config, live planner, live verifier, Storyboard Review handoff, Video Edit handoff, run-one-node, run-one-shot, batch execution, and emergency kill switch.
- Test emergency kill switch overrides all live and execution flags.
- Test enabling handoff does not enable provider execution.
- Test enabling run-one-node does not enable run-one-shot or batch execution.
- Test Thai/English labels exist for new states and errors.
- Test accessibility list fallback works without drag/drop.

## Phase 10.5: UI/UX Browser Release Gate

Target files/artifacts:

- `apps/web/client/src/e2e/media-production-director.spec.ts` or the repo-approved browser/E2E equivalent.
- `specs/feature/116-production-director-node-canvas/implementation/ui-browser-evidence.md`.
- UI test files under `apps/web/client/src/features/media-production/**/__tests__/`.

Test stubs:

- Test canonical journey: create goal, add normal asset and Feature 115 product evidence fixture, create fixture plan canvas, edit/reconnect through list fallback, open Video Shot, configure Image/Video/basic TTS nodes, Save to Node, approve plan, preview Storyboard Review and Video Edit handoff, and verify zero provider-generation credit reservation/deduction.
- Test 390x844 mobile: stacked Production layout, list fallback default, full-screen drawer/dialog behavior, no horizontal overflow, touch-safe Save to Node.
- Test 768x1024 tablet: collapsible evidence/status rails, no drawer/canvas overlap, focus order remains logical.
- Test 1280x800 laptop: header, stepper, canvas/list, node drawer, verifier summary, and primary action fit without clipping.
- Test 1440x900 desktop: full workspace supports header, brief/assets, canvas, status rail, and handoff/export preview without overlap.
- Test keyboard-only path: open project, add asset by click, create plan, navigate nodes/list rows, open drawer, open shot, configure node, Save to Node, approve, preview handoff, export/archive.
- Test focus trap/restore for node drawer, handoff preview, execution confirmation, export dialog, product image preview, stale conflict dialog, and destructive lifecycle confirmations.
- Test accessible names/tooltips for icon-only canvas toolbar controls, node actions, product evidence actions, lifecycle menu actions, and status badges.
- Test contrast/readability in light and dark mode for primary, muted, warning, destructive, disabled, selected, hover, focus, and blocked states.
- Test reduced-motion mode disables or simplifies canvas animation, drawer transitions, shot reorder animation, skeleton shimmer, and auto-scroll.
- Test negative states: planner failed, planner partial output, schema-invalid planner output, feature-disabled, stale version conflict, permission denied, no project, no shot, stale shot, blocked product evidence, disabled live handoff, disabled execution, export failure.
- Test copy snapshots for live-disabled, provider-disabled, planner failed/partial/schema-invalid, product blocked, invalid edge, stale conflict, permission denied, export success, archive/restore/delete confirmation.

Exit criteria:

- Browser evidence artifact records command, route/surface, files, screenshots/traces or manual notes, required viewport results, console result, keyboard result, overflow result, state coverage, dark/light result, accessible-name result, skipped checks, and residual risk.
- Missing browser automation is recorded as skipped/not-pass; it cannot satisfy this gate.

## Phase 11: Live Planner, Live Handoff, And Limited Execution

Target files:

- planner/verifier execution router/service paths.
- execution scheduler service.
- media router generation integration.

Test stubs:

- Test live planner stores a typed ProductionSpace draft and does not reserve provider-generation credits.
- Test live verifier blocks approval for missing product evidence and invalid provider constraints.
- Test run-one-node reserves credits only after readiness and user confirmation.
- Test run-one-node uses existing media generation adapter and stores Production metadata on the created media task.
- Test provider submission failure after credit deduction triggers refund.
- Test terminal failed/cancelled task reconciles unused credits.
- Test run-one-shot follows dependency order and stops on required failure.
- Test cancellation is idempotent and preserves completed outputs.
- Test failed node retry reuses idempotency rules and does not rerun unchanged completed nodes.
- Test Production polling/status derives node status from existing media task status where possible.

## Required Commands

- `npm --prefix apps/web test -- shared/mediaProduction.test.ts shared/geminiOmni.test.ts`
- `npm --prefix apps/web test -- server/routers/__tests__/mediaProduction*.test.ts`
- `npm --prefix apps/web test -- client/src/lib/__tests__/storyboardVideoProject.test.ts server/routers/__tests__/videoEditorProjects.storyboardReview.test.ts`
- repo-approved browser command for Feature 116, for example `npm --prefix apps/web run e2e:production-director` after the script is added, or a documented skipped/not-pass browser evidence artifact while automation is unavailable
- changed skill verify scripts under `apps/web/skills/*/scripts/verify.sh`
- `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check`
