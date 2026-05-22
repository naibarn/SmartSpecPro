# Production Director Node Canvas Implementation Plan

## Implementation Objective

Build Production Director as a full production planning system, not a media-generation form.

The final system should let a user plan a whole film/video/story first, then break it into ordered Video Shots, then break each shot into executable child nodes that use the existing Image, Video, Audio, Storyboard Review, and Video Edit surfaces.

## Core Product Hierarchy

```text
Production Project
  -> Production Brief / Goal
  -> Story Plan
  -> Ordered Video Shots
  -> Shot Child Nodes
  -> Existing Tool Config Surfaces
  -> Storyboard Review / Video Edit
```

### Production Project

Owns the whole story:

- project name,
- target audience,
- platform,
- total duration,
- aspect ratio,
- language,
- story goal,
- product/brand truth,
- characters/cast,
- location/mood references,
- budget/quality guardrails,
- final handoff targets.

### Video Shot

Owns one storyboard shot:

- shot order,
- story beat,
- shot type,
- duration,
- cast,
- product involvement,
- audio intent,
- visual/camera intent,
- references,
- child node graph,
- output clip/reference,
- QA state.

### Child Node

Owns a concrete planning or execution step inside a shot:

- script generation,
- prompt packaging,
- image generation,
- image reference/start/stop frame preparation,
- character asset creation,
- voice/audio asset creation,
- TTS,
- music,
- sound effects,
- voice change,
- video generation,
- QA,
- handoff.

Each child node keeps its own config snapshot and output refs. Existing media tabs are editors for that node, not the source of truth.

## Story-To-Shot Planning Algorithm

The planner skill and backend validation should follow this sequence.

### Step 1: Normalize The Brief

Normalize user input into a `ProductionBrief`:

- output type: film, ad, product review, brand story, tutorial, UGC, customer journey, music/lip-sync, custom;
- objective: awareness, trust, conversion, education, entertainment, retention;
- target audience and platform;
- duration target;
- product/brand truth;
- cast/character requirements;
- location/mood references;
- audio strategy;
- constraints and avoid list.

### Step 2: Estimate Shot Count

Estimate shot count from total duration, platform, pace, and output type.

Suggested default heuristics:

- TikTok/Reels fast ad: 2-4 seconds per shot.
- Product review/demo: 3-6 seconds per shot.
- Cinematic brand story: 4-8 seconds per shot.
- Dialogue/lip-sync: based on line length, speaking speed, and emotional pacing.
- B-roll/transition: 1-3 seconds.
- CTA/packshot: 2-5 seconds.

The planner should output a range first, then a chosen shot count:

```ts
interface ShotCountEstimate {
  totalDurationSeconds: number;
  pace: "fast" | "balanced" | "cinematic" | "dialogue_driven";
  minShots: number;
  maxShots: number;
  selectedShotCount: number;
  rationale: string;
}
```

### Step 3: Build Story Beats

Allocate time into story beats:

- hook,
- setup/context,
- product or character introduction,
- demo/action/proof,
- emotional payoff,
- CTA or transition.

For non-commerce film/story projects, substitute product beats with character conflict, reveal, or atmosphere.

### Step 4: Create Ordered Shots

For each shot, define:

- title,
- purpose,
- story beat,
- duration,
- shot type,
- characters,
- product usage,
- audio intent,
- visual intent,
- required assets,
- expected output.

### Step 5: Decide Shot Production Strategy

For each shot, decide whether it needs:

- video only,
- script first,
- image reference first,
- start frame,
- stop/end frame,
- TTS/audio first,
- music/SFX first,
- character asset first,
- product packshot/evidence first,
- QA before generation.

Decision rules:

- Use **image reference** when the goal is style, mood, product likeness, character likeness, or scene direction and the video provider can infer motion well.
- Use **start frame** when first-frame composition, character pose, product placement, or continuity must be strict.
- Use **stop/end frame** when the shot must land on a specific CTA, product packshot, transformation result, or transition endpoint.
- Use **both start and stop frames** only for high-control shots where the provider supports it and the credit/risk tradeoff is justified.
- Use **video-to-video** when the user provides a source motion clip or wants to preserve motion/camera/action from an existing video.
- Use **audio first** when lip-sync, singing, dialogue timing, or voiceover timing drives the shot.
- Use **script first** whenever the shot contains speech, voiceover, product review, dialogue, caption timing, or creator narration.

### Step 6: Create Child Nodes Per Shot

Examples:

Product review close-up:

```text
script_generation -> product_truth_qa -> image_generate(reference/packshot) -> video_generate -> video_qa
```

Lip-sync character line:

```text
script_generation -> text_to_speech -> character_reference/character_create -> video_generate(lip_sync) -> audio_qa -> video_qa
```

Cinematic b-roll:

```text
scene_reference -> video_generate -> visual_consistency_qa
```

Strict character continuity shot:

```text
character_reference -> image_generate(start_frame) -> video_generate(image_to_video) -> visual_consistency_qa
```

Singing shot:

```text
script_generation/lyrics -> music_generate or audio_reference -> voice_asset_create/text_to_speech -> video_generate(lip_sync/singing) -> audio_qa -> video_qa
```

### Step 7: Build The Graph

The planner returns:

- ordered `ProductionShot[]`,
- `video_shot` group nodes,
- child nodes per shot,
- edges inside each shot,
- continuity edges across shots,
- QA/control gates,
- Storyboard Review and Video Edit handoff nodes.

### Step 8: Verify Before Execution

Verifier checks:

- shot sequence tells a coherent story,
- shot durations match total duration,
- character continuity is possible,
- product truth evidence is preserved,
- every executable node has required inputs,
- reference/start/stop frame choices are justified,
- budget estimate is acceptable,
- handoff targets can receive the plan.

