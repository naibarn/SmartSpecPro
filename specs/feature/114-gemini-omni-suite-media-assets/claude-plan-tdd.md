# TDD Plan - Feature 114 Gemini Omni Suite Media Assets

Date: 2026-05-21

## Test Strategy

Build tests from the inside out:

1. Shared validation and pricing.
2. Provider asset persistence and API validation.
3. Kie provider request/response parsing.
4. Skill package schema validation.
5. Media Studio UI behavior.
6. End-to-end generation orchestration with mocked provider calls.
7. Learning recommendation creation.

## Unit Tests

- `mediaModelInputs` parses hidden, advanced-only, provider asset picker, and reference unit metadata.
- Gemini Omni validation accepts valid prompt-only, image, source-video, character, audio, and mixed-reference cases.
- Gemini Omni validation rejects reference unit totals over 7.
- Gemini Omni validation rejects more than one source video.
- Gemini Omni validation rejects more than 3 character assets.
- Pricing returns every supplied matrix value.
- Pricing uses the with-video branch when a source video is present via any supported alias.
- Provider asset service enforces tenant ownership.
- Provider asset service rejects wrong capability IDs.
- Provider asset service deduplicates idempotent create retries.
- Provider asset schema enforces unique provider asset IDs per tenant/provider/capability.
- Provider asset service enforces owner/admin authorization for list/use/delete/restore/purge.
- Provider asset retention logic excludes soft-deleted assets and can purge expired assets idempotently.
- Provider asset list supports pagination, search, filters, stable sort, and cursor continuation.
- Typed API schemas reject unknown/invalid Gemini Omni request shapes before service calls.
- State transition helpers reject invalid provider asset, clip, and storyboard transitions.
- Cancellation transition helpers settle queued/submitted/completed/storyboard states correctly.
- Skill schemas validate fixtures for single-shot, multi-shot, and storyboard outputs.
- Production Storyboard Planner schema validates goal interpretation, production bible draft, creative strategy, storyboard outline, scene timeline, shot plan, asset requirements, provider candidate plan, batch execution plan, credit/time estimate, risks, assumptions, approval checklist, revision targets, and next actions.
- Production Storyboard Planner schema validates full revision and targeted revision requests for scene, shot, dialogue, product claim, asset requirement, provider plan, and batch order.
- Production Plan Verifier schema validates verdict, score, blocking issues, warnings, missing decisions, recommended revisions, targeted revision map, credit risk summary, approval readiness, and reviewer notes.
- Production Plan Verifier rejects incomplete, off-goal, over-budget, unsupported-claim, missing-asset, provider-infeasible, or bad-batch-order plans before user approval.
- Planner/verifier prompt builder treats user brief, marketplace text, Feature 115 handoff text, filenames, captions, OCR/DOM snippets, comments, and prior AI output as untrusted evidence.
- Planner/verifier prompt-injection fixtures cannot alter schema, permissions, budget, approval status, provider choice, tool permissions, or output routing.
- Planner/verifier evidence minimization caps/summarizes raw evidence and strips scripts, hidden page text, prompt-control text, signed URL query strings, and account/contact/header noise.
- Gemini Omni Director schema validates cinematic storyboard fixtures with story bible, narrative arc, cast map, voice map, audio map, scene timeline, clip plans, continuity graph, and QA handoff metadata.
- Cinematic story validation rejects clip plans whose combined image/video/character references exceed Gemini Omni quota.
- Cinematic story validation marks exact lipsync as unsupported unless the active provider contract confirms a dedicated lipsync control.
- Skill package metadata validates `skill.md` frontmatter for stable slug, version, category, tags, execution mode, default enabled state, credit multiplier, priority, and auto-trigger behavior.
- Skill verification rejects Director outputs missing required top-level handoff fields even if prose prompt text exists.
- Prompt QA and Video QA schemas validate target level, severity, revisability, recommended action, revision instructions, learning signals, and contract version.
- `scripts/verify.sh` for each Gemini Omni skill validates schemas, fixtures, contract snapshots, and metadata without live provider calls.
- Helper Python/JavaScript validators return machine-readable pass/warning/revise/block results for schema, quota, pricing branch, asset reference, provider contract, and story-plan checks.
- Prompt QA schema validates aggregated reviewer verdicts for Story Continuity, Provider Constraint, Cinematic Direction, Character & Identity, Voice & Audio, Cost & Risk, and Safety/Policy roles.
- Pre-generation quality gate schema validates `gate_status`, `confidence_score`, `credit_risk_score`, `expected_quality_score`, `blocking_issues`, `revision_instructions`, `reviewer_verdicts`, `max_attempts_reached`, and `allowed_next_actions`.
- Marketplace product context schema validates Shopee and `tiktok_shop` product evidence snapshots, Feature 115 insight references, selected product images, product claims map, customer journey map, and image role map.
- Feature 115 adapter validates `MarketplaceStorytellingHandoff`, `MarketplaceInsightRecord`, and `MarketplaceClaimResolution` inputs by schema version, payload hash, readiness, provider, source platform, capture/product IDs, and parent insight IDs.
- Product Truth validator rejects unsupported features/specs/benefits/review claims/CTAs not backed by evidence IDs or approved user input.
- Marketplace Image Fidelity validator rejects wrong product, variant, package, color, or unrelated marketplace image references.
- Customer Journey validator rejects product storytelling plans whose scenes drift from the selected funnel stage.
- ProductionGoal schema validates goal type, audience, platform, product context, character requirements, voice/audio strategy, cinematic style, budget guardrails, and quality target.
- ProductionRun schema validates production bible, asset plan ID, storyboard run ID, final provider plan, quality gate summary, budget summary, status, attempts, and contract version.
- Production persistence schemas validate production runs, goal versions, plan versions, verifier results, asset plans, approvals, and output projections.
- ProductionAssetPlan schema validates asset nodes, dependencies, provider candidates, selected provider, required/optional readiness, quality checks, retry policy, cost estimate, and provenance IDs.
- Production quality gate schema validates story alignment, provider fit, product truth, asset readiness, expected quality, credit risk, reviewer verdicts, revision instructions, allowed next actions, and max-attempt state.
- Final provider selector rejects candidates that do not satisfy required reference, duration, aspect, resolution, voice/audio, character, product, or policy constraints.
- Final provider selector can rank Gemini Omni Video, Seedance 2, and other eligible video models by fit, quality, cost, and provider health.
- Delivery slice dependency resolver rejects impossible flag combinations, such as batch execution without persistence/approval gates or dual output without projection mapping.
- Delivery slice dependency resolver allows planning-only goal canvas without provider submission, credit reservation, asset creation, or output projection flags.

