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
- Test product reference asset pack selects approved primary/supporting refs and rejects low-resolution, wrong-variant, collage-like, remote-unhosted, rights-blocked, privacy-risk, or misleading images before visual provider spend.
- Test visual automation blocks or requests better product images when no product reference asset pack can be approved.
- Test standalone brand/logo/marketplace badge/review-image use is blocked unless asset rights approval exists.
- Test account/order/cart/payment/chat/customer/reviewer/private-seller PII is redacted or blocked before Agents context is built.
- Test review text cannot become named testimonial or social-proof creative input without evidence, rights, and approval.
- Test target distribution profile is created before concept/storyboard planning and includes platform, aspect ratio, safe areas, caption policy, and duration range.
- Test approved advertising policy rule pack is selected before concept/storyboard planning and blocks draft/deprecated/expired/fixture-failing packs.
- Test source URL, affiliate URL, shop link, and custom CTA link are validated for reachability, redirect safety, product/variant match, and tracking policy before CTA use.
- Test synthetic-media disclosure policy is resolved before generated human/voice/product-context concepts can be finalized.
- Test campaign/variation mode creates governance envelope with product/tenant/campaign caps, duplicate similarity policy, spend cap, rate-limit keys, and approval requirement.
- Test brand/seller voice policy is loaded, redacted, evidence-bound, and blocked when it conflicts with product truth, Thai/international ad policy, privacy, rights, or disclosure rules.
- Test high-risk or high-volume run creates human review queue policy with reason, role, scope, SLA, timeout, and decision refs before further spend.
- Test distribution profile creates publishable package requirements for thumbnail, title/caption/description, hashtags, transcript, subtitle sidecar, alt text, metadata manifest, and checksums when required.
- Test newer product/evidence/policy/profile snapshot creates input change impact envelope before background advancement continues paid work.
- Test product image, selected variant, price/offer, rights, privacy, brand policy, distribution profile, CTA, warning policy, or user script edit invalidates only affected downstream refs.
- Test volatile marketplace signals are classified and cannot become claims by default.
- Test regulated categories produce review-required/blocker detail.
- Test missing usable product image blocks visual automation.
- Test prompt-injection-like product text creates `MarketplaceEvidenceInstructionFirewall` findings and cannot influence instructions, tools, model/provider routing, credit policy, approvals, output routing, or public copy.
- Test agent request includes tenant/user/run/stage IDs and idempotency key.
- Test runtime call cannot happen before permission and credit preflight metadata is present.
- Test requested provider/model policy, entitlement, availability, and fallback reason are captured before planning/generation.
- Test identifiable face/voice reference without approved consent blocks continuity use or switches to safe product-only/hands-only/generic-person mode.
- Test recurring presenter, hand model, character, or voice requires `CharacterIdentityAssetPack` before media payload planning or provider spend.
- Test low-quality, conflicting, no-consent, customer/reviewer, celebrity-like, minor-sensitive, rights-blocked, or privacy-blocked character refs are rejected or converted to safer product-only/hands-only/generic-person/separate-TTS fallback.
- Test audio/music/SFX/uploaded reference rights are classified before audio planning/final render.
- Test preflight creates immutable policy/model/pricing/compliance snapshot references before a paid or approval-requiring attempt starts.
- Test Node runtime client cannot mark `product_preflight`, `concept_story`, or `prompt_plan` complete until stage completion evidence is created and validated.
- Test Node runtime client creates a `ProductionAgentsSdkCapabilityManifest` before every Agents-backed attempt and includes its manifest hash in the Python request.
- Test runtime call is blocked when the manifest includes unapproved tools, handoffs that widen scope, hosted SDK capabilities, raw session capture, raw trace export, or missing output schemas.
- Test Node creates `ProductionCreativeBriefSnapshot` before `concept_story` planning, including default one-click Marketplace brief when the user gives no custom prompt.
- Test user creative hints that contain claim/comparison/offer language are downgraded to style-only or blocked until evidence/approval refs exist.

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
- product reference asset pack with primary/supporting refs, rejected refs, crop/mask/fingerprint refs, selected variant binding, provider use policy, QA refs, and required user action when the pack is not usable.
- asset rights envelope with asset-level allowed use and restrictions.
- marketplace privacy envelope with PII findings, redaction decisions, allowed agent-context refs, blocked generation refs, and final media privacy risk.
- marketplace evidence instruction firewall with detected instruction patterns, quarantined/blocked refs, allowed structured fact refs, and pre-gateway-spend status.
- distribution profile with target platform, placement, aspect ratio, dimensions, safe areas, caption policy, duration range, warning profile, and export variants.
- initial audio rights/mix envelope for selected audio strategy and any existing audio references.
- creative feedback memory policy for tenant/product-scoped novelty and prior rejection metadata.
- CTA/landing integrity envelope for source URL, affiliate URL, shop URL, redirects, selected variant, current offer claims, and tracking parameters.
- advertising policy rule pack refs for Thailand/global/platform rules, warning templates, source anchors, triggered rule IDs, fixture refs, and effective dates.
- synthetic disclosure envelope seed with tenant/platform requirements for generated visuals, humans, voices, and metadata.
- campaign generation governance envelope for single/variation/batch mode, rate-limit keys, duplicate detection refs, spend cap, anomaly signals, and batch approval requirement.
- brand voice and seller policy envelope for tone/register, allowed/required/blocked phrases, competitor policy, claim/CTA style, pronunciation hints, evidence refs, and approval refs.
- human review queue policy seed for high-risk/high-volume/budget/regulatory/rights/privacy/comparison scenarios.
- publishable asset package requirement seed from distribution profile, including thumbnail, transcript/subtitle, platform metadata, alt text, manifest, and checksum expectations.
- input change impact envelope when current product/evidence/policy/profile refs differ from the refs used by the latest completed stage.
- SDK capability manifest for the first Agents-backed attempt, including allowed agents, tools, handoffs, output schemas, session policy, trace policy, stream policy, hosted capability denials, and manifest hash.
- production creative brief snapshot with objective, target audience/use context, viewer promise, creative latitude, quality mode, auto-decision policy, style preferences, CTA intent, user hint trust levels, avoid list, and ambiguity status.
- character identity asset pack with source kind, consent refs, allowed face/voice usage, continuity descriptors, blocked refs, QA thresholds, and fallback plan when recurring people or voices are requested.
- stage completion evidence draft for `product_preflight` containing required product/evidence/policy/credit/lineage refs before downstream planning is allowed.

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
- build a `ProductReferenceAssetPack` before paid visual generation, thumbnail generation, or visual repair; provider payloads may use only pack-approved refs;
- reject or pause visual automation when product refs are too small, ambiguous, collage-like, wrong variant, remote-unhosted, privacy-risky, rights-blocked, dominated by platform UI/watermarks, or likely to create misleading product identity;
- treat standalone brand marks, marketplace badges, seller shop logos, platform UI, review images, and certification marks as blocked unless explicit rights approval exists.

