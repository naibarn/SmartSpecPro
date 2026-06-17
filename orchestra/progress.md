# Progress

[COMPLETE] wave-1-hyperframes-overlay-audio — Reproduced and fixed duplicate first-shot overlay text and silent final composite output.

## HyperFrames Evidence
- Root cause confirmed in generated final composite HTML: source `<video>` clips were emitted with `muted` even when `preserveNativeAudio` was true.
- Root cause confirmed for duplicate text: shot 1 emitted `.shot-copy` underneath the global `hook-layer` when hook and per-shot text were both enabled.
- Worker output probe previously accepted MP4s with video+duration even when the config expected audio, allowing silent renders to be marked completed.

## HyperFrames Fix
- Final composite builder bumped to v7.
- Source videos preserve native audio unless explicitly disabled.
- Shot-1 copy is suppressed when hook layer owns the first-shot overlay.
- Worker now fails closed with a clear audio probe error when expected audio is absent from the rendered MP4.

[COMPLETE] wave-2-marketplace-preflight-policy — Fixed child-reference prompt preflight false positives while preserving minor safety enforcement.

## Marketplace Evidence
- Previous preflight policy treated `@Image2` child references as `character_reference_age_role_mismatch`.
- The intended rule is not "no child image"; it is "no unsafe or underdressed minor framing."

## Marketplace Fix
- Adult @Image2 references with explicit no-child wording pass without triggering minor-safety detection.
- Prompts that introduce a baby/toddler/child/minor must include `MINOR SAFETY CLOTHING LOCK`.
- Child/minor @Image2 references are allowed only under the safety clothing lock policy.

## Verification
- `hyperframesCompositionService.test.ts`: 6 passed.
- `hyperframesWorkerPolicy.test.ts`: 14 passed.
- `marketplaceAutoReviewService.test.ts`: 180 passed.
- `marketplaceAutoReviewReferenceEvidence.test.ts`: 2 passed.
- `npm run check`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.

[COMPLETE] wave-3-marketplace-reference-skill-qa — Checked real Marketplace Auto Review data and fixed reference/category/QA handoff root causes.

## Marketplace Run Evidence
- Product `mp_498882252361e566b847bd33de7dca00` is a newborn/baby romper. DB stored `productCategory=fashion_clothing`, while real marketplace path is `Baby & Maternity > Baby Clothing & Shoes > Bodysuits & One-pieces`.
- Latest run `mar_0fdc644e95909f055efa7a4c493044e0` selected uploaded reference mode. The skill path was not fallback: `selectedSkill=product-reference-storyboard`, `fallbackUsed=false`, schema audit passed, and input keys included `reference_product_images` and `reference_character_images`.
- The character image was correctly sent as `@Image2=character`, but skill runtime category was `fashion_clothing`.
- Provider prompts included a character identity lock for `@Image2`, but grid QA only checked layout. Because the invalid grid skipped per-shot QA, character identity mismatch could be missed and the system selected a warning handoff after three repair-required attempts.

## Fix
- Baby/bodysuit marketplace evidence now overrides generic `fashion_clothing` to `mother_baby` for product-reference-storyboard skill input.
- Storyboard grid vision QA now attaches the generated grid plus approved product/character references and asks for `productMatchesReference` and `characterConsistencySafe`, not layout-only verdicts.
- Character/product reference mismatch reason codes now block best-attempt selection and cannot be handed off as `accepted_with_warnings` after repair budget exhaustion.

## Verification
- `npm test --workspace=@smartspec/web -- marketplaceAutoReviewService.test.ts -t "baby bodysuit|character reference mismatch|repair budget"`: passed.
- `npm test --workspace=@smartspec/web -- marketplaceAutoReviewService.test.ts`: 184 passed.
- `npm run check --workspace=@smartspec/web`: passed.
- `git diff --check`: passed.

[COMPLETE] wave-4-hyperframes-preview-render-overlay-parity — Tightened HyperFrames preview/render text contract and added configurable text motion.

## HyperFrames Evidence
- Root cause confirmed in the final composite HTML: preview showed badge/title/hook/chip layers, while final render used a different `hook-layer` with only main/sub text.
- Shot 1 copy suppression prevented the third preview text group from reaching the final render when hook mode owned the first shot.
- Prompt generation with the HyperFrames skill did not receive text-motion settings, so generated prompt copy could drift from UI-selected motion.

