# Section 16: Deep-Implement Work Packets

## Goal

Convert the Feature 116 plan into implementation-ready work packets that can be executed without guessing.

This section exists because the feature spans contracts, database, routers, services, skills, Media Studio UI, React Flow, provider capability rules, Storyboard Review, Video Edit, and product evidence gates. It is the coordination map for deep-implement.

## Global Rules For Every Packet

- Do not expand `MediaStudio.tsx` with large new Production logic; extract Production-specific components/hooks early.
- Preserve existing Image, Video, Audio, Gemini Omni, provider asset, Storyboard Review, and Video Edit flows.
- Keep live planner, live verifier, downstream handoff, and provider execution behind feature flags until operational gates pass.
- `Save to Node` never spends provider-generation credits.
- Provider generation starts only after readiness passes and the user confirms the credit spend.
- All mutating server procedures enforce tenant/user ownership and expected versions.
- Every mutating server procedure must have cross-tenant, cross-user, unauthenticated, forbidden, permission-denied, disabled-flag, and stale-version tests before implementation is considered complete.
- Every user-facing provider key must have a friendly label. Raw keys such as `video_list`, `image_urls`, `character_ids`, and `audio_ids` can appear only in debug/provider payload preview.
- MVP node config adapters are Image, Video, and basic TTS only. Music, SFX, voice changer, STT, captions, delivery variants, and full matrix adapters are later gates unless explicitly promoted.
- Every UI-affecting packet must satisfy the UI/UX contracts in Sections 01, 04, 06, 07, 10, 14, and 15 before it can be marked complete.
- Browser evidence in `specs/feature/116-production-director-node-canvas/implementation/ui-browser-evidence.md` is required before release. Skipped browser checks are recorded risk, not a pass.
- The canonical user journey must prove zero provider-generation credit reservation or deduction before explicit generation confirmation.

## Packet 0: Planning Artifact Normalization

Owned files:

- `specs/feature/116-production-director-node-canvas/claude-research.md`
- `specs/feature/116-production-director-node-canvas/claude-interview.md`
- `specs/feature/116-production-director-node-canvas/claude-spec.md`
- `specs/feature/116-production-director-node-canvas/claude-plan.md`
- `specs/feature/116-production-director-node-canvas/claude-plan-tdd.md`
- `specs/feature/116-production-director-node-canvas/sections/index.md`
- `specs/feature/116-production-director-node-canvas/sections/section-16-deep-implement-work-packets.md`

Implementation:

- Keep the section manifest valid.
- Record codebase/provider research.
- Record the no-new-interview decision and captured user requirements.
- Add self-review and cross-section review notes.

Tests/checks:

- Run deep-plan `check-sections.py`.
- Run `git diff --check` on planning files.

Exit criteria:

- Deep-plan artifacts exist and `check-sections.py` returns `complete`.

## Packet 1: Shared Contracts

Owned files:

- `apps/web/shared/mediaProduction.ts`
- `apps/web/shared/mediaProduction.test.ts`
- `apps/web/shared/geminiOmni.ts`
- `apps/web/shared/geminiOmni.test.ts`

Implementation:

- Add `ProductionSpace` contracts and validators.
- Add `ProductionShot`, `ProductionFlowNode`, `ProductionFlowEdge`, `ProductionNodeToolBinding`, `ProductionNodeConfigSnapshot`, `ProductionReferenceInput`, `ProductionNodeOutputRef`, `ProductStoryboardAsset`, `ProductClaimEvidenceMap`, `ProductionProductEvidenceManifest`, and downstream result record types.
- Add graph validation, readiness computation, approval invalidation, idempotency, product evidence validation, handoff payload derivation, and provider capability validation helpers.
- Extend Gemini Omni capability helpers so Production nodes can validate reference units, source video, character/audio assets, provider payload keys, and pricing branch without duplicating UI logic.

Tests first:

- Minimal valid ProductionSpace passes.
- Duplicate IDs and invalid edges fail.
- Cycle detection fails.
- Gemini Omni over-quota source references fail.
- Product evidence/claim mismatch fails.
- Material node config change invalidates approval.
- Layout-only change does not invalidate approval.

Exit criteria:

- Shared tests pass.
- No new contract type is UI-only if it is needed by router/service.

## Packet 2: Persistence, Services, And Router Contracts