Privacy, audio, and distribution preflight rules:

- remove or mask account headers, order/cart/checkout/payment data, chats/messages, email, phone, address, customer usernames, profile photos, reviewer identities, unrelated people, and private seller/account data before Agents context;
- run the instruction firewall after privacy redaction and before any Agents context, LLM gateway call, vision QA prompt, repair prompt, provider prompt, or metadata-generation prompt receives marketplace DOM/OCR/review/seller text or prior AI output;
- treat hidden text, prompt templates, fake JSON schemas, fake tool calls, fake provider/model instructions, fake credit/budget instructions, policy-bypass requests, and "ignore previous instructions" content as data-only evidence to quarantine, escape, reduce to safe fact refs, or block;
- treat review text, comments, ratings, and screenshots as untrusted evidence that cannot become named testimonials, review quotes, review-star visuals, or social proof without approval;
- require commercial-use and attribution/consent status for music, SFX, TTS voice, native generated audio, uploaded audio references, and Library audio before final render;
- create `CharacterIdentityAssetPack` before a recurring visible face, hand model, presenter, synthetic character, lip-sync shot, voice-only persona, or native-audio character strategy can be planned;
- reject marketplace profile photos, reviewer/customer images, private seller faces, celebrity-like references, minors, and any identifiable face/voice without scoped consent unless policy explicitly allows use; use product-only, hands-only, generic-person, single-shot, or separate-TTS fallback when continuity is risky;
- create a target distribution profile before storyboard planning so shot framing, subtitles, warnings, CTA, and audio loudness fit the intended platform.
- validate CTA/landing URLs server-side and strip/block unsafe tracking parameters before they can appear in voiceover, captions, overlays, descriptions, or Library metadata;
- select an approved `AdvertisingPolicyRulePack` before planning; draft, deprecated, expired, blocked, or fixture-failing packs cannot authorize compliance decisions or provider spend;
- resolve synthetic-media disclosure policy before concept/prompt planning creates generated people, synthetic voice, or materially synthetic product contexts.
- enforce product/tenant/campaign active-run caps, daily variant caps, duplicate creative similarity thresholds, spend caps, and rate-limit keys before campaign/batch planning spends LLM credits;
- treat abnormal repair spend, provider refusal spikes, policy-risk spikes, or same-product campaign floods as preflight blockers for additional paid work;
- load brand/seller voice as style guidance only after redacting private seller instructions and rejecting guidance that would force unsupported claims, competitor mentions, prohibited phrases, or internal notes into public media;
- create a human review queue policy before further spend when batch size, category risk, budget, low QA confidence, brand exception, competitor/comparison claim, rights/privacy exception, or post-publish reuse risk crosses policy thresholds.
- derive publishable package requirements from the selected distribution profile before planning so scripts, subtitles, metadata, thumbnail, safe areas, and platform copy limits are known before final render.
- compare current product/evidence/policy/profile refs with persisted stage refs before background advancement, repair, render, or finalization continues;
- produce a timeline-visible impact state when changed inputs require recheck, repair, replan, regeneration, approval invalidation, or credit re-estimation.

