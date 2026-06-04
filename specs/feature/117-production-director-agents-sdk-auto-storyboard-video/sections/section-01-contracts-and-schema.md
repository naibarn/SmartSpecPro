# Section 01: Contracts And Schema

## Purpose

Create the shared contract foundation for Feature 117 before any runtime or media execution work. The system must preserve Feature 118's durable run/stage model while adding enough structured detail for Agents artifacts, QA, credit state, blockers, repairs, and final traceability.

## Depends On

- Feature 117 spec.
- Feature 118 implemented snapshot.

## Blocks

- all later sections.

## Files Owned By This Section

- `apps/web/shared/marketplaceAutoReview/*` or the closest existing shared-contract location.
- `apps/web/server/services/marketplaceAutoReviewService.ts` contract/type definitions only.
- `apps/web/drizzle/schema.ts`
- new migration under `apps/web/drizzle/` if schema fields are added.
- focused contract/schema tests.

## Tests First

- Test current Feature 118 run statuses still map to user-facing statuses.
- Test new metadata schema version validates.
- Test status detail supports `awaiting_credit_authorization`, `blocked_needs_user`, `completed_with_warnings`, `failed_retriable`, and `failed_terminal`.
- Test stage output validates known artifact types.
- Test timeline projection validates for storyboard-only and full-video stage paths.
- Test timeline item statuses cover pending, active, waiting provider, QA running, repairing, awaiting user, completed, completed with warnings, completion evidence blocked, failed, cancelled, and skipped.
- Test timeline projection is derivable from persisted run/stage data without frontend-only inference.
- Test stage completion evidence denies status-only success when required artifacts, QA, credit, policy, lineage, or acceptance refs are missing.
- Test stage completion evidence validates `repair_required`, `fail_retriable`, `block_needs_user`, `fail_terminal`, and `cancel` transitions with required reason, retry/repair, and credit reconciliation refs.
- Test production Agents SDK capability manifest validates allowed agents, tools, handoffs, output schemas, session policy, trace policy, stream policy, hosted capability denials, and manifest hash.
- Test capability manifest rejects handoffs that widen tool/write/model/credit/persistence scope and hosted SDK capabilities that bypass platform gateway/credit/audit.
- Test production creative brief snapshot validates objective, target audience/use context, viewer promise, creative latitude, quality mode, auto-decision policy, style preferences, CTA intent, user hint trust levels, ambiguity state, and snapshot hash.
- Test user hints that imply product claims require evidence or approval refs before they can influence concepts, scripts, captions, metadata, or CTA.
- Test product variant/SKU snapshot validates selected options, evidence refs, price snapshot refs, volatile-signal policy, and selected variant hash.
- Test access snapshot validates owner/group permission, allowed actions, credit payer, and background recheck policy.
- Test evidence freshness snapshot validates stale product handling, raw evidence purge state, image readiness, and blocked volatile claims.
- Test product reference asset pack validates primary/supporting/rejected refs, crop/mask/fingerprint refs, selected variant binding, provider use policy, and required user action.
- Test character identity asset pack validates source kind, consent status, reference image/video/voice refs, blocked refs, continuity descriptors, provider use policy, QA thresholds, fallback plan, and pack status.
- Test asset rights envelope validates exact-product-reference-only usage, standalone brand/logo restrictions, marketplace badge block, and approval refs.
- Test API projection schemas validate old Feature 118 rows, new Feature 117 rows, list summary projection, detail projection, and redaction flags.
- Test artifact lineage validates parent refs, product evidence refs, variant hash, QA refs, approval refs, credit refs, and storage/redaction state.
- Test provider event envelope validates signature/trust mode, tenant/run/stage/task binding, idempotency, stale/duplicate/out-of-order behavior, and redacted payload refs.
- Test payload budget validates max prompt, provider payload, stage output, trace, list projection, and detail projection sizes.
- Test storage quota plan validates estimated bytes, quota state, required re-host refs, cleanup refs, and transcode profile limits.
- Test retry/DLQ policy validates failure-class retryability, stale lease timeout, retry budget, alert threshold, and replay permission.
- Test marketplace privacy envelope validates PII finding kinds, redaction action, allowed agent refs, blocked generation refs, and final media privacy risk.
- Test marketplace evidence instruction firewall validates source refs, privacy envelope ref, detected instruction patterns, quarantined/blocked refs, allowed agent-context refs, confidence, and pre-gateway-spend enforcement.
- Test audio rights/mix envelope validates commercial-use rights, attribution, voice consent, license policy refs, blocked restrictions, and mix targets.
- Test distribution profile validates target platform, placement, dimensions, safe areas, caption policy, duration range, warning policy, and export variants.
- Test creative feedback memory policy validates tenant isolation, allowed/forbidden memory kinds, retention, external-training prohibition, and failed-output exclusion.
- Test synthetic disclosure envelope validates generated refs, materially synthetic status, synthetic human/voice flags, disclosure requirements, platform flags, provenance metadata refs, and watermark policy.
- Test CTA/landing integrity envelope validates URL reachability, redirect safety, product/variant match, current offer evidence, volatile-claim approval, and tracking policy.
- Test advertising policy rule pack validates source anchors, region/platform profiles, category triggers, rule IDs, severity, blocked patterns, required evidence kinds, warning template refs, allowed repair actions, fixture refs, approval status, and effective dates.
- Test automation quality calibration policy validates fixture refs, QA thresholds, drift signals, human spot-check policy, and promotion gate.
- Test post-publish governance envelope validates allowed reuse, review/expiry state, invalidation triggers, action-on-invalidation, external post refs, and audit refs.
- Test campaign generation governance envelope validates generation mode, active-run cap, daily variant cap, similarity threshold, spend cap, anomaly signals, approval requirement, and rate-limit keys.
- Test brand voice and seller policy envelope validates tone/register, allowed/required/blocked phrases, competitor policy, claim/CTA style policy, pronunciation hints, evidence refs, and approval refs.
- Test human review queue policy validates required reasons, approver roles, scope, SLA, timeout action, decision refs, and exact policy/artifact scoping.
- Test publishable asset package envelope validates final video refs, thumbnails, subtitles/transcripts, platform metadata, evidence refs, metadata manifest refs, checksum refs, and package QA status.
- Test run input change impact envelope validates previous/current snapshots, detected change kinds, impacted stages, artifact actions, invalidated approval/credit/QA refs, and partial-reuse status.
- Test shot frame vision QA envelope validates frame role, product refs, variant refs, character refs, gateway usage refs, per-check verdicts, findings, and targeted repair status.
- Test targeted media unit repair plan validates exact shot/media unit, failed QA ref, preserve/invalidate refs, downstream recheck stages, attempts, credit estimate refs, and idempotency key.
- Test generated media acceptance envelope validates artifact state, QA refs, repair refs, allowed/blocked surfaces, superseded refs, retention policy, and user-visibility flags.
- Test old run metadata can be read without crashing.
- Test no contract references `ProductionSpace`, `flowNodes`, or node canvas as required data.

