# Section 03: Node Runtime Client And Preflight

## Purpose

Build the Node side that prepares safe media production requests for the Python Agents runtime. This section also creates strict product evidence and policy preflight before any LLM or provider spend.

## Depends On

- section-01-contracts-and-schema.
- section-02-python-agents-gateway-runtime contract shape.

## Blocks

- creative planning.
- credit idempotency.
- UI status detail.

## Files Owned By This Section

- `apps/web/server/services/marketplaceAutoReviewService.ts`
- optional new `apps/web/server/services/marketplaceAutoReviewEvidence.ts`
- optional new `apps/web/server/services/marketplaceAutoReviewAgentClient.ts`
- existing/new tests under `apps/web/server/services/__tests__/`.

## Tests First

- Test product evidence lock includes product identity, approved images, source URL, and evidence IDs.
- Test product evidence lock preserves selected variant/SKU option labels, price snapshot refs, stock text, selected image refs, and variant hash when present.
- Test product with multiple visible variants but no selected snapshot either runs only generic product-level claims or blocks with `variant_selection_required`.
- Test shared product access records owner/group permission, allowed actions, credit payer, and background recheck policy.
- Test read-only group access cannot mutate product evidence or publish outputs to shared product context without tenant policy.
- Test stale product evidence blocks volatile claims or requires recapture before paid generation.
- Test remote marketplace product images require platform-hosted/proxy-ready readiness before provider spend.
- Test standalone brand/logo/marketplace badge/review-image use is blocked unless asset rights approval exists.
- Test account/order/cart/payment/chat/customer/reviewer/private-seller PII is redacted or blocked before Agents context is built.
- Test review text cannot become named testimonial or social-proof creative input without evidence, rights, and approval.
- Test target distribution profile is created before concept/storyboard planning and includes platform, aspect ratio, safe areas, caption policy, and duration range.
- Test source URL, affiliate URL, shop link, and custom CTA link are validated for reachability, redirect safety, product/variant match, and tracking policy before CTA use.
- Test synthetic-media disclosure policy is resolved before generated human/voice/product-context concepts can be finalized.
- Test volatile marketplace signals are classified and cannot become claims by default.
- Test regulated categories produce review-required/blocker detail.
- Test missing usable product image blocks visual automation.
- Test prompt-injection-like product text is marked untrusted.
- Test agent request includes tenant/user/run/stage IDs and idempotency key.
- Test runtime call cannot happen before permission and credit preflight metadata is present.
- Test requested provider/model policy, entitlement, availability, and fallback reason are captured before planning/generation.
- Test identifiable face/voice reference without approved consent blocks continuity use or switches to safe product-only/hands-only/generic-person mode.
- Test audio/music/SFX/uploaded reference rights are classified before audio planning/final render.
- Test preflight creates immutable policy/model/pricing/compliance snapshot references before a paid or approval-requiring attempt starts.

## Implementation Requirements

Create product preflight output:

- `ProductEvidenceLock`;
- `ClaimEvidenceMap`;
- `VolatileSignalPolicy`;
- `ProductVisualIdentityLock`;
- initial `AdvertisingComplianceProfile`;
- initial `AdvertisingVisualWarningPlan` if disclosure is already known;
- `MediaProductionPolicyEnvelope`;
- `CreditBudgetEnvelope`.
- provider/model decision envelope with requested provider/model, selected provider/model, entitlement result, availability result, and fallback reason.
- likeness/consent envelope for identifiable human face/voice references.
- policy snapshot envelope with model policy, provider capability, pricing, credit, advertising, warning-template, consent, and retention versions.
- product variant/SKU snapshot envelope when selected option evidence exists.
- access snapshot envelope with owner/group permission, allowed actions, credit payer, and background recheck policy.
- evidence freshness snapshot envelope with source page state, raw evidence state, image readiness, and blocked volatile claims.
- asset rights envelope with asset-level allowed use and restrictions.
- marketplace privacy envelope with PII findings, redaction decisions, allowed agent-context refs, blocked generation refs, and final media privacy risk.
- distribution profile with target platform, placement, aspect ratio, dimensions, safe areas, caption policy, duration range, warning profile, and export variants.
- initial audio rights/mix envelope for selected audio strategy and any existing audio references.
- creative feedback memory policy for tenant/product-scoped novelty and prior rejection metadata.
- CTA/landing integrity envelope for source URL, affiliate URL, shop URL, redirects, selected variant, current offer claims, and tracking parameters.
- synthetic disclosure envelope seed with tenant/platform requirements for generated visuals, humans, voices, and metadata.