No provider-generation credits are reserved during planning or verification.

## Codebase Integration Plan

### Shared Contracts

File area:

- `apps/web/shared/mediaProduction.ts`

Add or extend:

- `ProductionSpace`
- `ProductionBrief`
- `ProductionShot`
- `ProductionFlowCanvas`
- `ProductionFlowNode`
- `ProductionFlowEdge`
- `ProductionNodeToolBinding`
- `ProductionNodeConfigSnapshot`
- `ProductionNodeOutputRef`
- `ProductStoryboardAsset`
- `ProductClaimEvidence`
- `ProductClaimEvidenceMap`
- `ProductionShotProductUse`
- `ProductionProductEvidenceManifest`
- `ProductionDownstreamResultRecord`
- `ProductionActionAttempt`
- readiness and validation helper functions
- versioning, approval invalidation, and idempotency helper functions

Suggested helpers:

- `validateProductionSpace(space)`
- `validateProductionShot(shot)`
- `validateProductionFlowGraph(canvas, shots)`
- `computeProductionShotReadiness(shot, nodes)`
- `computeProductionNodeReadiness(node, context)`
- `buildProductionNodeConfigPatch(surfaceState)`
- `applyProductionNodeConfigSnapshot(tabState, snapshot)`
- `deriveStoryboardHandoffFromSpace(space)`
- `deriveVideoEditHandoffFromSpace(space)`
- `normalizeProductStoryboardAssets(source)`
- `normalizeProductClaimEvidenceMap(handoff)`
- `validateShotProductUse(shot, productAssets, claims)`
- `buildProductEvidenceManifest(space)`
- `buildProductionDownstreamResultRecord(sourceResult)`
- `mapProductAssetsToNodeConfig(node, shotProductUse)`
- `computeApprovalInvalidation(prev, next)`
- `buildProductionActionIdempotencyKey(input)`
- `buildProductionCapabilityRegistry(input)`

### Persistence And Router

File areas:

- `apps/web/drizzle/schema.ts`
- `apps/web/server/routers/mediaProduction.ts`
- `apps/web/server/routers.ts`

Recommended data model:

- Add a durable `mediaProductionSpaces` table for versioned `ProductionSpace`.
- Keep current `mediaProductionRuns` as the run/status index.
- Store current `spaceVersion` on run or derive latest active space version.
- Store or derive independent layer versions: `spaceVersion`, `briefVersion`, `shot.version`, `node.version`, `canvas.layoutVersion`, `planVersion`, `verifierVersion`, and `approvalVersion`.
- Store `ProductStoryboardAsset` and `ProductionShotProductUse` inside the versioned ProductionSpace JSON for MVP so restore/rollback remains atomic.
- If query volume requires separate tables later, add indexed projections keyed by `productionRunId`, `captureId`, `marketplaceProductId`, `assetId`, `evidenceId`, and `linkedClaimId`; projections must be rebuildable from ProductionSpace and enforce tenant ownership.
- Add a durable action-attempt record or JSON sub-record keyed by action idempotency key for planner/verifier/generation/handoff attempts.

Router procedures:

- `getSpace(productionRunId)`
- `saveSpace(productionRunId, expectedSpaceVersion, spacePatch, changedFields)`
- `saveBrief(productionRunId, expectedSpaceVersion, expectedBriefVersion, briefPatch)`
- `saveShot(productionRunId, expectedSpaceVersion, shotId, expectedShotVersion, patch)`
- `getNodeConfig(productionRunId, nodeId, configSnapshotId)`
- `saveNodeConfig(productionRunId, expectedSpaceVersion, nodeId, expectedNodeVersion, previousConfigSnapshotId, configSnapshot, outputRefs?)`
- `saveCanvasLayout(productionRunId, expectedSpaceVersion, expectedLayoutVersion, nodes, edges, viewport)`
- `validateSpace(productionRunId)`
- `executePlanner(productionRunId, skillId, modelId?)`
- `executeVerifier(productionRunId)`
- `projectOutput(surface)` extended to include shot metadata
- `getCapabilityRegistry()`
- `recordActionAttempt(productionRunId, shotId, nodeId, configSnapshotId, idempotencyKey, action)`
- `restoreSpaceVersion(productionRunId, version)`
- `adaptLegacyRunToProductionSpace(productionRunId)`
- `scheduleProductionExecution(productionRunId, scope)`
- `cancelProductionExecution(productionRunId, scopeOrActionId)`
- `duplicateProductionProject(productionRunId, options)`
- `archiveProductionProject(productionRunId)`
- `restoreProductionProject(productionRunId)`
- `deleteProductionProject(productionRunId, mode)`
- `exportProductionProject(productionRunId, format)`
- `repairProductionOutputRefs(productionRunId)`
- `importMarketplaceStorytellingHandoff(productionRunId, expectedSpaceVersion, handoffRef)`
- `resolveProductStoryboardAssets(productionRunId, expectedSpaceVersion, sourceRefs)`
- `reviewProductStoryboardAsset(productionRunId, expectedSpaceVersion, assetId, decision)`
- `updateProductStoryboardAssetRole(productionRunId, expectedSpaceVersion, assetId, role)`
- `linkProductClaimToAsset(productionRunId, expectedSpaceVersion, assetId, claimId)`
- `linkProductEvidenceToAsset(productionRunId, expectedSpaceVersion, assetId, evidenceId)`
- `requestMoreProductEvidence(productionRunId, expectedSpaceVersion, assetIdOrProductId, reason)`
- `relinkProductStoryboardAsset(productionRunId, expectedSpaceVersion, assetId, replacementRef)`
- `saveShotProductUse(productionRunId, expectedSpaceVersion, shotId, expectedShotVersion, productUse)`
- `importDownstreamResultRecord(productionRunId, resultRecord, expectedSpaceVersion)`

