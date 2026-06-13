# Feature 120 Implementation Summary

Date: 2026-06-12

## Scope Completed

- Sections 01-03: shared creative preset contracts, Thai font/runtime schemas, Storyboard Review server-owned HyperFrames state, and backend-gated preset listing API.
- Sections 04-06: Storyboard Review Final Composite persistence before render, independent overlay/subtitle/audio controls, canonical shot timeline sorting/validation, finite/positive shot timing guards, source media ref guards, subtitle cue finite/shot-boundary/overlap validation, SFX shot-boundary validation, timeline-aware composition input/HTML, audio event map metadata, staged audio asset provenance validation, role/preset-aware audio volume ceilings, SFX visual-trigger family validation with shot-boundary ownership, SFX timing/repetition/safe-volume policy validation, FFmpeg final composite fallback, native-audio preservation, deterministic synthetic fallback audio when enabled, output probing, and completed-status/probe gating.
- Sections 07-09: Library metadata enrichment, Media History playable-output filtering, operator metrics with creative/audio/probe signals, fixture final output evidence, and fail-closed production rollout gates.

## Key Behavior

- Final composite render state is persisted under `reviewData.hyperframesFinalComposite` with exact product/run/storyboard identity checks.
- Storyboard Review exposes editable audio pack, music bed, SFX triggers, preserve-native-audio, and synthetic-fallback controls; those choices persist with the project state and are sent in the final render config.
- Storyboard Review now exposes an editable full HyperFrames render prompt rather than a short style brief. The generated prompt is built from product truth, product category, hook/supporting copy, extracted specs, price/trust text, storyboard clips, overlay/subtitle state, audio policy, and animation timing. The JSON payload preview embeds the same prompt string that final render sends in `styleBrief`, preventing preview/render drift.
- Final Composite is collapsed by default, keeps payload JSON/audio event map/text preview as collapsible secondary sections, and remains disabled when there is no completed MP4/video shot. In that blocked state the visible summary explains that completed images/storyboard frames are not valid final-render source video, shows detected image/pending-video counts, and directs the user to create or import at least one MP4 shot before rendering.
- Added the `hyperframes-render-prompt` skill under `apps/web/skills/` for LLM-assisted premium prompt authoring when deterministic extraction is not enough. After service restart, SkillRegistry finds 98 folders and loads the new skill into the Admin Skills database list as `video_prompt_generation`, `llm-only`, enabled by default.
- Final composite shots are sorted by canonical `shot.index`, require unique shot ids, require contiguous indices from `0`, reject non-finite starts, zero/negative durations, missing source media refs, stale declared starts/final durations, subtitle cues with invalid timing, subtitle cues that leave their owning shot range, and overlapping subtitle cues inside the same shot.
- Composition output includes audio event map hashes, `<audio>` metadata with trigger/timing/volume attributes, and managed-path audio asset refs for downstream QA.
- Final composite creation fails closed when music/SFX events require staged licensed assets, the refs lack license/checksum/MIME/duration provenance, and explicit synthetic fallback is disabled.
- Final composite creation rejects SFX cues that leave a single storyboard shot range, use the wrong visual trigger for their preset family, fire far from the relevant scene cut/reveal/price lock, run too long, are mixed too loudly, or repeat too tightly for the visual trigger policy; SFX events starting exactly at a shot boundary are owned by the next shot so reveal/riser events at `8s`, `16s`, etc. do not fail as if they belonged to the previous shot. It also enforces spec-aligned volume ceilings for music under voiceover, music without voiceover, ambience, UI click, transition, cash register, notification, riser, and impact SFX families.
- Completed final render projection is downgraded to `failed_permanent` unless it has a safe `final_video` URL, content hash, and `playableProbe.passed=true`, so UI/download/Library actions never rely on manifest-only completion.
- Render jobs only project final `completed` when a `final_video` output ref has a URL, content hash, and `playableProbe.passed=true`.
- FFmpeg/ASS final composite now keeps editable Thai overlay text from the Storyboard Review preview as the render source of truth, wraps long overlay copy into safe multiline ASS text, and does not pre-truncate overlay text with ellipsis before rendering. This prevents rendered MP4 captions from collapsing long user-reviewed text such as `พร้อมส่ง ของเล่นที่ตักทราย...` into only `พร้อมส่ง...`.
- Final composite render idempotency now includes the runtime profile hash, and captioned final composite payloads include renderer policy version `ffmpeg_ass_final_composite_overlay_wrap_v2`, so renderer/ASS policy changes produce a new render job id instead of reusing an old MP4 artifact for unchanged composition input.
- Storyboard Review no longer seeds default Hook/Supporting/per-shot overlay text with data-level ellipsis; legacy persisted ellipsis values such as `พร้อมส่ง...` are expanded from canonical product title/description before render and persisted back into the Final Composite state.
- FFmpeg/ASS worker also expands legacy ellipsis overlay text from payload product truth before writing ASS, covering older clients or already-persisted projects that still submit `...` text.
- Historical FFmpeg fallback preserves native clip audio by default and can add deterministic fallback music/SFX tones when selected audio assets are not staged yet; the audio mix report records selected presets, generated event count, missing refs, validated refs, validated audio asset count, license names, and validation state. Per the 2026-06-13 direction update, this path is diagnostic/break-glass only and cannot satisfy future production-complete render gates.
- Media History ignores manifest-only or unprobed final outputs.
- Library finalize metadata records creative plan hashes, preset ids/versions, audio event hash, fallback quality, output hash, playable probe, and audio mix report.
- Production rollout gate rejects missing playable final fixture evidence, missing fixture hash/safe-area/exact-duration/audio-policy evidence, and enabled capabilities tied to unresolved open-question rows; it reports route, fixture, golden-snapshot, bundle, and runtime-prerequisite evidence separately.