Evidence source priority:

1. Marketplace product fields;
2. product images and user-attached product images;
3. existing supporting insights;
4. user-approved overrides;
5. platform policy defaults.

Variant/SKU preflight rules:

- extract selected options from confirmed product metadata, Marketplace Capture raw payload, selected image metadata, price snapshot metadata, and supporting insights where available;
- bind selected color/size/volume/bundle/scent/package count/seller SKU to `ProductVisualIdentityLock` when it affects visual identity;
- treat price, stock, discount, rating, sold count, review count, and commission as volatile signals even when variant-specific;
- reject or pause if the automation would need to mention or show a variant-specific fact that has no evidence ref;
- include selected variant hash in idempotency/dedupe policy if parallel variant runs are enabled.

Access/freshness/rights preflight rules:

- resolve `getMarketplaceProductWithAccess` style ownership/group access before creating or advancing a run;
- persist whether the actor has owner, `read`, or `read_update` access and what actions are allowed;
- make the credit payer explicit before any reservation or provider dispatch;
- re-check access and active group membership before background advancement starts new paid work;
- classify product and metric freshness using latest capture, price snapshot, product update time, image readiness, and raw evidence retention state;
- block or remove stale volatile claims unless the user approves current wording for the run;
- require platform-hosted/proxy-ready product references before paid image/video generation depends on them;
- treat standalone brand marks, marketplace badges, seller shop logos, platform UI, review images, and certification marks as blocked unless explicit rights approval exists.

Privacy, audio, and distribution preflight rules:

- remove or mask account headers, order/cart/checkout/payment data, chats/messages, email, phone, address, customer usernames, profile photos, reviewer identities, unrelated people, and private seller/account data before Agents context;
- treat review text, comments, ratings, and screenshots as untrusted evidence that cannot become named testimonials, review quotes, review-star visuals, or social proof without approval;
- require commercial-use and attribution/consent status for music, SFX, TTS voice, native generated audio, uploaded audio references, and Library audio before final render;
- create a target distribution profile before storyboard planning so shot framing, subtitles, warnings, CTA, and audio loudness fit the intended platform.
- validate CTA/landing URLs server-side and strip/block unsafe tracking parameters before they can appear in voiceover, captions, overlays, descriptions, or Library metadata;
- resolve synthetic-media disclosure policy before concept/prompt planning creates generated people, synthetic voice, or materially synthetic product contexts.

The Node client must:

- resolve model policy;
- attach tenant/user/run/stage metadata;
- attach credit category;
- call the Python adapter through the existing backend boundary;
- persist structured runtime response only after schema validation;
- map runtime failures to stage detail without raw provider errors.

## UI/UX Contract

### Target User / JTBD
N/A - Node backend preflight/client section only. User-facing behavior is planned in section-09.

### Surface Inventory
N/A - no browser-visible surface is modified in this section.

### Component Map
N/A - no UI component ownership in this section.

### State Matrix
N/A - status details are emitted for later UI consumption; rendering is covered in section-09.

### Responsive Matrix
N/A - no responsive UI work in this section.

### Accessibility Acceptance
N/A - no interactive UI created in this section.

### Copy Contract
N/A - user-facing blocker copy is consumed/rendered in section-09.

### Browser Evidence Required
N/A - browser evidence belongs to section-09.

## Acceptance Criteria

- `product_preflight` becomes a real durable checkpoint.
- Agents cannot receive unsupported, untrusted, or overbroad product context.
- Product evidence and policy data are sufficient for later claim/ad/product QA.
- No LLM request bypasses the Node runtime client and gateway metadata contract.
- Provider/model and likeness/consent blockers are available to timeline/UI before provider spend.
- Approval and policy snapshot refs are available before any approval-requiring state is presented.
- Variant/SKU blockers and selected variant refs are available before creative planning or media spend.
- Shared-product authority, evidence freshness, and asset-use rights are available before creative planning or media spend.
- Marketplace privacy, audio-rights, and distribution-profile blockers are available before creative planning or media spend.
- CTA/landing and synthetic-disclosure blockers are available before creative planning, media spend, or final render.