Every mutating procedure must enforce tenant ownership, expected version checks, and typed conflict responses. Stale `saveSpace`, `saveBrief`, `saveShot`, `saveNodeConfig`, and `saveCanvasLayout` must return conflicts instead of overwriting.

Router security tests must cover every mutating procedure:

- unauthenticated request rejected by protected procedure behavior;
- missing tenant context rejected;
- cross-tenant production run rejected;
- cross-user production run rejected unless an existing admin/internal policy explicitly allows it;
- permission-denied action rejected for archive, restore, delete, export, handoff, downstream import, execution, and product evidence mutation;
- stale expected version returns typed conflict and does not mutate state;
- disabled feature flag returns a disabled/read-safe response where the action is safe to view, and blocks mutations where it is not.

Initial ownership table:

| Procedure group | Service owner | State touched | Required tests |
| --- | --- | --- | --- |
| `getSpace`, `saveSpace`, `saveBrief`, `saveShot`, `saveCanvasLayout` | `productionSpaceService` | `mediaProductionRuns`, `mediaProductionSpaces` | tenant/user, expected version, conflict/no-overwrite |
| `getNodeConfig`, `saveNodeConfig` | `productionNodeConfigService` | `mediaProductionSpaces`, node config snapshots | tenant/user, node version, snapshot conflict |
| `adaptLegacyRunToProductionSpace` | `productionLegacyCompatibilityService` | legacy goal/plan/verification/approval records, read-only | no-data-loss, deterministic adapter |
| `projectSpaceOutput` | `productionHandoffProjectionService` | output projections, Storyboard Review/Video Edit targets | disabled target, idempotency, safe builder |
| `importDownstreamResultRecord` | `productionDownstreamResultService` | `mediaProductionSpaces`, downstream result records | stale source version, locked node protection |
| archive/restore/delete/export/repair | archive/export/retention services | lifecycle metadata and safe refs | permission, redaction, tombstone/read-safe |
| `scheduleProductionExecution`, `cancelProductionExecution` | `productionExecutionSchedulerService` | action attempts, media tasks, credits, node output refs | readiness, confirmation, credit refund, scoped cancel |

Keep `listRuns` and project restore behavior, but thumbnail selection should prefer:

1. approved shot thumbnail,
2. first generated clip thumbnail,
3. product reference,
4. first visual context asset.

### Execution Scheduler Integration

`productionExecutionSchedulerService` must coordinate existing media infrastructure instead of adding a second provider-submission system.

Canonical boundaries:

- use `mediaGenerationService` for image/video/audio provider execution;
- mirror `apps/web/server/routers/media.ts` credit and async task patterns for credit checks, reserved-credit metadata, failure refund, post-completion reconciliation, cancellation/status, and task metadata;
- attach Production metadata to created tasks: `productionRunId`, `spaceVersion`, `shotId`, `nodeId`, `nodeVersion`, `configSnapshotId`, `actionAttemptId`, and `idempotencyKey`;
- derive node status from existing media task status whenever possible;
- avoid direct provider polling when existing media task polling/status can provide the state;
- call refund/reconciliation paths when submission fails after credit deduction or terminal failed/cancelled state leaves unused credits;
- never deduct credits from planner, verifier, fixture preview, handoff preview, layout edits, shot edits, or `Save to Node`.

Scheduler tests must prove run-one-node, run-one-shot, cancellation, retry, provider task polling/status updates, and output attachment all use the existing media task/credit contracts.

### Handoff Builder Architecture

Handoff builders must be server-safe and shared:

- create a pure shared mapper such as `apps/web/shared/productionHandoffBuilders.ts`;
- `productionHandoffProjectionService` calls the shared builder before inserting Storyboard Review tasks or Video Editor projects;
- client UI can call the same builder only for preview/snapshot display;
- keep React/client-only code out of server routers/services;
- if current conversion behavior only exists in `apps/web/client/src/lib/storyboardVideoProject.ts`, extract pure mapping into the shared module before enabling live Video Edit handoff;
- Video Edit live handoff must use server-safe payloads compatible with existing `videoEditorProjects` records;
- incomplete media must either create explicit non-renderable placeholders or disable `Open in Video Edit`; never use provider task IDs as clip URLs.

Add compatibility tests that compare shared builder output with existing Storyboard Review to Video Edit fixture expectations before replacing or wrapping the current client helper.

### Production Services

Create small focused services instead of adding all logic to the router:

- `productionSpaceService`
- `productionPlanningContextService`
- `productionCanvasValidationService`
- `productionNodeConfigService`
- `productionProductEvidenceService`
- `productionHandoffProjectionService`
- `productionDownstreamResultService`
- `productionExecutionPlanService`
- `productionLegacyCompatibilityService`
- `productionExecutionSchedulerService`
- `productionDeliveryVariantService`
- `productionTimelineService`
- `productionContinuityService`
- `productionNodeToolBindingService`
- `productionSurfaceAdapterRegistry`
- `productionArchiveExportService`
- `productionRetentionService`
- `productionObservabilityService`
- `productionProductEvidenceService`
- `productionProductStoryboardBridgeService`

Responsibilities:

- normalize and validate saved space,
- build LLM context pack,
- build tool/provider capability registry,
- protect locked shots/nodes during replanning,
- enforce approval invalidation rules,
- manage optimistic locking/version conflicts,
- apply node config snapshots,
- attach idempotent outputs to nodes,
- compute readiness/credit estimates,
- project approved shot sequence to Storyboard Review and Video Edit.
- adapt interim Production Director runs into ProductionSpace.
- schedule node/shot/batch execution with cancellation and retry.
- compile captions/subtitles and delivery variants for handoff.
- build timeline/cue sheet from ordered shots.
- compute cross-shot continuity warnings.
- resolve node-to-surface adapters and enforce node config isolation.
- validate every `Save to Node` request against node version, adapter, schema, and capability registry.
- archive, restore, soft-delete, and export Production Projects.
- preserve safe output references without relying only on public URLs.
- repair or report stale/missing output refs.
- emit audit events and metrics for planner, verifier, node config saves, execution, credits, and handoff.
- enforce feature flags / kill switches for planner, verifier, execution, and downstream handoff.
- normalize Feature 115 selected product images into `ProductStoryboardAsset` records.
- map Feature 115 fields deterministically into product storyboard assets, claim IDs, readiness gates, and allowed actions.
- map product storyboard assets and claims into per-shot product usage.
- preserve product refs and claim refs in Image/Video/Script/Audio node config snapshots.
- build per-shot product evidence manifests for Storyboard Review and Video Edit.
- import downstream Storyboard Review / Video Edit result records back into Production status, selected takes, timeline, QA state, and product warning resolution.
- block execution when product image fidelity, claim evidence, or SKU/variant readiness is unresolved.

### Skill Contracts

File areas:

- `apps/web/skills/media-production-storyboard-planner`
- `apps/web/skills/media-production-plan-verifier`
- `apps/web/skills/gemini-omni-video-director`

Planner input must include:

- `production_brief`
- `context_assets`
- `product_storyboard_assets`
- `marketplace_storytelling_handoff`
- `product_claim_evidence_map`
- `feature_115_readiness`
- `feature_115_allowed_next_actions`
- `available_tool_capabilities`
- `provider_capabilities`
- `capability_registry`
- `duration_and_pacing_policy`
- `shot_count_guidance`
- `previous_space`
- `locked_shot_ids`
- `locked_node_ids`
- `revision_request`

Planner output must include:

- `shot_count_estimate`
- `story_beats`
- `shots`
- `shot_sequence`
- `shot_child_node_plan`
- `canvas_nodes`
- `canvas_edges`
- `node_tool_bindings`
- `node_config_suggestions`
- `shot_product_usage`
- `product_evidence_manifest`
- `feature_115_import_warnings`
- `unsupported_tool_requests`
- `handoff_plan`
- `credit_and_time_estimate`
- `approval_checklist`

Verifier input must include the full `ProductionSpace`.

Verifier output must include:

- story coherence score,
- shot completeness score,
- node readiness score,
- product truth score,
- product image fidelity score,
- Feature 115 readiness/allowed-action gate result,
- provider feasibility score,
- budget risk,
- blocking issues,
- per-shot warnings,
- per-node warnings,
- product image fidelity warnings,
- allowed next actions,
- approval invalidation recommendations.

### Operational Safeguards

Add early infrastructure for:

- optimistic locking on ProductionSpace save;
- material-change approval invalidation;
- local undo/redo for canvas and shot edits;
- durable change history for brief, shots, nodes, and approvals;
- idempotency keys for generation and handoff actions;
- output attachment records with task/provider/library IDs;
- scoped failure recovery for node, shot, handoff, and batch actions;
- permission checks for library/provider assets;
- large-project performance through collapsed shots and lazy config loading.

### Client Architecture

Avoid expanding `apps/web/client/src/pages/MediaStudio.tsx` further. Extract Production-specific UI into components/hooks.

Recommended file area:

- `apps/web/client/src/components/media/production/`
- or `apps/web/client/src/features/media-production/`

Components:

- `ProductionWorkspace`
- `ProductionProjectHeader`
- `ProductionBriefPanel`
- `ProductionContextAssetBoard`
- `ProductEvidenceTray`
- `ProductEvidenceCard`
- `ProductClaimEvidenceList`
- `ProductionPlannerPanel`
- `ProductionStoryboardTimeline`
- `ProductionCanvas`
- `ProductionNodeDrawer`
- `ProductionShotGroupNode`
- `VideoShotWorkspace`
- `ShotListPanel`
- `ShotBuilderPanel`
- `ShotChildNodeList`
- `VideoShotProductUsagePanel`
- `ShotReadinessStrip`
- `NodeConfigureBanner`

Hooks:

- `useProductionSpace`
- `useProductionShot`
- `useProductionCanvas`
- `useProductionNodeConfig`
- `useProductionToolHandoff`
- `useProductionAssetDrop`
- `useProductStoryboardEvidence`
- `useDownstreamResultImport`

### Media Studio Tab Routing

Add workspace tab:

```ts
type StudioWorkspaceTab = "production" | "video_shot" | "image" | "video" | "audio";

type ProductionSurface =
  | "production_workspace"
  | "production_skill"
  | "production_asset_drawer"
  | "production_qa"
  | "production_gate"
  | "production_review"
  | "production_timeline"
  | "video_shot"
  | "image"
  | "video"
  | "audio"
  | "character_wizard"
  | "audio_asset_wizard"
  | "caption_editor"
  | "storyboard_review"
  | "video_edit"
  | "render_surface"
  | "publish_export";
```

State/query params:

- `productionRunId`
- `shotId`
- `nodeId`
- `nodeMode=config`
- `returnTo=production`

Behavior:

- Production tab renders only Production workspace.
- Video Shot tab renders only Shot Builder workspace.
- Image/Video/Audio tabs can enter node configuration mode.
- Node configuration mode shows `Save to Node` and `Back to Production`.
- Saving writes to the node snapshot and returns to Production or Video Shot.

### Library / Asset Search

File areas:

- existing library panel components in Media Studio,
- `apps/web/server/routers/mediaProviderAssets.ts`,
- provider asset service.

Add:

- character search filter,
- provider asset search source,
- typed drag payloads,
- click-to-add fallback,
- role assignment after drop.

Drag payload shape should include:

