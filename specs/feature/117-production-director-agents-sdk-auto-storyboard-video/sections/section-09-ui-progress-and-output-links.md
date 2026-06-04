# Section 09: UI Progress And Output Links

## Purpose

Update Marketplace Capture product detail so users can start auto storyboard/video creation and understand long-running progress, QA checks, credit authorization, blockers, and output links with minimal manual work.

## Depends On

- section-01-contracts-and-schema.
- section-03-node-runtime-client-and-preflight.
- section-05-ad-compliance-warning-overlays.
- section-08-credit-billing-idempotency.

## Blocks

- none, but browser-visible launch quality depends on this section.

## Files Owned By This Section

- `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`
- optional extracted UI components under the existing client feature/component convention.
- tRPC type consumption only; server contracts owned by earlier sections.
- focused UI/component tests where the repo supports them.

## Tests First

- Test empty/no-run state shows start controls.
- Test active run disables duplicate start.
- Test running, waiting-provider, awaiting-credit, blocked, failed, completed, and completed-with-warnings states render.
- Test timeline renders completed stages, active stage/substep, and remaining stages.
- Test timeline renders provider wait, credit wait, QA running, repairing, blocked, failed, skipped, and completed-with-warnings states.
- Test timeline output links appear on the stage where the artifact is created.
- Test timeline shows provider callback/auth, payload-budget, storage-quota, transcode, and DLQ/recovery blockers with sanitized next actions.
- Test timeline shows privacy, audio-rights, distribution-profile, and creative-memory blockers with sanitized next actions.
- Test timeline shows synthetic-disclosure, CTA/landing, QA spot-check, and post-publish recheck blockers with sanitized next actions.
- Test timeline shows advertising policy rule-pack expired/deprecated/fixture-failed blockers with sanitized next actions.
- Test timeline shows campaign/batch governance, duplicate-variation, spend-anomaly, brand-policy, and human-review-queue blockers with sanitized next actions.
- Test timeline shows publishable-package blockers for missing/non-compliant thumbnail, subtitle/transcript, metadata manifest, checksum, or platform metadata with sanitized next actions.
- Test timeline shows input-change impact, preserved artifacts, invalidated artifacts, and next action after product/evidence/policy/profile edits.
- Test timeline shows exact shot/frame/clip targeted repair state when vision QA fails.
- Test timeline/list/detail projections never show quarantined failed media as normal output links.
- Test timeline shows product-reference blockers such as low-resolution, wrong variant, missing hosted reference, rights-blocked reference, or needs better product image without exposing private raw URLs.
- Test timeline shows stage-completion-evidence blockers when a stage cannot complete because required artifact, QA, credit, policy, lineage, or acceptance refs are missing.
- Test timeline shows SDK capability-manifest blockers when an attempt is stopped because a tool, handoff, hosted capability, trace/session setting, or manifest hash is unsafe.
- Test timeline/detail projection shows sanitized creative brief summary, default/safe-default state, ambiguity blocker, and changed-brief recheck state without exposing private seller notes or raw prompts.
- Test accepted-with-warnings media shows warning scope and approval summary before user can open/download/reuse it.
- Test Storyboard Review, Video Editor, and Library links appear when IDs exist.
- Test `listAutoReviewRuns` summary projection renders without needing full raw trace.
- Test `getAutoReviewRun` detail projection renders full timeline, approvals, blockers, lineage/output refs, and sanitized links.
- Test variant/SKU summary is visible when selected variant snapshot exists and does not overflow compact Thai UI.
- Test warning/ad blocker copy is user-actionable and sanitized.
- Test Thai labels do not overflow compact controls.

## Implementation Requirements

UI must remain product-detail first. Do not add node canvas entry points to this automation flow.

Show:

- output mode;
- selected variant/SKU summary when present;
- frame strategy;
- audio strategy;
- stage progress;
- current QA gate;
- repair attempt count;
- credit estimate/authorization status;
- blocker reason and next action;
- campaign/batch status when applicable;
- brand/seller voice policy status when applicable;
- human review queue status when applicable;
- publishable package status when applicable;
- input change impact status when applicable;
- shot/frame/clip vision QA and targeted repair status when applicable;
- media acceptance/quarantine state when applicable;
- product reference asset pack readiness and required user action when applicable;
- production creative brief summary, ambiguity state, and changed-brief recheck state when applicable;
- generated output links;
- cancel/manual refresh controls.

