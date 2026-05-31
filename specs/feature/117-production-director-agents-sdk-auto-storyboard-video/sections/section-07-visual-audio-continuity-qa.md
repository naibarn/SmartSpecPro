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
- Test back-facing person with later face reveal requires continuity lock or blocks.
- Test storyboard QA blocks adjacent shot story discontinuity.
- Test generated video QA blocks endpoint mismatch and product drift.
- Test audio QA blocks silent gaps, too-short spoken lines, mismatched voice, and unsupported claims.
- Test audio QA blocks music/SFX/TTS/native/uploaded audio without commercial-use rights, required attribution, or voice consent.
- Test final QA blocks customer/reviewer PII, private account/order/cart/chat data, or named testimonial content that survived generation.
- Test distribution profile QA blocks caption, warning, CTA, product, or platform-safe-area conflicts.
- Test synthetic disclosure QA blocks missing visible/metadata/platform disclosure when required.
- Test CTA/landing QA blocks wrong product, wrong variant, unsafe redirect, private URL, expired offer, or unapproved volatile offer claim.
- Test low-confidence or drifted QA routes to human spot-check according to calibration policy.
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
- calibration and human spot-check QA;
- render preflight QA;
- final QA.

Repair rules:

- smallest affected unit only;
- no regeneration of passed media unless upstream contract changed;
- cap retries by gate and reason code;
- preserve accepted outputs;
- persist every repair attempt and outcome.

Product visual QA should compare generated outputs against `ProductVisualIdentityLock`, selected `ProductVariantSnapshot`, and artifact lineage, not just prompt text.

Character continuity QA must prefer explicit face/reference identity evidence. If an over-shoulder/back-facing shot could reveal a face later, it must either be locked as never revealing the face or use a visible identity-consistent face.

Audio QA must verify:

- continuity across clips;
- no awkward silent tail;
- duration fit;
- natural Thai rhythm;
- stable voice when using TTS;
- no unsupported spoken claim;
- commercial-use rights, attribution, and voice consent for every non-silent audio ref;
- loudness target, music-under-voice level, and abrupt cut limits from `AudioRightsAndMixEnvelope`.

Privacy and distribution QA must verify:

- final visuals, captions, subtitles, overlays, and transcript contain no unapproved marketplace/customer/reviewer/account/order/cart/chat/private seller data;
- warning text, captions, CTA, product protection area, and platform UI safe areas comply with `MarketplaceAutoReviewDistributionProfile`;
- required synthetic-media disclosure and provenance metadata comply with `SyntheticMediaDisclosureEnvelope`;
- CTA copy, link, redirect chain, product identity, variant, and offer wording comply with `CtaLandingIntegrityEnvelope`;
- low-confidence model-based QA, provider/model drift, fixture regression, or user-rejection spikes create human spot-check or internal-only promotion gates;
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
