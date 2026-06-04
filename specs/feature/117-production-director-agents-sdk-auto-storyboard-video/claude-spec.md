# Synthesized Spec: Feature 117 Production Director Agents SDK Auto Storyboard And Video

## Summary

Feature 117 upgrades Marketplace Auto Review and Production Director automation into a stage-based, Agents SDK-driven runtime for creating product review storyboards and videos from existing product data. It must replace the current deterministic planner for eligible automation paths and must not use node canvas, `ProductionSpace`, or `flowNodes`.

The first concrete vertical slice is Marketplace Capture product detail:

```text
selected product
-> Create Storyboard or Auto Create Review Video
-> marketplace auto review run/stage pipeline
-> product evidence lock
-> Agents creative concept/storyboard/prompt/audio plan
-> QA and repair
-> Storyboard Review and/or final video in Media Library
```

## Non-Negotiables

- Replacement runtime, not shadow mode.
- Marketplace Auto Review run/stage state remains source of truth.
- Node canvas is out of scope.
- Python backend is the only SDK import boundary.
- Every SDK-driven LLM call must go through SmartSpecPro LLM gateway.
- Credit estimation, reservation, deduction, release/refund, and audit remain platform-owned.
- Agents may invent creative concepts, not product facts.
- Product references are immutable identity anchors.
- Generated human identity, face continuity, and voice continuity must be anchored to approved character identity asset packs before provider spend.
- Thai advertising and visual warning/disclosure rules must be checked.
- Campaign/batch automation must be capped, duplicate-safe, spend-safe, brand-safe, and reviewable.
- Final outputs should include a checked publishable package when platform metadata, thumbnail, subtitles, transcript, manifest, or checksums are required.
- Mid-run input changes must invalidate stale approvals, QA, credit estimates, and downstream artifacts only where affected.
- Start/stop/storyboard frames and video keyframes must pass gateway-routed vision QA and targeted repair before downstream use.
- Product reference asset packs must be approved before paid visual generation or repair uses product images.
- Thai/global/platform advertising policy decisions must cite approved rule-pack versions and triggered rule IDs.
- Stage completion must be evidence-gated; provider success, agent text, or handler completion is not enough to mark a stage complete.
- SDK tools, handoffs, hosted capabilities, sessions, traces, output schemas, and retry/resume behavior must be locked to a Node-created capability manifest per stage attempt.
- Every run must persist a production creative brief snapshot before concept generation so objective, audience, CTA, style, quality mode, and user hints are auditable and safely invalidated when changed.
- Marketplace DOM/OCR/reviews/seller text/prior AI output must pass a persisted evidence instruction firewall before Agents or LLM prompts can consume it; page content cannot steer instructions, tools, providers, credits, approvals, policy, routing, or public copy.
- Recurring presenters, hand models, synthetic characters, and voices must use `CharacterIdentityAssetPack` refs with consent, allowed shot/voice scope, and fallback rules.

## Primary Deliverables