Use status detail from run/stage metadata rather than guessing from stage key alone.

API projection usage:

- use list/summary projection for run history cards;
- use detail projection for the active run timeline and blocked/recovery state;
- do not render raw provider payloads, raw prompts, signed URLs, QA crop URLs, stack traces, or unredacted policy/debug details;
- if a Feature 118-era run lacks Feature 117 projection fields, render the compatible coarse status and avoid showing misleading substeps.
- if payload/detail projection data was truncated or moved to internal refs, show a concise safe summary rather than raw trace data.

Timeline display requirements:

- render the backend `MarketplaceAutoReviewTimelineProjection` as the primary progress view;
- show all canonical stages in order for the selected output mode;
- clearly separate `ทำแล้ว`, `กำลังทำ`, `รอระบบ/รอเครดิต/รอผู้ใช้`, and `ที่เหลือ`;
- show active substep such as concept agent, QA gate, provider wait, repair, render, or final QA;
- show stage-level QA verdict, credit state, blocker, repair count, and output links where present;
- show operational blockers such as callback verification failure, DLQ/recovery required, payload over budget, storage quota blocked, transcode failed, or quota cleanup required without exposing raw provider payloads;
- show content governance blockers such as privacy redaction required, audio rights approval required, distribution profile mismatch, or creative memory disabled without exposing private evidence;
- show publish governance blockers such as missing synthetic disclosure, CTA link mismatch, human spot-check required, or Library asset reuse blocked without exposing private link/debug data;
- show policy governance blockers such as advertising policy pack expired, deprecated, blocked, pending review, or fixture replay failed without exposing legal/internal notes;
- show campaign governance blockers such as duplicate variation, batch approval required, spend cap exceeded, same-product flood, abnormal repair spend, or provider refusal spike without exposing internal anomaly heuristics;
- show brand/seller policy blockers such as prohibited phrase, competitor policy, unsupported brand claim, or public-copy leak risk without showing private seller notes;
- show human review queue state with reason, role, SLA/timeout summary, and one next action without exposing internal reviewer comments unless the user is authorized;
- show publishable package blockers such as missing thumbnail, metadata copy blocked, subtitle timing failed, transcript source invalid, manifest missing, or checksum mismatch without exposing raw prompts/private evidence;
- show input-change impact such as product image changed, selected variant changed, offer changed, rights changed, profile changed, or script edited; show what was preserved, what must be rechecked, and what is blocked without exposing private evidence;
- show targeted repair such as shot 3 start frame product mismatch, shot 5 stop frame face drift, shot 6 clip speaking identity drift, or thumbnail product mismatch, with preserved/unaffected units summarized;
- show quarantined/superseded media only as sanitized internal status, not as normal user output links;
- show product reference readiness such as image too small, wrong variant, product not visible, rights blocked, remote image not ready, or select/upload better product reference before visual generation;
- show evidence-gate blockers such as missing QA verdict, missing accepted media, missing credit reconciliation, missing lineage, missing rule-pack ref, or missing package refs without exposing private debug data;
- show SDK capability-manifest blockers such as unknown tool, unapproved handoff, hosted capability request, raw trace/session capture request, manifest mismatch, or over-call-limit tool use without exposing SDK internals to normal users;
- show creative brief state such as default brief applied, audience/CTA changed, user hint needs evidence, or brief needs review without exposing raw prompts, private seller notes, or internal policy reasoning;
- show the next action only once in the timeline header, then repeat it on the blocked stage for context;
- do not expose raw internal stage keys as primary labels;
- after refresh/resume, render timeline exactly from backend data.

## UI/UX Contract

### Target User / JTBD

