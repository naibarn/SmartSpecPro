# TDD Plan: Feature 117 Production Director Agents SDK Auto Storyboard And Video

Write tests before implementation for each plan section. These are stubs/descriptions, not full test implementations.

## 1. Runtime Contract Extension

Python tests:

- Test `media_production` is an accepted runtime surface.
- Test marketplace/media origin surfaces validate.
- Test missing tenant/user/run/stage/idempotency fields fail validation.
- Test direct provider API key is rejected for `media_production`.
- Test direct provider base URL is rejected for `media_production`.
- Test gateway base URL and attribution token are required.
- Test SDK import boundary remains Python-only.
- Test media production request requires `ProductionAgentsSdkCapabilityManifest`.
- Test Python registers only manifest-listed agents, tools, handoffs, output schemas, session policy, trace policy, and stream policy.
- Test unknown tool, handoff scope widening, hosted SDK capability, raw trace/session capture, or manifest mismatch fails before additional LLM spend.
- Test tool outputs are untrusted until Node verifies returned refs/intents.

Node tests:

- Test Node runtime client builds a valid media production request.
- Test Node runtime client creates and persists a capability manifest before every Agents-backed stage attempt.
- Test Node runtime client creates and persists `ProductionCreativeBriefSnapshot` before concept/story planning.
- Test Node runtime client creates and persists `MarketplaceEvidenceInstructionFirewall` before marketplace evidence reaches Agents, vision QA, repair prompts, provider prompts, or metadata generation.
- Test request metadata includes tenant, user, run, stage, agent, model, credit category, and idempotency key.
- Test runtime errors map to structured stage failure details.
- Test runtime response cannot mark an Agents-backed stage complete without stage completion evidence.

## 2. Product Evidence And Policy Preflight

- Test product evidence lock includes product ID, name, source URL, approved images, and evidence IDs.
- Test selected variant/SKU snapshot includes option labels, selected image refs, price snapshot refs, stock text, volatile-signal policy, confidence, and variant hash.
- Test product with multiple visible variants but no selected snapshot blocks with `variant_selection_required` or runs only generic product-level claims.
- Test shared product access snapshot captures owner/group permission, allowed actions, credit payer, and background recheck policy.
- Test read-only shared product access cannot mutate product evidence or publish output to group context unless policy allows it.
- Test stale product/evidence blocks volatile claims or requires recapture/approval before spend.
- Test marketplace remote images are re-hosted/proxy-ready before provider spend.
- Test product reference asset pack selects approved primary/supporting refs and rejects low-resolution, wrong-variant, collage-like, remote-unhosted, rights-blocked, privacy-risk, or misleading refs before visual provider spend.
- Test character identity asset pack approves, limits, or blocks recurring presenter/hand/voice refs by consent, reference quality, allowed face/voice scope, and fallback policy before provider spend.
- Test visual automation blocks or asks for a better product image when no reference pack is approved.
- Test asset rights block standalone brand/logo/marketplace badge/review-image use without approval.
- Test marketplace/account/order/cart/payment/chat/customer/reviewer/private-seller PII is redacted or blocked before Agents context and final media.
- Test named review/testimonial/social-proof use requires evidence, rights, and approval.
- Test target distribution profile is created before creative planning.
- Test approved advertising policy rule pack is selected before creative planning and draft/deprecated/expired packs block.
- Test audio/music/SFX/TTS/native/uploaded reference rights are classified before final render.
- Test synthetic disclosure policy is resolved before generated people, synthetic voice, or materially synthetic scenes reach final render.
- Test CTA/source/affiliate/custom links validate reachability, redirect safety, product/variant match, current offer evidence, and tracking policy.
- Test campaign/variation governance creates caps, duplicate thresholds, spend cap, anomaly signals, rate-limit keys, and batch approval requirement before spend.
- Test brand/seller voice policy is evidence-bound and blocks prohibited phrases, competitor claims, private seller notes, and unsupported brand claims.
- Test human review queue policy captures reason, role, scope, SLA, timeout action, and decision refs before high-risk or high-volume spend.
- Test publishable package requirements are created from the distribution profile for thumbnail, metadata, transcript/subtitles, manifest, and checksums.
- Test input change impact is created when product/evidence/policy/profile/user-edit snapshots differ from stage refs.
- Test shot frame vision QA envelope is required for storyboard cells, start/stop frames, video keyframes, thumbnails, and final render samples.
- Test targeted media unit repair plan targets only the failed shot/frame/clip/audio unit.
- Test volatile price/rating/sold/review/commission fields are not allowed as claims by default.
- Test unsupported claims are rejected before concept generation.
- Test product with no visual reference blocks image/video automation.
- Test regulated category marks run as blocked or review-required.
- Test prompt-injection text from marketplace DOM/OCR/review/seller data creates firewall findings, quarantines or blocks unsafe refs, and cannot steer tools, providers, credits, approvals, policy, routing, or public copy.
- Test creative brief user hints that imply claims, comparisons, offers, urgency, ratings, certifications, or results require evidence/approval refs before planning.