## HyperFrames Fix
- Added `textMotionPreset` to the runtime schema at both final config and per-shot levels.
- Storyboard Review now autosaves, hydrates, previews, payload-previews, and submits global/per-shot text-motion settings.
- Final composite HTML now emits preview-equivalent hook layers: badge, main title, yellow hook/sub text, and bottom chip.
- Motion presets are configurable: slide right-to-left, slide left-to-right, stagger rise, pop scale, wipe reveal, or none.
- Shot text animation is scoped to active shots; hook animation starts at the first-shot hook layer.

## Verification
- `npm test -- --run server/services/__tests__/hyperframesCompositionService.test.ts shared/hyperframes/__tests__/runtimeApiSchemas.test.ts --reporter=dot`: 16 passed.
- `npm run check`: passed.
- `npm run build`: passed.
- `npm run hyperframes:fixture-render`: passed with official HyperFrames CLI, `hasVideo=true`, `hasAudio=true`, safe area passed.
- `git diff --check`: passed.

[COMPLETE] wave-5-hyperframes-text-motion-state-schema — Fixed render-blocking textVariables validation for new text-motion fields.

## HyperFrames Evidence
- User-facing error was a real Zod validation rejection from `reviewData.hyperframesFinalComposite.patch.textVariables`.
- The frontend submitted `textMotionPreset` and `perShotTextMotionPreset`, but `HyperframesFinalCompositeTextVariablesSchema` still used `.strict()` without those keys.
- Because autosave/persist failed before render, the render button could appear usable while the server rejected the state patch.

## Fix
- Added `textMotionPreset` and `perShotTextMotionPreset` to the server-owned Storyboard Review HyperFrames state schema.
- Kept validation strict by using the same exact text-motion enum as final composite config instead of allowing arbitrary strings.
- Added regression coverage for the exact UI variables sent before render.

## Verification
- `npm test -- --run shared/hyperframes/__tests__/storyboardReviewState.test.ts --reporter=dot`: 5 passed.
- `npm test -- --run shared/hyperframes/__tests__/storyboardReviewState.test.ts shared/hyperframes/__tests__/runtimeApiSchemas.test.ts server/services/__tests__/hyperframesCompositionService.test.ts --reporter=dot`: 21 passed.
- `npm run check`: passed.
- `git diff --check`: passed.

[COMPLETE] wave-6-hyperframes-overlay-lifetime-label-removal — Removed debug shot labels from preview/render and scoped decorative overlay lifetime to text.

## HyperFrames Evidence
- Final composite HTML rendered a user-visible `SHOT 1 · KINETIC BOLD HOOK` hook badge.
- The first shot suppressed shot copy when the hook layer owned the opening text, but the shot-level `.shade` layer still rendered for the full shot duration.
- That made the dark left panel and yellow diagonal accent remain after the hook text layer ended, while subtitles should remain independent.

## Fix
- Removed the hook badge/debug label from both Storyboard Review preview and final composite HTML.
- Shot-level decorative `.shade` now renders only when that shot actually has overlay copy.
- Hook-owned kinetic decorations moved into the 3-second hook layer, so the dark/yellow accents disappear with hook text.
- Per-shot overlay decorations are wrapped in an `overlay-copy-layer` with a 3.2s lifetime that starts only when each shot becomes active, separate from subtitle cues.
- Refined poor-quality preset layouts after the first three presets:
  - `spec_highlight` now uses top punch text with yellow/white stroked copy inspired by short-form UGC examples.
  - `electronics_spec_stack`, `split_product_specs`, `feature_cards`, and `badge_cascade` now have distinct layouts instead of repeated pill styles.
  - `lower_third_review`, `price_impact`, and `hero_price_billboard` are lifted above the subtitle safe area.
- Added new preset ids supported by schema, UI preview, final HTML render, and worker policy:
  - `creator_top_punch`
  - `white_intro_card`
  - `tech_signal_map`
- Bumped final composite builder version to `hyperframes_final_composite_builder_v14`.

## Verification
- `npm test -- --run shared/hyperframes/__tests__/storyboardReviewState.test.ts shared/hyperframes/__tests__/runtimeApiSchemas.test.ts server/services/__tests__/hyperframesCompositionService.test.ts server/services/__tests__/hyperframesWorkerPolicy.test.ts server/routers/__tests__/videoEditorProjects.storyboardReview.test.ts --reporter=dot`: 56 passed.
- `npm run check`: passed.
- `git diff --check`: passed.

[COMPLETE] wave-9-hyperframes-text-layer-source-of-truth — Made Text layer selection, preview, prompt payload, and render semantics match.

## HyperFrames Evidence
- The UI label for `hook_and_per_shot` implied "overlay every shot", but final composite HTML suppressed shot 1 overlay whenever the hook layer was enabled.
- Thumbnail/live previews and prompt/payload previews used raw per-shot overlay text in places that did not consistently reflect the selected `textMode`.
- This made users unable to trust whether a selected Text layer mode would match the final render.

