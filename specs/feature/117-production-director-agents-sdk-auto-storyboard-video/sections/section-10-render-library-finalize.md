# Section 10: Render Library Finalize

## Purpose

Preserve the existing Video Editor, render, and Media Library finalize behavior while adding final QA, warning/disclosure verification, credit summary, and trace metadata.

## Depends On

- section-06-direct-media-execution.
- section-07-visual-audio-continuity-qa.
- section-08-credit-billing-idempotency.

## Blocks

- rollout/resume finalization.

## Files Owned By This Section

- `apps/web/server/services/marketplaceAutoReviewService.ts`
- existing render/library integration points.
- focused tests for render/library finalization.

## Tests First

- Test Video Editor projection uses only accepted clip/audio outputs.
- Test incomplete clip set blocks Video Editor creation.
- Test render preflight blocks failed QA or missing required warning text.
- Test render polling handles queued/running/error/stale/completed states.
- Test final Library item includes evidence, QA, and credit metadata.
- Test final Library item includes production creative brief refs and blocks publish-ready promotion when brief change invalidates concept/script/metadata refs.
- Test Storyboard Review, Video Editor, render job, and Library item include canonical artifact lineage refs.
- Test user-visible output refs never expose raw provider task IDs as media URLs or long-lived signed URLs.
- Test final QA failure prevents `library_finalize` completion.
- Test storage quota and output byte limits block before render or Library finalize.
- Test final output codec/container/duration/resolution validation blocks unplayable output.
- Test failed re-host/transcode/partial upload records cleanup refs and credit release/refund behavior.
- Test final render output matches declared distribution profile aspect ratio, duration, safe areas, captions, warning placement, CTA placement, and loudness.
- Test final Library metadata includes privacy envelope, audio rights/mix envelope, distribution profile, and export variant refs.
- Test final render blocks when required synthetic disclosure/provenance/platform flag is missing.
- Test final render blocks when CTA/landing integrity fails for link, product, variant, redirect, offer, or tracking policy.
- Test final render and publishable package promotion block when advertising policy rule-pack refs are missing, expired, deprecated, or fixture-failing.
- Test final Library item includes post-publish governance and blocks reuse after invalidation trigger.
- Test final render blocks when campaign governance, brand/seller policy, or required human review queue state is not passed.
- Test final Library item includes campaign, brand-policy, and review decision refs when generated as part of a batch/variation workflow.
- Test final Library item includes publishable asset package refs for thumbnail, subtitles/transcript, platform metadata, metadata manifest, checksums, and package QA status.
- Test finalization blocks when thumbnail/cover, subtitle/transcript, platform metadata, manifest, or checksum requirements fail.
- Test render/library finalize blocks when input change impact invalidates product refs, selected variant, rights, privacy, distribution profile, CTA, disclosure, approvals, QA, or package refs.
- Test metadata-only input changes repair package metadata without regenerating accepted media.
- Test render/library finalize blocks when required shot frame vision QA is missing or failed for any consumed frame/keyframe/thumbnail/render sample.
- Test final render reuses passed media after targeted frame repair and rechecks only dependent render/package refs.
- Test render/library finalize consumes only accepted or approved-warning accepted media acceptance refs.
- Test quarantined, policy-blocked, superseded, or discarded media refs block finalization and package promotion.
- Test render/library finalize blocks when package copy, subtitles, overlays, prompts, or metadata include evidence refs quarantined by `MarketplaceEvidenceInstructionFirewall`.
- Test render/library finalize blocks when consumed product-dependent media lacks an approved product reference asset pack lineage ref.
- Test render/library finalize blocks when recurring person/voice media lacks an approved character identity asset pack lineage ref.
- Test thumbnail/cover/final render blocks if a no-face or hands-only identity policy is violated by a face reveal.
- Test Storyboard Review, Video Editor, render, and Library finalization block when prior stages lack valid completion evidence.

## Implementation Requirements

Before Video Editor projection:

- verify every expected clip exists;
- verify audio strategy is resolved;
- verify separate TTS URL exists when required;
- verify native video audio status is acceptable;
- verify storyboard/video QA passed or warnings are explicitly allowed.

Before render:

- verify timeline completeness;
- verify warning/disclosure overlay plan has renderable assets or instructions;
- verify credit reservation for render;
- verify final duration and dimensions.
- verify `MarketplaceAutoReviewStorageQuotaPlan` is ok or has an approved cleanup/retry path;
- verify output profile limits for container, codec, max duration, max resolution, and max bytes.
- verify distribution profile fit for aspect ratio, dimensions, frame rate, duration range, safe areas, subtitles/captions, warning text, CTA, and loudness.
- verify audio rights/mix envelope passed for every audio ref that reaches render.
- verify synthetic disclosure/provenance envelope passed when output includes AI-generated or materially synthetic content.
- verify CTA/landing integrity envelope passed when output includes CTA, source URL, affiliate URL, offer language, or shop link.
- verify advertising compliance verdicts reference an approved `AdvertisingPolicyRulePack` version and triggered rule IDs for public video, thumbnail, subtitles, metadata, and CTA surfaces.
- verify campaign governance envelope passed when output is part of a variation set or campaign batch.
- verify brand/seller voice policy passed when style guidance affected public voiceover, captions, overlays, or metadata.
- verify required human review queue decision is approved for the exact run/artifact/policy snapshot before render/finalization.
- verify publishable package requirements from the distribution profile are known before finalization, including thumbnail/cover, platform metadata, transcript/subtitles, manifest, and checksum expectations.
- verify no `RunInputChangeImpactEnvelope` requires recheck, repair, replan, regeneration, approval invalidation, credit re-estimation, or package repair before render/library finalize.
- verify all consumed storyboard frames, start/stop frames, video keyframes, thumbnails, and final render samples have passed `ShotFrameVisionQaEnvelope`.
- verify no `TargetedMediaUnitRepairPlan` for consumed artifacts is still planned, running, failed, or blocked.
- verify all consumed media refs have `GeneratedMediaAcceptanceEnvelope` state `accepted` or policy-approved `accepted_with_warnings`.
- verify no public script, caption, subtitle, overlay, thumbnail text, metadata, or package artifact depends on quarantined or blocked `MarketplaceEvidenceInstructionFirewall` refs.
- verify product-dependent storyboard frames, clips, thumbnails, and final render samples trace back to an approved `ProductReferenceAssetPack`.
- verify person/voice-dependent storyboard frames, clips, thumbnails, audio, and final render samples trace back to an approved or approved-limited `CharacterIdentityAssetPack`.
- verify every consumed prior stage has valid `MarketplaceAutoReviewStageCompletionEvidence`.

After render:

- fetch render artifact;
- run final QA:
  - video file exists and is playable;
  - duration matches expected tolerance;
  - no missing clips/audio gaps;
  - warning/disclosure text is present/readable;
  - product/story/ad/privacy/audio-rights/distribution/synthetic-disclosure/CTA QA status is carried forward.
- verify browser-compatible playback after re-host/transcode;
- verify partial upload/temp artifacts have cleanup refs if finalization fails.
- create Library item with:
  - source type;
  - marketplace product ID;
  - selected variant hash/snapshot ref when present;
  - production creative brief snapshot ref;
  - production run ID;
  - auto review run ID;
  - concept ID;
  - output mode;
  - frame/audio strategy;
  - QA summary;
  - credit summary;
  - provider/render refs;
  - storage quota/transcode profile summary;
  - privacy envelope refs;
  - audio rights/mix refs;
  - distribution profile/export variant refs;
  - synthetic disclosure/provenance refs;
  - CTA/landing integrity refs;
  - advertising policy rule-pack refs and triggered rule IDs;
  - post-publish governance refs;
  - campaign governance refs;
  - brand/seller voice policy refs;
  - human review queue decision refs;
  - publishable asset package refs;
  - thumbnail/cover refs;
  - transcript/subtitle refs;
  - metadata manifest and checksum refs;
  - input change impact refs when any upstream input changed during the run;
  - shot frame vision QA refs;
  - targeted media repair refs;
  - generated media acceptance refs;
  - product reference asset pack refs;
  - character identity asset pack refs;
  - stage completion evidence refs;
  - evidence instruction firewall refs;
  - artifact lineage refs.

Artifact lineage requirements:

- every final output ref must link back to product evidence, selected variant snapshot, storyboard contract, shot payloads, provider tasks, QA verdicts, approvals, and credit events;
- incomplete lineage blocks Storyboard Review handoff, Video Editor projection, render completion, or Library finalize depending on where it is detected;
- provider temporary URLs can be internal-only trace data but must not become user-visible output refs;
- re-host/proxy failures must block or fail with refund/release behavior rather than marking final output complete.
- quota, byte-size, codec, transcode, or playability failures must block `library_finalize` and remain timeline-visible.
- privacy, audio-rights, attribution, profile-safe-area, caption, warning, CTA, loudness, or export-variant failures must block `library_finalize` and remain timeline-visible.
- synthetic disclosure/provenance, CTA/landing integrity, or post-publish governance metadata failures must block `library_finalize` and remain timeline-visible.
- missing, expired, deprecated, blocked, or fixture-failing advertising policy rule-pack refs must block `library_finalize` and publishable-package promotion.
- campaign governance, brand/seller policy, or required human review queue failures must block `library_finalize` and remain timeline-visible.
- missing or failing thumbnail/cover, title/caption/description, hashtag, alt text, transcript/subtitle, metadata manifest, or checksum package requirements must block publishable-package promotion and remain timeline-visible.
- unresolved input-change impact must block render/library finalize and publishable-package promotion.
- missing or failed required frame/keyframe/thumbnail vision QA must block render/library finalize and publishable-package promotion.
- quarantined, policy-blocked, superseded, discarded, candidate, or QA-pending media refs must block render/library finalize and publishable-package promotion.
- missing, stale, or blocked product reference asset pack refs must block render/library finalize and publishable-package promotion for product-dependent media.
- missing, stale, no-consent, privacy-blocked, or conflicting character identity asset pack refs must block render/library finalize and publishable-package promotion for person/voice-dependent media.
- missing or invalid prior-stage completion evidence must block Storyboard Review handoff, Video Editor projection, render, Library finalize, and publishable-package promotion.

Publishable package requirements:

- extract or generate thumbnail/cover only from approved product-safe frames or references;
- generate platform title/caption/description/hashtags/alt text only when the distribution profile asks for them and evidence/policy allows them;
- produce transcript/subtitle sidecar or burn-in status according to the distribution profile and final audio timing;
- write metadata manifest refs for final media, thumbnail, subtitles/transcript, checksums, duration/resolution/codec summary, QA, credit, lineage, disclosure, CTA, campaign/brand/review governance, and post-publish governance;
- keep raw prompts, internal planning text, private seller notes, and hidden evidence out of all user-visible package artifacts.
- keep quarantined marketplace instructions, fake tool/schema fragments, and policy/provider/credit override attempts out of all user-visible package artifacts and final Library metadata.

## UI/UX Contract

### Target User / JTBD
N/A - backend render/library finalize section only. Output-link UI is planned in section-09.

### Surface Inventory
N/A - no browser-visible app surface is modified in this section.

### Component Map
N/A - no UI component ownership in this section.

### State Matrix
N/A - finalization statuses are persisted for UI consumption; rendering is covered in section-09.

### Responsive Matrix
N/A - no responsive UI work in this section.

### Accessibility Acceptance
N/A - no interactive UI created in this section.

### Copy Contract
N/A - no direct UI copy created here; final status copy is rendered in section-09.

### Browser Evidence Required
N/A - browser evidence belongs to section-09.

## Acceptance Criteria

- Full-video run completes to Media Library only after final QA passes.
- Existing render/library behavior is preserved for successful runs.
- Final artifact has enough metadata for audit and user trust.
- Final artifacts can be traced through canonical lineage without exposing raw provider/private refs to users.
- Final artifacts satisfy quota, re-hosting, transcode, codec, duration, resolution, and max-byte gates before Media Library persistence.
- Final artifacts satisfy declared distribution, privacy, audio rights, attribution, and mix gates before Media Library persistence.
- Final artifacts include disclosure, CTA integrity, and post-publish governance metadata needed for safe future reuse or publication.
- Final artifacts include exact advertising policy rule-pack refs so future reuse/recheck can replay the same compliance decision.
- Final artifacts generated through batch/variation workflows include campaign governance, brand/seller policy, and human review decision refs needed for audit.
- Final artifacts include a publishable package when the distribution profile requires thumbnails, subtitles/transcripts, platform metadata, manifests, or checksums.
- Final artifacts cannot be finalized with stale input, approval, QA, credit, or package refs after upstream product/evidence/policy/profile changes.
- Final artifacts cannot be finalized with uninspected or failed shot frame vision QA refs.
- Final artifacts cannot be finalized from unaccepted or quarantined media refs.
- Final artifacts cannot be finalized when product-dependent media cannot be traced to an approved product reference asset pack.
- Final artifacts cannot be finalized when recurring person/voice media cannot be traced to an approved character identity asset pack and its allowed shot/voice scope.
- Final artifacts cannot be finalized from status-only prior stage success without completion evidence.