## Verification

- `npm --prefix apps/web run test -- shared/hyperframes/__tests__/creativePresets.test.ts shared/hyperframes/__tests__/runtimeApiSchemas.test.ts shared/hyperframes/__tests__/storyboardReviewState.test.ts shared/hyperframes/__tests__/contracts.test.ts server/routers/__tests__/videoEditorProjects.storyboardReview.test.ts server/routers/__tests__/marketplaceCapture.hyperframesRuntimeApi.test.ts server/services/__tests__/hyperframesRuntimeApiService.test.ts server/services/__tests__/hyperframesCompositionService.test.ts server/services/__tests__/hyperframesRenderService.test.ts server/services/__tests__/hyperframesLibraryFinalizeService.test.ts server/services/__tests__/hyperframesOperatorService.test.ts scripts/__tests__/hyperframes-production-rollout-gate.test.ts`
  - Latest result after SFX boundary ownership and completed/probe projection validation pass: 12 files, 116 tests passed.
- `npm --prefix apps/web run test -- shared/hyperframes/__tests__/creativePresets.test.ts shared/hyperframes/__tests__/runtimeApiSchemas.test.ts shared/hyperframes/__tests__/storyboardReviewState.test.ts shared/hyperframes/__tests__/contracts.test.ts server/routers/__tests__/videoEditorProjects.storyboardReview.test.ts server/routers/__tests__/marketplaceCapture.hyperframesRuntimeApi.test.ts server/services/__tests__/hyperframesRuntimeApiService.test.ts server/services/__tests__/hyperframesCompositionService.test.ts server/services/__tests__/hyperframesRenderService.test.ts server/services/__tests__/hyperframesLibraryFinalizeService.test.ts server/services/__tests__/hyperframesOperatorService.test.ts server/services/__tests__/hyperframesWorkerPolicy.test.ts scripts/__tests__/hyperframes-production-rollout-gate.test.ts`
  - Latest result after render-policy idempotency and legacy ellipsis expansion pass: 13 files, 125 tests passed.
- `npm --prefix apps/web run test -- shared/hyperframes/__tests__/contracts.test.ts server/services/__tests__/hyperframesRenderService.test.ts server/services/__tests__/hyperframesWorkerPolicy.test.ts`
  - Latest focused result after render-policy idempotency and legacy ellipsis expansion pass: 3 files, 32 tests passed.
- `npm --prefix apps/web run test -- server/services/__tests__/hyperframesWorkerPolicy.test.ts`
  - Latest focused result after long Thai overlay ASS regression pass: 1 file, 9 tests passed.
- `npm --prefix apps/web run test -- server/services/__tests__/hyperframesRuntimeApiService.test.ts server/services/__tests__/hyperframesCompositionService.test.ts`
  - Latest focused result after role/preset volume ceilings and subtitle-overlap validation pass: 2 files, 19 tests passed.
- `npm --prefix apps/web run test -- server/services/__tests__/hyperframesRuntimeApiService.test.ts`
  - Latest focused result after SFX visual-trigger family and timing policy validation pass: 1 file, 16 tests passed.
- `npm --prefix apps/web run test -- server/services/__tests__/hyperframesCompositionService.test.ts`
  - Latest focused result after canonical timeline finite/positive timing and source-media guard pass: 1 file, 4 tests passed.
- `npm --prefix apps/web run test -- server/services/__tests__/hyperframesRuntimeApiService.test.ts server/services/__tests__/hyperframesRenderService.test.ts`
  - Latest focused result after SFX shot-boundary ownership and completed/probe projection gating pass: 2 files, 36 tests passed.