1. Runtime contract extension for `media_production`.
2. Node service client that calls the Python Agents runtime through the existing backend boundary.
3. Structured product evidence, claim, volatile-signal, and product visual identity contracts.
4. Agents-driven creative concept set, storyboard, prompt plan, voiceover/audio plan, and media payload plan.
5. Direct shot-payload media execution adapter that bypasses node canvas for this feature.
6. QA gates and repair loops for product truth, product visuals, face continuity, story continuity, audio continuity, ad compliance, visual warning text, render readiness, and final output.
7. Credit/billing idempotency and audit coverage for all LLM, media, audio, repair, render, and finalization steps.
8. UI progress and blocker states in Marketplace Capture product detail and downstream review surfaces.
9. TDD coverage and E2E flows for storyboard-only and full-video modes.
10. Backend-derived timeline status projection that shows completed, current, blocked/waiting, and remaining stages.
11. Operational hardening for provider/model availability, no silent downgrade, cancellation, backpressure, asset URL hygiene, retention, and likeness/consent.
12. Durable approval decision ledger and immutable policy/model/pricing/compliance snapshots for audit and replay.
13. Variant/SKU snapshot handling so selected marketplace options cannot drift in visuals, claims, pricing, or output metadata.
14. Backward-compatible API projections for run detail/list surfaces, with redaction of raw prompts, provider payloads, signed URLs, and internal traces.
15. Canonical artifact lineage from product evidence and shot payloads through provider jobs, QA, approvals, credits, render, and Library output.
16. Operator recovery runbook for stuck runs, orphan provider jobs, re-host failures, refund mismatches, timeline rebuilds, and gateway/provider outages.
17. Shared-product access, credit payer, and background recheck snapshots for owner/group Marketplace products.
18. Evidence freshness and asset readiness checks for stale products, purged raw evidence, and remote marketplace images.
19. Asset-use rights and media-safety/provider-refusal contracts for brand/logo/badge/review-image restrictions and non-retryable safety refusals.
20. Campaign/batch governance, brand/seller voice policy, spend anomaly detection, and human review queue contracts for high-volume automation.
21. Publishable asset package contract for thumbnail/cover, title/caption/description, hashtags, subtitle/transcript artifacts, platform metadata, manifest, and checksum refs.
22. Run input change impact contract for product/evidence/policy/profile/user edits during long-running automation.
23. Shot frame vision QA and targeted media unit repair contracts for exact-unit visual/audio-continuity repair.
24. Generated media acceptance/quarantine contract for candidate, accepted, warning-accepted, quarantined, superseded, and discarded refs.
25. Product reference asset pack contract for primary/supporting/rejected product refs, crop/mask/fingerprint refs, selected variant binding, and better-image blockers.
26. Advertising policy rule-pack contract for source anchors, rule IDs, warning templates, fixture refs, effective dates, approval state, and replayable compliance decisions.
27. Stage completion evidence contract for required refs, missing refs, warning/blocking reason codes, evaluator, and transition idempotency.
28. SDK capability manifest contract for allowed agents, tools, handoffs, output schemas, session policy, trace policy, stream policy, hosted capability denials, and manifest hash.
29. Production creative brief snapshot contract for objective, target audience, viewer promise, creative latitude, quality mode, auto-decision policy, style, CTA intent, user hint trust, ambiguity, and snapshot hash.
30. Marketplace evidence instruction firewall contract for untrusted DOM/OCR/review/seller/prior-AI content, quarantined instruction-like refs, safe fact refs, blocked refs, and pre-gateway-spend enforcement.

## Data Contracts To Add Or Version

At minimum:

- `MarketplaceAutoReviewRunMetadataV2`
- `MarketplaceAutoReviewStageOutputV2`
- `MarketplaceAutoReviewStageCompletionEvidence`
- `ProductionAgentsSdkCapabilityManifest`
- `ProductionCreativeBriefSnapshot`
- `MarketplaceEvidenceInstructionFirewall`
- `MediaProductionAgentRequest`
- `MediaProductionAgentResponse`
- `ProductEvidenceLock`
- `ProductVariantSnapshot`
- `MarketplaceAutomationAccessSnapshot`
- `ProductEvidenceFreshnessSnapshot`
- `ProductReferenceAssetPack`
- `CharacterIdentityAssetPack`
- `AssetRightsEnvelope`
- `ClaimEvidenceMap`
- `VolatileSignalPolicy`
- `ProductVisualIdentityLock`
- `CharacterContinuityLock`
- `CreativeConceptSet`
- `StoryboardContract`
- `ShotMediaPayloadContract`
- `NaturalSpeechContract`
- `AdvertisingComplianceProfile`
- `AdvertisingVisualWarningPlan`
- `AdvertisingPolicyRulePack`
- `QAVerdict`
- `RepairDecision`
- `CreditReservationPlan`
- `MarketplaceAutoReviewApiProjection`
- `MarketplaceAutoReviewArtifactLineage`
- `MarketplaceAutoReviewApprovalDecision`
- `MarketplaceAutoReviewPolicySnapshot`
- `CampaignGenerationGovernanceEnvelope`
- `BrandVoiceAndSellerPolicyEnvelope`
- `HumanReviewQueuePolicy`
- `PublishableAssetPackageEnvelope`
- `RunInputChangeImpactEnvelope`
- `ShotFrameVisionQaEnvelope`
- `TargetedMediaUnitRepairPlan`
- `GeneratedMediaAcceptanceEnvelope`