- source,
- asset kind,
- title,
- thumbnail,
- public URL,
- provider asset ID,
- library item ID,
- marketplace/product evidence refs.

### Canvas And Shot UX

Production canvas:

- high-level story graph,
- shot group nodes,
- handoff nodes,
- major QA gates,
- collapsible child nodes.

Video Shot workspace:

- focused shot form,
- child node list/mini-canvas,
- open child node in Image/Video/Audio,
- apply shot-level values to child configs,
- preserve manually edited configs unless user confirms overwrite.

### Execution And Credits

Execution modes:

- configure only: no credits,
- generate one node,
- generate one shot,
- run approved batch,
- handoff only.

Credit rules:

- planning/verifier LLM costs are separate from provider generation credits;
- provider generation is blocked until node/shot readiness passes;
- batch execution follows dependency order;
- failed node does not invalidate completed independent nodes;
- rerun should be node-scoped or shot-scoped by default.

## UI/UX Release Contract

Deep-implement must treat the UI/UX work as a first-class release gate. The feature is not ready if the user can technically save data but cannot understand the next step, recover from blockers, use the flow without a pointer device, or verify that no credits were spent during planning/config-only actions.

### Surface Contracts

Each surface must implement the matching section contract:

| Surface | Contract source | Required implementation output |
| --- | --- | --- |
| Production Workspace | Section 01 | Project header, journey stepper, brief, asset/product evidence entry, planner states, copy contract, responsive behavior. |
| React Flow Canvas | Section 04 | Canvas, list fallback, node drawer, invalid edge recovery, keyboard/list equivalent for pointer actions. |
| Video Shot Workspace | Section 07 | no-project/no-shot/stale/selected/locked/product-blocked/conflict states. |
| Node Drawer / Node Config Mode | Section 06/13 | Configure, Save to Node, Back to Production, stale conflict, disabled adapters, output attach, standalone mode. |
| Product Evidence Tray | Section 15 | Product roles, fidelity risk, claim/evidence linking, warnings, recovery, project/shot conflict. |
| Handoff / Execution / Export | Section 10/14 | Preview-only handoff, live-disabled states, credit confirmation, progress/failure/cancel/retry, safe export/archive/delete. |

### Canonical Browser Journey

The release browser test or manual evidence must prove this exact journey with mocked providers and mocked credit APIs:

1. Open Media Studio Production and create a new Production project.
2. Fill the brief with output type, audience/platform, duration/aspect/language, and constraints.
3. Add a normal asset and a Feature 115 product evidence fixture by click-to-add. Drag/drop can be separately covered, but click-to-add is mandatory.
4. Create a fixture plan canvas.
5. Open canvas list fallback and edit/reconnect at least one dependency through a non-pointer path.
6. Open a `video_shot` group in Video Shot workspace and save a shot-level edit.
7. Configure one Image node, one Video node, and one basic TTS node through node config mode.
8. Use `Save to Node` for each node and prove outputs/config snapshots attach only to the active node.
9. Approve the plan after blockers are resolved.
10. Preview Storyboard Review and Video Edit handoff payloads while live handoff remains disabled.
11. Verify no provider-generation credit reservation or deduction happens before explicit generation confirmation.
12. Open Export preview and confirm the safe manifest excludes secrets, private signed URLs, raw provider payloads, and raw marketplace/OCR/review/comment text.

### Browser Evidence Artifact

Implementation must write evidence to:

```text
specs/feature/116-production-director-node-canvas/implementation/ui-browser-evidence.md
```

The artifact must include exact command used or explicit reason automation was unavailable, route/surface list, changed files, build/dev server command, screenshots/traces or manual notes for 390x844, 768x1024, 1280x800, and 1440x900, console errors, keyboard-only path, overflow/overlap, component states, dark/light readability, accessible names, focus trap/restore, skipped checks, and residual risk.

Missing browser tooling, dev server access, or screenshots must be recorded as `skipped`, never `pass`.

### Accessibility Gate

The implementation must include automated or documented equivalent checks for:

- keyboard-only canonical journey;
- focus order across header, stepper, main workspace, canvas/list, drawer/dialogs, tool surfaces, handoff/export dialogs;
- focus trap and focus return for drawers, dialogs, previews, confirmations, and image/product preview;
- accessible names for icon-only canvas toolbar controls, node actions, lifecycle menu actions, and status badges;
- contrast/readability in light and dark mode;
- reduced-motion behavior for canvas animation, drawer transitions, reorder animation, skeleton shimmer, and auto-scroll;
- axe/WCAG check where runner support exists, or a documented manual equivalent when unavailable.

### Visual And Token Gate

The implementation must follow existing Media Studio and shadcn/dashboard vocabulary:

- semantic colors/tokens first, raw colors only where an existing Media Studio accent pattern already exists and contrast is proven;
- stable button hierarchy with one primary next action per state;
- operational density with compact panels and no landing-page hero treatment;
- 8 px-or-less card radius unless using existing component defaults;
- lucide icons for icon buttons, with tooltips and accessible names;
- warning/error/success states use semantic treatment and text labels, never color alone;
- text must not overflow parent buttons, cards, tabs, badges, or action sheets in Thai or English;
- dark/light mode must be readable before live rollout.

## Implementation Phases

### Phase Ordering Rule

Live planner, live verifier, downstream handoff, and provider execution must not be enabled until operational gates from Phase 10.5 pass. Earlier phases may build contracts, UI, preview payloads, fixtures, and snapshot tests, but they must keep live side effects behind feature flags.

### Phase 0: Guardrails And Flags

- Add feature flag for Production Space / Shot Builder.
- Keep current Gemini Omni suite behavior working.
- Ensure Production tab can be disabled without affecting Image/Video/Audio.
- Add Feature 116 flag truth table and kill-switch precedence before implementation begins.
- Define disabled/read-safe/fixture/live behavior for Production Space UI, Video Shot tab, node config mode, planner/verifier, Storyboard Review handoff, Video Edit handoff, run-one-node, run-one-shot, and batch execution.

