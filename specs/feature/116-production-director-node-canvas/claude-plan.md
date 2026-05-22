# Implementation Plan: Production Director Node Canvas

## Overview

Production Director becomes a project-level planning workspace, not a provider form. The implementation must preserve existing Image, Video, Audio, Storyboard Review, Video Edit, provider assets, and Gemini Omni behavior while adding a durable `ProductionSpace` layer above them.

The practical path is incremental:

1. Add shared contracts and validators.
2. Add versioned persistence and router/service APIs.
3. Extract Production UI into dedicated components.
4. Add a separate Video Shot workspace.
5. Render and edit a React Flow canvas from fixture planner output.
6. Add node config mode for Image, Video, and basic TTS first.
7. Add typed handoff payloads to Storyboard Review and Video Edit.
8. Add operational gates before enabling live planner, live handoff, or execution.

## Current State To Preserve

Existing working surfaces:

- `apps/web/shared/mediaProduction.ts` contains interim production goal/status/readiness helpers.
- `apps/web/server/routers/mediaProduction.ts` persists production runs, goals, plans, verifications, approvals, and output projections.
- `apps/web/client/src/pages/MediaStudio.tsx` contains the current interim Production Director.
- `apps/web/server/routers/mediaProviderAssets.ts` and `apps/web/server/services/mediaProviderAssetService.ts` manage provider assets.
- `apps/web/shared/geminiOmni.ts` validates Gemini Omni references and payloads.
- Storyboard Review to Video Edit conversion already exists in `apps/web/client/src/lib/storyboardVideoProject.ts`.

Do not break existing standalone Image, Video, Audio, Gemini Omni, provider asset, Storyboard Review, or Video Edit flows.

## Architecture

### Shared Contract Layer

Extend `apps/web/shared/mediaProduction.ts` with Feature 116 contracts:

- `ProductionSpace`
- `ProductionBrief`
- `ProductionContextAsset`
- `ProductStoryboardAsset`
- `ProductClaimEvidence`
- `ProductClaimEvidenceMap`
- `ProductionShot`
- `ProductionShotProductUse`
- `ProductionProductEvidenceManifest`
- `ProductionFlowCanvas`
- `ProductionFlowNode`
- `ProductionFlowEdge`
- `ProductionNodeToolBinding`
- `ProductionNodeConfigSnapshot`
- `ProductionReferenceInput`
- `ProductionNodeOutputRef`
- `ProductionDownstreamResultRecord`
- `ProductionActionAttempt`
- `ProductionCapabilityRegistry`

Add validators/helpers:

- validate a complete space,
- validate graph edges and cycles,
- compute shot readiness,
- compute node readiness,
- compute Gemini Omni reference-unit and pricing-branch warnings from node config,
- compute approval invalidation,
- build idempotency keys,
- derive Storyboard Review and Video Edit handoff payloads,
- normalize Feature 115 selected product images into product storyboard assets,
- validate shot product use and claim/evidence maps.

### Persistence Layer

Add versioned storage for the full `ProductionSpace`.

Preferred MVP data model:

- keep `mediaProductionRuns` as the run/status/search index;
- add `mediaProductionSpaces` with tenant/user/run IDs, version, schema version, full space JSON, summary fields, thumbnail URL, status, created/updated metadata;
- keep existing goal/plan/version records for compatibility and migration;
- store product storyboard assets inside the versioned space for MVP;
- add projections later only if query needs justify them.

Every write requires expected versions and returns typed conflict details.

### Service Layer

Create focused services under `apps/web/server/services/`:

- `productionSpaceService`
- `productionPlanningContextService`
- `productionCanvasValidationService`
- `productionNodeConfigService`
- `productionSurfaceAdapterRegistry`
- `productionHandoffProjectionService`
- `productionDownstreamResultService`
- `productionLegacyCompatibilityService`
- `productionExecutionPlanService`
- `productionArchiveExportService`
- `productionObservabilityService`
- `productionProductStoryboardBridgeService`

The router should be thin. Shared validation and state transitions should not live only in React components.

### Router Layer

Extend `mediaProductionRouter` with:

- `getSpace`
- `saveSpace`
- `saveBrief`
- `saveShot`
- `getNodeConfig`
- `saveNodeConfig`
- `saveCanvasLayout`
- `validateSpace`
- `executePlanner`
- `executeVerifier`
- `getCapabilityRegistry`
- `projectSpaceOutput`
- `importDownstreamResultRecord`
- `adaptLegacyRunToProductionSpace`
- `archiveProductionProject`
- `restoreProductionProject`
- `deleteProductionProject`
- `exportProductionProject`
- `repairProductionOutputRefs`

All procedures enforce tenant/user ownership and feature flags.

### Client Layer

Extract Production code out of `MediaStudio.tsx` into:

```text
apps/web/client/src/features/media-production/
  components/
  hooks/
  adapters/
  lib/
  __tests__/
```

Primary components:

- `ProductionWorkspace`
- `ProductionProjectHeader`
- `ProductionBriefPanel`
- `ProductionContextAssetBoard`
- `ProductEvidenceTray`
- `ProductionPlannerPanel`
- `ProductionCanvas`
- `ProductionNodeDrawer`
- `ProductionShotGroupNode`
- `VideoShotWorkspace`
- `ShotListPanel`
- `ShotBuilderPanel`
- `ShotChildNodeList`
- `NodeConfigureBanner`

Primary hooks:

- `useProductionSpace`
- `useProductionShot`
- `useProductionCanvas`
- `useProductionNodeConfig`
- `useProductionToolHandoff`
- `useProductionAssetDrop`
- `useProductStoryboardEvidence`
- `useDownstreamResultImport`

`MediaStudio.tsx` should become the tab shell and compatibility bridge rather than the location for all Production logic.

## UX State Matrix

Production tab states:

- no project: show goal-first empty state, create/open/search actions;
- draft project: show brief, asset board, planner controls, save state;
- planning: disable destructive edits, show progress and cancellation/retry if supported;
- plan ready: show canvas, shot timeline, verifier summary, approve/revise;
- verification blocked: show blocking issues by shot/node/product/provider;
- approved: allow handoff/configuration/execution according to rollout gates;
- conflict: show reload latest, compare summary, save as new version where allowed;
- feature disabled: show read-compatible state and safe return to standalone tabs.

Video Shot states:

- no project selected: show select/create/open actions only;
- no shot selected: show ordered shot list and missing requirements;
- stale shot ID: show reload/open list/back actions;
- selected shot: show shot builder, child nodes, readiness, save, apply-to-child controls;
- locked shot: show read-only fields unless user unlocks or replans with confirmation.

Node config mode states:

- valid route params: load only that node snapshot and show `Save to Node`;
- missing route params: open normal standalone tab and hide `Save to Node`;
- stale versions: block save, show conflict, offer reload/latest or save-as-new when safe;
- generated output while in node mode: attach output to active node only.

## UI/UX Release Gate

The UI/UX gate is mandatory before deep-implement can claim Feature 116 complete.

Required surface contracts:

- Production Workspace: target user/JTBD, project header/search/save/new, journey stepper, state matrix, copy contract, responsive behavior, and token strategy.
- React Flow Canvas: canvas, node drawer, list fallback, invalid-edge recovery, keyboard/list equivalents for pointer actions, and accessible names for nodes/toolbars.
- Video Shot Workspace: no-project, no-shot, stale-shot, selected-shot, locked-shot, product-blocked, conflict, and back-to-production states.
- Node Drawer / Node Config Mode: Configure, Save to Node, Back to Production, stale conflict, disabled post-MVP adapters, output attachment, and standalone mode.
- Product Evidence Tray: product identity, image roles, fidelity risk, claim/evidence linking, approvals, blockers, recovery, and project/shot conflicts.
- Handoff / Execution / Export: preview-only handoff, live-disabled states, credit confirmation, progress/failure/cancel/retry, safe export, archive, restore, and delete confirmations.

Required responsive evidence:

- 390x844 mobile,
- 768x1024 tablet,
- 1280x800 laptop,
- 1440x900 desktop.

Required accessibility evidence:

- keyboard-only canonical journey,
- drawer/dialog focus trap and focus return,
- icon-only accessible names and tooltips,
- contrast and dark/light readability,
- reduced-motion behavior,
- axe/WCAG check or documented manual equivalent.