## Integration Tests

- Creating a Gemini Omni Audio asset stores `kieAudioId`.
- Creating a Gemini Omni Character asset stores `characterId`.
- Character creation can reference an existing Gemini Omni Audio asset.
- Gemini Omni Video generation sends selected character/audio provider IDs in extra params.
- Gemini Omni Video generation blocks invalid combinations before credit reservation.
- Provider failure after reservation voids/refunds credits according to existing credit ledger rules.
- Storyboard mode creates one media task per clip with shared run metadata.
- Storyboard partial failure preserves successful clips and retries only failed clips.
- Gemini Omni storyboard handoff creates Storyboard Review task projections in clip order with `storyboardRunId`, `clipId`, prompt, model, duration, aspect ratio, asset snapshot, QA summary, and source surface metadata.
- Storyboard Review placeholder tasks remain review-only and do not submit provider jobs, reserve credits, or count as generated clips until a backend media task/provider task is attached.
- Completed Gemini Omni clips update the matching Storyboard Review task media without overwriting fresher review edits.
- Storyboard Review comments, approvals, and revision requests are recorded as Gemini Omni review feedback or revision attempts without mutating provider asset records or historical generation snapshots.
- Storyboard Review deep links filter by Gemini Omni storyboard run and clip IDs.
- Deleting or renaming a provider asset after Storyboard Review handoff does not mutate the review task asset snapshot.
- Gemini Omni review task projections populate `generationExtraParams.geminiOmni` with contract version, delivery mode, storyboard run ID, clip ID, shot list, reference-unit usage, asset snapshot, and QA summary.
- Cinematic Storyboard mode persists story-level orchestration with story bible, narrative arc, cast/voice/audio maps, scene timeline, continuity graph, clip plans, QA summary, and review state.
- Cinematic Storyboard projection groups Storyboard Review tasks by scene and preserves story order, dialogue/voiceover text, cinematic intent, character/audio badges, and continuity warnings.
- Story-level revisions target only affected story bible, scene, clip, voice line, asset mismatch, provider quota, cinematic quality, or continuity nodes when possible.
- Saved `/storyboard-review/:reviewId` records can be reopened and reconciled by `storyboardRunId + clipId` without local-storage-only state.
- Storyboard Review direct regeneration is disabled for Gemini Omni tasks unless a Gemini Omni-specific regeneration adapter is installed.
- If Gemini Omni-specific Storyboard Review regeneration is enabled, it calls Gemini Omni validation, pricing, credit reservation, provider asset snapshotting, QA, and learning orchestration instead of the generic video generation path.
- Review-layer clip import/replacement is stored as review feedback or an imported replacement marker and does not mutate original provider submission metadata.
- Storyboard preflight blocks launch when total planned cost exceeds balance/budget.
- Storyboard preflight enforces per-user and per-tenant concurrency limits.
- Prompt QA failure creates a revisable state before generation.
- Production quality gate blocks credit reservation and provider submission while status is `revise`, `human_review`, or `block`.
- Production quality gate loops through Director revisions until pass, max attempts, budget guard, or human review.
- Conflicting high-risk reviewer/subagent verdicts route to human review instead of provider submission.
- Video QA failure creates a learning signal after generation.
- Director skill unavailable follows manual/fallback policy without provider submission from invalid structured output.
- Prompt QA unavailable follows tenant policy: block when required, continue when optional.
- Video QA unavailable completes generation and marks learning signal as `qa_unavailable`.
- Video QA records cinematic/story categories: narrative continuity, character consistency, framing/camera motion, lighting/color consistency, pacing, audio alignment, audio-guided performance/lipsync intent, transition continuity, and CTA/platform fit.
- Marketplace product campaign orchestration imports confirmed product data/images and Feature 115 ProductBrief/ReviewInsight/TikTokShopTrendBrief/VideoBrief when available.
- Marketplace product campaign orchestration imports Feature 115 `MarketplaceStorytellingHandoff` by capture ID, product ID, or insight ID and does not parse free-form local insight text.
- `ready_for_storytelling`, `ready_with_warnings`, `needs_user_review`, and `insufficient_evidence` states map to correct Gemini Omni actions and block direct provider generation where required.
- Claim resolution approve/edit/remove/request-more-evidence decisions update claims map and dependent scenes/captions/voiceover/CTA before Director planning.
- Request-more-evidence creates a return path to marketplace capture/product evidence surfaces when available.
- Marketplace campaign quality gate blocks credit reservation when product claims are unsupported, selected image mismatches product, review claims lack evidence, or customer journey is inconsistent.
- Storyboard Review projection includes marketplace product card, selected images, evidence-backed claims, unsupported-claim warnings, customer journey stage, and product image fidelity QA.
- Missing Feature 115 insights falls back to confirmed marketplace product fields and selected images with reduced confidence instead of blocking basic product video creation.
- Production Director creates a production run and asset plan without reserving final provider credits.
- Production Director persists goal version, plan version, verifier result, approval event, and output projection mappings server-side.
- Production persistence honors retention/redaction policy for raw planner/verifier payloads while preserving hashes, summaries, approvals, and lineage.
- Production Director can reopen a saved run and resume from the correct status without browser local storage.
- Production Director runs the Production Storyboard Planner after goal definition and before asset-generation batch execution.
- Production Director runs Production Plan Verifier after planner output and loops targeted revisions up to configured limits.
- Plan/storyboard approval is required before batch asset generation, provider submission, final render, Storyboard Review render, or Video Edit export.
- Batch execution is blocked when plan verifier returns revise, human_review, block, failed, or unavailable without allowed internal/admin override.
- Batch execution is blocked when any required delivery slice gate is disabled or readiness diagnostics fail.
- Enabling dual output without idempotent projection mappings prevents Storyboard Review and Video Edit handoff actions from creating records.
- Rolling back a later delivery slice preserves earlier durable records, generated media, provider asset snapshots, approved plan versions, and existing downstream review/edit records.
- Agency Swarm reviewer pack is optional and feature-flagged; normal planner/verifier path works without Agency Swarm.
- LangGraph batch runtime is optional and feature-flagged; deterministic state transitions work without LangGraph for MVP.
- OpenAI Agents Python usage is only through the existing Python adapter/shared skill-runtime boundary; Node/frontend never import SDK classes.
- Targeted planner revisions preserve approved/locked scenes/assets unless dependency validation unlocks related items.
- Production Director can open Image, Video, Audio, Gemini Omni Character, and Gemini Omni Audio workflows with prefilled production context.
- Cross-modal asset orchestration marks required assets, optional enhancement assets, missing assets, blocked assets, fallback provider options, and human confirmation requirements.
- Cross-modal asset orchestration preserves Feature 115 product evidence IDs and selected marketplace image roles through asset nodes.
- Asset plan readiness blocks final render when required product, character, voice/audio, keyframe, source video, or evidence assets are missing.
- Production quality loop repeats targeted revisions until pass, max attempts, budget guard, hard block, or human review.
- Final provider preflight runs after quality pass and before provider submission for balance, budget, concurrency, provider health, callback/polling readiness, and storage readiness.
- Final provider submission can route to Gemini Omni Video, Seedance 2, or another eligible provider based on selected final provider plan.
- Post-generation QA compares completed output against the original production goal, production bible, asset plan, product truth, and storyboard plan.
- Targeted revision after failed post-generation QA does not regenerate unaffected approved assets or clips.
- Storyboard Review production handoff includes production run ID, story bible summary, scene order, asset snapshots, provider plan, quality gate summary, generated media, and revision options.
- Storyboard Review feedback maps back to production run revision requests without mutating provider submission payloads, provider asset records, credit ledger records, or historical task metadata.
- Video Edit handoff creates or updates an editable project with production run ID, storyboard run ID, scene/clip order, generated media, prompt/shot metadata, asset snapshots, dialogue/voiceover, captions where available, audio references, QA badges, provider metadata, and provenance IDs.
- Video Edit handoff reuses `VideoEditorProject` and the storyboard project builder contract instead of creating a parallel timeline schema.
- Video Edit handoff with incomplete media either creates explicit non-renderable placeholders or disables the action until usable media exists; it never uses fake clip URLs.
- Sending the same production output to Storyboard Review and Video Edit is idempotent and does not duplicate provider jobs or reserve final provider credits again.
- Output projection mapping prevents duplicate Storyboard Review records or Video Edit projects and updates downstream projections without overwriting user edits.
- Stale output projection sync cannot overwrite newer Storyboard Review comments or Video Edit timeline edits.
- Storyboard Review render/compound and Video Edit export costs are labeled and accounted for separately from provider generation credits.
- Planner/verifier token and credit costs are accounted separately from provider generation credits unless tenant policy marks planning included.
- Video Edit timeline edits, manual replacements, captions, overlays, audio mixes, and exports are stored as edit-layer artifacts and do not mutate provider submission payloads, provider asset records, credit ledger records, historical generated media metadata, or QA/learning evidence.
- Video Edit exported media can be linked back to the production run as an output artifact without changing the original generated clip records.
- Provider asset creation success followed by DB write failure creates a retryable reconciliation record and does not double-charge on retry.
- DB reservation without durable provider ID is refunded/voided and marked with a stable reason code.
- Unknown callback provider task ID routes to retry/DLQ diagnostics without creating cross-tenant records.
- Re-host success followed by final task update failure is recoverable and idempotent.
- Generation submission snapshots selected asset metadata so later asset rename/delete does not mutate historical jobs.
- Learning aggregation creates recommendations only after configured sample thresholds/windows are met.
- Learning aggregation groups by skill version and issue category.
- Older media task records without Gemini Omni envelopes still render/poll through existing paths.
- Gemini Omni task metadata persists additive versioned envelopes with distinct internal task ID, provider task ID, storyboard run ID, clip ID, and provider asset IDs.