## 3. Creative Concept And Storyboard Planning

- Test `concept_story` no longer completes from deterministic `buildAutoReviewPlan`.
- Test Agents output must validate as `CreativeConceptSet`.
- Test concept generation requires a production creative brief snapshot.
- Test selected/rejected rationale cites brief objective, audience, CTA intent, creative latitude, quality mode, and allowed risk.
- Test repeated concepts for same product require distinct novelty fingerprints.
- Test concept with unsupported product claim fails QA.
- Test concept with unsupported SKU/variant-specific color, size, package count, price, stock, or bundle detail fails QA.
- Test selected concept stores rationale and rejected alternatives.
- Test creative feedback memory uses only tenant-safe redacted fingerprints and does not positive-learn from failed/blocked outputs.
- Test distribution profile constraints affect shot planning, captions, warnings, CTA, and duration.
- Test compliance decisions cite advertising policy rule-pack version and triggered rule IDs.
- Test CTA copy is omitted or repaired when landing integrity fails.
- Test required synthetic disclosure is reserved in script/caption/overlay/export metadata.
- Test campaign batch planning produces distinct concepts within caps and blocks duplicate variants before provider spend.
- Test brand/seller voice improves Thai tone/register/CTA/pronunciation without overriding product truth or ad policy.
- Test human review requirement blocks auto-selection or additional paid media until scoped approval exists.
- Test publish metadata drafts and thumbnail concepts are evidence-bound, platform-limited, and policy-safe.
- Test input changes after planning preserve unaffected concepts and invalidate affected storyboard/script/media/package refs.
- Test creative brief changes after planning invalidate dependent concept/story/script/metadata refs but preserve unrelated accepted media after recheck.
- Test failed start frame vision QA regenerates only that frame and does not rewrite other passed frames.
- Test storyboard/media payloads use only approved product reference asset pack refs.
- Test `prompt_plan` stores storyboard shots, voiceover, warning plan, media payloads, and QA verdicts.
- Test Thai script fits target shot duration.

## 4. Direct Shot-Payload Media Execution

- Test image scheduling does not call `getProductionSpace`, `scheduleProductionExecution`, or `reconcileProductionExecution` for Feature 117 runs.
- Test direct image execution persists media task IDs and provider task IDs.
- Test visual provider dispatch is blocked when product reference asset pack is missing, stale, blocked, or not platform-hosted/proxy-ready.
- Test provider callback signature/auth failure cannot advance the run.
- Test provider success cannot mark media stage complete without completion evidence covering output, QA, credit, storage, acceptance, and lineage refs.
- Test duplicate, stale, out-of-order, and mismatched provider events are idempotent no-ops or DLQ/recovery outcomes.
- Test provider payload over budget is redacted/linked or blocks before further spend.
- Test `storyboard_3x3_split` still extracts 9 frame URLs from direct output.
- Test `video_shot_start_stop` stores start/stop/storyboard frame URLs.
- Test video scheduling uses accepted shot payloads and reference mapping.
- Test retry resubmits only failed shot payloads.

## 5. QA And Repair