Required canonical journey proof:

1. Create goal.
2. Add asset and product evidence.
3. Render fixture plan.
4. Edit/reconnect via canvas/list fallback.
5. Configure Image, Video, and basic TTS node.
6. Save to Node.
7. Approve plan.
8. Preview handoff.
9. Verify zero provider-generation credit spend before explicit generation confirmation.

Evidence path:

```text
specs/feature/116-production-director-node-canvas/implementation/ui-browser-evidence.md
```

Skipped browser checks must be marked skipped with reason and residual risk. They are not pass results.

## Video Shot Mutation Rules

Reorder:

- update shot `order` values and sequence edges;
- preserve child node IDs/config snapshots/output refs;
- increment space version and affected shot sequence version;
- do not invalidate approved child outputs unless timing/cue sheet materially changes.

Duplicate:

- create a new shot ID;
- clone child nodes with new node IDs and new config snapshot IDs;
- clear generated outputs by default;
- preserve references and prompts;
- record source shot ID in metadata.

Split:

- create two shots from one;
- distribute duration, story purpose, product use, and child nodes according to user choice;
- rewire edges so upstream dependencies point to the first split shot and downstream dependencies leave the second;
- lock existing outputs unless user explicitly moves them.

Merge:

- create one resulting shot or update the first shot;
- preserve both source shot IDs in metadata;
- merge child node lists in dependency order;
- detect duplicate output roles and require user choice.

Lock/unlock:

- locked shots and locked nodes cannot be overwritten by replanning;
- replanning can suggest changes as pending patches;
- unlock is a material change and may invalidate approval.

## Canonical Node Binding

Section 13 is canonical.

Every executable node has:

- `surface`
- `mode`
- `adapterId`
- `canConfigure`
- `canGenerate`
- `canSaveToNode`
- `requiresApprovalBeforeGenerate`
- `configSchemaVersion`
- `outputSchemaVersion`
- provider/capability metadata where applicable.

Planner output may suggest bindings; server normalization validates them against the capability registry before saving.

## Provider Capability Rules

Capability registry must include:

- media model ID,
- provider,
- operation type,
- supported input kinds,
- supported output kinds,
- duration/resolution/aspect support,
- reference unit rules,
- provider payload keys,
- pricing tiers and pricing branch logic,
- feature flags,
- readiness blockers and warnings.

Gemini Omni-specific readiness blocks:

- more than 7 reference units;
- more than one source video;
- more than three character IDs;
- source video missing public/provider-fetchable URL;
- unsupported trim or duration;
- invalid character/audio asset capability;
- unresolved product evidence for product shots.

For audio IDs, fail safe at one ID until the Kie contract is confirmed or admin metadata explicitly permits a higher limit.

## Handoff Contracts

Add typed payloads:

- `ProductionStoryboardReviewHandoffPayload`
- `ProductionVideoEditHandoffPayload`

Both include:

- schema version;
- production run and space version;
- idempotency key;
- ordered shots;
- shot metadata;
- selected/generated clip refs;
- audio refs;
- caption/subtitle refs;
- cue sheet;
- transitions;
- QA summaries;
- product evidence manifests;
- warnings and blockers;
- source node/output refs.

Repeated handoff should return the existing downstream target if the source output hash matches.

Disabled handoff targets must render a clear disabled state and preserve the approved ProductionSpace.

Downstream result import must:

- verify source run and source space version;
- update selected takes, trims, captions, product warning resolution, and manual approvals;
- return conflict when the source version is stale;
- never overwrite locked shot/node configs without explicit user confirmation.

## Phase Plan

### Phase 0: Guardrails And Canonical Planning Artifacts

Deliver:

- feature flag inventory;
- Feature 116 flag truth table and kill-switch precedence for disabled/read-safe/fixture/live modes;
- canonical `claude-*` deep-plan artifacts;
- valid section manifest;
- Section 16 work packets;
- phase ordering correction.

### Phase 1: Shared Contracts And Tests

Deliver:

- `ProductionSpace` and related shared types;
- validators/readiness helpers/idempotency helpers;
- Gemini Omni capability validation bridge;
- shared unit tests.

### Phase 2: Persistence And Services