## Fix
- Added a client-side render overlay resolver so generated prompts, prompt signatures, skill dynamic params, payload preview, thumbnails, live preview, and final render config use the same text-mode rules.
- Updated Text layer labels/descriptions to explain the exact behavior:
  - Hook 3 seconds + overlay every shot
  - Hook only on shot 1
  - Per-shot overlay on every shot
  - No hook/overlay
- Changed `hook_and_per_shot` semantics to render overlay for every shot. For shot 1, final composite HTML now defers the shot overlay until after the 3-second hook instead of suppressing it.
- Updated live-preview helper text and per-shot edit helper copy so users can see whether the selected shot will render overlay/subtitle.
- Updated regression coverage to assert shot 1 uses `data-shot-copy-deferred="after-hook"` and still emits its own overlay copy.

## Verification
- `npm test -- --run server/services/__tests__/hyperframesCompositionService.test.ts server/services/__tests__/hyperframesWorkerPolicy.test.ts shared/hyperframes/__tests__/runtimeApiSchemas.test.ts shared/hyperframes/__tests__/storyboardReviewState.test.ts --reporter=dot`: 38 passed.
- `npm test -- --run shared/hyperframes/__tests__/storyboardReviewState.test.ts shared/hyperframes/__tests__/runtimeApiSchemas.test.ts server/services/__tests__/hyperframesCompositionService.test.ts server/services/__tests__/hyperframesWorkerPolicy.test.ts server/routers/__tests__/videoEditorProjects.storyboardReview.test.ts --reporter=dot`: 56 passed.
- `npm run check`: passed.
- `npm run hyperframes:fixture-render`: passed using Node v22.22.3, HyperFrames CLI 0.6.95, official runtime, playable MP4 with video+audio, safe-area overflow count 0.
- `npm run hyperframes:snapshot-test`: passed against the official fixture manifest.
- `git diff --check`: passed.

[COMPLETE] wave-7-hyperframes-shot-map-live-preview — Added per-shot live thumbnails, replay, and a UGC center text preset.

## HyperFrames Evidence
- The useful preview was still below prompt/payload/SFX controls, so selecting a preset required scrolling away from the preset controls before the user could see the result.
- User-reported thumbnail overflow was reproducible with DOM measurement. Real out-of-frame thumbnail issues were found in:
  - `electronics_spec_stack`
  - `split_product_specs`
  - `badge_cascade`
- Other presets mostly had line-clamp truncation, not layout escaping, but thumbnails still looked abruptly cut because they used no ellipsis.

## Fix
- Added `ugc_center_stack` preset across schema, Storyboard Review UI, final composite HTML render, and worker preset validation.
- Added per-shot rendered thumbnail previews directly in the Shot text map using the shot's own overlay preset, text motion, video, overlay text, and subtitle-derived fallback.
- Added a Shot text map `Replay preview` control that restarts animation for every shot thumbnail and the selected-shot live preview.
- Kept the larger live preview beside the selected-shot controls for detailed inspection.
- Fixed thumbnail overflow by resetting preset-specific width/transform behavior for `electronics_spec_stack`, `split_product_specs`, and `badge_cascade`.
- Thumbnail text now uses ellipsis instead of silent hard truncation.
- Added final-render CSS guards for long text: overlay/subtitle blocks use `box-sizing`, `overflow-wrap:anywhere`, and `word-break:break-word`.
- Bumped final composite builder version to `hyperframes_final_composite_builder_v15`.

## Verification
- Playwright DOM overflow scan: passed for 18 overlay presets.
- `npm test -- --run shared/hyperframes/__tests__/storyboardReviewState.test.ts shared/hyperframes/__tests__/runtimeApiSchemas.test.ts server/services/__tests__/hyperframesCompositionService.test.ts server/services/__tests__/hyperframesWorkerPolicy.test.ts server/routers/__tests__/videoEditorProjects.storyboardReview.test.ts --reporter=dot`: 56 passed.
- `npm run check`: passed.
- `git diff --check`: passed.

[COMPLETE] wave-8-hyperframes-shot-map-layout-autosave — Moved selected-shot navigation to the right rail and enlarged live preview.

## HyperFrames Evidence
- The selected-shot thumbnails consumed the top of the editor, while the live preview was too small and visually separated from the controls users were changing.
- The live preview showed overlay styling but did not show burn-in subtitle styling, so users could not verify subtitle placement/style from the same selected-shot preview.
- Per-shot overlay/subtitle edits already flowed into the autosave snapshot, but leaving a text field did not force an immediate save flush.

