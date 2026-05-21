# Plan Completeness Review - Feature 114 Gemini Omni Suite Media Assets

Date: 2026-05-21

## Review Result

The plan is directionally complete and implementable, but the first version under-specified several production details. This review updated the plan artifacts to cover those gaps.

## Added Requirements

- Current Kie.ai docs verification notes.
- Provider `video_list` `ends` spelling preservation.
- Asset creation pricing gate.
- Credit void/refund behavior after provider failure.
- Idempotent asset creation.
- Provider asset unique constraints and picker indexes.
- Upload validation for size/type/public URL/source ownership.
- Skill registration/sync into the app catalog.
- Storyboard partial failure and retry semantics.
- QA/generation durable state taxonomy.
- Privacy boundaries for voice/character/media learning records.
- Admin migration/backfill for existing raw Gemini Omni config rows.
- Feature-flag off-state and QA-disabled fallback tests.

## Remaining Implementation-Time Decisions

- Final Character/Audio asset creation credit costs, unless Kie pricing is confirmed before implementation.
- Exact router shape: extend `media.ts` or create a dedicated provider asset router.
- Whether provider asset sharing beyond owner/private tenant scope is in MVP. Current plan assumes no broader sharing in MVP.
- Whether Video QA runs synchronously after task completion or via a background worker. Current plan requires durable state either way.

## Second Review Additions

- Callback and polling/recovery must both be supported.
- Callback terminal updates and polling terminal updates must deduplicate.
- Provider response normalization must accept Kie success codes `0` and `200` when expected data exists.
- Provider result URLs must be re-hosted or explicitly governed by existing durable media URL policy.
- Public media URL validation must follow existing SSRF-safe patterns.
- Rate-limit/capacity failures should use deferred retry behavior where possible.
- Public callback routes require signature/timestamp/replay/size protections.
- Lifecycle observability and audit redaction are now explicit requirements.
- Skill contract/version snapshots are required to protect Media Studio handoff from future learning edits.

## Third Review Additions

- Provider asset RBAC is now explicit for owner, tenant/domain admin, and system admin paths.
- Asset retention, restore, and permanent purge are now part of the provider asset lifecycle.
- Character/voice asset creation now requires a consent/policy acknowledgment surface when configured.
- Skill/QA credit costs must be shown or explicitly treated as included by tenant policy.
- Storyboard preflight must enforce total planned cost, user/tenant budget, and concurrency limits before provider submission.
- Admin/provider asset inspection must be sanitized and hide raw provider IDs by default.
- Rate-limit, concurrency, and budget blocks need user-visible disabled/deferred states.

## Fourth Review Additions

- Configuration/readiness diagnostics are now required for Kie key, callback secret/URL, R2/public storage, pricing, skill packages, and seed/backfill state.
- Callback config is optional; missing callback config must fall back to polling/recovery.
- Migration safety now includes additive-first changes, verification checks, idempotent seed/backfill, and flag-based rollback.
- Provider contract drift fixtures are required to detect upstream Kie response changes.
- Director/Prompt QA/Video QA unavailable or invalid-output fallback behavior is now explicit.
- Visual, responsive, keyboard, and accessibility smoke checks are required for the Gemini Omni panel.
- Admin runbook and user help documentation are now release criteria.
- Rollout stop thresholds must cover provider error rate, callback failures, re-host failures, credit refund anomalies, and queue lag.

## Fifth Review Additions

- External provider operations now require saga/reconciliation behavior for provider-success/DB-failure and DB-success/provider-failure split-brain cases.
- Unknown callback provider task IDs must go through retry/DLQ diagnostics without creating cross-tenant records.
- Stable Gemini Omni reason codes are now required for UI, support, tests, and audit.
- Provider contract drift must fail closed with redacted diagnostics.
- Metrics/SLO coverage now includes submit success/failure, callback duplicates, orphan reconciliation, re-host failure, refund failure, and storyboard partial failure.
- Tests must not call live Kie endpoints by default; live smoke tests must be explicit opt-in.

## Sixth Review Additions

- Provider asset APIs now require explicit typed request/response contracts and paginated/searchable/sortable list behavior.
- Node-to-Python provider bridge contracts must be versioned and tested with shared fixture expectations.
- Generation must snapshot selected provider asset metadata at submission time so historical jobs remain stable after asset rename/delete/restore.
- Provider asset, clip, and storyboard state machines need explicit transition contracts with invalid-transition errors.
- Learning recommendations need thresholds, rolling windows, severity weighting, skill/contract version grouping, and issue-category dedupe.
- API schema tests must reject invalid Gemini Omni request shapes before service/provider calls.