Owned files:

- `apps/web/drizzle/schema.ts`
- new migration in `apps/web/drizzle/`
- `apps/web/server/services/productionSpaceService.ts`
- `apps/web/server/services/productionLegacyCompatibilityService.ts`
- `apps/web/server/services/productionCanvasValidationService.ts`
- `apps/web/server/services/productionNodeConfigService.ts`
- `apps/web/server/services/productionHandoffProjectionService.ts`
- `apps/web/server/routers/mediaProduction.ts`
- router/service tests under `apps/web/server/routers/__tests__/`

Implementation:

- Add versioned ProductionSpace storage.
- Keep existing `mediaProductionRuns` as search/status index.
- Add `getSpace`, `saveSpace`, `saveBrief`, `saveShot`, `getNodeConfig`, `saveNodeConfig`, `saveCanvasLayout`, `validateSpace`, and `adaptLegacyRunToProductionSpace`.
- Return typed conflict responses for stale expected versions.
- Add compatibility adapter from existing goal/plan/tabSnapshots into a minimal draft ProductionSpace.
- Update `listRuns` to prefer ProductionSpace thumbnails and summary when present.
- Add router security tests for every new mutating procedure: unauthenticated, missing tenant, cross-tenant, cross-user, permission-denied, disabled flag, and stale expected version.
- Add migration/backfill/no-data-loss/rollback/schema-version tests before enabling write-mode migration.

Tests first:

- Create/read version 1.
- Stale save returns conflict and does not overwrite.
- Save shot mutates one shot only.
- Save node config mutates one node only.
- Legacy run adapter returns valid draft space.
- Cross-tenant and cross-user access is rejected for get/save/archive/export/handoff/import/execution.
- Backfill migration preserves legacy run, goal, plan, verification, approval, asset plan, and projection records.
- Rollback/read-safe mode opens old runs and hides new write actions.
- Schema-version upgrade preserves brief, shots, nodes, configs, output refs, product evidence, and downstream refs.
- Project search returns thumbnail/title/summary/status.

Exit criteria:

- Existing production run APIs still work.
- New APIs are feature-flag guarded where appropriate.

## Packet 3: Capability Registry And Skill Schema Upgrade

Owned files:

- `apps/web/server/services/productionPlanningContextService.ts`
- `apps/web/server/services/productionSurfaceAdapterRegistry.ts`
- `apps/web/skills/media-production-storyboard-planner/schemas/*`
- `apps/web/skills/media-production-storyboard-planner/fixtures/*`
- `apps/web/skills/media-production-plan-verifier/schemas/*`
- `apps/web/skills/media-production-plan-verifier/fixtures/*`
- `apps/web/skills/gemini-omni-video-director/schemas/output.schema.json`

Implementation:

- Build capability registry from media models, provider metadata, provider assets, skills, and downstream surfaces.
- Upgrade planner input/output schemas to require tool/provider capabilities and typed canvas output.
- Upgrade verifier schemas to validate full ProductionSpace.
- Add deterministic fixtures before live planner calls.
- Encode Gemini Omni provider constraints and fail-safe audio ID policy.

Tests first:

- Registry includes Image, Video, Audio, Storyboard Review, Video Edit, Gemini Omni Character/Audio/Video, and Seedance 2 where configured.
- Planner fixtures validate full story, product review, marketplace product, lip-sync, and b-roll.
- Verifier blocks missing product evidence and invalid Gemini Omni references.
- Skill verify scripts pass.

Exit criteria:

- UI can render fixture planner output without live LLM dependency.

## Packet 4: Production Workspace UI Extraction

Owned files:

- `apps/web/client/src/pages/MediaStudio.tsx`
- `apps/web/client/src/features/media-production/components/ProductionWorkspace.tsx`
- `apps/web/client/src/features/media-production/components/ProductionProjectHeader.tsx`
- `apps/web/client/src/features/media-production/components/ProductionBriefPanel.tsx`
- `apps/web/client/src/features/media-production/components/ProductionPlannerPanel.tsx`
- `apps/web/client/src/features/media-production/components/ProductionContextAssetBoard.tsx`
- `apps/web/client/src/features/media-production/components/ProductEvidenceTray.tsx`
- `apps/web/client/src/features/media-production/hooks/useProductionSpace.ts`