- `npm --prefix apps/web run check`
  - Latest result after render-policy idempotency and legacy ellipsis expansion pass: passed.
- `npm --prefix apps/web run test -- shared/hyperframes/__tests__/storyboardReviewState.test.ts shared/hyperframes/__tests__/creativePresets.test.ts scripts/__tests__/hyperframes-production-rollout-gate.test.ts`
  - Latest result after full HyperFrames prompt schema expansion and Admin skill addition: 3 files, 30 tests passed.
- `PLAYWRIGHT_USE_EXISTING_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm --prefix apps/web run e2e:marketplace-hyperframes`
  - Latest result after production build/restart: 12 tests passed, including assertion that Storyboard Review exposes a full HyperFrames prompt with `Feature callouts`, `Animation`, and `Export` sections.
- Database/Admin Skills verification:
  - `skills.slug='hyperframes-render-prompt'` exists with `isEnabled=true`, `visibleByDefault=true`, `category='video_prompt_generation'`, `executionMode='llm-only'`, `folderPath='skills/hyperframes-render-prompt'`, and priority `62`.
- `npm --prefix apps/web run hyperframes:dependency-audit`
  - Latest result: passed with `gate: partial`; production package install remains deferred.
- `npm --prefix apps/web run hyperframes:doctor`
  - Latest historical result: passed with diagnostic smoke readiness only; future
    production completion requires official HyperFrames CLI/producer readiness.
- `npm --prefix apps/web run hyperframes:fixture-render`
  - Latest result: passed; playable local fixture MP4 evidence produced.
- `npm --prefix apps/web run hyperframes:snapshot-test`
  - Latest result: passed; local snapshot evidence produced.
- `npm --prefix apps/web run hyperframes:production-rollout-gate`
  - Latest result after render-policy idempotency and legacy ellipsis expansion pass: blocked fail-closed because production prerequisites remain unresolved; evidence shows fixture final output passed while seeded route E2E and golden snapshots are still missing.
- `git diff --check -- apps/web/server/workers/hyperframesRenderWorker.ts apps/web/server/services/__tests__/hyperframesWorkerPolicy.test.ts apps/web/server/services/hyperframesRenderService.ts apps/web/server/services/hyperframesRuntimeApiService.ts apps/web/server/services/hyperframesCompositionService.ts apps/web/server/services/__tests__/hyperframesRuntimeApiService.test.ts apps/web/server/services/__tests__/hyperframesRenderService.test.ts specs/feature`
  - Latest result after FFmpeg/ASS Thai overlay no-ellipsis regression pass: passed.
- `git diff --check -- apps/web/client/src/pages/StoryboardReviewPage.tsx apps/web/server/services/hyperframesRenderService.ts apps/web/server/workers/hyperframesRenderWorker.ts apps/web/shared/hyperframes/contracts.ts apps/web/shared/hyperframes/__tests__/contracts.test.ts apps/web/server/services/__tests__/hyperframesRenderService.test.ts apps/web/server/services/__tests__/hyperframesWorkerPolicy.test.ts`
  - Latest result after render-policy idempotency and legacy ellipsis expansion pass: passed.

## Live Artifact Check

- Checked `https://smartaihub.app/api/storage/files/marketplace-auto-review/tenant-ZCSKEM9s/mar_29c7e2346ec77b3d984aaa75d7245ed9/hyperframes/hf_hf_28d30f41/output.mp4` on 2026-06-13 Asia/Bangkok. The response was `200`, `content-length: 48287956`, `last-modified: Fri, 12 Jun 2026 16:34:51 GMT`, `cf-cache-status: HIT`, and extracted frames confirmed the top overlay was burned as `พร้อมส่ง...`.
- Downloaded source clip `https://smartaihub.app/api/storage/files/media-jobs/assets/bawuRk5ywalloGLoKjpBj/v001.mp4`. The response was `200`, `last-modified: Fri, 12 Jun 2026 18:29:22 GMT`, `duration: 8.000000`, and the extracted frame had no top overlay. Therefore the bad `พร้อมส่ง...` text was introduced by the Final Composite render layer, not by the source MP4.
- The inspected Final Composite artifact predates the inspected source clip and uses render job id `hf_hf_28d30f41`; after this fix, unchanged composition input should queue a new render job id because the runtime profile hash now includes the renderer policy version.

## Notes

- The production HyperFrames producer remains gated by pinned dependency versions, license/provenance/native-postinstall review, worker-image review, Chrome/FFmpeg/font approvals, seeded route E2E, and golden snapshots.
- Existing dirty worktree files outside Feature 120 were preserved.