## Implementation Requirements

Add or version these contracts:

- `MarketplaceAutoReviewRunMetadataV2`
- `MarketplaceAutoReviewStageOutputV2`
- `MarketplaceAutoReviewStatusDetail`
- `MarketplaceAutoReviewTimelineProjection`
- `MarketplaceAutoReviewTimelineItem`
- `MarketplaceAutoReviewStageCompletionEvidence`
- `ProductionAgentsSdkCapabilityManifest`
- `ProductionCreativeBriefSnapshot`
- `MarketplaceAutoReviewApiProjection`
- `MarketplaceAutoReviewRunSummary`
- `MarketplaceAutoReviewApprovalDecision`
- `MarketplaceAutoReviewPolicySnapshot`
- `MarketplaceAutoReviewArtifactLineage`
- `ProductEvidenceLock`
- `ProductVariantSnapshot`
- `MarketplaceAutomationAccessSnapshot`
- `ProductEvidenceFreshnessSnapshot`
- `ProductReferenceAssetPack`
- `CharacterIdentityAssetPack`
- `AssetRightsEnvelope`
- `MarketplaceAutoReviewProviderEventEnvelope`
- `MarketplaceAutoReviewPayloadBudget`
- `MarketplaceAutoReviewStorageQuotaPlan`
- `MarketplaceAutoReviewRetryDlqPolicy`
- `MarketplaceEvidencePrivacyEnvelope`
- `MarketplaceEvidenceInstructionFirewall`
- `AudioRightsAndMixEnvelope`
- `MarketplaceAutoReviewDistributionProfile`
- `CreativeFeedbackMemoryPolicy`
- `SyntheticMediaDisclosureEnvelope`
- `CtaLandingIntegrityEnvelope`
- `AdvertisingPolicyRulePack`
- `AutomationQualityCalibrationPolicy`
- `PostPublishGovernanceEnvelope`
- `CampaignGenerationGovernanceEnvelope`
- `BrandVoiceAndSellerPolicyEnvelope`
- `HumanReviewQueuePolicy`
- `PublishableAssetPackageEnvelope`
- `RunInputChangeImpactEnvelope`
- `ShotFrameVisionQaEnvelope`
- `TargetedMediaUnitRepairPlan`
- `GeneratedMediaAcceptanceEnvelope`
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
- `QAVerdict`
- `RepairDecision`
- `CreditReservationPlan`