Implementation:

- Add tab order `Production -> Video Shot -> Image -> Video -> Audio`.
- Make Production exclusive.
- Move interim Production panel out of provider-specific Gemini Omni placement.
- Add project search/open/save/new UI with thumbnails and summaries.
- Keep brief simple, with progressive advanced sections.

Tests first:

- Production tab does not render prompt composer/generate controls.
- Production journey stepper shows Goal, Assets, Plan, Fix blockers, Approve, Configure/Generate, Review/Edit, and Export/Archive.
- Production Workspace UI/UX contract fields are implemented or explicitly marked N/A with reason.
- Responsive evidence covers 390x844, 768x1024, 1280x800, and 1440x900 for no-project, draft, planner failed, partial, schema-invalid, plan ready, approved, conflict, and feature-disabled states.
- Keyboard-only flow can create/open/search, save goal, add asset by click, create fixture plan, and reach the plan list fallback.
- Planner failed, partial-output, and schema-invalid states do not expose provider generate controls or save malformed output as executable.
- Image/Video/Audio standalone tabs still render.
- Project search card shows thumbnail/title/summary/status.
- Save action calls the correct ProductionSpace save path.

Exit criteria:

- No duplicate Production Director panels.
- Production is not tied to Gemini Omni model selection.

## Packet 5: Context Assets And Product Evidence

Owned files:

- `apps/web/client/src/features/media-production/components/ProductionContextAssetBoard.tsx`
- `apps/web/client/src/features/media-production/components/ProductEvidenceTray.tsx`
- `apps/web/client/src/features/media-production/hooks/useProductionAssetDrop.ts`
- `apps/web/client/src/features/media-production/hooks/useProductStoryboardEvidence.ts`
- provider asset search integration.
- Feature 115 handoff mapping utilities.

Implementation:

- Add typed drag/click payloads.
- Add character search source.
- Add product/storyboard evidence cards.
- Normalize Feature 115 selected product images into `ProductStoryboardAsset`.
- Add product readiness and warning/blocked states.

Tests first:

- Character asset can be searched and added.
- Drag and click produce equivalent context asset payload.
- Product evidence preserves claim/evidence IDs and does not mix product claims.
- Unresolved product evidence blocks product-related generation/handoff.
- Product Evidence Tray UI/UX contract covers empty, ready, warning, blocked, conflict, and permission-denied states.
- Claim/evidence link controls have accessible labels and reject using evidence IDs in claim fields.

Exit criteria:

- Product images are never treated as anonymous references when evidence exists.

## Packet 6: Video Shot Workspace

Owned files:

- `apps/web/client/src/features/media-production/components/VideoShotWorkspace.tsx`
- `apps/web/client/src/features/media-production/components/ShotListPanel.tsx`
- `apps/web/client/src/features/media-production/components/ShotBuilderPanel.tsx`
- `apps/web/client/src/features/media-production/components/ShotChildNodeList.tsx`
- shot mutation helper tests.

Implementation:

- Add Video Shot tab.
- Add no-project, no-shot, stale-shot, selected-shot, and locked-shot states.
- Implement reorder, duplicate, split, merge, lock/unlock mutation rules.
- Persist shot edits with expected versions.
- Apply shot-level refs to child node suggestions without overwriting manually edited configs unless confirmed.

Tests first:

- Empty/stale states render correctly.
- Reorder preserves child configs.
- Duplicate creates new IDs and clears outputs.
- Lock prevents replanning overwrite.
- Video Shot UI/UX contract covers no-project, no-shot, stale-shot, selected-shot, locked-shot, product-blocked, and conflict states.
- Keyboard-only shot selection/reorder/open-child/save/back-to-production path works.
- Responsive evidence covers mobile/tablet/laptop/desktop with no clipped Thai/English labels.

Exit criteria:

- One project can contain many shots and each shot can own different child nodes.

## Packet 7: React Flow Canvas

Owned files:

- `apps/web/client/src/features/media-production/components/ProductionCanvas.tsx`
- `apps/web/client/src/features/media-production/components/ProductionShotGroupNode.tsx`
- `apps/web/client/src/features/media-production/components/ProductionNodeDrawer.tsx`
- canvas validation helpers.

Implementation:

- Render fixture planner output as React Flow.
- Add shot group nodes, child nodes, handoff nodes, QA/gate nodes.
- Add node drawer, edge reconnect, add/delete nodes, layout save, invalid connection warnings.
- Add list/keyboard fallback.

Tests first:

- Fixture renders nodes/edges.
- Shot node opens Video Shot workspace.
- Invalid edge blocks approval.
- Layout save does not alter node config hash.
- React Flow UI/UX contract covers canvas, drawer, list fallback, invalid-edge recovery, accessible node labels, and keyboard/list equivalents for pointer actions.
- Browser evidence covers empty, loaded, invalid-edge, drawer-open, list-fallback, partial-output, schema-invalid, disabled-feature, and dark/light states.

Exit criteria:

- User can review and edit the generated plan before spending credits.

## Packet 8: Node Config Mode MVP

Owned files:

- `apps/web/client/src/features/media-production/hooks/useProductionToolHandoff.ts`
- `apps/web/client/src/features/media-production/hooks/useProductionNodeConfig.ts`
- image/video/basic TTS adapters.
- Media Studio tab shell updates.

Implementation:

- Add route/query state for `productionRunId`, `spaceVersion`, `shotId`, `nodeId`, `nodeVersion`, `configSnapshotId`, `nodeMode=config`, and `returnTo`.
- Add `NodeConfigureBanner`.
- Add Image, Video, and basic TTS adapters first.
- Add `Save to Node`, `Back to Production`, and stale conflict handling.
- Attach generated outputs to the active node only.

Tests first:

- Image node roundtrip.
- Video node roundtrip with source video/reference inputs.
- TTS node roundtrip.
- Music/SFX/voice changer/STT/caption/delivery variant nodes remain disabled or preview-only in MVP.
- Missing params open standalone mode.
- Two same-type nodes do not cross-save.
- Node Drawer / Node Config Mode UI/UX contract covers valid config mode, standalone mode, loading snapshot, stale version, disabled adapter, output attachment, and permission denied.
- Save to Node browser proof confirms no provider-generation credits are reserved.

Exit criteria:

- Configure-only node edits never spend generation credits.

## Packet 9: Safe Handoff Payloads

Owned files:

- `productionHandoffProjectionService.ts`
- `productionDownstreamResultService.ts`
- `apps/web/shared/productionHandoffBuilders.ts`
- Storyboard Review / Video Edit integration tests.

Implementation:

- Add `ProductionStoryboardReviewHandoffPayload`.
- Add `ProductionVideoEditHandoffPayload`.
- Extract pure handoff mapping into a server-safe shared builder.
- Include schema version, source space version, idempotency key, ordered shots, output refs, audio/caption refs, cue sheet, transitions, QA, warnings, and product manifests.
- Repeated handoff opens existing downstream target.
- Result import writes new ProductionSpace version or returns conflict.
- Video Edit handoff must use server-safe `VideoEditorProject` payloads compatible with existing fixtures.
- Incomplete media either produces safe non-renderable placeholders or disables `Open in Video Edit`.
- Provider task IDs are never used as clip URLs.

Tests first:

- Handoff preserves shot order.
- Repeated handoff is idempotent.
- Shared builder has no React/browser imports.
- Video Edit builder output matches existing Video Editor project fixture expectations.
- Disabled target does not mutate state.
- Stale downstream result import returns conflict.
- Handoff UI/UX contract covers preview-only, live-disabled, disabled target, stale source, permission denied, and copy that explains the next recovery action.

Exit criteria:

- Handoff payload builders pass snapshot tests before live handoff is enabled.

## Packet 10: Operational Gates And Lifecycle

Owned files:

- archive/export/observability services.
- feature flag checks.
- i18n labels.

Implementation:

- Add archive, restore, delete, export.
- Add stale output ref detection and repair/relink.
- Add audit events and metrics.
- Add kill switches for UI, Video Shot, live planner/verifier, node config mode, execution, and handoff.
- Add Feature 116 flag truth table covering Production Space UI, React Flow preview, Video Shot tab, node config mode, live planner/verifier, Storyboard Review handoff, Video Edit handoff, run-one-node, run-one-shot, batch execution, and emergency kill switch.
- Enforce precedence: emergency kill switch overrides all live/execution flags; handoff flags do not imply provider execution; run-one-node does not imply run-one-shot or batch.
- Add Thai/English labels for new statuses/errors.
- Add accessibility fallback coverage.