## Fix
- Desktop Shot text map now uses a right-side shot selector rail, with the old horizontal selector retained only for smaller screens.
- The selected-shot live preview now uses a larger 9:16 preview stage and stays beside the preset/text controls.
- Burn-in subtitles are previewed inside the selected-shot live preview using the same subtitle preset styles as the dedicated subtitle preview.
- Overlay and subtitle textareas now trigger an immediate HyperFrames final composite autosave flush on blur, while keeping the existing debounced autosave path.

## Verification
- `npm test -- --run shared/hyperframes/__tests__/storyboardReviewState.test.ts shared/hyperframes/__tests__/runtimeApiSchemas.test.ts server/services/__tests__/hyperframesCompositionService.test.ts server/services/__tests__/hyperframesWorkerPolicy.test.ts server/routers/__tests__/videoEditorProjects.storyboardReview.test.ts --reporter=dot`: 56 passed.
- `npm run check`: passed.
- `git diff --check`: passed.

[COMPLETE] wave-10-hyperframes-text-clarity-subtitle-size — Clarified Hook/Overlay/Subtitle editing and stopped subtitle truncation.

## HyperFrames Evidence
- Selected-shot preview and the lower render preview truncated subtitle text with short-line helpers, so long Thai subtitles looked incomplete before render.
- Overlay preview had fallback chip behavior that reused the hook/product line as an extra bottom chip when no third overlay line existed, making users see more text layers than the final render should own.
- Old video-generation prompt text could remain inside per-shot Overlay text and appear in preview/render config as on-screen copy.
- Final composite config did not expose subtitle font size, leaving users no practical way to fit longer subtitles without rewriting the sentence.

## Fix
- Added `subtitleFontSizePx` to HyperFrames final composite schema, Storyboard Review saved state, prompt/payload preview, final render config, and server HTML renderer.
- Added a `Subtitle size` selector with 28/34/40/46px choices and applied it to preview, prompt payload, saved config, and final render CSS.
- Subtitle preview now shows the full subtitle text instead of intentionally truncating it.
- Hook and Overlay editors now have explicit badges/helper copy:
  - Hook text edits the opening 0-3s hook on shot 1.
  - Overlay text edits the selected shot's on-screen overlay; for shot 1 in hook+overlay mode, it appears after Hook.
  - Subtitle/Voiceover edits the burn-in subtitle/voiceover line and shows the selected subtitle size.
- Removed the preview-only duplicate chip fallback so preview no longer invents an extra text layer from Hook/Product copy.
- Added prompt-like overlay detection and sanitization on both client and server. Video prompt text is warned about in UI and excluded from render HTML/config instead of being drawn as overlay text.

## Verification
- `npm test -- --run server/services/__tests__/hyperframesCompositionService.test.ts shared/hyperframes/__tests__/runtimeApiSchemas.test.ts shared/hyperframes/__tests__/storyboardReviewState.test.ts --reporter=dot`: 24 passed.
- `npm run check`: passed.
- `npm run hyperframes:fixture-render`: passed with official HyperFrames CLI 0.6.95, Node v22.22.3, playable MP4, video+audio present, safe-area overflow count 0.
- `npm run hyperframes:snapshot-test`: passed against the official fixture manifest.
- `git diff --check`: passed.

[COMPLETE] wave-11-hyperframes-overlay-draft-prompt-sanitization — Removed video prompt text at the source of per-shot Overlay text.

## HyperFrames Evidence
- SocratiCode narrowed the issue to `StoryboardReviewPage.tsx`.
- `shotSpecificHyperframesOverlayLines()` used `firstThaiProductLine(input.clip.prompt)` as an overlay fallback.
- Video clip prompts start with text like `Create a 5-second cinematic video...`, so auto-filled Overlay text inherited that line for every shot before render-time sanitization could help.
- Saved `textVariables.perShotText` could already contain stale prompt lines, so fixing only future draft generation would leave existing projects dirty.

## Fix
- Updated prompt-like detection to catch both `Create a...` and `Create an...` video prompt openings.
- `uniqueHyperframesOverlayLines()` now rejects prompt-like lines, so every draft path gets the same protection.
- `shotSpecificHyperframesOverlayLines()` no longer seeds overlay draft text from video-generation prompt lines.
- Saved per-shot overlay maps are sanitized during hydration.
- The auto-fill effect sanitizes existing per-shot overlay state; if removing the prompt line leaves a shot empty, it rebuilds a clean overlay draft from product/voice/subtitle context.
- Subtitle fallback now returns blank instead of using video prompt boilerplate when a clip has no extracted dialogue.
- Added a focused regression test proving:
  - overlay draft does not contain `Create a 5-second cinematic video`, `Use @Image1`, or `Use @Image2`;
  - stale saved per-shot text maps are cleaned before use.
  - video prompt boilerplate is not used as subtitle fallback.