- Role: affiliate seller, media operator, or content creator.
- Goal: choose a marketplace product and receive a ready storyboard or review video automatically.
- Entry point: Marketplace Capture product detail page.
- Success outcome: user sees progress and can open Storyboard Review, Video Editor, or final Library video.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Product detail | `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx` | Add richer run progress, QA, credit, blocker, and output state. |
| Auto Review action panel | same page or extracted component | Preserve output/frame/audio controls and start action. |
| Run timeline | same page or extracted component | Completed/current/remaining stage timeline with QA, credit, blockers, repair, and output refs. |
| Output links | same page | Storyboard Review, Video Editor, Library. |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| AutoReviewActionPanel | product detail or child component | mode/strategy controls, start/cancel | product, active run, feature flags |
| AutoReviewRunTimeline | product detail or child component | completed/current/remaining stage timeline, substeps, QA, credit, blockers, repair, outputs | `MarketplaceAutoReviewTimelineProjection` |
| AutoReviewCreditNotice | product detail or child component | credit estimate/authorization/blocker | credit status detail |
| AutoReviewOutputs | product detail or child component | output links | storyboardReviewId, videoEditorProjectId, resultLibraryItemId |
| AutoReviewVariantSummary | product detail or child component | selected variant/SKU/options, warning when variant is missing | `ProductVariantSnapshot` summary |
| AutoReviewGovernanceSummary | product detail or child component | campaign/batch, brand policy, and review queue summary | governance projection detail |
| AutoReviewPublishPackageSummary | product detail or child component | thumbnail, subtitle/transcript, platform metadata, manifest, and package QA summary | publishable package projection |
| AutoReviewInputChangeSummary | product detail or child component | changed input, impacted stages, preserved artifacts, invalidated artifacts, and next action | input change impact projection |
| AutoReviewTargetedRepairSummary | product detail or child component | failed shot/frame/clip, QA reason, repair attempt, preserved refs, and downstream recheck | targeted repair projection |
| AutoReviewMediaAcceptanceSummary | product detail or child component | candidate, accepted, warning-accepted, quarantined, superseded, or discarded media state | media acceptance projection |
| AutoReviewProductReferenceSummary | product detail or child component | reference image readiness, accepted/rejected refs summary, and select/upload better image action | product reference asset pack projection |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | stable spinner/skeleton, controls not jumping | UI test/screenshot |
| empty | start controls enabled when product is ready | UI test |
| running | timeline shows completed stages, active stage/substep, and remaining stages | UI test |
| waiting_provider | timeline marks provider-wait stage and no duplicate start | UI test |
| awaiting_credit_authorization | timeline marks credit-wait stage with approval guidance | UI test |
| blocked_needs_user | timeline marks blocked stage with concise reason and next action | UI test |
| variant_selection_required | timeline/header asks user to select or confirm variant before media spend | UI test |
| provider_event_blocked | timeline marks provider event/auth/replay issue and avoids duplicate start | UI test |
| payload_over_budget | timeline marks trace/payload budget blocker with safe retry/reduce guidance | UI test |
| storage_quota_blocked | timeline marks quota or cleanup-required blocker before render/finalize | UI test |
| dlq_recovery_required | timeline marks operator recovery state with user-safe status | UI test |
| privacy_redaction_required | timeline marks privacy blocker without exposing private evidence | UI test |
| evidence_instruction_blocked | timeline marks adversarial/unsafe marketplace evidence blocker without exposing raw injected text | UI test |
| audio_rights_required | timeline marks music/SFX/voice rights blocker before final render | UI test |
| distribution_profile_mismatch | timeline marks platform/export profile mismatch with repair guidance | UI test |
| synthetic_disclosure_required | timeline marks required AI/synthetic disclosure blocker | UI test |
| cta_landing_blocked | timeline marks CTA/link/offer integrity blocker | UI test |
| policy_rule_pack_blocked | timeline marks expired/deprecated/pending/fixture-failed ad policy rule pack | UI test |
| qa_spot_check_required | timeline marks human spot-check before promotion | UI test |
| reuse_recheck_required | timeline marks post-publish/reuse recheck blocker | UI test |
| campaign_batch_queued | timeline marks batch/variation queued by governance or rate limit | UI test |
| duplicate_variation_blocked | timeline marks duplicate/similar concept blocker with replan guidance | UI test |
| spend_anomaly_blocked | timeline marks abnormal spend/repair/refusal blocker | UI test |
| brand_policy_blocked | timeline marks brand/seller voice policy conflict | UI test |
| human_review_queued | timeline marks review queue reason, role, and SLA | UI test |
| publish_package_blocked | timeline marks thumbnail/subtitle/metadata/manifest package blocker | UI test |
| input_change_recheck_required | timeline marks changed input and downstream recheck/repair/replan state | UI test |
| frame_vision_qa_repairing | timeline marks failed shot frame/keyframe and targeted repair progress | UI test |
| media_quarantined | timeline marks failed/policy-blocked/superseded media as internal-only | UI test |
| product_reference_blocked | timeline marks missing/low-confidence product reference and safe next action | UI test |
| character_identity_blocked | timeline marks missing/unsafe person or voice reference and safe fallback | UI test |
| completion_evidence_blocked | timeline marks missing required completion evidence and safe next action | UI test |
| capability_manifest_blocked | timeline marks unsafe SDK capability request with sanitized next action | UI test |
| creative_brief_needs_review | timeline marks ambiguous/changed creative brief with safe next action | UI test |
| failed_terminal | sanitized error and retry/restart guidance if allowed | UI test |
| completed_with_warnings | output links plus warning summary | UI test |
| completed | output links and credit/QA summary | UI test |
| disabled/focus/hover | controls remain usable by keyboard | browser/manual evidence |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | action cards stack, timeline vertical, no clipped Thai text | screenshot |
| tablet 768x1024 | two-column controls allowed, output links visible | screenshot |
| desktop 1440x900 | product, media panel, and automation summary are scannable | screenshot |
| small-mobile 360x800 | long labels wrap cleanly | screenshot if risky |
| laptop 1024x768 | no overlap between progress and product details | screenshot if risky |
| wide-desktop 1280x800 | content width remains readable | screenshot if risky |

