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