## Seventh Review Additions

- Cancellation semantics are now explicit for queued, submitted, completed, and storyboard partial-complete states.
- Result media re-hosting now requires content-type, extension, max-size validation, idempotency, and temporary file cleanup.
- Existing `media_tasks` compatibility is protected through additive, versioned metadata envelopes.
- Task identity naming must distinguish internal task ID, provider task ID, provider asset ID, storyboard run ID, and clip ID.
- Contract version markers are required across API payloads, task metadata, skill handoff, and provider bridge metadata.
- Rolling deploy compatibility should support current and previous contract versions where feasible, and fail closed otherwise.

## Eighth Review Additions

- Existing Storyboard Review can be reused as a downstream human review surface for Gemini Omni storyboard runs.
- Gemini Omni must keep authoritative ownership of provider submission, credit reservation/refund, callback/polling reconciliation, Prompt QA, Video QA, learning signals, and provider asset snapshots.
- A Gemini Omni to Storyboard Review adapter is required to write review-task projections with `storyboardRunId`, `clipId`, clip order, prompt, model, duration, aspect ratio, asset snapshot, QA summary, generated media, status, and source surface metadata.
- Review-only placeholders must not submit provider jobs, reserve credits, or count as generated clips until a real backend/provider task is attached.
- Storyboard Review comments, approvals, and revision requests must feed back as review feedback or revision attempts, not direct mutations of provider asset, billing, or historical task metadata.
- Existing stale-write protection behavior should be preserved so completed/fresher review task media is not overwritten by stale Gemini Omni or client state.

## Ninth Review Additions

- Existing Storyboard Review supports queued/generating/completed/error clip tasks, selected clip IDs, saved review records, local draft fallback, prompt editing, reference frame replacement, clip import/replacement, project creation, and compound/render flows.
- Gemini Omni integration is not complete if it only writes generic review tasks; it also needs a typed `generationExtraParams.geminiOmni` envelope carrying contract version, delivery mode, storyboard run ID, clip ID, shot list, reference-unit usage, selected provider asset snapshots, and QA summaries.
- Generic Storyboard Review regeneration is unsafe for Gemini Omni unless it is routed through Gemini Omni validation, pricing, credit reservation, provider asset snapshotting, QA, and learning orchestration.
- If Gemini Omni-specific regeneration from Storyboard Review is not included in the implementation slice, review tasks must expose "Revise in Gemini Omni" instead of direct generic regenerate.
- Handoff persistence must support saved `/storyboard-review/:reviewId` records and idempotent updates by `storyboardRunId + clipId`, not local storage alone.
- Storyboard Review composition actions may remain, but source-of-truth updates must be represented as review feedback, imported replacement markers, approval events, or revision requests.

## Tenth Review Additions

- Gemini Omni should include a `Cinematic Storyboard` production mode so Media Studio and Storyboard Review can manage a coherent story timeline, not only disconnected generated clips.
- Media Studio needs Story Bible, Cast & Voice, Scene Timeline, Provider Plan, QA, and Review Storyboard areas for cinematic runs.
- Director skill output now requires story bible, narrative arc, cast map, voice/audio map, scene timeline, continuity graph, clip plans, and cinematic provider handoff metadata.
- Storyboard Review needs a story timeline view with scene groups, narrative arc, voiceover/dialogue text, character/audio badges, cinematic QA, continuity warnings, and whole-story approval.
- Lipsync must be handled conservatively: use provider-safe "audio-guided dialogue/performance" wording unless the active Kie contract confirms exact lipsync controls; preserve `lipsyncIntent` metadata for prompts and QA.
- Cinematic QA categories now include narrative continuity, character consistency, camera/framing, lighting/color, pacing, audio alignment, audio-guided performance/lipsync intent, transition continuity, and CTA/platform fit.
- Revisions must be targetable at story bible, scene, clip, voice line, asset mismatch, quota, cinematic quality, or continuity level so unaffected clips are not regenerated unnecessarily.

## Eleventh Review Additions

