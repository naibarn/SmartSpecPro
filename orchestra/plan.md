# Orchestra Plan

## Task
Fix current Marketplace/HyperFrames review regressions: duplicate final composite overlays, silent HyperFrames MP4 output, and child-reference prompt preflight false positives.

## Classification
- scope: medium
- risk: medium
- affected_domains: HyperFrames final composite builder, HyperFrames render worker audio policy, Marketplace Auto Review prompt preflight, focused tests
- estimated_file_count: 6
- chosen_route: direct-inline standard light bug route
- task_summary: Preserve source clip audio, prevent first-shot hook/per-shot overlay duplication, fail closed on expected-but-missing audio, and replace child-reference age-role false blocking with the actual minor clothing safety lock rule.
- bug_route: render output and prompt preflight regressions
- parallel_default: false
- planned_agents: []
- dispatch_preference: direct-standard-light

## Activation
- Orchestra auto-activated by repo AGENTS.md for code-aware bug fix.
- SocratiCode active: green index; narrowed to HyperFrames composition/worker services and Marketplace prompt preflight service/tests.

## Root Cause
- HyperFrames first-shot duplicate text: final composite HTML emitted both the global `hook-layer` and shot-1 `.shot-copy` when hook and per-shot text were both enabled.
- HyperFrames silent output: source `<video>` tags were hardcoded `muted` even when `preserveNativeAudio` was enabled.
- HyperFrames hidden failure: MP4 output probing accepted video+duration even when the payload expected audio.
- Marketplace false block: preflight treated `@Image2` being a child as `character_reference_age_role_mismatch`; the correct rule is minor imagery must be safely clothed and carry the minor-safety clothing lock.

## Fix
- Bumped final composite builder to v7 so stale v6 hashes are not reused.
- Removed `muted` from source video tags when native audio preservation is enabled; only explicitly disabled native audio emits muted video tags.
- Suppressed shot-1 copy when the hook layer owns the first-shot overlay.
- Added fail-closed worker audio policy: expected audio without an output audio stream raises a clear probe error instead of marking the render completed.
- Removed the child-reference age-role blocker; prompts that introduce a baby/toddler/child/minor now require `MINOR SAFETY CLOTHING LOCK`, while explicit adult/no-child wording no longer triggers minor safety detection.

## Verification
- `npm test -- --run server/services/__tests__/hyperframesCompositionService.test.ts`
- `npm test -- --run server/services/__tests__/hyperframesWorkerPolicy.test.ts`
- `npm test -- --run server/services/__tests__/marketplaceAutoReviewService.test.ts`
- `npm test -- --run server/services/__tests__/marketplaceAutoReviewReferenceEvidence.test.ts`
- `npm run check`
- `npm run build`
- `git diff --check`

## Addendum: Marketplace Reference Skill QA

## Task
Deep-check the current Marketplace Auto Review failure for product `mp_498882252361e566b847bd33de7dca00` using real DB/run data. Do not hide failures with fallback; confirm whether product/character references are sent to `product-reference-storyboard` skill and fix the root cause.

## Classification
- scope: medium
- risk: medium
- affected_domains: Marketplace Auto Review skill input category inference, product-reference-storyboard reference manifest, storyboard grid vision QA, image repair budget handoff policy
- chosen_route: direct-inline bug route with DB evidence and regression tests

## Root Cause
- The latest uploaded-reference run correctly sent the uploaded person as `reference_character_images` (`@Image2=character`) and did not use fallback.
- The real product was a baby bodysuit but the skill received `product_category=fashion_clothing`, because generic `productCategory` overrode the marketplace baby category path.
- For `storyboard_3x3_split`, grid layout QA failed and caused shot-frame QA to be skipped, so approved product/character reference images were not compared against the generated grid before the warning handoff.
- After three repair-required attempts, the previous gate mixed publish safety with Storyboard Review handoff. Minor-safety QA reasons could terminally block handoff even when the generated 3x3 storyboard had already been split into reviewable frames.