Prefer additive schema evolution. If DB status enums are risky, preserve existing statuses and store detail in JSON.

Required artifact IDs:

- tenant ID,
- user ID,
- product ID,
- production run ID,
- auto review run ID,
- stage key,
- concept ID,
- creative brief snapshot hash,
- shot ID/order,
- attempt ID,
- idempotency key,
- provider task IDs where applicable.
- selected variant hash and price snapshot ID where applicable.
- access type, group share permission, credit payer, and background recheck policy where applicable.

Timeline contract requirements:

- include every canonical stage in order;
- expose `completedStageCount`, `totalStageCount`, `percentComplete`, `currentStageKey`, `currentStepLabelTh`, and `lastUpdatedAt`;
- each item includes Thai label/summary, status, timestamps, QA summary, credit summary, blocker, repair summary, output refs, and optional substeps;
- timeline data is a projection from durable run/stage/artifact state, not the source of truth;
- frontend must render this projection rather than deriving progress from raw strings alone.
- every completed, completed-with-warnings, skipped, blocked, failed, or cancelled stage transition persists completion evidence with required refs, missing refs, reason codes, evaluator, and idempotency key.
- downstream stage selection reads completion evidence and cannot advance from status-only success.

Approval and snapshot contract requirements:

- approval decisions are scoped to run, stage, actor, affected refs, reason, policy version, expiration, and idempotency key;
- policy snapshots include model policy, provider capability, pricing, credit policy, advertising policy, Thailand profile, warning template, consent policy, and retention policy versions;
- every started stage attempt can reference the immutable snapshot used at the time;
- old runs remain auditable even after current policies/prices/models change.

Variant/API/lineage contract requirements:

- variant/SKU context is optional for products without variants but required when selected option evidence exists;
- variant-specific price, stock, color, size, bundle, scent, package count, or seller SKU claims must reference `ProductVariantSnapshot` and approval policy;
- `getAutoReviewRun` detail projection includes full timeline, approval summary, policy snapshot refs, artifact lineage refs, and sanitized output links;
- `listAutoReviewRuns` summary projection stays lightweight and must not expose raw prompts, provider payloads, signed URLs, QA crops, or internal stack traces;
- artifact lineage links final outputs back to product evidence, selected variant, shot payloads, provider tasks, QA results, approvals, and credit events.
- access/freshness/rights snapshots are resolved before paid provider spend and remain auditably tied to the run.
- product reference asset packs are resolved before paid visual provider spend and remain the only allowed product-reference source for visual generation, repair, thumbnails, and future reference selection.
- character identity asset packs are resolved before recurring presenter, actor, hand-model, synthetic character, or voice generation and remain the only allowed identity-reference source for provider payloads, QA, repair, thumbnails, render, and future reference selection.
- provider event envelopes bind callbacks/polling results to the expected tenant, run, stage, media task, provider task, idempotency key, and trust/signature state before state changes.
- payload budgets keep raw prompts, provider payloads, QA crops, traces, and long internal data out of UI-facing projections.
- storage quota plans preflight intermediate/final bytes, required re-hosting, cleanup refs, and transcode/playability limits before paid media/render/finalize work.
- retry/DLQ policies classify retryability by failure class so provider refusals, quota blocks, payload budget failures, and policy blocks do not loop or spend repeatedly.
- privacy envelopes classify and redact marketplace/customer/account/order/chat/seller PII before Agents planning or final media.
- evidence instruction firewalls classify marketplace DOM/OCR/reviews/seller text/filenames/prior AI output as data-only evidence, quarantine instruction-like content, and expose only structured refs or escaped untrusted blocks to Agents.
- audio rights/mix envelopes prove commercial-use/attribution/consent status and carry loudness/mix targets before final render.
- distribution profiles bind storyboard/video outputs to platform, aspect ratio, safe areas, captions, warnings, CTA, loudness, and export variants.
- creative feedback memory policies keep novelty/feedback metadata tenant-safe, redacted, and unavailable for external model training.
- synthetic disclosure envelopes preserve generated-media disclosure, provenance metadata, platform upload flag, and watermark/visible-disclosure decisions.
- CTA/landing integrity envelopes bind CTA copy, source/affiliate/custom URLs, redirect safety, product/variant match, offer evidence, and tracking policy.
- advertising policy rule packs bind Thai/global/platform ad rules to approved rule IDs, source anchors, category triggers, warning templates, repair actions, fixture refs, effective dates, and approval status.
- automation quality calibration policies bind provider/model/QA drift, fixture replay, confidence thresholds, and spot-check promotion gates.
- post-publish governance envelopes preserve allowed reuse, expiry, invalidation triggers, re-check/tombstone actions, and external publish refs.
- campaign generation governance envelopes bind single/variation/batch mode to tenant/product/campaign caps, duplicate similarity checks, spend caps, anomaly signals, rate-limit keys, and scoped batch approvals.
- brand voice and seller policy envelopes bind tone/register, required/blocked phrasing, competitor policy, claim/CTA style, pronunciation hints, evidence refs, and approvals without allowing brand policy to override product truth or ad policy.
- human review queue policies bind high-risk or high-volume approval states to reason, role, scope, SLA, timeout behavior, policy snapshot, affected artifacts, and decision refs.
- publishable asset package envelopes bind final media, thumbnail/cover refs, subtitle/transcript refs, platform title/caption/description/hashtag/alt-text metadata, metadata manifest refs, checksum refs, evidence refs, and package QA status.
- run input change impact envelopes bind product/evidence/policy/profile/user-edit diffs to impacted stages, artifact invalidation, approval/QA/credit invalidation, and safe partial reuse.
- shot frame vision QA envelopes bind each storyboard cell, start frame, stop frame, video keyframe, thumbnail, or final render sample to gateway-routed vision QA results.
- targeted media unit repair plans bind a failed QA finding to exactly one shot/frame/clip/audio/subtitle/thumbnail unit, preserved refs, invalidated refs, downstream rechecks, and incremental credit estimation.
- generated media acceptance envelopes bind provider outputs and repair outputs to candidate, QA-pending, accepted, warning-accepted, quarantined, superseded, or discarded state before any downstream routing.

