# Section 07: Visual Audio Continuity QA

## Purpose

Implement real QA gates and repair decisions for product fidelity, character/face continuity, story continuity, generated visuals, generated video clips, audio continuity, and final media coherence.

## Depends On

- section-04-creative-planning-contracts.
- section-05-ad-compliance-warning-overlays.
- section-06-direct-media-execution.

## Blocks

- render/library finalize.
- rollout/resume.

## Files Owned By This Section

- new QA helper such as `apps/web/server/services/marketplaceAutoReviewQa.ts`.
- `apps/web/server/services/marketplaceAutoReviewService.ts` QA integration.
- existing skill/QA services only when reused behind this service.
- focused QA tests.

## Tests First

- Test product visual QA blocks changed product color/material/geometry/part count/label/logo placement.
- Test product visual QA blocks selected variant/SKU drift such as wrong color, size, package count, bundle, scent, or visible option.
- Test product QA blocks invented accessories or extra parts.
- Test face continuity QA blocks identity drift across shots.
- Test character continuity QA compares against `CharacterIdentityAssetPack`, not only prompt text, for recurring face, hands, wardrobe, body, lip-sync, and voice continuity.
- Test back-facing person with later face reveal requires continuity lock or blocks.
- Test no-face/hands-only/single-shot fallback policy blocks later face reveal, profile-to-front, face re-entry, or native-audio identity drift.
- Test storyboard QA blocks adjacent shot story discontinuity.
- Test generated video QA blocks endpoint mismatch and product drift.
- Test audio QA blocks silent gaps, too-short spoken lines, mismatched voice, and unsupported claims.
- Test audio QA blocks music/SFX/TTS/native/uploaded audio without commercial-use rights, required attribution, or voice consent.
- Test final QA blocks customer/reviewer PII, private account/order/cart/chat data, or named testimonial content that survived generation.
- Test final QA blocks hidden marketplace instruction text, prompt fragments, fake tool/schema text, policy-bypass text, or provider/credit instructions that survive into narration, captions, overlays, subtitles, prompts, or metadata.
- Test distribution profile QA blocks caption, warning, CTA, product, or platform-safe-area conflicts.
- Test synthetic disclosure QA blocks missing visible/metadata/platform disclosure when required.
- Test CTA/landing QA blocks wrong product, wrong variant, unsafe redirect, private URL, expired offer, or unapproved volatile offer claim.
- Test advertising compliance QA blocks when the rule pack is draft, deprecated, expired, blocked, missing fixture replay, or missing triggered rule IDs.
- Test low-confidence or drifted QA routes to human spot-check according to calibration policy.
- Test brand/seller voice QA blocks prohibited phrases, unsupported brand claims, competitor policy violations, and public leakage of private seller notes.
- Test campaign/batch QA blocks duplicate creative variants, same-product flood, abnormal repair spend, provider refusal spike, or policy-risk spike before additional paid work.
- Test human review queue QA blocks advancement when required review is queued, rejected, expired, or scoped to different artifacts/policy snapshots.
- Test publishable package QA blocks missing/non-compliant thumbnail, title, caption/description, hashtags, alt text, transcript/subtitle, metadata manifest, or checksum refs.
- Test subtitle/transcript QA rejects visual prompts, internal planning text, private evidence, or unverified ASR drift as final subtitle sources.
- Test input change impact QA invalidates stale QA verdicts when evidence refs, product refs, policy snapshots, generated refs, or final audio/render refs change.
- Test safe generated media can be preserved with recheck when changed inputs do not affect that artifact.
- Test product reference asset pack QA blocks low-resolution, wrong-variant, collage-like, rights-blocked, privacy-risky, remote-unhosted, or misleading product refs before they are used for visual generation or repair.
- Test each storyboard cell, start frame, stop frame, video keyframe, thumbnail, and final render sample has gateway-routed vision QA before acceptance.
- Test product mismatch, wrong variant, product distortion, missing product, invented detail, low visual quality, prompt misalignment, unwanted text/glyph, or endpoint mismatch creates targeted frame/keyframe repair.
- Test native-audio or voice-driven generation that changes face, mouth movement, or speaking identity creates targeted shot/clip repair or switches to product-only/separate-TTS strategy.
- Test failed/unverified/superseded media is quarantined from downstream outputs and positive creative memory.
- Test accepted-with-warnings media requires scoped approval and warning metadata before routing to user-visible surfaces.
- Test QA stages cannot complete or allow downstream render when completion evidence lacks required QA verdict refs, warning approvals, repair closure, or accepted-media refs.
- Test repair decision targets the smallest failed unit.
- Test QA verdict references artifact lineage and selected variant hash for generated outputs when applicable.
- Test retry exhaustion creates `blocked_needs_user` or `failed_terminal`.

