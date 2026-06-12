# TDD Plan: Feature 120 HyperFrames Creative Systems Overlay, Subtitle, Audio, And SFX Presets

Write tests before implementation in each section. Prefer focused Vitest tests
and existing Playwright marketplace HyperFrames gates.

## Section 01: Shared Creative Contracts and Registry

- `apps/web/shared/hyperframes/__tests__/creativePresets.test.ts`: registry ids
  are unique, versioned, lifecycle-safe, and category-valid.
- Test overlay, subtitle, music, SFX, transition, and audio pack presets parse.
- Test every starter id listed in spec sections 7, 8, and 9 exists exactly once
  in the registry and under the correct category: 16 overlays, 12 subtitles, 6
  music presets, 10 SFX presets, and 6 audio packs.
- Test product-category-aware defaults for electronics/spec overlays,
  price/deal overlays, and social proof/review overlays.
- Test subtitle preset ids cover classic box, karaoke word highlight, highlight
  sweep, creator pop, and cinematic wide families.
- Test legacy ids map only through explicit aliases.
- Test unknown preset ids fail validation.
- Test preset lifecycle, emergency disable, historical outputs, candidate to
  active promotion, and archived provenance behavior.
- Test producer-only presets are marked disabled or limited when runtime
  capability is fallback-only.
- Test Thai font metadata requires Thai-capable font families.
- Test prompt packs are stored as metadata but are not sufficient render input.
- Test creative plan hash changes when preset id, version, variables, text,
  audio event map, timeline, platform profile, source media, or evidence hashes
  change.
- Test `social_variant_package` is either schema-valid but rollout-disabled or
  enabled only after explicit fixture and platform-profile evidence.
- Test artifact/output kind compatibility maps creative sidecars to existing
  Feature 119 artifact kinds unless a migration adds new enum values with
  retention/operator/Library tests.
- Test arbitrary tenant-authored HTML is rejected and cannot become executable
  production HTML.
- Test copy plan metadata requires `copyPlanHash`, `productTruthHash`,
  `evidenceManifestHash`, `claimEvidenceMapHash`, per-line `copySource`, and
  evidence refs or safe omission reasons.
- Test generated overlay/spec/price/review/CTA/subtitle/voiceover copy rejects
  unsupported claims, stale volatile facts, and instruction-like marketplace
  text before render-facing metadata is accepted.
- Test public exports/schemas cover the exact contract names in `spec.md`:
  `HyperframesPresetVariable`, `HyperframesPresetTimingPolicy`,
  `HyperframesPresetSafeAreaPolicy`, `HyperframesAudioEvent`,
  `HyperframesCreativeVariables`, `HyperframesCreativeRenderManifest`,
  `HyperframesCreativeQaResult`, `HyperframesCreativeLibraryMetadata`,
  `HyperframesShotMediaAssignment`, `HyperframesArtifactRef`,
  `HyperframesOutputRef`, `CreateHyperframesFinalCompositeInput.config`, and
  `CreateHyperframesFinalCompositeOutput`.
- Test `copySource` accepts only `product_truth`,
  `marketplace_capture_field`, `ai_insight_evidence`, `user_edit`,
  `policy_disclosure`, and `derived_summary`.
- Test copy plan metadata requires `policyRulePackRef`.
- Test audio event roles accept only `voiceover`, `music`, `transition_sfx`,
  `ui_sfx`, `accent_sfx`, and `ambience`.
- Test `HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION` remains
  `hyperframes_marketplace_auto_review_v1` unless a versioned migration and
  dual-parse suite are added.
- Test the exact anchor
  `HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION = "hyperframes_marketplace_auto_review_v1"`
  remains documented and backward-compatible.

## Section 02: Storyboard Review Persistence and Provenance

- `apps/web/server/routers/__tests__/videoEditorProjects.storyboardReviewHyperframesState.test.ts`: scoped update creates and updates `reviewData.hyperframesFinalComposite`.
- Test update requires tenant, user, product, run, storyboard review id, and
  expected revision.
- Test product/run mismatch is rejected without fallback.
- Test open-by-id verifies `reviewData.marketplaceContext.productId` and
  `marketplace_auto_review_runs.storyboardReviewId` before enabling actions.
- Test persisted MVP state exposes exact keys `schemaVersion`,
  `canonicalProductId`, `autoReviewRunId`, `storyboardReviewProjectId`,
  `revision`, `updatedAt`, `shotMediaAssignments`, `textVariables`, and
  `creativePlanHash`.
- Test promoted table/column state includes `createdAt`, `updatedAt`, and
  optional `deletedAt`.
- Test drag/drop, replace, import, and manual select shot MP4 assignments persist
  and reload after refresh.