## UI/UX Contract

### Target User / JTBD
N/A - backend/shared contract section only. User-facing behavior is planned in section-09.

### Surface Inventory
N/A - no browser-visible surface is modified in this section.

### Component Map
N/A - no UI component ownership in this section.

### State Matrix
N/A - status states are contract-only here; visual states are covered in section-09.

### Responsive Matrix
N/A - no responsive UI work in this section.

### Accessibility Acceptance
N/A - no interactive UI created in this section.

### Copy Contract
N/A - no user-facing copy created in this section.

### Browser Evidence Required
N/A - browser evidence belongs to section-09.

## Acceptance Criteria

- Existing Feature 118 records remain readable.
- New Feature 117 metadata can represent every planned stage and QA result.
- New Feature 117 contracts can represent stage completion evidence so transitions cannot claim success without required refs.
- New Feature 117 contracts can represent SDK capability manifests so Python cannot add unapproved tools, handoffs, hosted SDK capabilities, raw trace/session capture, persistence authority, or credit authority.
- New Feature 117 contracts can represent production creative brief snapshots so Agents plan from an auditable goal, audience, style, CTA, quality mode, and user hint policy rather than implicit product-only guesses.
- New Feature 117 contracts can represent a full completed/current/remaining timeline.
- New Feature 117 contracts can represent approval decisions and immutable policy snapshots.
- New Feature 117 contracts can represent variant/SKU truth, backward-compatible API projections, and canonical artifact lineage.
- New Feature 117 contracts can represent shared-product authority, evidence freshness, and asset-use rights.
- New Feature 117 contracts can represent prepared product reference asset packs and block unreliable product images before paid visual provider work.
- New Feature 117 contracts can represent trusted provider events, payload/trace budgets, storage quota/transcode plans, and retry/DLQ policy.
- New Feature 117 contracts can represent marketplace privacy, audio rights/mix targets, target distribution profiles, and tenant-safe creative feedback memory.
- New Feature 117 contracts can represent synthetic disclosure/provenance, CTA/landing integrity, QA calibration, and post-publish governance.
- New Feature 117 contracts can represent source-attributed advertising policy rule packs and replay exact rule decisions after policy changes.
- New Feature 117 contracts can represent campaign/batch governance, brand/seller voice policy, and human review queue decisions.
- New Feature 117 contracts can represent publishable asset packages with thumbnails, subtitles/transcripts, platform metadata, manifests, and checksums.
- New Feature 117 contracts can represent mid-run input changes and downstream invalidation without restarting all work blindly.
- New Feature 117 contracts can represent per-frame vision QA and targeted repair without regenerating unrelated shots.
- New Feature 117 contracts can prevent failed/unverified/superseded media from leaking into user-visible or reusable surfaces.
- Contract tests fail if node canvas becomes a required execution dependency.
- Later sections have stable types to consume.
