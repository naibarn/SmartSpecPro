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
| audio_rights_required | timeline marks music/SFX/voice rights blocker before final render | UI test |
| distribution_profile_mismatch | timeline marks platform/export profile mismatch with repair guidance | UI test |
| synthetic_disclosure_required | timeline marks required AI/synthetic disclosure blocker | UI test |
| cta_landing_blocked | timeline marks CTA/link/offer integrity blocker | UI test |
| qa_spot_check_required | timeline marks human spot-check before promotion | UI test |
| reuse_recheck_required | timeline marks post-publish/reuse recheck blocker | UI test |
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