- Test assignment requires managed storage ref or staged URL normalization.
- Test stale revision returns conflict state and preserves existing state.
- Test corrupted legacy rows are classified as repairable, delete-only, or
  already valid.
- If companion table is chosen, add migration dry-run, backfill, dual-read,
  dual-write, drift, cutover, rollback, and cleanup tests before use.

## Section 03: Runtime API, Feature Access, and Credit Gates

- `apps/web/shared/hyperframes/__tests__/runtimeApiSchemas.test.ts`: add schemas
  for creative preset listing, scoped HyperFrames state updates, conflict
  states, and final composite revision/hash guards.
- `apps/web/server/routers/__tests__/marketplaceCapture.hyperframesCreativeRuntimeApi.test.ts`: router validates identity, access, revision, and hash inputs.
- Test feature access projection extends existing capability fields without
  renaming or removing Feature 119 fields.
- Test exact Feature 119 capability/flag keys remain parseable:
  `canStartAuto`, `canPreview`, `canCancel`, `canSaveToLibrary`,
  `canInspectAsOperator`, `canReplayAsOperator`, `flags.enabled`,
  `flags.tenantAllowed`, `flags.workerEnabled`, `flags.librarySaveEnabled`,
  `flags.operatorEnabled`, and `flags.templateAllowlist`.
- Test additive projections use `creativeCapabilities`, `presetAvailability`,
  and `runtimeCapabilities` without replacing Feature 119 fields.
- Test existing procedures remain available and additive:
  `marketplaceCapture.createHyperframesFinalComposite`,
  `marketplaceCapture.getHyperframesRenderJob`,
  `marketplaceCapture.repairHyperframesRenderJob`,
  `marketplaceCapture.cancelHyperframesRenderJob`,
  `marketplaceCapture.saveHyperframesRenderToLibrary`,
  `marketplaceCapture.listHyperframesTemplates`,
  `videoEditorProjects.updateStoryboardReviewHyperframesState`, and
  `videoEditorProjects.getStoryboardReview`.
- Test tenant flags and env guards enable, disable, or block creative presets,
  final render, Library save, and operator actions.
- Test `MARKETPLACE_HYPERFRAMES_RUNTIME_READY` is honored by preset listing,
  render creation, and producer-only availability projection.
- Test credit estimates include creativePlanHash, presetManifestHash, and
  audioEventMapHash metadata.
- Test render credit idempotency preserves
  `hyperframes-credit:{tenantId}:{runId}:{renderIntent}:{compositionInputHash}:{templateVersion}:{platformPresetId}`.
- Test duplicate render/finalize does not charge twice.
- Test paid final render is blocked when credit or quota is not authorized.

## Section 04: Preview and Editable UX

- `apps/web/client/src/pages/__tests__/StoryboardReviewPage.hyperframesCreative.test.tsx`: panel is collapsed by default and can expand without blocking page scroll.
- Test users can inspect and edit hook, supporting text, per-shot overlay text,
  subtitle/voiceover text, and preset variables before render.
- Test registry-provided editable `styleBrief` defaults can be inspected,
  changed, persisted, and included in creative hashes when exposed by a preset.
- Test overlay and subtitle preset controls are independent and preview together.
- Test CSS/GSAP preview renders selected preset differences, not the same static
  preview for all presets.
- Test audio event preview shows music/SFX/VO timing and missing asset blockers.
- Test deterministic preview uses the same staged assets, variables, QA results,
  and output artifact assumptions as final render.
- Test save errors keep render disabled and show visible copy.
- Test keyboard navigation, reduced motion, mobile safe area, and no horizontal
  overflow.
- Test all new copy has Thai and English coverage or centralized copy ids.
- Test raw `fallback_quality`, `producer_ready`, and `smoke_only` strings never
  leak into normal user UI.
- Test accessibility evidence for keyboard reachability, accessible names,
  polite live regions for progress/completion announcements, reduced-motion behavior, and
  collapsed/expanded responsive states.

## Section 05: Composition Builder, Timeline, and Fallback Adapter

- `apps/web/server/services/__tests__/hyperframesCreativeTimeline.test.ts`: normalizes shot order, absolute times, cue bounds, final duration, and timeline hash.
- Test legacy `shot.startSec` mismatch rejects stale timeline.
- Test overlay events, subtitles, VO, music, SFX, transitions, and QA sample
  points reference the same canonical timeline.
- `apps/web/server/services/__tests__/hyperframesCompositionService.creative.test.ts`: builds deterministic HTML/CSS/GSAP from creative plan.
- Test sanitizer rejects remote scripts, external stylesheets, iframes, fetch,
  cookies, localStorage, inline event handlers, and unsafe URLs.