Tests first:

- Export excludes secrets, signed URLs, raw provider payloads, raw marketplace/OCR/review/comment text, and raw prompts.
- Kill switches disable each live action independently.
- Flag truth-table tests cover disabled/read-safe/fixture/live modes and precedence.
- Audit payloads are redacted.
- List fallback opens shots/nodes without drag/drop.
- Export/Archive/Delete UI/UX contract covers export-ready, export-success, export-failure, archive, restore conflict, delete draft, and permission-denied states.
- Thai/English copy snapshots cover live-disabled, provider-disabled, planner failed/partial/schema-invalid, product blocked, invalid edge, stale conflict, permission denied, export success, archive/restore/delete confirmation.

Exit criteria:

- Live planner, live handoff, and execution remain off until this packet passes.

## Packet 10.5: UI/UX Browser Evidence Gate

Owned files:

- `specs/feature/116-production-director-node-canvas/implementation/ui-browser-evidence.md`
- browser/E2E test file such as `apps/web/client/src/e2e/media-production-director.spec.ts`, or the repo-approved equivalent
- UI test fixtures for mocked ProductionSpace, Feature 115 product evidence, provider/credit APIs, Storyboard Review, and Video Edit handoff previews

Implementation:

- Add or identify a deterministic browser command, for example `npm --prefix apps/web run e2e:production-director`, before claiming this packet complete.
- Cover the canonical journey: goal, asset/product evidence, fixture plan, canvas/list edit/reconnect, Video Shot edit, Image/Video/basic TTS config, Save to Node, approve, preview handoff, zero provider-credit spend, export preview.
- Capture or document evidence for 390x844, 768x1024, 1280x800, and 1440x900.
- Capture or document accessibility evidence: keyboard-only path, focus trap/restore, accessible names/tooltips, contrast, dark/light readability, reduced motion, and axe/WCAG or manual equivalent.
- Capture negative state evidence: planner failed, partial output, schema-invalid, feature-disabled, stale version conflict, permission denied, no project, no shot, stale shot, blocked product evidence, disabled live handoff, disabled execution, and export failure.

Tests first:

- Canonical browser journey passes with mocked external/provider APIs.
- No provider-generation credit reservation or deduction happens before explicit generation confirmation.
- Mobile/tablet/laptop/desktop layout has no incoherent overlap, hidden primary actions, or horizontal overflow.
- Icon-only controls and status badges have accessible names.
- Focus returns to the invoking control after drawer/dialog close.

Exit criteria:

- `implementation/ui-browser-evidence.md` is complete.
- Missing automation, screenshots, or browser tooling is recorded as skipped/not-pass with residual risk, not marked as success.

## Packet 11: Live Planner, Handoff, And Limited Execution

Owned files:

- planner/verifier execution router/service paths.
- `apps/web/server/services/productionExecutionSchedulerService.ts`
- media generation integration through existing `mediaGenerationService` and media task/credit paths.

Implementation:

- Enable live planner/verifier behind flags.
- Enable Storyboard Review / Video Edit handoff behind flags.
- Enable run-one-node and run-one-shot behind flags.
- Keep full approved batch behind a later flag.
- Use existing media generation, task status/cancellation, credit deduction/refund/reconciliation, and provider polling/status patterns.
- Store Production metadata on created media tasks and attach outputs back to the active node only.

Tests first:

- Planner/verifier do not reserve provider-generation credits.
- Run-one-node reserves credits only after readiness and user confirmation.
- Run-one-node calls existing media generation adapter and records Production metadata.
- Submission failure after credit deduction refunds credits.
- Terminal failed/cancelled task reconciles unused credits.
- Run-one-shot follows dependencies.
- Cancellation and retry are idempotent.
- Polling/status updates derive node status from existing media task status where possible.

Exit criteria:

- Limited live execution is safe, observable, cancellable, and recoverable.

## Required Final Gates

- `npm --prefix apps/web test -- shared/mediaProduction.test.ts shared/geminiOmni.test.ts`
- Relevant router/service tests for changed procedures.
- Relevant skill verify scripts.
- Feature 116 browser/UI evidence gate from Packet 10.5.
- `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check`
- `git diff --check` for touched files.