## UI Tests

- Gemini Omni Video no longer shows raw `audio_ids` as a normal textarea/JSON field.
- Reference Images picker is interactive when Gemini Omni Video supports images.
- Source Video picker is interactive and capped at one video.
- Empty character/audio pickers show create actions.
- Newly created character/audio assets are selected automatically.
- Credit estimate changes when a source video is selected.
- Quota meter blocks over-limit selection before generate.
- Character reference image over 20 MB is blocked before provider call.
- New Gemini Omni controls have Thai and English labels.
- Character/voice creation requires policy/consent acknowledgment when configured.
- Storyboard UI shows per-clip and total estimated cost, including skill/QA costs when applicable.
- Storyboard UI exposes a clear Review Storyboard action only after reviewable prompts or clips exist.
- Storyboard Review handoff UI distinguishes review-only placeholders, submitted clips, completed clips, and revision-needed clips.
- Open in Video Edit appears as a separate action from Review Storyboard when output can form an edit project.
- Open in Video Edit is disabled with a clear reason when there is no usable media and placeholder projects are unsupported.
- Video Edit handoff UI distinguishes creating project, opening existing project, export ready, and handoff failed states.
- Render/export cost labels distinguish Storyboard Review render and Video Edit export from provider generation credits.
- Returning from Storyboard Review preserves the original Gemini Omni run state and selected clip ordering.
- Returning from Video Edit preserves the original Gemini Omni/Production run and shows linked edit project/export metadata without implying provider generation changed.
- Media Studio Cinematic Storyboard shows Story Bible, Cast & Voice, Scene Timeline, Provider Plan, QA, and Review Storyboard areas without making users edit raw provider fields.
- Storyboard Review story timeline view shows narrative arc, scene groups, clip order, voiceover/dialogue, asset badges, cinematic QA, continuity warnings, and whole-story approval state.
- UI labels use provider-safe wording for audio-guided performance/lipsync intent and do not promise exact lipsync without provider contract support.
- Marketplace Product Storytelling workspace shows Product Truth, Insight Bridge, Campaign Goal, Customer Journey, Claim Map, and Product Image Roles panels.
- Product Truth panel blocks or warns on unsupported product claims, product-image mismatch, review claim without evidence, and customer journey mismatch before Generate.
- Storyboard Review product timeline displays product evidence, customer journey stage, claim QA, and product image fidelity status.
- Feature 115 insight lifecycle statuses and readiness states are visible enough for a non-technical user to know whether to generate, review claims, select more images, run server AI review, or capture more evidence.
- Media Studio Production tab shows Goal Brief, Audience and Platform, Product or Brand Context, Characters and Cast, Voice/Audio/Sound, Story Structure, Production Constraints, and Readiness/Cost/Quality panels.
- ProductionGoal visual canvas shows concise goal summary, output type cards, audience/platform chips, product/brand card, character/voice cards, visual style board, story arc mini timeline, constraints chips, and readiness strip.
- Editing any visual ProductionGoal card updates the underlying structured `ProductionGoal` without losing hidden/advanced fields needed by planner, QA, provider selection, audit, or Feature 115 handoff.
- ProductionGoal canvas avoids raw provider payload keys and technical enum names in normal-user mode.
- ProductionGoal template picker previews changed cards/fields and does not overwrite imported product evidence or selected assets without explicit confirmation.
- ProductionGoal AI clarification asks only material missing questions and allows safe defaults when policy permits.
- ProductionGoal revision drawer shows version, changed cards/fields, actor, timestamp, reason/template, and affected plan/storyboard items.
- ProductionGoal canvas graphics have text labels and accessible names; decorative-only graphics do not carry critical information.
- ProductionGoal visual canvas passes desktop/mobile responsive checks without horizontal scrolling or clipped card text.
- ProductionGoal visual canvas has accessible labels for cards, chips, thumbnails, readiness badges, and edit actions.
- Media Studio Production tab shows generated plan/storyboard review before batch start, with approve, revise all, revise selected scene/shot/dialogue/claim/asset/provider/batch order, and lock approved parts actions.
- Plan verifier warnings appear as user-readable badges/drawer content without exposing Agency Swarm, LangGraph, or OpenAI Agents SDK as normal-user concepts.
- Batch start controls remain disabled while plan/storyboard status is draft, needs_revision, rejected, or generating.
- Production tab clearly separates planning, asset preparation, storyboard review, final render, and post-generation QA states.
- Production asset plan UI shows required assets, optional enhancement assets, readiness, owner/provider, cost, quality status, and next action.
- Production tab can route users to existing Image, Video, and Audio tabs without hiding those standalone workflows.
- Final provider plan UI explains why Gemini Omni Video, Seedance 2, or another provider is selected or blocked.
- Generate/final render controls remain disabled while production assets, product truth, quality gate, budget, or provider fit are unresolved.
- Rate-limit/concurrency/budget blocks show disabled or deferred states without submitting provider jobs.
- Feature flags can enable goal canvas planning-only preview without enabling batch execution.
- Feature flags block normal-user batch execution when planner, verifier, persistence, approval, or dual-output dependencies are disabled.
- Delivery slice flags expose a clear off-state for foundation, Gemini Omni base video, goal canvas, planner/verifier, provider assets, asset readiness, batch execution, dual output, Feature 115 storytelling, and optional advanced runtimes.
- Planning-only slices never show enabled final render, Storyboard Review handoff, Video Edit handoff, or provider submission controls unless later slice gates are enabled.
- Enabling a later slice while a required earlier slice is disabled shows a disabled reason and does not submit provider jobs, reserve credits, or create output projections.
- Rolling back a later slice leaves earlier slice records visible and usable where policy allows.