- Gemini Omni skill package completeness now requires `SKILL.md`, `skill.md`, schemas, UI schema, references, fixtures, structured test assertions, verify script, registry metadata, and optional lock/version snapshot where existing tooling expects it.
- Director, Prompt QA, and Video QA must all return structured JSON contracts; prose-only output is invalid except inside specific text fields.
- Director output must preserve stable top-level handoff fields across single-shot, multi-shot, storyboard, and cinematic modes so Media Studio does not need separate parsers.
- Prompt QA and Video QA schemas must include target level, severity, revisability, recommended action, revision instructions, learning signal candidates, and contract version.
- Fixture matrix now covers happy paths, source-video pricing, character/audio refs, over-quota failure, missing assets, cinematic voiceover, cinematic audio-guided dialogue, metadata-only QA, visual-inspection placeholder QA, learning recommendations, and invalid outputs.
- Skill verification must run offline without live Kie/provider calls.

## Twelfth Review Additions

- Gemini Omni skill suite now requires a production-grade pre-generation quality gate before credit reservation or provider submission.
- The quality gate combines deterministic Python/JavaScript validators with reviewer/subagent-style roles for Story Continuity, Provider Constraints, Cinematic Direction, Character & Identity, Voice & Audio, Cost & Risk, and Safety/Policy.
- Helper scripts are allowed under skill packages as long as default verification is offline, fixture-based, machine-readable, and does not call live Kie/provider endpoints.
- Quality gate output must include gate status, confidence score, credit risk score, expected quality score, blocking issues, revision instructions, reviewer verdicts, max-attempt state, and allowed next actions.
- The Director/Prompt QA loop must revise repeatedly within limits and stop at pass, block, human review, max attempts, or budget guard.
- Media Studio must not reserve provider credits while the gate status is `revise`, `human_review`, or `block`; high-risk reviewer disagreement requires human review or explicit authorized override.

## Thirteenth Review Additions

- The master `claude-plan.md` is now synchronized with the production quality gate requirements so implementation cannot follow the older simplified Director -> Prompt QA -> credit flow.
- Credit reservation is explicitly blocked until the quality gate passes or an authorized human override accepts the risk.
- Human override must be audited with actor, reason, risk score, affected clips, estimated credits, and contract version, and it must not bypass budget or tenant policy.
- Pre-generation revisions should be targeted by story/scene/clip/voice/asset/continuity level to avoid rewriting unrelated approved prompts or asset mappings.
- Rollout verification now includes production quality gate tests, helper-script offline output checks, human override audit checks, and release blockers for failed preflight still reserving provider credits.
- Skill rollback must keep previous contract versions available for in-flight Gemini Omni runs until completion or cancellation.

## Fourteenth Review Additions

- Gemini Omni now includes Marketplace Product Storytelling mode for Shopee and TikTok Shop products captured through Marketplace Capture.
- The plan bridges Feature 115 outputs (`ProductBrief`, `ReviewInsight`, `TikTokShopTrendBrief`, `VideoBrief`) into Media Studio/Gemini Omni without making them mandatory for basic product videos.
- Product evidence snapshots must carry platform, capture/product IDs, external item/shop IDs, source URL, product/shop/category fields, selected images, price/sold/rating/review text snapshots, insight schema versions, and claim evidence IDs.
- Product Truth, Marketplace Image Fidelity, and Customer Journey reviewers are now part of the quality gate for marketplace campaigns.
- Unsupported claims, wrong-product images, variant/package/color mismatches, review claims without evidence, and customer-journey drift must block or revise before credit reservation.
- Storyboard Review must display marketplace product card, selected images, evidence-backed claims, unsupported-claim warnings, customer journey stage, and product image fidelity QA.

## Fifteenth Review Additions

- Feature 115 now provides a dedicated `MarketplaceStorytellingHandoff`; Feature 114 must consume that typed contract directly instead of reinterpreting free-form local insight text.
- Feature 114 must be able to load Feature 115 handoffs by capture ID, marketplace product ID, insight ID, or AI Video Studio import payload.
- Feature 114 must respect Feature 115 readiness states: `ready_for_storytelling`, `ready_with_warnings`, `needs_user_review`, and `insufficient_evidence`.
- Feature 115 claim resolution decisions (`approve`, `edit`, `remove`, `request_more_evidence`) now need roundtrip support in Gemini Omni before Director planning.
- Edited claims require provenance/version preservation; removed claims must revise dependent scenes, captions, voiceover, CTA, and on-screen text.
- Request-more-evidence must return users to marketplace capture/product evidence surfaces when routes exist.
- Hard policy blocks from Feature 115 cannot be bypassed by normal claim approval or ordinary human override.

## Sixteenth Review Additions

