# P1 — Director, Style and Visual Continuity

## Goal

Unify existing cinematic intent and visual-continuity components into a coherent, optional storyboard-to-render enhancement without adding prerequisites to image or video generation.

## Scope

Close source-verified gaps for AI director/shot intent, shot composition and camera movement, lighting/color and series style, cast/wardrobe/prop/location facts, first/last-frame planning, compatible model routing, preview and current user-controlled approvals, and reusable style presets/templates. Reconcile Feature 137/138/140/167/170/173 and existing look-lock, prompt, object-reference and UI work before editing.

Exclude a separate renderer, a new mandatory approval, automatic model switching to an unconfigured provider, and redesign of existing approval/cancel behavior.

## User-Facing Behavior

Users can inspect and optionally apply director/style suggestions in the existing storyboard workspace. If CPE is off, returns invalid/stale data, or times out, the existing storyboard and generation buttons continue using the current prompt and reference rules. Existing explicit approval settings remain authoritative.

## Technical Constraints

- First extension seam: `VerticalDramaEpisodePipeline.generateRealStoryboard` before storyboard persistence.
- Scene-state enrichment seam: `generateRealStartFramePlan`; invalid optional continuity data falls back to storyboard facts.
- Reuse `verticalDramaShotSceneIntent.ts`, `verticalDramaSceneContinuityLock.ts`, `verticalDramaSceneVisualState.ts`, `verticalDramaStartFrameGeneration.ts`, `verticalDramaVideoMotionPromptGeneration.ts`, shared series look-lock and character/object/location references.
- Reuse model-registry capabilities for references, duration, resolution and transport; never infer capability from model names.
- Preserve user edits and current plan revisions; add schema only when no safe existing JSONB contract can carry the needed versioned fields.

## Dependencies

P0 safety/fallback contracts and reconciled ownership of existing specs.

## Outputs

Validated optional director/shot facts, style snapshot and render projections; existing UI preview wiring; explicit fallback to original storyboard and prompt when enrichment is absent or invalid.

## Edge Cases

- The series look lock changes after an episode's storyboard was drafted.
- A wardrobe/prop reference is deleted or belongs to another tenant.
- A model supports the prompt but not the required number of references or duration.
- A stop frame is absent or generation fails while the selected model supports first-frame-only mode.
- A user-edited shot conflicts with generated director intent.

## Error Handling

Ignore stale optional overlays, preserve user-authored data, select only explicitly configured compatible providers, and keep the current image/video path available. Existing hard safety and ownership violations remain blocking.

## Testing Expectations

Cover round-trip/feature-off parity, shot facts to prompts, style/reference projection, stale revision, invalid JSON, timeouts, provider capability and flag combinations. Include representative Thai dialogue and multi-character, wardrobe, prop and location fixtures. Prove no new approval or wait state.