## Fix
- Override generic `fashion_clothing` with `mother_baby` when product evidence includes Baby & Maternity, newborn, infant, bodysuit, or romper signals.
- Include reference image manifest/order in skill input and provider audit path.
- Attach approved product/character refs to full-grid vision QA and require `productMatchesReference` and `characterConsistencySafe`.
- Prevent product/character reference mismatch from being selected as a clean/best attempt.
- When complete storyboard frame evidence exists and the repair budget is exhausted, hand off QA blockers (including product, character, and minor-safety reasons) to Storyboard Review as `accepted_with_warnings` so the user can inspect and replace frames manually. This is not publish-safe acceptance.
- Persist `skillRuntime` on direct image task refs so future run evidence shows the selected skill, schema audit, product category, reference role counts, and input keys without digging through nested prompt audit metadata.

## Verification
- `npm test --workspace=@smartspec/web -- marketplaceAutoReviewService.test.ts -t "baby bodysuit|character reference mismatch|repair budget"`
- `npm test --workspace=@smartspec/web -- marketplaceAutoReviewService.test.ts`
- `npm run check --workspace=@smartspec/web`
- `git diff --check`

## Addendum: HyperFrames Preview/Render Overlay Parity

## Task
Make Storyboard Review HyperFrames text preview and final composite render use the same visual layer contract, restore the missing third overlay text layer, and add configurable text motion transitions for attention-grabbing first seconds.

## Classification
- scope: medium
- risk: low
- affected_domains: Storyboard Review frontend controls/preview, HyperFrames final composite schema, HyperFrames composition HTML/CSS, focused composition tests
- chosen_route: direct-inline standard light UI/renderer fix
- dispatch_preference: direct-standard-light

## Impact Preflight
- SocratiCode status: green, 93069 indexed chunks.
- SocratiCode narrowed the work to `apps/web/client/src/pages/StoryboardReviewPage.tsx`, `apps/web/shared/hyperframes/runtimeApiSchemas.ts`, `apps/web/server/services/hyperframesCompositionService.ts`, and HyperFrames service tests.
- Root cause: frontend preview rendered a richer kinetic layout (`badge`, `title`, `yellow hook/card`, `bottom chip`) while server final composition rendered a separate `hook-layer` with only `hook-main`/`hook-sub`; shot-1 per-shot copy was suppressed, so the rendered output lost the preview-only third text group.
- Solution: add an explicit text-motion schema field, make final render emit preview-equivalent kinetic DOM layers, preserve shot-level chip text when hook mode is active, and make preview/payload/render carry the same motion preset.

## Planned Verification
- Focused HyperFrames composition tests.
- TypeScript check for schema/client/server contract.
- `git diff --check`.

## Addendum: Marketplace Auto Storyboard Prompt Budget

## Task
Fix Auto Storyboard Review failure where `product-reference-storyboard` image prompt preflight blocks on `prompt_too_long_for_image_provider` after 5/6 steps.

## Classification
- scope: small
- risk: medium
- affected_domains: Marketplace Auto Review image prompt preflight/submit path and focused service tests
- chosen_route: direct-inline standard light bug fix
- dispatch_preference: direct-standard-light

## SocratiCode Preflight
- SocratiCode status: green, 93143 indexed chunks.
- SocratiCode narrowed the issue to `apps/web/server/services/marketplaceAutoReviewService.ts` and `apps/web/server/services/__tests__/marketplaceAutoReviewService.test.ts`.

## Root Cause
- The failing unit is `shot-1-start`, which uses the non-`storyboard_grid` image prompt path.
- That path built and preflighted the final start/stop/storyboard-frame prompt synchronously, without dispatching the existing LLM prompt optimizer.
- For `storyboard_grid`, optimizer usage could also happen before backend safety/layout post-processing, so later prompt additions could still push the final provider prompt over `PRODUCT_REFERENCE_STORYBOARD_PROMPT_MAX_CHARS` (4500).

## Fix
- Removed the hardcoded provider-budget compactor.
- Added a final LLM optimizer gate using `product-reference-storyboard-prompt-optimizer` after all prompt construction/post-processing and before preflight/provider submit.
- Applied the final optimizer gate to both non-grid units (`shot-*-start`, `shot-*-stop`, `storyboard_frame`) and `storyboard_grid`.
- Persist optimizer evidence in `skillRuntime.finalPromptOptimizer` when the final optimizer is used.

## Verification
- `npm --workspace apps/web run test -- server/services/__tests__/marketplaceAutoReviewService.test.ts`
- `npm --workspace apps/web run check`
