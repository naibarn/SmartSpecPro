# P1 Implementation Spec — Director and Visual Continuity

## Accepted outcome

Make the existing director, scene intent, look-lock, reference, camera, motion, first/last-frame, and provider capability components behave as one optional storyboard-to-render enhancement. The first seam is `VerticalDramaEpisodePipeline.generateRealStoryboard` before persistence. Enrichment is additive and bounded. Original storyboard, image-prompt, and video-prompt contracts remain the automatic fallback.

## User-facing behavior

Creators can preview cinematic shot/style suggestions in the existing storyboard UI and apply them within the existing user-controlled approval behavior. A CPE failure or decline returns to existing story/shot intent. Image/video actions remain available subject only to existing hard conditions.

## Existing source to reconcile and reuse

- `verticalDramaShotSceneIntent.ts` plus `generateRealStoryboard` (already integrated and catches optional failure).
- `verticalDramaSceneContinuityLock.ts`, `verticalDramaSceneVisualState.ts`, and `generateRealStartFramePlan`.
- `verticalDramaVideoMotionPromptGeneration.ts`, `verticalDramaStartFrameGeneration.ts`, shared motion/identity contracts.
- `shared/verticalDramaSeries/seriesLookLock.ts`, current presets, character stock, location stock, object references and scene facts.
- Model registry/capabilities and current provider/media transport routing.
- `VerticalDramaStoryboardPanel.tsx` and existing explicit approve/reject/cancel controls.

## Non-goals

No separate CPE rendering system, new unconfigured model fallback, quality-based generation gate, mandatory approval, or automatic paid regeneration. Do not overwrite user-authored storyboard/style values or weaken reference ownership, content safety, billing, or provider-capability checks.

## Acceptance

Valid authored data improves the existing storyboard/prompt inputs. Disabled, failed, malformed, stale, over-budget, or unapproved optional enhancement preserves the existing base contract. Provider routing uses only explicitly configured authorized models compatible with the actual reference, duration and resolution requirements.