## Status And Failure Semantics

Existing user-facing statuses may remain, but internal detail must distinguish:

- `running`
- `waiting_provider`
- `awaiting_credit_authorization`
- `blocked_needs_user`
- `completed_with_warnings`
- `failed_retriable`
- `failed_terminal`
- `cancelled`

If changing DB enums is too risky, preserve existing status values and add structured status detail in metadata/stage output.

The API/UI must expose a timeline projection derived from durable run/stage state. It must show every stage in order, completed stages, the active stage/substep, waiting provider/credit/user-action states, blockers, outputs, repair attempts, and remaining stages. The frontend must not guess timeline state from raw strings alone.

`getAutoReviewRun` should return the full Feature 117 projection when available. `listAutoReviewRuns` should return only a safe lightweight summary. Both must remain compatible with Feature 118-era rows and must not expose raw provider payloads, raw prompts, long-lived signed URLs, QA crops, or internal stack traces.

## Stage Behavior

`product_preflight`

- Load product, images, permissions, tenant policy, previous completed artifacts, and supporting insights.
- Build evidence lock and volatile-signal policy.
- Build product reference asset pack for visual generation and block/request better image when product refs are unreliable.
- Preserve selected variant/SKU snapshot when marketplace option evidence exists, including option labels, selected image refs, price snapshot refs, stock text, volatility policy, and variant hash.
- Block or stay generic when a product has visible variants but no selected snapshot.
- Classify product category and advertising risk.
- Block if evidence is insufficient for automated claims or product visuals.

`production_project`

- Create/link a Production Project record for ownership and output traceability.
- Do not create or update node canvas/`ProductionSpace`/`flowNodes`.

`concept_story`

- Call Agents runtime through gateway only.
- Produce several creative concepts with novelty fingerprints, hook types, truth-risk scores, product evidence maps, and ad-compliance scores.
- Auto-select only if it passes thresholds.

`prompt_plan`

- Produce storyboard shots, voiceover, captions/on-screen text, visual warning plan, product visual locks, character locks, audio contract, and media payload contracts.
- Run schema, product truth, ad, and continuity checks before media spend.

`image_generation`

- Schedule direct storyboard/image tasks from validated shot payloads.
- Use only approved product reference asset pack refs for product-dependent visual payloads.
- Preserve existing frame strategy names.
- Run product visual QA and storyboard continuity QA.

`storyboard_review`

- Create the existing Storyboard Review projection with QA trace, evidence, warning plan, and credit summary.
- Attach canonical artifact lineage refs.

`video_generation`

- Schedule video clips from accepted shot payloads and references.
- Run clip continuity, product identity, face identity, endpoint, and policy QA.

`audio_generation`

- Resolve native, TTS, or silent strategy.
- Check natural Thai speech, duration, no gaps, no inconsistent voice, and no unsupported claims.

`video_edit`

- Create deterministic Video Editor projection only from accepted clips/audio.
- Use accepted media refs and lineage only; never use provider task IDs as media URLs.

`render`

- Run render preflight; submit existing render job; poll with timeout and idempotency.

`library_finalize`

- Run final QA, store final video in Media Library, attach full trace/evidence/credit summary and canonical lineage refs.

## Advertising And Warning Text Requirements

The system must classify ad risk and apply conservative defaults:

- unsupported, exaggerated, absolute, miracle, cure, guaranteed, or before/after claims are blocked unless explicitly proven and allowed;
- food/supplement/cosmetic/health/medical claims require category-specific policy;
- Thai ad compliance must consider OCPB and Thai FDA requirements;
- endorsement/affiliate/sponsored content must carry disclosure when applicable;
- visual warning/disclosure text must have exact text, language, placement, duration, contrast/readability, safe margins, and OCR/readability verification;
- warning text must not cover the product or create a misleading impression.

## Operational Hardening Requirements

- Requested and selected provider/model must be persisted with fallback reason.
- Provider/model fallback must be policy-approved and visible in the timeline; text-only or silent-output downgrade must not happen silently.
- Per-user, per-tenant, and provider-specific concurrency limits must prevent runaway jobs.
- Cancellation must stop future scheduling, cancel supported provider/render jobs, reconcile credits, and preserve already completed outputs according to retention policy.
- Provider outputs must be re-hosted/proxied when required; signed URLs must not become canonical final asset references.
- Intermediate assets need retention/deletion metadata.
- Identifiable face/voice continuity requires approved consent/rights metadata; otherwise use product-only, hands-only, or generated generic-person alternatives.
- Replay/golden fixtures must protect Agents planning, QA, timeline, warning overlay, and credit/provider race behavior from regression.
- User/admin/system approvals must be recorded as durable, scoped, idempotent approval decisions.
- Every started attempt must reference immutable model, provider capability, pricing, credit, advertising, warning-template, consent, and retention policy versions.
- Replays must evaluate against the original policy snapshot, not only the current policy.
- Recovery actions must be operator-audited and cannot mark a stage complete without artifact, QA, lineage, and credit evidence.
- Background advancement must re-check product access, group membership, tenant policy, and credit authority before each new paid stage.
- Provider moderation/content-policy refusals must become sanitized blockers or terminal failures, not repeated paid retries.
- Stale evidence and asset-rights blockers must pause or limit generation before provider spend.
- Provider callbacks/polling results must be trusted only after signature/authentication or provider-owned polling, tenant/run/stage/task binding, idempotency, and replay-safety checks.
- Payload, trace, provider response, and API projection budgets must prevent raw oversized data from breaking durable state or leaking into UI.
- Storage quota, re-hosting, codec/container, duration, resolution, byte-size, transcode, cleanup, and playability gates must pass before render/library finalize.
- Retry/DLQ policies, stage leases/heartbeats, migration/backfill dry-runs, and launch SLO alerts must be in place before broad rollout.
- Marketplace evidence privacy must redact or block account/order/cart/payment/chat/customer/reviewer/private-seller data before planning and final media.
- Marketplace evidence instruction firewall must quarantine hidden prompt injection, fake tool/schema text, fake provider/credit instructions, policy-bypass requests, and output-routing attempts before planning, QA, repair, provider prompts, or metadata generation.
- Audio/music/SFX/TTS/native/uploaded audio must have commercial-use rights, attribution, voice consent, and mix targets before final render.
- Every final output must match a declared distribution profile for platform, aspect ratio, duration, safe areas, captions, warning text, CTA, loudness, and export variants.
- Creative feedback memory must be tenant-safe, redacted, and must not treat failed/blocked/non-compliant outputs as positive examples.
- Synthetic-media disclosure, provenance metadata, platform flags, and visible/metadata disclosure decisions must be preserved when policy requires them.
- CTA and landing links must be validated for reachability, redirect safety, product/variant match, current offer evidence, and tracking policy before finalization.
- QA calibration must gate model/provider/policy drift, low-confidence verdicts, and high-risk cohorts through fixture replay or human spot-check.
- Final Library outputs must carry post-publish governance for allowed reuse, expiry, invalidation triggers, and takedown/re-check actions.
- Campaign/variation generation must enforce caps, duplicate similarity thresholds, spend caps, anomaly blockers, and scoped batch approvals before additional paid work.
- Brand/seller voice must shape tone/register/CTA/pronunciation only within product truth, policy, rights, privacy, disclosure, and evidence constraints.
- Human review queues must capture reason, role, artifact scope, policy snapshot, SLA, timeout, and repair/rejection outcomes for high-risk or high-volume automation.
- Publishable packages must validate thumbnails, platform titles/captions/descriptions/hashtags, transcripts/subtitles, alt text, manifests, and checksums as governed output artifacts, not optional polish.
- Input change impact must compare previous/current snapshots, invalidate stale approvals/QA/credit refs, preserve safe artifacts, and redo only affected stages.
- Shot frame vision QA must inspect storyboard cells, start/stop frames, video keyframes, thumbnails, and final render samples through gateway-routed vision QA.
- Targeted repair must regenerate only failed shot/frame/clip/audio units and preserve unrelated accepted artifacts.