### Phase 1: Contracts And Persistence

- Add shared types and validators.
- Add migration/table or versioned JSON storage for ProductionSpace.
- Add router procedures for save/load space, shot, node config, canvas layout.
- Add unit tests for graph validation and shot readiness.
- Add versioning, optimistic locking, and approval invalidation helpers.
- Add read-compatible adapter for existing interim Production Director runs.
- Add migration/backfill/no-data-loss/rollback/schema-version upgrade acceptance tests before enabling write-mode migration.

### Phase 1.5: Capability Registry And Operational Guards

- Add capability registry builder from existing media models, skills, provider assets, and downstream surfaces.
- Add idempotency key helpers for node generation and handoff.
- Add action attempt records for retry/failure recovery.
- Add permission checks for dragged library/provider assets.
- Add change-history records for material edits.

### Phase 2: Production Workspace Shell

- Extract Production UI from `MediaStudio.tsx`.
- Make Production tab exclusive.
- Add project header, save/open project, brief panel.
- Keep Image/Video/Audio standalone.

### Phase 3: Context Assets And Library Search

- Add character search/filter.
- Add typed drag/drop and click-to-add.
- Add context asset board and drop zones.
- Persist selected context assets.

### Phase 3.5: Product Image Evidence Bridge

- Normalize Feature 115 `selectedProductImages` into `ProductStoryboardAsset`.
- Add explicit field-level mapper from Feature 115 handoff to ProductStoryboardAsset, `ProductClaimEvidenceMap`, claim IDs, readiness gates, and allowed actions.
- Map `source.url`, `insightRefs`, `EvidenceBackedClaim.claimText`, `claimType`, `approvedByUser`, and `risk` into safe Production contracts.
- Block product-related generation for `needs_user_review`, `insufficient_evidence`, unresolved `ready_with_warnings`, unsupported claims, image mismatch, policy-sensitive claims, and unapproved confirmation-required claims.
- Add Product Evidence Tray with product identity, image role, fidelity risk, claim/evidence badges, approval state, and warnings.
- Add product image review actions: role change, approve, block, link claim, link evidence, request more evidence, and relink capture/library refs.
- Add per-shot `ProductionShotProductUse`.
- Add typed per-shot `ProductionProductEvidenceManifest`.
- Add reduced-confidence manual product path when Feature 115 insights are missing but product identity and images are confirmed.
- Add privacy guard so raw marketplace/OCR/DOM payloads are never attached unless Feature 115 raw-capture settings allow it.

### Phase 4: Planner And Verifier Contracts

- Update planner skill schemas.
- Update verifier skill schemas.
- Add deterministic fixtures for a full story, product review, marketplace product image story, lip-sync shot, and b-roll shot.
- Render planner fixture output before enabling live planning.

### Phase 5: Video Shot Workspace

- Add Video Shot tab.
- Add shot list and Shot Builder.
- Add empty/standalone guard states when no project or no valid shot is selected.
- Persist shot config.
- Add shot group node linking.
- Add shot reorder/split/merge/duplicate basics.

### Phase 6: React Flow Canvas

- Render `video_shot` group nodes and child nodes.
- Add node drawer, edge editing, layout save.
- Add graph validation warnings.
- Add mobile/list fallback.

### Phase 7: Node Configuration Handoff

- Add `Configure Node` flow.
- Add node configuration mode to Image tab.
- Add node configuration mode to Video tab.
- Add MVP node configuration mode to basic TTS in the Audio tab.
- Keep music, sound effects, voice changer, speech-to-text, captions/subtitles, delivery variants, and full node matrix adapters deferred until the post-MVP/full-matrix release gate explicitly promotes them.
- Add `Save to Node` and `Back to Production`.
- Ensure node snapshots do not overwrite global tab state.
- Add adapter registry with one adapter per supported node/surface/mode.
- Add route params: `spaceVersion`, `nodeVersion`, and `configSnapshotId`.
- Add stale-version conflict handling for `Save to Node`.

### Phase 8: Handoff To Storyboard Review And Video Edit (Safe Preview First)

- Extract pure shared handoff builders before live handoff.
- Extend output projection with ordered shots.
- Include clip/audio/caption/QA metadata.
- Include per-shot product evidence manifests.
- Include timeline/cue sheet and transition cues.
- Build preview/snapshot payloads first.
- Open existing downstream project/task after handoff only when live handoff flag and Phase 10.5 gates are enabled.
- Add `ProductionDownstreamResultRecord` import/sync from Storyboard Review and Video Edit for selected takes, shot order, trims, captions, product warning resolution, and manual fidelity approval.
- Handle stale downstream result imports as conflict or save-as-new-version without overwriting locked shots/nodes.

### Phase 9: Execution Orchestration (Flagged, After Operational Gates)

- Integrate with existing `mediaGenerationService`, media task status/cancellation, credit deduction/refund/reconciliation, and provider polling/status paths.
- Store Production metadata on generated media tasks.
- Add readiness-gated run one node / run one shot / run approved batch.
- Add dependency ordering.
- Add node/shot/batch cancellation.
- Add idempotent retry from failed node.
- Add credit reservation and refund boundaries.
- Attach outputs back to nodes and shots.
- Add node/shot QA hooks.
- Keep all provider-credit-spending execution disabled until Phase 10.5 gates pass.

### Phase 9.5: Captions, Subtitles, And Delivery Variants

- Add `caption_subtitle` node support.
- Add subtitle/caption handoff to Video Edit.
- Add delivery variant instructions for aspect/language/platform variants.
- Add Storyboard Review / Video Edit idempotent open-existing-project behavior.