## Implementation Requirements

Create QA verdict type:

```ts
interface QAVerdict {
  status: "pass" | "pass_with_warnings" | "needs_repair" | "blocked";
  gate: string;
  score?: number;
  reasonCodes: string[];
  evidenceRefs: string[];
  repairTargets: RepairTarget[];
  userActionRequired?: boolean;
}
```

QA gates:

- intake QA;
- concept QA;
- storyboard QA;
- media payload QA;
- generated visual QA;
- generated video QA;
- audio QA;
- advertising compliance QA;
- privacy QA;
- audio rights and mix QA;
- distribution profile QA;
- synthetic disclosure and provenance QA;
- CTA/landing integrity QA;
- advertising policy rule-pack QA;
- calibration and human spot-check QA;
- campaign governance QA;
- brand/seller voice QA;
- human review queue QA;
- publishable package QA;
- input change impact QA;
- product reference asset pack QA;
- shot frame vision QA;
- targeted media unit repair QA;
- generated media acceptance QA;
- stage completion evidence QA;
- render preflight QA;
- final QA.

Repair rules:

- smallest affected unit only;
- no regeneration of passed media unless upstream contract changed;
- frame-level failures repair the exact storyboard cell, start frame, stop frame, video keyframe, thumbnail, or render sample that failed;
- clip/audio-driven character drift repairs the affected clip or audio strategy, not unrelated frames;
- cap retries by gate and reason code;
- preserve accepted outputs;
- persist every repair attempt and outcome.

Product visual QA should compare generated outputs against `ProductVisualIdentityLock`, selected `ProductVariantSnapshot`, and artifact lineage, not just prompt text.

Shot frame vision QA must:

- call only gateway-routed LLM vision models or approved deterministic image comparators behind the backend service;
- record `llm_visual_qa` credits and `ShotFrameVisionQaEnvelope` refs;
- include product refs, selected variant hash, protected product attributes, character refs, shot intent, and allowed transformations;
- include character identity asset pack refs, face/voice visibility policy, allowed shot scopes, and fallback plan whenever a person or voice appears;
- block downstream consumption until each required frame/keyframe status is `passed`;
- create `TargetedMediaUnitRepairPlan` for `needs_targeted_repair`.

Character continuity QA must prefer explicit `CharacterIdentityAssetPack` evidence. If an over-shoulder/back-facing shot could reveal a face later, it must either be locked as never revealing the face or use a visible identity-consistent face from an approved pack.

Audio QA must verify:

- continuity across clips;
- no awkward silent tail;
- duration fit;
- natural Thai rhythm;
- stable voice when using TTS;
- stable voice or approved separate-TTS fallback when the character identity asset pack limits native-audio/lip-sync use;
- no unsupported spoken claim;
- commercial-use rights, attribution, and voice consent for every non-silent audio ref;
- loudness target, music-under-voice level, and abrupt cut limits from `AudioRightsAndMixEnvelope`.

Privacy and distribution QA must verify:

- final visuals, captions, subtitles, overlays, and transcript contain no unapproved marketplace/customer/reviewer/account/order/cart/chat/private seller data;
- final visuals, captions, subtitles, overlays, prompts, metadata, and repair instructions contain no quarantined marketplace instruction text from `MarketplaceEvidenceInstructionFirewall`;
- warning text, captions, CTA, product protection area, and platform UI safe areas comply with `MarketplaceAutoReviewDistributionProfile`;
- required synthetic-media disclosure and provenance metadata comply with `SyntheticMediaDisclosureEnvelope`;
- CTA copy, link, redirect chain, product identity, variant, and offer wording comply with `CtaLandingIntegrityEnvelope`;
- advertising compliance verdicts cite the approved `AdvertisingPolicyRulePack` and triggered rule IDs for claim, warning, thumbnail, metadata, CTA, and Thai-regulated-category checks;
- low-confidence model-based QA, provider/model drift, fixture regression, or user-rejection spikes create human spot-check or internal-only promotion gates;
- campaign/batch outputs comply with `CampaignGenerationGovernanceEnvelope`, including duplicate similarity, spend anomaly, cap, and approval rules;
- public narration, captions, overlays, and metadata comply with `BrandVoiceAndSellerPolicyEnvelope` without copying private seller instructions or internal compliance text;
- review-required outputs comply with `HumanReviewQueuePolicy` and cannot advance on expired, rejected, or wrong-scope approvals;
- thumbnail, title, caption/description, hashtags, alt text, transcript, subtitle refs, metadata manifest, and checksum refs comply with `PublishableAssetPackageEnvelope`;
- transcript/subtitle timing must be checked against final audio after render or verified alignment, not only planned shot duration;
- stale QA verdicts, approvals, and repair decisions comply with `RunInputChangeImpactEnvelope` before they can continue to authorize downstream work;
- product reference asset packs must pass enough quality, variant, rights, freshness, privacy, and hosting checks before they can authorize visual generation, repair, thumbnail selection, or future reference selection;
- each visual unit complies with `ShotFrameVisionQaEnvelope` before it becomes storyboard, video, thumbnail, or final render input;
- each person/voice-dependent unit complies with `CharacterIdentityAssetPack` and `CharacterContinuityLock` before it becomes storyboard, video, thumbnail, audio, or final render input;
- targeted repairs comply with `TargetedMediaUnitRepairPlan` and invalidate only dependent downstream refs;
- every generated unit complies with `GeneratedMediaAcceptanceEnvelope` before it is visible, reusable, or accepted as a downstream reference;
- QA gate completion writes stage completion evidence that distinguishes pass, pass-with-warnings, needs-repair, blocked, and terminal failure instead of relying on freeform QA text;
- repair targets the overlay/subtitle/audio mix/export variant when the media itself is otherwise valid.

## UI/UX Contract

### Target User / JTBD
N/A - backend QA/repair section only. User-facing QA/blocker rendering is planned in section-09.

### Surface Inventory
N/A - no browser-visible surface is modified in this section.

### Component Map
N/A - no UI component ownership in this section.

### State Matrix
N/A - QA statuses are persisted for UI consumption; rendering is covered in section-09.

### Responsive Matrix
N/A - no responsive UI work in this section.

### Accessibility Acceptance
N/A - no interactive UI created in this section.

### Copy Contract
N/A - no direct UI copy created here; blocker reason codes are rendered in section-09.

### Browser Evidence Required
N/A - browser evidence belongs to section-09.

## Acceptance Criteria

- Broken product, character, story, or audio outputs do not silently advance.
- Repair loops are targeted and auditable.
- Final render cannot start until required QA gates pass or explicit policy allows warnings.
- Variant/SKU drift cannot pass as a product-fidelity warning when it changes material product truth.
- Final render cannot start when privacy, audio-rights, mix, or distribution-profile gates fail.
- Final render cannot start when synthetic disclosure, CTA/landing integrity, or calibration spot-check gates fail.
- Final render cannot start when the active advertising policy rule pack is not approved or when required rule-pack fixture replay has failed.
- Final render or additional batch spend cannot start when campaign governance, brand/seller policy, or required human review gates fail.
- Final render or publishable-package promotion cannot start when thumbnail, subtitle/transcript, platform metadata, manifest, checksum, or package QA gates fail.
- Final render or downstream reuse cannot start when input-change impact requires recheck, repair, replan, regeneration, or stale approval invalidation.
- Storyboard Review, video generation, render, and Library finalize cannot consume failed or uninspected required visual units.
- Targeted repair preserves unrelated passed frames/clips/audio/package artifacts.
- Failed, unverified, policy-blocked, superseded, or discarded generated media remains internal-only and cannot become positive creative memory.
- Visual QA and repair are grounded in the approved product reference asset pack rather than raw marketplace URLs or prior generated approximations.
- QA-driven stage transitions are evidence-gated so missing verdicts cannot be treated as pass.