- Test product visual QA blocks changed color/material/geometry/part count/label/logo placement.
- Test product reference asset pack QA blocks unreliable refs before paid generation or repair.
- Test face continuity QA blocks identity drift and back-facing-to-different-face risk.
- Test face/voice continuity QA compares recurring people, hands, wardrobe, lip-sync, native-audio character behavior, and voice profile against `CharacterIdentityAssetPack`.
- Test no-face/hands-only/single-shot/generic-person/separate-TTS fallback prevents later face reveal or voice identity drift without regenerating unrelated accepted product media.
- Test storyboard QA blocks story discontinuity across adjacent shots.
- Test audio QA blocks silent gaps, short awkward lines, mismatched voice, and unsupported spoken claims.
- Test ad compliance QA blocks exaggerated, guaranteed, miracle, cure, or unsupported before/after claims.
- Test ad compliance QA blocks when policy rule pack is missing, expired, deprecated, or fixture replay failed.
- Test warning overlay QA checks exact text, placement, duration, contrast, safe margin, and OCR/readability result.
- Test privacy QA blocks leaked PII or private marketplace/account/order/cart/chat data in visuals/captions/audio.
- Test final QA blocks quarantined marketplace instruction text, fake tool/schema fragments, policy-bypass text, and provider/credit override attempts from visuals/captions/audio/subtitles/metadata.
- Test audio-rights QA blocks unlicensed music/SFX/TTS/native/uploaded audio or missing attribution/consent.
- Test distribution QA blocks safe-area, caption, warning, CTA, loudness, duration, aspect ratio, or export-variant mismatch.
- Test synthetic disclosure QA blocks missing visible/metadata/platform disclosure when required.
- Test CTA/landing QA blocks unsafe redirect, private URL, wrong product, wrong variant, expired offer, or unapproved volatile offer claim.
- Test model/provider/QA drift or low confidence creates human spot-check or internal-only promotion gate.
- Test campaign governance QA blocks duplicate variation, same-product flood, spend anomaly, provider refusal spike, and policy-risk spike before additional paid work.
- Test brand/seller voice QA blocks prohibited phrases, unsupported brand claims, competitor policy violations, and private-note leakage.
- Test human review queue QA blocks advancement on queued, rejected, expired, or wrong-scope approvals.
- Test publishable package QA blocks missing or non-compliant thumbnail, subtitle/transcript, platform metadata, manifest, or checksum refs.
- Test input change impact QA invalidates stale QA, approval, credit, and package refs while preserving safe artifacts.
- Test product mismatch, wrong variant, character drift, speaking identity drift, low visual quality, prompt mismatch, unwanted glyphs, or endpoint mismatch creates targeted repair.
- Test native-audio character drift repairs the affected clip or switches strategy without full-run regeneration.
- Test failed, unverified, policy-blocked, superseded, or discarded generated media cannot route to user-visible or reusable surfaces.
- Test accepted-with-warnings generated media requires scoped approval and warning metadata before user access.
- Test repair decision targets the smallest failed unit.
- Test retry exhaustion becomes `blocked_needs_user` or `failed_terminal`.

## 6. Credit, Billing, And Idempotency

- Test planning LLM call requires credit preflight/reservation metadata.
- Test provider generation does not start when reservation fails.
- Test duplicate stage advancement does not double reserve or double charge.
- Test repair reserves only incremental credits for affected outputs.
- Test provider failure releases/refunds according to existing ledger rules.
- Test final run summary includes estimated, reserved, spent, refunded, and outstanding credits.
- Test credit authorization approval is bound to pricing/credit policy snapshot and selected variant hash when variant-specific pricing is used.
- Test campaign/batch spend cap and anomaly blockers pause new paid work without corrupting previous credit events.
- Test high-volume approval is scoped to estimate, batch, run, stage, variant count, and policy snapshot.

## 7. Persistence And Resume

- Test run can resume from the latest valid checkpoint.
- Test completed stages are not rerun unless upstream input changed.
- Test provider task reconciliation happens before new provider submission.
- Test cancellation is idempotent.
- Test status detail distinguishes waiting provider, credit authorization, blocker, terminal failure, and completed with warnings.
- Test timeline projection orders every stage correctly for `storyboard_images`.
- Test timeline projection orders every stage correctly for `full_video`.
- Test timeline projection shows completed, active, waiting, blocked, failed, skipped, and pending stages from persisted run/stage state.
- Test timeline projection shows completion-evidence blockers when required refs are missing.
- Test refresh/resume derives the same timeline without relying on frontend guessing.
- Test `getAutoReviewRun` returns full redacted detail projection for Feature 117 rows.
- Test `listAutoReviewRuns` returns lightweight summary projection for Feature 117 rows and remains compatible with Feature 118 rows.
- Test artifact lineage can be rebuilt from persisted stage outputs and blocks finalization when required refs are missing.
- Test payload/list/detail projection budgets keep raw prompts, provider payloads, QA crops, and long traces out of UI-facing APIs.
- Test storage quota/transcode plan blocks render/finalize when quota, byte-size, codec, duration, resolution, or playability gates fail.

## 8. UI