### Phase 9.6: Timeline And Continuity

- Add timeline/cue sheet builder from ordered shots.
- Add `timeline_assembly`, `transition_edit`, and `continuity_check` nodes.
- Add Video Edit timeline handoff snapshot tests.
- Add continuity warnings across neighboring shots.

### Phase 10: QA, Learning, And Rollout

- Add verifier-driven issue display per shot/node.
- Feed repeated issues into skill improvement workflow where existing mechanisms support it.
- Add browser/E2E coverage for the canonical UI/UX journey in the UI/UX Release Contract. Prefer a Playwright command such as `npm --prefix apps/web run e2e:production-director`; if the repo still lacks a browser runner, add an approved deterministic runner or record manual evidence as skipped/not-pass until automation exists.
- Capture or document browser evidence for 390x844, 768x1024, 1280x800, and 1440x900.
- Add accessibility checks for keyboard-only navigation, focus trap/restore, accessible names, contrast, dark/light readability, reduced motion, and axe/WCAG or documented equivalent.
- Keep behind feature flag until Phase 10.5 operational gates are in place.

### Phase 10.5: Data Lifecycle And Observability

- Add archive, restore, soft delete, and safe export actions for Production Projects.
- Export a manifest containing the brief, space version, ordered shots, graph, configs, cue sheet, scripts/captions, output refs, product evidence refs, provider/task refs, warnings, and QA summaries.
- Exclude secrets, provider keys, and private signed URLs from export.
- Add stale output ref detection plus repair/relink UI.
- Emit audit events for planner, verifier, node config save, node/shot/batch execution, credit reservation/refund, archive/delete/export, and handoff.
- Add metrics for planner failures, verifier blocks, save conflicts, provider failures, credit mismatches, handoff failures, stale output refs, and storage growth.
- Add audit payload schema tests to exclude raw prompts, raw marketplace/OCR/review/comment text, signed URLs, provider keys, and raw provider payloads.
- Add default alert thresholds for planner schema failures, save conflict spikes, provider failure spikes, credit mismatch, downstream handoff/import failures, stale output refs, and storage growth anomalies.
- Add kill switches for Production Space UI, Video Shot tab, live planner/verifier, node config mode, execution scopes, and downstream handoffs.
- Add flag truth-table tests for disabled/read-safe/fixture/live modes and kill-switch precedence.
- Add Thai/English labels for node types, shot types, readiness, errors, conflicts, disabled states, and handoff states.
- Add list/keyboard alternatives for canvas and drag/drop flows.
- Treat Phase 10.5 as a prerequisite for live planner, downstream handoff, and execution rollout.

## Test Plan

### Unit Tests

- ProductionSpace schema validation.
- Feature flag truth table and kill-switch precedence.
- Shot count heuristic edge cases.
- Shot readiness rules.
- Node config snapshot apply/extract.
- MVP node-to-tool adapter coverage for Image, Video, and basic TTS.
- full node-to-tool matrix adapter coverage before enabling all node categories.
- adapter schema rejects mismatched node type/surface/mode.
- Graph validation for cycles/missing inputs/invalid edge types.
- Handoff projection order.
- approval invalidation rules.
- idempotency key stability.
- capability registry rejects unsupported node/tool combinations.
- legacy run adapter produces valid draft ProductionSpace.
- delivery variant overrides preserve shot order.
- timeline start/end times reconcile with shot durations.
- continuity warnings target the correct shots.
- export manifest excludes secrets, provider keys, and private signed URLs.
- audit payload schema excludes raw prompts, raw marketplace/OCR/review/comment text, signed URLs, provider keys, and raw provider payloads.
- archive/restore preserves ProductionSpace versions, node configs, and output refs.
- stale output ref detection distinguishes repairable refs from permanently missing refs.
- Feature 115 selected product images normalize into `ProductStoryboardAsset`.
- Feature 115 readiness and allowed next actions map to Production gates.
- Feature 115 `needs_user_review` and `insufficient_evidence` block product-related generation and downstream handoff.
- Feature 115 `ready_with_warnings` requires authorized warning acceptance before generation or handoff.
- Feature 115 `EvidenceBackedClaim.risk` and `approvedByUser` normalize into `ProductClaimEvidenceMap`.
- shot product usage validation blocks missing product images, unsupported claims, high fidelity risk, and SKU/variant mismatch.
- shot product usage validation rejects free-form claim text in `claimIds`.
- shot product usage validation rejects evidence IDs accidentally supplied as `claimIds`.
- multi-product comparison validation prevents product A claims from attaching to product B shots.
- product evidence manifest preserves image roles, evidence IDs, claim IDs, and per-shot QA state.
- product evidence manifest includes schema version, safe source handoff refs, sanitized provenance, QA state, and unresolved blockers.

### Router Tests