### Accessibility Acceptance

- Keyboard path: start, cancel, refresh, mode controls, and links are reachable.
- Focus visibility: visible focus state on buttons, segmented controls, and links.
- Labels/semantics: controls have accessible names in Thai or clear bilingual text.
- Contrast: warning/error/success states meet contrast expectations.
- Reduced motion: progress state does not rely only on animation.

### Copy Contract

- Tone: concise Thai, operational, calm.
- Primary language(s): Thai for user copy; English IDs only in debug/dev context.
- Required labels: stage, QA, credit estimate, blocker, output, retry/repair.
- Required governance labels: campaign, batch, brand policy, review queue, spend cap.
- Required package labels: thumbnail, subtitles, transcript, metadata, manifest.
- Required policy labels: policy profile, rule pack, expired, pending review, needs recheck.
- Required evidence labels: missing evidence, recheck, waiting for QA, waiting for credit, waiting for lineage.
- Required capability labels: automation capability blocked, unsafe tool request, unsafe handoff, retry with updated manifest.
- Required creative brief labels: objective, audience, CTA, style, safe default, needs review.
- Required input-change labels: changed input, preserved, recheck, repair, replan, regenerate.
- Required targeted-repair labels: shot, frame, clip, failed check, repair attempt, preserved.
- Required acceptance labels: candidate, accepted, warning, quarantined, superseded.
- Required product-reference labels: product image, selected image, upload/select better image, wrong variant, image too small, product not visible.
- Validation/error copy: sanitized, no raw provider token/URL/stack.
- Empty/loading/success copy: short and actionable.
- Localization/fallback notes: if a status detail is unknown, show safe generic Thai text and log technical detail separately.

### Browser Evidence Required

- Capture screenshots after implementation at mobile 390x844, tablet 768x1024, and desktop 1440x900.

## Acceptance Criteria

- User can start storyboard or full-video automation from product detail.
- User can understand what the automation has completed, what it is doing now, and what remains without opening node canvas.
- Blockers and credit authorization are visible and actionable.
- Completed outputs are discoverable from the product page.
- Campaign/batch, brand policy, spend anomaly, and human review queue states are visible enough for users/operators to understand why automation is waiting or blocked.
- Publishable package states are visible enough for users/operators to know whether the output is only rendered or also ready to use on the selected platform.
- Input-change states are visible enough for users/operators to know why prior work was preserved, rechecked, invalidated, repaired, or blocked.
- Targeted repair states are visible enough to see exactly which shot/frame/clip is being regenerated and which outputs remain accepted.
- Media acceptance states prevent users from mistaking quarantined or superseded artifacts for usable outputs.
- Product reference blockers make it clear when automation needs a better product image before visual generation can spend credits.
- Completion evidence blockers make it clear why a stage is not considered done even when provider/agent work has returned.
- Capability manifest blockers are visible as safe automation blockers without exposing raw SDK tool names, trace payloads, prompts, or credentials.
- Creative brief states make it clear when automation used safe defaults, needs a clearer goal, or must recheck work after audience/CTA/style changes.