## Verification
- `npm test -- --run client/src/pages/StoryboardReviewPage.hyperframesText.test.ts server/services/__tests__/hyperframesCompositionService.test.ts shared/hyperframes/__tests__/runtimeApiSchemas.test.ts shared/hyperframes/__tests__/storyboardReviewState.test.ts --reporter=dot`: 27 passed.
- `npm run check`: passed.
- `git diff --check`: passed.

[COMPLETE] wave-12-marketplace-storyboard-review-handoff-policy — Stopped minor-safety warnings from terminally blocking reviewable images.

## Marketplace Evidence
- SocratiCode was active and narrowed the flow to `marketplaceAutoReviewService.ts` and the focused Marketplace Auto Review tests.
- Real DB run `mar_f97356fdcc5b42ec34c4534429dcfc1b` failed in `image_generation` with `publish_safety_hard_blocker_after_repair_budget_exhausted`.
- The same run had generated image evidence: 3 completed direct image attempts, `storyboardGridUrl`, and 9 `storyboardFrameUrls`.
- The run did include both approved references in `referenceImageManifest`: product and uploaded character.
- The blocker was policy mixing: `imageRepairBudgetExhaustedAllowsStoryboardReviewHandoff()` returned false for publish-safety reason codes even when reviewable frames were ready.

## Fix
- Storyboard Review handoff now depends on complete reviewable frame evidence, not on absence of minor-safety/product/character QA reason codes.
- Minor-safety/product/character QA blockers stay attached as warning reason codes and do not mark media clean publish-ready.
- Direct image task refs now persist `skillRuntime` at the top level so future evidence shows selected skill, schema audit, category, reference counts, and input keys directly.
- Updated the repair-exhaustion contract and regression test expectations for warning handoff.

## Verification
- `npm test --workspace=@smartspec/web -- marketplaceAutoReviewService.test.ts -t "hands off QA blockers|does not select image attempts with character reference mismatch|minor|baby bodysuit|reference mismatch|repair budget"`: 13 passed.
- `npm test --workspace=@smartspec/web -- marketplaceAutoReviewService.test.ts`: 184 passed.
- `npm run check --workspace=@smartspec/web`: passed.
- `git diff --check -- apps/web/server/services/marketplaceAutoReviewService.ts apps/web/server/services/__tests__/marketplaceAutoReviewService.test.ts orchestra/contracts.md`: passed.

[COMPLETE] wave-13-marketplace-storyboard-provider-prompt-budget — Moved over-budget image prompt handling to final LLM optimizer gate.

## Marketplace Evidence
- User screenshot showed `Image prompt preflight failed ... blockers=prompt_too_long_for_image_provider` at image generation step 5/6.
- SocratiCode was active and narrowed the relevant flow to `marketplaceAutoReviewService.ts` prompt preflight/submit logic and its focused tests.
- The hard limit is `PRODUCT_REFERENCE_STORYBOARD_PROMPT_MAX_CHARS = 4500`.
- Updated screenshot showed the failing unit as `shot-1-start`, proving the non-grid prompt path also needed budget handling.
- Root cause: non-grid prompts were built and preflighted without the existing optimizer skill; grid prompts could also be optimized before later backend safety/layout additions, making final prompt length drift.

## Fix
- Removed the hardcoded provider-budget compactor and its test.
- Added `optimizeMarketplaceAutoReviewFinalImagePromptForProvider()` as the single final budget gate.
- The final gate calls the existing `product-reference-storyboard-prompt-optimizer` LLM skill only when the fully assembled provider prompt exceeds 4500 chars.
- Applied the final optimizer before preflight for all image units, including `shot-*-start`, `shot-*-stop`, `storyboard_frame`, and `storyboard_grid`.
- Added `skillRuntime.finalPromptOptimizer` audit metadata when the final optimizer runs.
- Added a regression test proving an over-budget final prompt dispatches the optimizer skill with run/unit/attempt metadata and uses the optimizer output before preflight.

## Verification
- `npm --workspace apps/web run test -- server/services/__tests__/marketplaceAutoReviewService.test.ts -t "optimizes over-budget final image prompts"`: 1 passed.
- `npm --workspace apps/web run test -- server/services/__tests__/marketplaceAutoReviewService.test.ts`: 185 passed.
- `npm --workspace apps/web run check`: passed.
