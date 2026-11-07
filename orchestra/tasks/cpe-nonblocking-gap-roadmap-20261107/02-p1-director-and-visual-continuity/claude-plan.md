# P1 Implementation Plan — Director and Visual Continuity

## Outcome and requirement ledger

| ID | Requirement | Existing state | Completion predicate |
|---|---|---|---|
| CPE-01/02 | Shot director, composition, camera and motion intent | Scene intent, Smart Director and motion contracts exist; end-to-end chain not proven | Shot facts flow through one existing contract to image/video prompts; optional failure uses baseline |
| CPE-03/16 | Lighting/color, look-lock, reusable style presets | Look-lock and preset code/UI exist; full projection/old-series parity unverified | A versioned style selection projects consistently and old/flag-off records remain byte-compatible |
| CPE-04/05/06 | Character, wardrobe, prop, scene and location consistency | Identity, object reference and Feature 138 continuity components exist | Required facts and refs persist across shot edits and renders; missing/stale data warns/falls back, never aesthetic-blocks |
| CPE-07 | First/last-frame planning | Start/stop frame paths and Feature 167 exist; canonical ledger unresolved | Optional frame absent/failure chooses a supported baseline mode and does not hide a valid start frame |
| CPE-08 | Compatible multi-model routing | Registry, capability and transport boundaries exist | Every route/fallback passes configured model, tenant, capability and budget constraints |
| CPE-09 | Preview and user-controlled approval | Existing storyboard workspace and actions exist | CPE proposal is inspectable and optional; explicit approval/reject/cancel is preserved |

## Sequence

1. Reconcile canonical requirements for Features 137/138/140/167/170/173 and Quick 191/186. Inspect runtime and UI source before using existing plan statements.
2. Extend the current `generateRealStoryboard` scene-intent contract only where actual shot fact/style gaps remain. Validate the result against the current storyboard revision; merge only allowed generated fields and preserve user edits.
3. Project accepted visual canon, style, character, wardrobe, prop and location facts through existing start-frame/video-prompt contracts. Reuse role-specific asset resolution and tenant-owned references.
4. Reconcile first/last-frame behavior with supported model capabilities and existing approval controls. Missing stop frame or optional plan uses the selected model's normal supported mode.
5. Complete compatible provider routing from registry facts. No fallback to unavailable, disabled, tenant-disallowed, unsafe, incompatible, or over-budget models.
6. Wire preview/status into the existing storyboard UI. No new mandatory approval or global wait state; optional decline uses existing storyboard values.
7. Add flag-off, stale revision, invalid schema, missing/deleted asset, model capability and cancellation tests; run focused backend/UI checks before rollout.

## Owned paths

Potential shared contracts in `apps/web/shared/verticalDramaSeries/`; `apps/web/server/services/verticalDramaEpisodePipeline.ts`, `verticalDramaShotSceneIntent.ts`, `verticalDramaSceneContinuityLock.ts`, `verticalDramaSceneVisualState.ts`, `verticalDramaStartFrameGeneration.ts`, `verticalDramaVideoMotionPromptGeneration.ts`, model registry/provider routing, and existing `VerticalDramaStoryboardPanel.tsx` controls. Existing canonical specs remain authoritative for their requirement IDs.

## Dependencies

P0 contract complete. P2 consumes accepted shot/style/revision lineage. P4 consumes provider and budget observations but does not block P1 integration.

## Definition of done

The creator can choose or decline a CPE shot/style proposal using existing UI patterns; current prompts/reference contracts receive only valid current-revision data; normal image/video actions are unchanged for CPE off/failure; all hard provider, tenant, credit, safety and manual approval controls still apply; tests cover model families and old persisted records.

No production deployment is part of this phase.