- save/load space with `expectedSpaceVersion`.
- stale `saveSpace` returns typed conflict.
- save shot with `expectedShotVersion` without changing other shots.
- stale `saveShot` returns typed conflict.
- save node config with `expectedNodeVersion` and `previousConfigSnapshotId` without changing other nodes.
- stale node config save conflict.
- stale canvas layout save conflict and layout-only merge path.
- output attachment writes to active node only.
- planner output persistence.
- verifier blocking states.
- project list thumbnails.
- optimistic locking conflict.
- restore previous space version.
- idempotent node output attachment.
- execution scheduler dependency ordering.
- execution cancellation and retry behavior.
- archive/restore/delete project lifecycle.
- export project manifest shape.
- audit events emitted for planner, verifier, config save, execution, credits, and handoff.
- stale output refs are repaired or reported without crashing the canvas.
- get node config returns exactly the requested snapshot or a version conflict.
- cancel production execution is idempotent and scoped to node, shot, or batch.
- record action attempt enforces idempotency key and duplicate retry behavior.
- duplicate project preserves source refs but creates new ProductionSpace/node/config IDs.
- resolve/review product storyboard assets preserves capture/product ownership and permission checks.
- update role, link claim, link evidence, request more evidence, and relink product image actions preserve ownership and audit-safe metadata.
- link product claim rejects evidence IDs in claim fields.
- save shot product usage does not mutate unrelated shots.
- import downstream result record updates selected takes/timeline/product QA or returns conflict for stale source versions.
- cross-tenant, cross-user, unauthenticated, forbidden, and permission-denied router cases for every mutating Production procedure.
- migration backfill converts eligible legacy runs without deleting old records.
- rollback/read-safe mode keeps legacy runs and standalone Image/Video/Audio workflows usable.
- schema-version upgrade preserves brief, shots, nodes, config snapshots, output refs, product evidence, and downstream projection refs.
- scheduler adapter calls existing media generation paths and records Production metadata.
- scheduler refund/reconciliation tests cover submission failure, terminal failed/cancelled tasks, cancellation, and retry.
- shared handoff builder output is server-safe and compatible with existing Video Edit project fixtures.

### Skill Contract Tests

- planner fixture validates full story output.
- planner fixture validates product review story.
- planner fixture validates Shopee and TikTok product image storyboard stories.
- planner fixture validates Feature 115 `needs_user_review`, `insufficient_evidence`, unresolved `ready_with_warnings`, and missing allowed action blocking.
- planner fixture validates claim risk/approval gates from `ProductClaimEvidenceMap`.
- planner fixture validates two-product comparison without cross-product claim leakage.
- planner fixture validates lip-sync/singing shot.
- verifier blocks missing product evidence.
- verifier blocks unresolved product image fidelity risk and unsupported claim mapping.
- verifier blocks missing character/audio requirements.
- verifier warns when start frame/reference strategy is unjustified.

### UI Tests

- Production tab does not render Image/Video/Audio prompt UI.
- Production journey stepper shows Goal, Assets, Plan, Fix blockers, Approve, Configure/Generate, Review/Edit, Export/Archive and marks blockers clearly.
- Video Shot tab opens selected shot.
- Video Shot tab empty state appears when no Production project or invalid shot is selected and shows no provider generate controls.
- Image node opens Image tab in node config mode and saves back.
- Video node opens Video tab in node config mode and saves back.
- Basic TTS node opens the correct Audio workflow and saves back.
- Music/SFX/voice changer/STT nodes remain disabled or preview-only in MVP unless a later release gate promotes them.
- Missing node route params open standalone tab mode and cannot save to node.
- Two nodes of the same type round-trip distinct configs without cross-over.
- Reordering shots preserves child node configs.
- Caption/subtitle node hands off subtitle refs to Video Edit.
- Delivery variant node preserves shot order with platform overrides.
- Timeline handoff reconstructs ordered clips, trims, audio, captions, and transitions.
- Storyboard Review handoff preserves shot order.
- Video Edit handoff preserves shot order.
- archive, restore, export, and delete actions are visible only when permissions allow.
- canvas list/keyboard fallback can open shots and nodes without drag/drop.
- disabled feature states show useful Thai/English messages and preserve read/edit access where safe.
- Product Evidence Tray shows product image role, fidelity risk, evidence badges, approval state, and warnings.
- Video Shot Product Usage panel saves per-shot product assets, claims, frame strategy, and QA requirements.
- Image and Video node config mode loads structured product refs and saves them back to the same node.
- Storyboard Review and Video Edit handoff display per-shot product evidence manifests.
- Storyboard Review and Video Edit result import updates selected takes, product warning state, and stale-verifier markers.
- Storyboard Review and Video Edit result import preserves source surface, downstream project/task IDs, conflict policy, and import outcome.
- Product Evidence Tray and Video Shot Product Usage panel show conflicts when project-level and shot-level edits race.

### Browser, Responsive, and Accessibility Evidence

- Canonical journey proof covers create goal, add asset/product evidence, render fixture plan, edit/reconnect/list fallback, configure Image/Video/basic TTS node, Save to Node, approve/preview handoff, and zero provider-generation credit spend.
- Responsive evidence covers 390x844, 768x1024, 1280x800, and 1440x900 for Production Workspace, React Flow/list fallback, Video Shot Workspace, Node Drawer/Config Mode, Product Evidence Tray, and Handoff/Execution/Export.
- Accessibility evidence covers keyboard-only journey, drawer/dialog focus trap and return, icon-only accessible names/tooltips, status live regions, contrast in light/dark mode, and reduced motion.
- Negative browser states cover planner failed, partial output, schema-invalid, feature-disabled, stale version conflict, permission denied, no project, no shot, stale shot, product evidence blocked, disabled live handoff, disabled execution, and export failure.
- Evidence artifact `specs/feature/116-production-director-node-canvas/implementation/ui-browser-evidence.md` is updated with commands, screenshots/traces or manual notes, skipped checks, and residual risk.

## Rollout Strategy

1. Ship types/router behind feature flag.
2. Ship Production workspace with fixture planner output.
3. Ship Video Shot workspace.
4. Ship Product Evidence Tray and product storyboard asset import behind the same feature flag.
5. Ship operational prerequisites: audit events, metrics, export manifest, retention behavior, stale ref repair, and kill switches.
6. Ship node config handoff for Image first.
7. Add Video and basic TTS node handoff.
8. Enable live planner/verifier.
9. Enable Storyboard Review / Video Edit handoff.
10. Enable run-one-node and run-one-shot execution.
11. Promote music/SFX/voice changer/STT/captions/delivery variants only after full-matrix adapter tests pass.

This keeps the system flexible and avoids one large risky cutover.