- Test all text escaped before becoming composition HTML, diagnostics, status
  copy, or operator output.
- Test generated composition includes `data-composition-id`, `data-width`,
  `data-height`, timed `class="clip"` elements, `data-volume`, and
  `window.__timelines[compositionId]`.
- Test generated composition also includes exact timing/preset attributes:
  `data-start`, `data-duration`, `data-media-start`, `data-track-index`,
  `data-overlay-preset`, and `data-subtitle-preset`.
- Test `<audio>` elements are deterministic and do not rely on JavaScript
  `play()` calls.
- Test canonical timeline entries include exact `shotId`, `shotIndex`,
  `absoluteStartSec`, `absoluteEndSec`, `durationSec`, `timelineHash`, and
  `timelineVersion` fields.
- Test legacy `HyperframesFinalCompositeConfig.shots[].startSec` mismatch
  produces a stale timeline error.
- Test platform profiles `generic_vertical_9_16` and
  `tiktok_reels_shorts_9_16` resolve dimensions, safe area, and thumbnail
  policy before manual overrides.
- Test render setup rejects async/fetch timeline behavior and other
  nondeterministic render inputs.
- Test remote font references are rejected unless staged and approved.
- Test composition code cannot manually play/pause/seek audio with JavaScript.
- Test composition and custom React preview do not access SmartSpecPro API
  calls, cookies, localStorage, raw signed URLs, or private URLs.
- Test Thai font references are local/staged and runtime-verifiable.
- Test allowed Thai font families include `Prompt`, `Noto Sans Thai`,
  `IBM Plex Sans Thai`, `Sarabun`, and `Kanit`, and reject non-Thai fallback for
  Thai overlay/subtitle text.
- Test FFmpeg/ASS fallback rejects or marks partial unsupported presets instead
  of silently rendering low-quality text.
- Test text overflow, safe area, product/face avoidance metadata, and subtitle
  line limits.
- Test visual QA detects clipped Thai glyphs and blocks final render or Library
  save when clipping is blocking.
- Test mandatory disclosure placement and safe labels are preserved.
- Test thumbnail policy, safe area, and disclosure placement resolve from the
  platform profile.
- Test word-level karaoke timing remains rollout-gated until transcript, TTS, or
  manual cue decision and fixture evidence are available.

## Section 06: Render Worker and Output Projection

- `apps/web/server/services/__tests__/hyperframesRenderService.creative.test.ts`: final render input includes creativePlanHash, timelineHash, preset versions, source media hashes, audio event map hash, and runtime capability hash.
- Test final render input/output includes `preserveNativeAudio` and
  `runtimeCapabilityHash`.
- `apps/web/server/services/__tests__/hyperframesWorkerPolicy.test.ts`: worker
  preserves native audio unless explicitly disabled and records audio mix report.
- Test render does not complete without playable `final_video` output URL and
  content hash.
- Test Feature 119 outbox payload compatibility fields remain present:
  `compositionInputHash`, `compositionHtmlHash`, `templateId`,
  `templateVersion`, `templateContentHash`, `platformPresetId`,
  `platformPresetVersion`, `renderIntent`, `compositionMode`, and
  `runtimeProfileHash`.
- Test Feature 120 optional outbox fields are included when relevant:
  `creativePlanHash`, `presetManifestHash`, `audioEventMapHash`, and
  `fallbackQuality`.
- Test progress reaches 100 only after playable probe passes.
- Test output download/open actions come from sanitized `outputRefs`.
- Test artifact/output compatibility continues to parse
  `hyperframes_input_json`, `hyperframes_composition_html`,
  `hyperframes_snapshot`, `hyperframes_render_mp4`,
  `hyperframes_render_webm`, `hyperframes_subtitle_vtt`,
  `hyperframes_manifest`, `hyperframes_sanitized_log`, `preview_video`,
  `final_video`, `snapshot`, and `library_item`.
- Test internal Library save uses paired `artifactRefs` while normal UI uses
  sanitized playable `outputRefs`.
- Test SFX visual trigger and timing rules for whoosh, click, notification, cash
  register, riser, and impact events.
- Test SFX policies avoid excessive repeated SFX.
- Test voiceover/music ducking respects configured volume ranges.
- Test audio clipping probes and exact duration tolerance block completed status
  when failing.
- Test runtime manifest records runtime profile hash plus Chrome/Playwright,
  FFmpeg/FFprobe, libass/fontconfig, Node, and HyperFrames package/CLI versions.
- Test staged-manifest ownership, MIME, duration/size, checksum, and
  license/source validation for media, audio, SFX, and font refs.
- Test failure statuses distinguish missing clip, missing audio asset, unsupported
  preset, font failure, overflow QA, render failure, and storage failure.