- Test product detail renders no-run, running, waiting-provider, awaiting-credit, blocked, failed, and completed states.
- Test timeline displays completed work, current stage/substep, blocker/provider/credit wait, output refs, and remaining work.
- Test storyboard-only and full-video timelines show different total stage counts.
- Test start button is disabled while active run exists.
- Test output links appear when Storyboard Review, Video Editor, or Library IDs exist.
- Test selected variant/SKU summary renders when available and variant-required blocker renders when missing.
- Test Thai copy is concise and does not expose raw provider errors.
- Browser evidence: mobile 390x844, tablet 768x1024, desktop 1440x900 for changed UI.

## 9. End-To-End

- E2E: product detail -> Create Storyboard -> Agents plan -> generated frames -> Storyboard Review.
- E2E: product detail -> Auto Create Review Video -> clips/audio/render -> Library video.
- E2E: unsupported claim blocks before provider spend.
- E2E: product visual drift triggers targeted repair and then completes.
- E2E: credit budget exceeded pauses for authorization.
- E2E: Thai warning/disclosure text appears and passes readability QA.
- E2E: selected variant/SKU product creates storyboard/video without changing visible option or making unsupported variant claims.

## 10. Operational Hardening

- Test requested provider/model unavailable creates a durable blocker or approved fallback and never silently downgrades to text-only.
- Test provider rate limit/backpressure queues or blocks without duplicate jobs.
- Test cancellation during provider wait stops future scheduling, cancels supported jobs, records non-cancellable jobs, and releases/refunds unused credits.
- Test signed provider URLs are not persisted as canonical final assets.
- Test intermediate assets carry retention/deletion metadata.
- Test identifiable face/voice references without approved consent are blocked or converted to safe product-only/hands-only/generic-person alternatives.
- Test replay/golden fixtures catch drift in Agents planning, QA verdicts, warning overlays, timeline projection, and credit/provider race behavior.
- Test approval creation is idempotent for credit authorization, claim approval, warning text approval, provider/model fallback, likeness consent, and manual retry.
- Test every started attempt stores immutable model policy, provider capability, pricing, credit, advertising, warning-template, consent, and retention policy versions.
- Test replay uses the original policy snapshot rather than the current policy.
- Test operator recovery can pause/resume/fail stale runs from checkpoints without duplicate provider jobs or credit events.
- Test orphan provider task recovery attaches a verified task ref once or blocks/refunds when verification is impossible.
- Test expired provider URL or re-host failure cannot become a completed user-visible output.
- Test timeline rebuild from durable run/stage/artifact lineage after metadata drift.
- Test recovery actions cannot bypass hard policy, missing consent, tenant restriction, unsupported provider access, or budget denial.
- Test background advancement re-checks access, group membership, tenant policy, and credit authority before paid work.
- Test provider moderation/content-policy refusal is non-retryable for the same payload and surfaces sanitized blocker.
- Test retry budget sends repeated transient failures to DLQ/recovery without runaway credit spend.
- Test stage lease/heartbeat or equivalent claim protection prevents stale background workers from spending after another worker advances the stage.
- Test background/manual/operator advancement cannot advance from status-only success without completion evidence.
- Test migration/backfill dry-run produces affected-row manifest, old-row compatibility report, and rollback plan.
- Test launch SLO/alert evidence covers completion latency, queue wait, stuck runs, callback auth failures, DLQ, storage/transcode failures, provider refusal spikes, and credit mismatches.
- Test privacy, evidence-instruction-firewall, audio-rights, distribution-profile, and feedback-memory blockers are timeline-visible and sanitized.
- Test disclosure, CTA integrity, QA calibration, and post-publish reuse blockers are timeline-visible and sanitized.
- Test post-publish invalidation blocks reuse or requires re-check when rights, evidence, offer, policy, privacy, or takedown state changes.
- Test campaign/batch governance blockers, duplicate variation blockers, spend anomaly blockers, brand-policy blockers, and human-review queue states are timeline-visible and sanitized.
- Test human review timeout/expiry never silently approves future changed evidence or future batches.
- Test publishable package blockers for thumbnail, transcript/subtitle, platform metadata, manifest, or checksum are timeline-visible and sanitized.
- Test input change impact blockers and partial-reuse decisions are timeline-visible and sanitized.
- Test shot/frame/clip targeted repair state is timeline-visible and sanitized.
- Test product reference pack blockers and select/upload-better-image actions are timeline-visible and sanitized.