Deliver:

- `mediaProductionSpaces` migration;
- `productionSpaceService`;
- legacy adapter from old runs to minimal ProductionSpace;
- optimistic locking and conflict types;
- mutating router authorization/tenant-isolation tests;
- migration backfill, rollback/read-safe, no-data-loss, and schema-version upgrade tests;
- router/service tests.

### Phase 3: Capability Registry And Skill Schemas

Deliver:

- capability registry from media models, skills, provider assets, and downstream surfaces;
- planner/verifier schema upgrades;
- deterministic fixtures for story, product review, marketplace product, lip-sync, and b-roll;
- skill verify scripts pass.

### Phase 4: Production Workspace Shell

Deliver:

- extracted Production workspace components;
- exclusive Production tab;
- project header/search/save/open/new;
- brief panel;
- no nested Image/Video/Audio controls.

### Phase 5: Context Assets And Product Evidence

Deliver:

- typed drag/click payloads;
- character search source;
- context asset board;
- product evidence tray;
- Feature 115 handoff normalization and gates.

### Phase 6: Video Shot Workspace

Deliver:

- Video Shot tab;
- shot list;
- shot builder;
- mutation rules for reorder/duplicate/split/merge/lock;
- shot readiness display.

### Phase 7: React Flow Canvas

Deliver:

- canvas renderer from fixture planner output;
- node/edge editing;
- node drawer;
- layout save;
- mobile/list fallback;
- graph validation warnings.

### Phase 8: Node Config Mode MVP

Deliver:

- Image node adapter;
- Video node adapter;
- basic TTS node adapter;
- `Save to Node`;
- route/query params and conflict handling;
- output attachment to active node.

### Phase 9: Handoff Payloads In Safe Mode

Deliver:

- typed Storyboard Review and Video Edit payload builders;
- shared server-safe `productionHandoffBuilders` mapper;
- snapshot tests;
- idempotent open-existing behavior;
- disabled-target behavior;
- no live execution dependency yet.

### Phase 10: Operational Gates

Deliver:

- audit/metrics events;
- archive/restore/delete/export;
- stale output ref repair;
- kill switches;
- Thai/English labels for new states;
- accessibility/list fallback coverage.

### Phase 11: Live Planner, Live Handoff, And Limited Execution

Only after Phase 10 gates pass:

- enable live planner/verifier behind flags;
- enable Storyboard Review / Video Edit handoff;
- enable run-one-node / run-one-shot execution;
- integrate run-one-node/run-one-shot with existing media generation, media task status/cancellation, credit reservation/refund/reconciliation, and provider polling/status paths;
- keep batch execution behind a separate flag.

## Testing Strategy

Use TDD per section:

- write shared contract tests before shared implementation;
- write router conflict tests before router implementation;
- write router authorization/tenant isolation tests before mutating procedure implementation;
- write migration/backfill/rollback/schema-version tests before enabling migration writes;
- write skill fixture tests before live planner usage;
- write UI tests for Production exclusivity before extracting the UI;
- write node config roundtrip tests before enabling generate from node mode;
- write handoff payload snapshot tests before creating downstream records.
- write scheduler credit/refund/cancel/retry tests before enabling provider-credit-spending execution.

Quality gates:

- targeted Vitest tests for touched files;
- full web typecheck with 8GB Node heap;
- skill verify scripts for changed app skills;
- `git diff --check` for touched plan/source files.

## Rollout Constraints

- No provider-generation credits during planning, verification, layout, shot editing, or Save to Node.
- Live handoff/execution remains disabled until operational gates pass.
- Existing Image/Video/Audio workflows remain usable when Production flags are off.
- Legacy production runs open through compatibility adapter before any backfill.
- Product truth gates block product-related generation and handoff until evidence is sufficient or warnings are explicitly accepted.
- MVP node config adapters are Image, Video, and basic TTS only. Music, SFX, voice changer, STT, captions, delivery variants, and full node matrix adapters remain deferred until full-matrix gates pass.
- Handoff live mutation uses shared server-safe builders; client-only Video Edit helper code cannot be imported into server routers.
- Production execution must reuse existing media generation, credit, status, cancellation, and reconciliation paths rather than duplicate provider infrastructure.
