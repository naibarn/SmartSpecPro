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