- Test repair action projections are safe, copy-covered, and do not expose raw
  internals.
- Test refresh/resume loads terminal output from server projection.

## Section 07: Library, Media History, and Video Editor Handoff

- `apps/web/server/services/__tests__/hyperframesLibraryFinalizeService.creative.test.ts`: final metadata includes creativePlanHash, preset ids, preset versions, audio event map hash, fallback quality, hasAudio, and output hash.
- Test idempotency key remains
  `hyperframes-library:{tenantId}:{runId}:{renderIntent}:{compositionInputHash}:{outputHash}`.
- Test duplicate finalize returns existing item and does not charge again.
- Test Media History shows playable final video and download link by source,
  product id, run id, and type video.
- Test Library and Document Management use existing HyperFrames source label.
- Test Video Editor opens completed MP4 as normal media.
- Test preview-only expired artifacts do not appear as durable Library media.

## Section 08: Observability, Cleanup, Retention, and Operator Tools

- `apps/web/server/services/__tests__/hyperframesOperatorService.creative.test.ts`: inspect, replay, cancel, disable preset, promote candidate, and cleanup are permission-gated and audited.
- Test diagnostics redact signed URLs, storage keys, raw HTML, local paths, raw
  worker logs, and product evidence.
- Test metrics include preset ids, fallback quality, Thai font resolution, audio
  presence, overflow warnings, output probe, and product/run/storyboard refs.
- Test cleanup dry-run classifies invalid legacy projects without deleting
  Library media.
- Test delete/archive actions require explicit operator permission and produce
  audit records.
- Test retention preserves completed Library outputs while allowing preview and
  temp artifacts to expire.
- Test retention dry-run skips active, locked, retry-grace, Library-owned, and
  operator-held artifacts.
- Test no raw enum/status/lifecycle values leak into Thai/English UI snapshots.
- Test operator replay and purge flows are permission-gated, audited, and reject
  stale creative/runtime hashes.

## Section 09: Fixtures, E2E, and Rollout Gates

- Extend `apps/web/tests/e2e/marketplace-hyperframes-ui.spec.ts` for final
  composite creative flow.
- Test `apps/web/package.json` exposes every required release gate script before
  Feature 120 rollout evidence can pass.
- Browser evidence covers desktop and mobile Storyboard Review, Media History,
  Library, and Video Editor handoff.
- Fixture matrix covers ecommerce toys, electronics specs, price/deal, UGC
  review, Thai long text, no audio, native audio, music/SFX, fallback-only, and
  producer-ready capability states.
- Fixture matrix also covers licensed audio asset, missing license/source,
  stale price, unsupported user edit, and product truth hash mismatch cases.
- `hyperframes:fixture-render` verifies output duration, playable MP4, hasAudio,
  text safe area, subtitle safe area, and output refs.
- `hyperframes:snapshot-test` verifies overlay/subtitle preset visual differences.
- `hyperframes:production-rollout-gate` verifies route evidence, media history
  output, download/open actions, and no manifest-only completion.
- Rollout tests cover canary tenants and candidate to active preset promotion.
- Rollout tests record the SFX starter pack and music generation decisions before
  enabling SFX/music presets.
- Rollout tests read
  `specs/feature/120-hyperframes-creative-systems-overlay-audio-presets/reviews/open-question-decision-log.md`
  and fail when an enabled capability depends on an `Open` decision row.
- Rollout tests verify Feature 119 base Marketplace HyperFrames behavior with
  Feature 120 creative flags disabled.
- Dependency audit and doctor tests fail closed for unapproved producer package
  versions, missing FFmpeg/FFprobe, missing Chrome/Playwright readiness, missing
  Thai fonts, invalid licenses, missing temp/storage readiness, runtime image
  mismatch, or worker isolation gaps.

## Final Gates

Run focused gates before rollout:

```bash
npm --prefix apps/web run test -- apps/web/shared/hyperframes
npm --prefix apps/web run test -- apps/web/server/services/__tests__/hyperframes
npm --prefix apps/web run test -- apps/web/server/routers/__tests__/marketplaceCapture.hyperframesRuntimeApi.test.ts
npm --prefix apps/web run test -- apps/web/server/routers/__tests__/videoEditorProjects.storyboardReview.test.ts
npm --prefix apps/web run check
npm --prefix apps/web run e2e:marketplace-hyperframes
npm --prefix apps/web run hyperframes:dependency-audit
npm --prefix apps/web run hyperframes:doctor
npm --prefix apps/web run hyperframes:fixture-render
npm --prefix apps/web run hyperframes:snapshot-test
npm --prefix apps/web run hyperframes:production-rollout-gate
```