The Node client must:

- resolve model policy;
- attach tenant/user/run/stage metadata;
- attach credit category;
- build and persist a capability manifest before calling Python for an Agents-backed stage;
- reject runtime dispatch when the manifest would allow direct provider/hosted SDK execution, raw trace/session capture, unscoped handoffs, or Python-owned persistence;
- build and persist a creative brief snapshot before calling Python for concept/story planning;
- treat user hints as style/intent guidance unless they are explicitly evidence-backed or approved claims;
- pass only firewall-approved structured refs or escaped untrusted evidence blocks to Python/Agents and fail closed when the firewall status is `blocked` or confidence is too low for safe separation;
- call the Python adapter through the existing backend boundary;
- persist structured runtime response only after schema validation;
- verify every returned tool intent/ref against platform state, permissions, credit state, policy, and lineage before mutating run/stage state;
- persist stage completion evidence before marking an Agents-backed stage completed or warning-completed;
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
- Product reference asset packs are available before storyboard/image/video/thumbnail payloads use product images, and blockers are visible before provider spend.
- Character identity asset packs are available before recurring people, hands, or voices are planned or generated, and fallback/blocker states are visible before provider spend.
- Marketplace privacy, audio-rights, and distribution-profile blockers are available before creative planning or media spend.
- Evidence instruction blockers are available before any LLM/vision/repair/provider-prompt spend and cannot be bypassed by background advancement.
- CTA/landing and synthetic-disclosure blockers are available before creative planning, media spend, or final render.
- Advertising policy rule-pack blockers are available before concept selection, media spend, render, package promotion, or reuse.
- Campaign/batch governance, brand/seller voice, and human review queue blockers are available before repeated generation, additional spend, or high-risk finalization.
- Publishable package requirements are available before planning/finalization so missing thumbnails, subtitles, metadata, manifests, or checksums cannot surprise the run after render.
- Input change impact blockers are available before stale approvals, QA verdicts, credit estimates, or downstream artifacts authorize new work.
- Stage completion evidence is available before downstream stages consume preflight, concept, or prompt-plan outputs.
- SDK capability manifests are available before Python creates Agents runners, so unapproved tools, handoffs, hosted capabilities, raw traces/sessions, or persistence authority cannot appear mid-run.
- Production creative brief snapshots are available before concept generation, so objective, audience, CTA intent, style, quality mode, and auto-decision policy are explicit and auditable.
