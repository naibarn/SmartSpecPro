# Section 05: Ad Compliance And Warning Overlays

## Purpose

Add advertising compliance gates for international and Thai rules, including structured visual warning/disclosure text in generated ads. This section prevents unsupported or non-compliant product-review videos from advancing silently.

## Depends On

- section-01-contracts-and-schema.
- section-04-creative-planning-contracts.

## Blocks

- QA repair.
- UI blocker state.
- final QA.

## Files Owned By This Section

- new/updated policy helper under `apps/web/server/services/marketplaceAutoReviewCompliance.ts`
- `apps/web/server/services/marketplaceAutoReviewService.ts` integration points.
- focused compliance tests.

## Tests First

- Test unsupported health/medical/cure claims are blocked.
- Test exaggerated/miracle/guaranteed/before-after claims are blocked unless proven and allowed.
- Test food or supplement benefit/property claims require stricter policy state.
- Test cosmetic disease-treatment claims are blocked.
- Test affiliate/sponsored endorsement requires disclosure when applicable.
- Test Thai warning/disclosure plan requires exact text, language, placement, duration, contrast, safe margins, and OCR/readability result.
- Test warning text cannot cover or contradict the product.
- Test required warning/disclosure overlays are rendered by deterministic compositor or render layer, not trusted to image/video prompt generation.
- Test OCR/readability failure creates targeted overlay repair without regenerating unrelated product media.
- Test warning/disclosure approval stores approved text, actor, policy/template version, affected refs, expiration when applicable, and idempotency key.
- Test general media safety blocks sexual/minor-sensitive/graphic-violence/hate/self-harm/illegal/weapon/counterfeit/unsafe-instruction content before provider spend.
- Test standalone brand/logo, marketplace badge, seller logo, platform UI, review image, or certification mark use is blocked unless asset rights policy allows it.
- Test provider content-policy refusal maps to sanitized blocker and is not retried as a paid repair loop with the same payload.
- Test marketplace/customer/reviewer PII and private account/order/cart/chat data cannot appear in ad copy, captions, overlays, or final visual frames.
- Test named review/testimonial/social-proof framing requires evidence, rights, and approval.
- Test target distribution profile safe areas are used for warning/disclosure/caption/CTA placement.
- Test required synthetic-media disclosure or platform flag is represented when policy requires it.
- Test CTA/landing offer wording is blocked when URL, selected variant, product identity, or current offer evidence fails.

## Implementation Requirements

Use conservative classification for:

- general consumer protection false/misleading ads;
- endorsement/affiliate/sponsored disclosure;
- price/discount/sold/rating/review volatile claims;
- food/supplement;
- cosmetic;
- health/medical;
- alcohol/tobacco/e-cigarette;
- financial;
- children;
- gambling;
- hazardous or regulated goods.
- general media safety: sexual content, minors, graphic violence, self-harm, hate/harassment, illegal activity, weapon instructions, controlled goods, counterfeit goods, impersonation, and deceptive endorsement.
- asset rights: standalone brand marks, shop logos, marketplace badges, platform UI, certification marks, and review images.
- marketplace privacy: customer/reviewer identity, account/order/cart/payment/chat data, private seller/account data, and unrelated people.
- target distribution profile: platform, placement, safe area, caption policy, CTA placement, and warning overlay compatibility.
- synthetic media disclosure: generated people, synthetic voice, AI-generated product scenes, platform flags, and provenance metadata.
- CTA/landing integrity: source URL, affiliate URL, offer claim, selected variant, redirect safety, and tracking policy.

Thailand policy anchors to encode as configurable policy, not hardcoded legal advice:

- OCPB consumer protection and advertising truth/proof requirements.
- Thai FDA food advertising permission/benefit/property requirements.
- Thai FDA cosmetic advertising rule that ads need not have a license but must not be false, exaggerated, misleading, or claim disease treatment.

`AdvertisingVisualWarningPlan` must include:

- exact Thai/English disclosure text;
- reason code;
- required shots;
- start/end seconds;
- location/safe area;
- contrast target;
- minimum duration;
- OCR/readability requirement;
- product-occlusion rule;
- final verification result.
- warning template version;
- approval decision ref when user/admin approval is required.

Rendering rule:

- required warning/disclosure overlays must be applied deterministically during composition/render or a controlled overlay layer;
- do not rely on image/video generation prompts to draw legal warning text;
- OCR/readability QA must inspect the actual rendered frame/video segment before finalization.
- placement must be validated against the selected `MarketplaceAutoReviewDistributionProfile`, not only generic frame coordinates.
- synthetic or affiliate disclosure must share safe-area constraints with warning text, captions, and CTA so it cannot be hidden or clipped.

Provider refusal rule:

- provider moderation/content-policy refusals are non-retryable for the same payload;
- allowed repair must remove or rewrite the unsafe concept/shot and pass policy before any new paid attempt;
- UI receives sanitized reason codes only; internal audit keeps safe provider refusal metadata.

## UI/UX Contract

### Target User / JTBD
N/A - backend policy/warning contract section. User-facing blocker rendering is planned in section-09.

### Surface Inventory
N/A - no browser-visible app surface is modified in this section.

### Component Map
N/A - no UI component ownership in this section.

### State Matrix
N/A - compliance states are persisted for UI consumption; rendering is covered in section-09.

### Responsive Matrix
N/A - no responsive app UI work in this section.

### Accessibility Acceptance
N/A - no interactive app UI created in this section.

### Copy Contract
N/A - ad warning/disclosure text is media overlay content; UI copy is covered in section-09.

### Browser Evidence Required
N/A - app browser evidence belongs to section-09; final media warning verification belongs to QA/finalize sections.

## Acceptance Criteria

- Ad compliance is a durable QA artifact, not just prompt wording.
- Thai policy-sensitive categories can pause or block automation.
- Required warning/disclosure text is verified before finalization.
- Warning/disclosure overlay failure can be repaired without mutating product imagery.
- Approved warning/disclosure text remains auditable after policy/template changes.
- Users get clear blocker reasons instead of generic failures.
- Provider safety refusals and rights blockers stop safely without repeated paid retries.
- Privacy and distribution-profile blockers stop finalization before the ad leaks personal data or places required text in an unsafe area.
- Synthetic disclosure and CTA/landing blockers stop finalization before the ad creates a misleading publishable asset.