- Media Studio now needs a centralized Production/Director tab so cinematic/storytelling work starts from the user's goal rather than from separated image/video/audio/provider tabs.
- Existing Image, Video, and Audio tabs remain standalone execution surfaces; Production coordinates them and can open them with prefilled context for missing assets.
- The plan now includes `ProductionGoal`, `ProductionRun`, `ProductionBible`, `ProductionAssetPlan`, `ProductionQualityGate`, and final provider plan contracts.
- Cross-modal asset orchestration must use all suitable Media Studio systems for image/keyframe, product image, reference video, character, voice/audio, TTS, sound/music, draft clip, and final render assets.
- Gemini Omni Video and Seedance 2 are treated as high-quality final provider candidates, not as hard-coded assumptions; final provider selection must be capability, quality, cost, policy, and provider-health aware.
- Planning and asset preparation must not reserve final provider credits. Final render is allowed only after asset readiness, product truth, quality gate, budget/concurrency, and provider preflight pass.
- Production QA now loops across goal, story bible, asset plan, prompt, scene, clip, voice line, provider selection, post-generation QA, and Storyboard Review feedback with targeted revisions.
- Storyboard Review receives production-level story and QA metadata but must not mutate provider submission payloads, provider asset records, credit ledger records, or historical task metadata.

## Seventeenth Review Additions

- Production/storyboard output must route to two first-class downstream surfaces: Storyboard Review and Video Edit.
- Storyboard Review is for narrative review, approvals, revision requests, and final storyboard render.
- Video Edit is for user-controlled timeline editing, trimming, ordering, overlays, captions, audio mixing, manual replacements, and export.
- Both routes receive projections of production output and must not become the source of truth for provider submission, credit reservation, provider asset snapshots, QA/learning state, or historical generation metadata.
- Media Studio must show `Review Storyboard` and `Open in Video Edit` as separate actions so users understand the difference between review/render workflow and manual editing workflow.
- Sending output to both routes must be idempotent and must not duplicate provider jobs or reserve final provider credits again.
- Video Edit changes are edit-layer artifacts. They must not mutate original provider submissions, credit records, provider asset snapshots, historical generated media metadata, or QA/learning evidence.

## Eighteenth Review Additions

- Codebase inspection showed an existing Video Editor contract and storyboard project builder path (`VideoEditorProject` / `buildStoryboardVideoProject`), so the new Video Edit handoff must reuse those contracts unless compatibility tests prove a gap.
- Gemini Omni/Production metadata should be attached to existing project/asset metadata and provenance, not encoded in a parallel timeline schema.
- Video Edit handoff must define incomplete-media behavior: either explicit non-renderable placeholders that the editor can safely display or a disabled `Open in Video Edit` action until generated/imported media exists.
- The handoff must never create fake clip URLs or use provider task IDs as media URLs.
- Downstream projection mapping is required for Storyboard Review and Video Edit so repeated exports reopen/update existing records instead of duplicating review records or editor projects.
- Storyboard Review render/compound and Video Edit export may use separate render queues/costs, but UI and billing must label those as render/export costs rather than provider generation credits.

## Nineteenth Review Additions

- Production Director needs a mandatory Plan & Storyboard Approval Gate after the user defines the goal and before any batch execution starts.
- Add `apps/web/skills/media-production-storyboard-planner` to generate a reviewable production plan, storyboard outline, scene timeline, shot plan, asset requirements, provider candidate plan, batch execution plan, estimate, assumptions, risks, and approval checklist.
- The generated plan/storyboard must be editable through full revision or targeted revision commands for scene, shot, dialogue/voiceover, product claim, asset requirement, provider plan, and batch order.
- Users can lock approved scenes/assets so targeted revisions do not rewrite stable work unless dependency validation requires unlocking related items.
- Provider-specific Director skills, including Gemini Omni Video Director, should consume the approved plan/storyboard package rather than reinterpreting the original goal from scratch.
- Batch asset generation, provider generation, final render, Storyboard Review render, and Video Edit export must be blocked while the plan/storyboard status is draft, generating, needs revision, or rejected.
- Skipping plan/storyboard approval should be disabled for normal users and allowed only through an audited internal/admin override.

## Twentieth Review Additions

- ProductionGoal must be presented as a readable visual goal canvas, not a long technical configuration form.
- The visual canvas should use goal summary cards, output type cards, audience/platform chips, product/brand cards, character/voice cards, a visual style board, story arc mini timeline, constraints chips, and readiness/cost/quality strips.
- Normal users should edit the goal by clicking focused cards while advanced/debug structured fields remain hidden by default.
- The visual canvas must preserve the complete structured `ProductionGoal` for planner skills, QA, provider selection, audit, and Feature 115 handoff; it is not allowed to simplify data destructively.
- Responsive and accessible behavior is part of release readiness: no horizontal scrolling, no clipped labels, and accessible labels for cards, chips, thumbnails, readiness badges, and edit actions.