## Provider Tests

Python:

- `generate_video` keeps existing Gemini Omni video behavior.
- Character create posts to `/api/v1/omni/character/create`.
- Audio create posts to `/api/v1/omni/audio/create`.
- Character parser extracts `data.characterId`.
- Audio parser extracts `data.kieAudioId`.
- Provider errors are sanitized.
- Provider success normalization accepts both `code: 0` and `code: 200` only when expected `data` is present.

Node:

- asset create calls do not create fake video task IDs.
- video task calls keep existing polling path.
- asset create retry does not double-charge or duplicate stored assets.
- callback and polling terminal updates deduplicate the same provider task.
- provider rate-limit/capacity errors use deferred retry behavior where supported.
- provider-hosted result URLs are re-hosted before final user-visible completion.
- Result re-hosting rejects unsupported content type, unsafe extension, and over-size files.
- Temporary re-hosting directories are removed on success and failure.
- Cancel before provider submit releases reservations; cancel after provider submit is best-effort and does not claim remote provider cancellation unless supported.

## Security and Observability Tests

- Reference URL validation rejects private, loopback, link-local, metadata-service, local/internal, and unsafe redirect targets.
- Callback handler rejects invalid signature, stale timestamp, replayed event, and over-size body.
- Logs/audit records redact provider tokens, signed URL query strings, and raw private media payloads.
- Feature flag denial emits a safe diagnostic event.
- Skill contract snapshot test fails if required Director/QA output fields are removed.
- Unauthorized cross-tenant provider asset IDs return forbidden/not found without leaking existence.
- Asset delete/restore/purge audit events are emitted and redacted.
- Readiness diagnostics report missing Kie key, callback secret, public callback URL, R2/storage, pricing, and skill package state without leaking secrets.
- Migration verification detects missing table/index/constraint after schema change.
- Seed/backfill can run twice without duplicating models/assets or clobbering unrelated admin edits.
- Provider contract fixtures detect Kie response drift for success codes, required data fields, and `video_list` shape.
- Every Gemini Omni failure path returns a stable reason code and sanitized user message.
- Metrics/audit counters exist for provider submit success/failure, callback duplicate, orphan reconciliation, re-host failure, refund failure, and storyboard partial failure.
- Node/Python bridge fixtures agree on request and normalized response contracts.
- Current and previous Gemini Omni contract versions are accepted during rolling deploy where feasible; unsupported versions fail closed.

## Visual and Documentation Tests

- Media Studio Gemini Omni panel passes desktop/mobile responsive smoke checks.
- Keyboard path can reach pickers, create dialogs, delivery mode, and generate controls.
- New controls have accessible labels and do not overlap at supported breakpoints.
- Admin help/runbook includes readiness, feature flags, pricing, rollback, and troubleshooting sections.
- User help explains Character/Audio assets without raw provider key terminology.
- CI provider tests use fixtures/mocks and never call live Kie endpoints by default.
- Optional live Kie smoke test is skipped unless explicit environment flags are set.

## Verification Commands

- `npm --prefix apps/web test -- --run apps/web/shared`
- `npm --prefix apps/web test -- --run apps/web/server/services`
- `npm --prefix apps/web test -- --run apps/web/client/src`
- `npm --prefix apps/web run check`
- `cd python-backend && DEBUG=false PYTEST_ADDOPTS=--no-cov uv run pytest tests/unit/llm_proxy/test_kie_ai_provider_model_resolution.py`