## UI/UX Requirements

Marketplace product detail must remain the primary entry point. The UI should show:

- product readiness,
- automation mode,
- output mode,
- frame/audio strategy,
- credit estimate and authorization state,
- current stage and QA status,
- timeline of completed/current/remaining stages,
- blockers and repair attempts,
- generated Storyboard Review / Video Editor / Library links,
- cancellation and manual refresh/advance controls.

The UI must not expose node canvas as part of this flow.

## Acceptance Criteria

- A user can start storyboard-only automation from a selected Marketplace product and receive a Storyboard Review output.
- A user can start full-video automation and receive a final Library video when inputs/providers are healthy.
- Repeated runs for the same product produce materially different creative concepts while staying product-truth safe.
- All LLM calls route through the LLM gateway.
- Direct provider LLM credentials/base URLs are rejected.
- Credit-affecting actions are idempotent and audited.
- No Feature 117 execution creates or depends on node canvas/`ProductionSpace`/`flowNodes`.
- Unsupported claims, product visual drift, face/voice continuity drift, audio gaps, missing warning text, and Thai ad-policy blockers prevent finalization or trigger targeted repair.
- Variant/SKU context is preserved or the run blocks/stays generic before media spend.
- Detail/list APIs expose versioned redacted projections without breaking old rows.
- Final outputs can be traced through canonical lineage to evidence, prompts/payloads, QA, approvals, credits, and storage refs.
- Operators can recover or terminate stuck jobs through audited procedures without bypassing hard policy or credit controls.
- Shared-product generation has explicit permission and billing authority.
- Stale or unreachable marketplace evidence cannot become volatile claims or failed provider jobs.
- Standalone brand/logo/marketplace badge/review-image use is blocked without explicit rights approval.
- Provider safety refusals stop safely without runaway retry spend.
- Provider callback auth/replay failures, oversized payloads, storage quota/transcode failures, and repeated transient failures become durable timeline-visible blockers or DLQ/recovery states.
- Old Feature 118 rows remain readable and migration/backfill tooling proves new projections can be rebuilt without destructive history rewriting.
- Marketplace PII/privacy, audio rights, distribution profile, and creative-memory blockers are durable QA/approval states, not hidden prompt instructions.
- Evidence instruction firewall blockers are durable preflight/QA states, so injected marketplace text cannot reappear after resume, migration/backfill, or timeline rebuild.
- Character identity asset pack blockers are durable preflight/QA states before recurring presenter/voice planning, provider dispatch, repair, thumbnailing, render, or Library finalization.
- Synthetic disclosure, CTA integrity, calibration, and post-publish governance blockers are durable QA/approval states before download, reuse, or future publication.
- Campaign governance, brand/seller policy, spend anomaly, and human review queue blockers are durable QA/approval states before repeated generation, render, download, or publication.
- Publishable package blockers are durable QA states before an output is marked ready for the selected platform.
- Input-change impact blockers are durable QA/approval/credit states before continuing after product, evidence, policy, profile, or script edits.
- Frame vision QA and targeted repair blockers are durable stage states before Storyboard Review, video generation, render, or Library finalization.
- Character identity pack scope, consent, and fallback rules prevent unsafe face reveal, person swap, lip-sync drift, native-audio identity drift, or unapproved real-person imitation.