## Twenty-First Review Additions

- ProductionGoal needs an implementation component map so the visual canvas does not become an improvised oversized form.
- Starter templates are required for common goals such as product review short, TikTok Shop trend short, Shopee support video, cinematic brand story, UGC ad, tutorial/demo, customer journey campaign, and character dialogue scene.
- Applying a template must preview changed fields and must not overwrite imported product evidence or selected assets without confirmation.
- A compact AI clarification step should ask only materially missing decisions before planner execution, and it should use safe defaults where policy allows.
- ProductionGoal edits need a lightweight revision trail with version, changed fields, actor, timestamp, reason/template, and affected storyboard/asset-plan items.
- Graphics are allowed only when they improve comprehension; all icons, thumbnails, cards, badges, and timeline markers need text labels and accessible names.

## Twenty-Second Review Additions

- The right-sized orchestration solution is not to make Agency Swarm, LangGraph, or OpenAI Agents Python mandatory for MVP.
- Add `apps/web/skills/media-production-plan-verifier` as the default bounded LLM verification layer after storyboard planning and before user approval.
- Agency Swarm should be optional for high-risk/high-value reviewer packs only, behind feature flag and tenant policy, because it adds cost, latency, and operational complexity.
- LangGraph should be optional for long-running checkpointed production batches only when existing durable media task/state handling is insufficient.
- OpenAI Agents Python may power planner/verifier execution only through the existing Python adapter/shared skill-runtime boundary; Node and frontend must not import SDK classes.
- The legacy `agency_swarm_adapter.py` must not be expanded for this feature without separate flags and contract tests.
- Normal users should never see internal runtime engine names. They should see plan status, verifier warnings, revisions, and next actions.

## Twenty-Third Review Additions

- Production Director state needs durable server-side persistence, not browser-only local storage or opaque unversioned JSON.
- Add production run, goal version, plan version, plan verification, asset plan, approval, and output projection records.
- Approval records must persist actor, accepted warnings, risk score, estimated credits, policy snapshot, and approved plan version.
- Output projections for Storyboard Review and Video Edit must be idempotent and stale-write safe so generated clip completion cannot overwrite newer user comments or timeline edits.
- Feature flags need dependency rules: normal-user batch execution cannot be enabled unless persistence, planner, verifier, approval, and relevant output handoff gates are enabled.
- ProductionGoal canvas can ship as planning-only preview before batch execution, but it must not unlock provider submission by itself.

## Twenty-Fourth Review Additions

- Planner and verifier inputs include untrusted evidence from user briefs, marketplace text, Feature 115 handoffs, filenames, captions, OCR/DOM snippets, comments, and prior AI output.
- Prompt-injection hardening must keep untrusted evidence out of system instructions and prevent it from changing schema, permissions, provider choice, budget, approval, or output routing.
- Evidence minimization must prefer normalized records/evidence IDs, cap and summarize raw text, and strip script/prompt-control/signed URL/account-noise content before LLM calls.
- Production persistence must support redacted/display-safe summaries and retention expiry for raw planner/verifier payloads.
- Planner/verifier token and credit costs must be tracked separately from provider generation credits unless tenant policy explicitly includes planning.
- Release is blocked if planner/verifier logs or persists raw evidence/prompts contrary to redaction and retention policy.

## Twenty-Fifth Review Additions

- The plan is now large enough that implementation must be delivered as independently releasable slices rather than one feature release.
- Add slice gates for foundation/persistence, Gemini Omni base video, Director skill/Prompt QA, ProductionGoal planning preview, planner/verifier approval, provider assets, cross-modal asset readiness, internal batch execution, dual output, Feature 115 storytelling, and optional advanced runtimes.
- Planning-only slices must never reserve credits, submit provider jobs, create Storyboard Review or Video Edit projections, or mutate existing standalone Image/Video/Audio behavior.
- Later slices must be blocked by flag dependency checks and readiness diagnostics when required earlier slices are disabled or incomplete.
- Dual output must not be enabled until idempotent projection mappings and stale-write protections are proven for both Storyboard Review and Video Edit.
- Rollback must preserve durable records from earlier slices, including production runs, goal/plan versions, approval records, provider asset snapshots, generated media, Storyboard Review records, and Video Edit projects.

## Verdict

Ready for implementation starting at section 01. Do not skip section 01; later UX, backend, Production Director, asset orchestration, and final render work depend on the shared validation/metadata contract.
