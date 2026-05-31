# Completeness Review Round 6

Date: 2026-05-31
Scope: codebase-aware review for shared-product authority, evidence freshness, asset-use rights, and media-safety/provider refusal handling.

## Result

Plan remains implementable and is now stronger for production rollout. Round 5 covered variant/SKU, API projection, artifact lineage, and operator recovery. Round 6 checked the plan against current Marketplace Capture sharing, product health, and provider refusal behavior and found four more areas that should be explicit contracts.

## Findings Fixed

1. Shared-product authority and billing were too implicit.
   - Current Marketplace products can be owner-owned or group-shared with `read` / `read_update`.
   - Added `MarketplaceAutomationAccessSnapshot`.
   - Added rules for allowed actions, private output vs shared product mutation, explicit credit payer, access revocation, and background recheck before paid work.

2. Evidence freshness was not strict enough.
   - Marketplace Capture has product health and metric snapshots, but Feature 117 needed stronger rules for stale values.
   - Added `ProductEvidenceFreshnessSnapshot`.
   - Added blocks for stale price/discount/stock/rating/sold/review/commission/campaign claims and remote-image readiness before provider spend.

3. Asset-use rights needed a dedicated envelope.
   - Product images must stay product-reference-first, but standalone logos, badges, review images, seller logos, and platform UI are a different rights surface.
   - Added `AssetRightsEnvelope`.
   - Added rules that visible logos physically printed on product packaging may be preserved only as incidental product identity, not reused as decorative/generated brand assets.

4. Provider moderation/refusal handling needed a non-retryable path.
   - Current media task code already treats moderation/content-policy/NSFW/invalid-prompt style errors as non-retryable.
   - Added media-safety/provider-refusal requirements so Feature 117 does not waste credits retrying the same refused payload.
   - Added sanitized blocker and audit requirements.

## Current Verdict

No material spec blocker remains. The implementation still needs to choose storage shape and rollout order, but the plan now covers the major failure modes for:

- product truth and variant truth;
- group-shared access and billing authority;
- stale marketplace evidence;
- asset rights and brand/logo restrictions;
- gateway-only LLM execution;
- credit idempotency;
- direct media execution without node canvas;
- QA/repair/final render;
- API projection, lineage, and recovery.
