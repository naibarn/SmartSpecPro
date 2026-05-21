# Claude Plan - Feature 114 Gemini Omni Suite Media Assets

Date: 2026-05-21
Mode: self_review
Source files:

- `spec.md`
- `claude-research.md`
- `claude-interview.md`
- `claude-spec.md`

## Objective

Turn Gemini Omni from a raw model config into a coherent Media Studio suite with correct references, reusable provider assets, pricing, QA, and learning.

Then extend Media Studio into a production-grade Director workflow that can plan story goals, prepare cross-modal assets through all supported media providers, select Gemini Omni Video, Seedance 2, or another qualified final provider, and loop quality checks before expensive generation.

The safest delivery strategy is foundation first, then provider assets, then skills, then UX, then QA/learning, then Production Director orchestration, then rollout.

## Plan Structure

1. Validation and metadata foundation
2. Provider asset data model and APIs
3. Kie provider asset contract
4. Gemini Omni skill packages
5. Admin presets, seed data, and pricing
6. Media Studio Gemini Omni UX
7. Generation, QA, and learning orchestration
8. Media Studio Production Director
9. Cross-modal asset orchestration
10. Production quality loop and final render
11. Rollout and regression verification

## 1. Validation and metadata foundation

Extend the shared media model input contract so Gemini Omni can be represented without raw user-editable fields.

Add support for:

- hidden fields
- advanced-only fields
- provider asset picker fields
- reference unit weights
- max reference counts by kind
- asset capability filters
- normalized provider payload keys

Build shared Gemini Omni validation helpers that run on both client-facing preflight and server-side generation.

The helpers should produce:

- normalized duration
- normalized resolution
- reference unit count
- source-video presence
- provider asset validation requirements
- human-readable validation errors

This section should not yet change the main UX heavily. It establishes a reliable contract that later UI and server work can share.

Likely files:

- `apps/web/client/src/lib/mediaModelInputs.ts`
- `apps/web/shared/mediaModelPricing.ts`
- `apps/web/shared` or `apps/web/server/services` Gemini Omni validation helper
- focused tests near existing media model input and pricing tests

## 2. Provider asset data model and APIs

Add `media_provider_assets` as the source of truth for provider-owned reusable assets.

The table should store:

- tenant/user ownership
- provider
- capability
- asset type
- provider asset ID
- display name
- status
- optional source library item ID
- optional thumbnail/source URL
- provider metadata JSON
- soft-delete fields
- timestamps

Add a service and router procedures for:

- list assets by capability/type
- create Gemini Omni Character asset
- create Gemini Omni Audio asset
- soft delete asset
- validate selected asset IDs for a video generation request
- idempotent create by client request ID
- restore or deduplicate existing provider asset IDs where safe
- rename/update display metadata
- restore and permanent purge where policy allows
- paginated list with search, status/type filters, stable sort, and next cursor

Add durable Production Director persistence. Do not keep ProductionGoal, planner output, verifier result, approval, or output projection state only in browser local storage or unversioned JSON blobs.

Recommended records:

- `media_production_runs`
- `media_production_goal_versions`
- `media_production_plan_versions`
- `media_production_plan_verifications`
- `media_production_asset_plans`
- `media_production_approvals`
- `media_production_output_projections`

These records should support reopening a production run, resuming from the current state, auditing what was approved, and updating downstream projections without overwriting user edits.

At minimum, persist:

- run owner/tenant/status
- goal versions and changed fields
- planner output versions with input/output hashes
- plan verifier verdicts and targeted revision maps
- approved plan version and accepted warnings
- policy/budget snapshot at approval time
- output projection mapping for Storyboard Review and Video Edit
- contract versions and timestamps

The API should return picker-friendly records and never require users to see raw provider IDs unless in admin/debug context.

Define typed contracts before implementation:

- list assets request/response
- create character request/response
- create audio request/response
- validate assets request/response
- update/delete/restore/purge request/response
- admin inspection projection

Schema constraints should include:

- unique tenant/provider/capability/provider asset ID
- indexes for tenant/type/status picker queries
- soft-delete filtering by default
- optional source/result library item links
- redacted provider metadata storage
- retention/purge markers compatible with existing library/media deletion policy

Access rules:

- normal users can list/create/use assets they own when feature flags and budget policy allow
- tenant/domain admins can inspect tenant assets through sanitized admin views
- server validation must reject cross-tenant or deleted asset IDs before pricing/credit reservation
- delete/restore/purge must be authorized and audited

Add reconciliation support for provider asset creation:

- persist an app-side idempotency record before external provider calls where possible
- record pending/submitted/succeeded/failed states
- if provider returns `characterId` or `kieAudioId` but DB persistence fails, create a retryable reconciliation record or safe operator diagnostic
- reconcile orphaned pending records without double-charging or duplicating user-visible assets

Generation submission must snapshot selected asset references so historical jobs do not change meaning when an asset is renamed, deleted, or restored later.

Production run resume must read durable server state rather than local storage. Downstream projection sync must be idempotent and stale-write safe.

Likely files:

- `apps/web/drizzle/schema.ts`
- new migration under `apps/web/drizzle`
- new server service for provider assets
- media router or a dedicated provider asset router
- server tests for tenant isolation and validation

## 3. Kie provider asset contract

Keep Gemini Omni Video on the existing async Kie task path. Add direct asset creation support for:

- `/api/v1/omni/character/create`
- `/api/v1/omni/audio/create`

The provider layer must parse:

- `data.characterId` for character creation
- `data.kieAudioId` for audio creation
- provider video `video_list` objects using `url`, optional `start`, and provider spelling `ends`
- success responses with either `code: 0` or `code: 200` when expected `data` is present

Errors should be normalized into actionable application errors without leaking headers or keys.

Node should call the provider through the existing media gateway/task architecture where possible, but asset creation must not be treated as a long-running video task unless the upstream endpoint actually returns a task ID.

Asset creation must be idempotent from the product perspective: duplicate client retries should not create duplicate stored assets or double-charge platform credits.

Video generation must support both callback and polling/recovery:

- include `callBackUrl` only when a configured safe public callback URL is available
- continue to support polling/recover-stuck behavior for local/dev and callback failures
- deduplicate callback and polling terminal updates
- classify provider rate-limit/capacity errors as retryable/deferred where the existing media system supports it

Provider errors and unknown response shapes must map to stable internal reason codes. Unknown response shapes should fail closed as `provider_contract_drift` with redacted diagnostics, not as successful generation.

Define a versioned Node-to-Python provider bridge contract for asset creation and Gemini Omni Video submission. Node and Python tests should use the same fixture names and expected normalized response fields.

Keep task identity unambiguous:

- internal media task ID
- provider task ID
- provider asset ID
- storyboard run ID
- clip ID

Do not reuse one field name across these identities in persisted envelopes or callback handlers.

Likely files:

- `python-backend/app/llm_proxy/providers/kie_ai_provider.py`
- Python Kie provider tests
- Node media provider bridge/service tests

## 4. Gemini Omni skill packages

Create:

- `apps/web/skills/media-production-storyboard-planner`
- `apps/web/skills/media-production-plan-verifier`
- `apps/web/skills/gemini-omni-video-director`
- `apps/web/skills/gemini-omni-prompt-qa`
- `apps/web/skills/gemini-omni-video-quality-qa`

Each package must include complete contract files:

- `SKILL.md`
- `skill.md`
- `schemas/input.schema.json`
- `schemas/output.schema.json`
- `schemas/ui.schema.json`
- references
- fixtures/examples
- `scripts/verify.sh`

The implementation must also register/sync the skills into the app's existing skill catalog so Media Studio can select them by stable slug/ID.

`media-production-storyboard-planner` runs immediately after `ProductionGoal` is defined in Production Director mode. It creates a reviewable plan/storyboard package and must not submit provider jobs or reserve provider credits.

Its output must include:

- production goal interpretation
- production bible draft
- creative strategy
- storyboard outline
- scene timeline
- shot plan
- asset requirements
- provider candidate plan
- batch execution plan
- credit/time estimate
- risk and assumption list
- approval checklist
- revision targets
- next actions

It must support full and targeted revision commands:

- revise all
- revise scene
- revise shot
- revise dialogue/voiceover
- revise product claim
- revise asset requirement
- revise provider plan
- revise batch order
- preserve locked approved scenes/assets where dependency validation allows

Provider-specific Director skills must consume the approved plan/storyboard package rather than interpreting the original goal from scratch.

`media-production-plan-verifier` runs after each planner output and before user approval. It should use bounded LLM verification to check:

- goal alignment
- story completeness
- audience/platform fit
- asset requirement completeness
- provider feasibility
- product truth and Feature 115 evidence coverage
- budget/credit risk
- batch order correctness
- missing approval decisions
- downstream readiness for Storyboard Review and Video Edit

Verifier output must include verdict, score, blocking issues, warnings, missing decisions, recommended revisions, targeted revision map, credit risk summary, and approval readiness.

Default verifier loop:

1. Planner emits plan/storyboard package.
2. Verifier returns pass, warning, revise, human review, or block.
3. If revise, planner receives targeted revisions.
4. Stop after 2 verifier-guided revisions by default, or earlier on pass/block/human review.

The verifier is required for normal Production Director batch start. If unavailable, batch start is blocked unless tenant policy allows an audited internal/admin manual approval.

Agency Swarm, LangGraph, and OpenAI Agents Python should be treated as runtime options, not mandatory MVP dependencies:

- Agency Swarm may power optional high-risk reviewer packs when multiple specialist personas should challenge a plan.
- LangGraph may run long, checkpointed production batches only if existing durable media task/state handling is insufficient.
- OpenAI Agents Python may power planner/verifier through the existing Python adapter/shared skill-runtime boundary, but Node and frontend must not import SDK classes directly.
- The legacy `agency_swarm_adapter.py` must not be expanded just for this feature unless a separate feature flag and contract tests approve it.

The director output must support:

- single-shot video
- multi-shot single video
- storyboard multi-video with per-clip shot lists

The QA outputs must include issue categories, severity, revisability, and learning recommendation candidates.

The Director output must include a machine-readable handoff contract for Media Studio:

- delivery mode
- generated prompt per clip
- per-clip shot list
- selected/reference asset summary
- duration/resolution recommendation
- quota estimate
- safety/compatibility notes

Skill packages should include versioned contract fixtures and snapshot checks so future skill-learning edits cannot remove required output fields silently.

Skill packages must also include a production-grade pre-generation verification loop. This loop is part of the skill suite contract, not a later nice-to-have, because Gemini Omni provider calls can be expensive.

The verification loop should combine deterministic helper scripts with reviewer/subagent-style roles:

- deterministic scripts for schema, fixture, provider quota, pricing branch, asset reference, provider contract, and story-plan checks
- Story Continuity Reviewer
- Gemini Omni Provider Constraint Reviewer
- Cinematic Direction Reviewer
- Character & Identity Reviewer
- Voice & Audio Reviewer
- Cost & Risk Reviewer
- Safety/Policy Reviewer

The reviewers may be implemented as separate internal skill calls, subagent-like orchestration roles, deterministic scripts, or a hybrid. Their output must aggregate into a single quality gate result that Media Studio can display compactly.

The quality gate result must include:

- `gate_status`
- `confidence_score`
- `credit_risk_score`
- `expected_quality_score`
- `blocking_issues`
- `revision_instructions`
- `reviewer_verdicts`
- `max_attempts_reached`
- `allowed_next_actions`

Default pre-generation limits:

- max Director revision attempts before generation: 3
- max total pre-generation loop attempts: 4
- high-risk reviewer disagreement routes to human review
- provider credit reservation is blocked while gate status is `revise`, `human_review`, or `block`

Skill execution costs must be explicit in the handoff plan. If prompt QA or video QA consumes credits/tokens, the UI and backend should account for that cost separately from provider video credits or mark it as included by tenant policy.

If the Director or QA skill is unavailable, disabled, or returns an invalid contract, Media Studio must fail gracefully:

- Director unavailable: allow manual prompt generation path when feature policy permits it.
- Prompt QA unavailable: either block or continue according to `prompt QA required` tenant flag.
- Video QA unavailable: generation can complete, but learning signal is marked `qa_unavailable`.
- Invalid skill output: do not submit provider jobs until the prompt package is repaired or user chooses manual mode.

## 5. Admin presets, seed data, and pricing

Update the static registry and seed script so Gemini Omni has complete managed config.

Gemini Omni Video should expose normal user controls only for:

- duration
- resolution
- aspect ratio/status
- seed/style/result type where useful

Provider fields like `image_urls`, `video_list`, `character_ids`, and `audio_ids` should be hidden or suite-managed.

Add Gemini Omni Character and Gemini Omni Audio metadata as asset capabilities, not normal video/image/audio generation models.

Admin UI should make suite-managed fields understandable. The current generic config editor can remain, but it needs enough metadata to avoid making operators believe raw fields are the normal user UX.

Pricing tests must prove all matrix branches.

Character/Audio asset creation pricing must be configurable. If final Kie asset pricing is not confirmed during implementation, keep normal-user asset creation disabled by default and expose only admin/internal creation until pricing is configured.

Existing DB rows for `gemini-omni-video` must be migrated or overwritten only for known managed fields:

- mark raw `audio_ids` / `character_ids` as suite-managed or advanced/debug-only
- preserve unrelated admin edits
- keep static fallback and seeded DB rows equivalent

Admin surfaces should include a minimal sanitized provider asset inspection path, even if full asset management is deferred:

- count assets by type/status
- inspect display name, owner, status, created/deleted timestamps
- hide raw provider IDs by default with an admin/debug reveal when authorized
- show feature flag and pricing readiness status

Add readiness diagnostics for:

- Kie API key configured/tested
- callback URL and webhook secret configured when callback mode is enabled
- public storage/R2 available for reference/result media
- Gemini Omni skill packages installed and contract versions current
- pricing configured for Video and asset creation
- latest seed/backfill status

## 6. Media Studio Gemini Omni UX

When `gemini-omni-video` is selected, render a dedicated suite panel.

The panel should provide:

- interactive image reference picker/status
- interactive source video picker/status
- character asset picker with create dialog
- audio asset picker with create dialog
- quota meter for the 7 reference units
- delivery mode selector
- prompt QA status
- video QA summary status
- credit estimate

The existing dynamic input panel should stop presenting Gemini Omni reference fields as the main interaction. Synced status is acceptable only as secondary status or advanced diagnostics.

The create character/audio dialogs should return the newly created asset to the Video workflow and select it automatically.

The UX should include:

- loading/empty/error states for asset pickers
- search/filter for saved assets
- file size/type validation before upload/provider submission
- mobile-safe layout and keyboard-accessible controls
- Thai and English labels for new text
- clear partial failure state for storyboard clip generation
- callback/polling status that users can understand as "processing" without exposing infrastructure details
- clear warning when selected references are not provider-fetchable public media
- policy/consent acknowledgment for creating reusable character or voice assets
- visible per-clip credit estimate for storyboard mode, including skill/QA costs when applicable
- disabled/deferred states for rate limit, concurrency, and tenant budget caps

Storyboard Review should be reused through a clear handoff action, not by merging its state machine into Gemini Omni. Media Studio should show a "Review storyboard" entry point when storyboard prompts or generated clips exist. The link should open the existing Storyboard Review workspace filtered by `storyboardRunId` and `clipId` values.

Production and storyboard output must also support a separate "Open in Video Edit" route. This route creates or updates an editable Video Editor project from the same generated clips, story order, audio/dialogue metadata, captions, asset snapshots, and QA summaries.

Media Studio should show two distinct downstream actions when output is ready:

- `Review storyboard`: for story approval, QA, revision requests, and final storyboard render in Storyboard Review.
- `Open in Video Edit`: for hands-on user editing, trimming, reordering, overlays, captions, audio mixing, and manual export in Video Edit.

Sending output to either route must not submit new provider jobs or reserve final-render credits. Sending to both routes must be idempotent and should reuse the same production/storyboard identity mapping.

The Video Edit route should reuse the existing `VideoEditorProject` contract and storyboard project builder pattern such as `buildStoryboardVideoProject`. Add compatibility tests before introducing any new timeline/project schema. Gemini Omni/Production metadata should travel as project/asset metadata and provenance, not as a second editor model.

If clips are not generated yet, the route must either create explicit non-renderable placeholders that the editor UI can safely show, or disable `Open in Video Edit` until usable media exists. It must never create an editor project with fake media URLs or provider task IDs masquerading as clip URLs.

Storyboard Review render/compound and Video Edit export may use the existing render queue/pipeline. Any queueing or cost there must be shown as composition/export cost and kept separate from provider generation credit reservation.

The review handoff should distinguish:

- review-only placeholders created from Gemini Omni storyboard prompts
- submitted backend media tasks
- completed clips with platform-hosted result media
- revision requests/comments that need to return to the Gemini Omni run

Users should never need to understand raw provider IDs to move between Gemini Omni and Storyboard Review.

Because the existing Storyboard Review task model is oriented around generic video review tasks, add a typed Gemini Omni metadata envelope under review task extra params rather than inventing a parallel review object. The envelope should carry delivery mode, `storyboardRunId`, `clipId`, shot list, source video/reference image summaries, selected character/audio snapshots, reference-unit usage, QA badges, and contract version.

Gemini Omni review tasks should not expose the generic Storyboard Review regenerate button unless regeneration is routed through Gemini Omni validation/pricing/orchestration. If that adapter is not implemented in the same release, direct regeneration from Storyboard Review must be disabled with a clear "Revise in Gemini Omni" action.

Existing Storyboard Review composition affordances can still be useful:

- select/reorder clips for review or render
- create a Video Editor project from completed clips
- compound/render selected clips
- import or replace a clip as a review-layer replacement

These actions must be framed as review/composition changes. They must not silently alter the original Gemini Omni provider submission, asset snapshots, credit state, or learning evidence.

Video Edit output must follow the same source-of-truth boundary. User timeline edits, manual replacements, caption edits, overlays, audio mixes, and exports are edit-layer artifacts. They must not mutate original provider submissions, credit records, provider asset snapshots, or historical generated media metadata. A future "learn from edited output" action would need explicit consent/policy design.

Add a `Cinematic Storyboard` mode for Gemini Omni in Media Studio. This should not be a separate model; it is a guided production workflow that sits above the existing Gemini Omni Video clip settings.

The mode should include:

- Story Bible panel for premise, target audience, platform, narrative arc, cinematic style, continuity rules, and CTA.
- Cast & Voice panel for Gemini Omni Character assets, Gemini Omni Audio assets, narrator/character assignments, dialogue/voiceover text, and audio-guided performance intent.
- Scene Timeline panel with ordered scenes, emotional beats, duration, shot lists, transition intent, references, and per-scene cost.
- Provider Plan panel showing per-clip quota usage, selected assets, source video/image refs, pricing branch, and readiness.
- Review Storyboard action that opens Storyboard Review in story timeline mode.

Storyboard Review should display Gemini Omni storyboard handoffs as a story timeline:

- global story arc summary
- scene groups with clip cards in order
- voiceover/dialogue lines per clip
- selected character/audio asset badges
- cinematic QA badges
- adjacent-clip continuity warnings
- whole-story approval state

Do not claim exact lipsync unless provider support is confirmed through the Kie contract. The UI should use "audio-guided dialogue/performance" as the provider-safe label and reserve `lipsyncIntent` as metadata for prompts and QA.

Add Marketplace Product Storytelling mode for Shopee and TikTok Shop products selected from Marketplace Capture. This should reuse existing Media Studio marketplace product/image selectors and should import Feature 115 insights when available.

The mode should include:

- Product Truth panel with product name, platform, shop, source URL, selected product images, price/sold/rating/review text snapshots, and evidence provenance.
- Insight Bridge panel for ProductBrief, ReviewInsight, TikTokShopTrendBrief, and VideoBrief records from Feature 115.
- Campaign Goal selector: product review, sales/demo, brand awareness, customer journey, trust/proof, objection handling, TikTok Shop trend short, Shopee support video, cinematic brand story.
- Customer Journey panel mapping scenes to awareness, problem recognition, consideration, proof/review/demo, objection handling, trust building, conversion, and retention/brand recall.
- Claim Map panel showing evidence-backed, user-confirmed, unsupported, and blocked claims.
- Product Image Roles panel for hero product, detail, use-case, comparison, packaging, variant, and screenshot roles.

The UI must make unsupported product claims visible before generation. Users can edit/confirm a claim, remove it, or attach evidence; the system must not silently generate unsupported claims.

## 7. Generation, QA, and learning orchestration

Wire the Gemini Omni generation path:

1. User selects assets and delivery mode.
2. Director skill creates prompt package.
3. Deterministic validators check schema, fixture contract, quota, pricing branch, asset references, and provider contract.
4. Reviewer roles inspect story, provider constraints, cinematic quality, character identity, voice/audio, cost risk, and safety/policy.
5. Prompt QA aggregates the production quality gate.
6. If revisable, Director revises and the loop repeats within limits.
7. If pass, server validates and reserves credits.
8. Video task is submitted.
9. Video QA reviews result.
10. Learning signals are stored.
11. Recurring issues create `media-studio-auto-learning` recommendations.

The orchestration must define durable states for:

- prompt QA pending/pass/fail/revised
- production quality gate pending/pass/warning/revise/human_review/block
- pre-generation revision attempt count
- credit reserved/refunded/voided
- provider submission pending/created/failed
- per-clip storyboard success/failure
- video QA pending/pass/fail
- human review required
- result re-hosting pending/succeeded/failed
- callback/polling terminal deduped
- rate limited/deferred
- budget blocked
- consent/policy blocked

Turn these states into an explicit transition contract before wiring UI actions. Invalid transitions should be rejected with stable reason codes instead of silently updating task state.

Credit reservation must not happen until the production quality gate is pass or an authorized human override explicitly accepts the risk. Overrides must be audited with actor, reason, risk score, affected clips, estimated credits, and contract version.

Cancellation rules:

- cancel before provider submission releases local reservations and marks queued clips cancelled
- cancel after provider submission is best-effort and may only hide/stop local retries if Kie does not support remote cancellation
- completed clips stay completed when a storyboard is cancelled later
- cancellation must be audited and must not double-refund

Retry defaults:

- prompt revision attempts: 2
- same-prompt regenerate attempts: 1
- max attempts per clip: 3
- human review after exhaustion

Storyboard mode should create one task per clip and retain shared run metadata for continuity and learning.

If a storyboard clip fails while other clips succeed, the system should preserve completed tasks, allow retry of failed clips, and avoid charging again for clips that are not retried.

Pre-generation revision should be targeted where possible. Story-level fixes should not rewrite already-approved asset mappings unnecessarily, and clip-level fixes should not regenerate unrelated clip prompts unless the continuity graph says they depend on the changed clip.

Add a Gemini Omni Storyboard Review adapter that writes downstream review-task projections after prompt QA and updates them after media completion. Gemini Omni remains the source of truth for:

- provider submission
- credit reservation/refund
- callback/polling reconciliation
- Prompt QA and Video QA state
- learning signal creation
- provider asset snapshots

Storyboard Review remains the human review surface. Its edits, comments, approvals, and revision requests should create review feedback against the Gemini Omni run or a new revision attempt. They must not directly overwrite fresher generated clip media, provider asset snapshots, or credit/task state.

Define one-way and two-way event rules before implementation:

- Gemini Omni to Storyboard Review: create placeholder, update prompt QA status, attach backend/provider task IDs, attach completed media, attach Video QA summary, attach failure/retry status.
- Storyboard Review to Gemini Omni: comment, approve clip, request revision, request regenerate, mark imported replacement, reorder/selection preference for composition.
- Prohibited Storyboard Review to Gemini Omni mutations: provider asset edits, credit ledger edits, source submission payload edits, direct provider task status edits, direct learning recommendation writes.

Persist handoff identity mapping so a saved `/storyboard-review/:reviewId` can be reopened without depending only on local storage. The mapping should support idempotent updates keyed by `storyboardRunId + clipId`.

For Cinematic Storyboard mode, add an explicit story-level orchestration object:

- `storyRunId`
- `storyBible`
- `narrativeArc`
- `castMap`
- `voiceMap`
- `audioMap`
- `sceneTimeline`
- `clipPlans`
- `continuityGraph`
- `qaSummary`
- `reviewState`

The story orchestration should run in this order:

1. Director creates or revises story bible and scene timeline.
2. Director creates per-clip shot/voice/audio plan.
3. Prompt QA validates story continuity, provider quota, character/audio assignments, and cinematic feasibility.
4. Server validates assets and pricing per clip.
5. Gemini Omni generates clips.
6. Video QA evaluates clip quality and cross-clip continuity.
7. Storyboard Review receives story timeline projection.
8. User approves, requests revision, imports replacement, renders in Storyboard Review, or sends selected clips to Video Editor composition.

Failures should be targetable by level: story bible, scene, clip, voice line, asset mismatch, provider quota, cinematic quality, or continuity. A revision should regenerate only the affected level where possible.

For Marketplace Product Storytelling mode, add an explicit product-campaign orchestration object:

- `marketplaceCampaignRunId`
- `platform`
- `captureProductId`
- `marketplaceInsightIds`
- `marketplaceStorytellingHandoff`
- `marketplaceInsightStatus`
- `sourceCaptureIds`
- `productEvidenceSnapshot`
- `feature115Insights`
- `claimResolutions`
- `selectedProductImages`
- `campaignGoal`
- `customerJourneyMap`
- `productClaimsMap`
- `imageRoleMap`
- `sceneTimeline`
- `storyboardRunId`
- `qaSummary`
- `reviewState`

The marketplace campaign orchestration should run in this order:

1. Load confirmed marketplace product fields/images and synced Feature 115 insights where available by capture ID, product ID, or insight ID.
2. Prefer `MarketplaceStorytellingHandoff` when present; otherwise synthesize a reduced-confidence handoff from confirmed product fields and selected images for basic product videos only.
3. Apply Feature 115 readiness rules:
   - `ready_for_storytelling`: continue to Gemini Omni quality gate
   - `ready_with_warnings`: require warning review or authorized policy
   - `needs_user_review`: open claim/image/evidence review
   - `insufficient_evidence`: route back to capture, image selection, server AI review, or manual confirmation
4. Build Product Truth snapshot and evidence map.
5. Apply any `MarketplaceClaimResolution` decisions before Director planning.
6. Director creates product campaign plan, customer journey map, scene timeline, and Gemini Omni provider plan.
7. Deterministic validators check evidence IDs, product image roles, unsupported claims, platform naming, handoff readiness, and customer journey coverage.
8. Product Truth, Marketplace Image Fidelity, and Customer Journey reviewers join the production quality gate.
9. If pass, generation proceeds through normal Gemini Omni validation, pricing, credit reservation, and provider submission.
10. Storyboard Review receives marketplace product evidence, claims QA, customer journey stage, and product-image fidelity metadata.

Unsupported claims, wrong-product images, variant/package/color mismatches, missing proof for review claims, or customer-journey drift must block generation or request revision before credits are reserved.

Feature 114 should not store Feature 115 insight payloads as opaque strings. It should reference typed insight records by ID, schema version, payload hash, provider, and storytelling readiness. If the Feature 115 storage decision is still pending, implement the 114 side behind a feature flag and typed adapter so a later dedicated insight table does not require UI rewrites.

Claim resolution behavior:

- approve/edit/remove/request-more-evidence decisions update the claims map before Director planning
- edited claims retain provenance and version history
- removed claims remove or revise dependent scenes and voice/caption/CTA text
- request-more-evidence links back to marketplace capture/product evidence surfaces when possible
- hard policy blocks cannot be overridden by normal claim approval

Generated result URLs should follow the existing media pipeline: provider result URLs are transient inputs, and durable user-visible media should be re-hosted into platform storage where current media/library behavior expects that.

All lifecycle transitions should emit sanitized audit/log events with enough identifiers for support debugging without exposing prompts, provider tokens, signed URL query strings, or private media content.

Before launching multi-clip generation, orchestration must compute total planned cost and enforce:

- user credit balance
- tenant budget policy
- per-user concurrency limit
- per-tenant concurrency limit
- provider-specific backoff/deferred retry state

When limits are hit, no provider jobs should be submitted for clips that cannot be funded or scheduled.

Add reconciliation/repair behavior for split-brain external operations:

- provider submitted but DB update failed
- DB task exists but provider ID missing
- callback references unknown task ID
- re-host succeeded but final task update failed
- refund attempted but ledger update failed

Each case must have a deterministic retry, DLQ, or support-visible state.

Persist Gemini Omni task metadata in additive, versioned envelopes compatible with existing `media_tasks` behavior:

- `submission`
- `polling`
- `rehosting`
- `billing`
- `qa`
- `assetSnapshot`
- `storyboard`
- `contractVersion`

Older tasks without these envelopes must still render and poll through existing paths.

Learning recommendations should use explicit aggregation policy:

- minimum sample count before recommendation
- rolling time window
- severity weighting
- skill version / contract version grouping
- deduplication by issue category
- human review default before any skill-changing action

## 8. Media Studio Production Director

Add a new Media Studio `Production` or `Director` tab as the command center for full production-grade storytelling.

The tab should collect a `ProductionGoal` before users commit to any provider-specific workflow:

- goal type: film, product review, ad, brand story, UGC, tutorial, customer journey, social short, or custom
- target audience, platform, language, duration, aspect ratio, and delivery constraints
- story premise, campaign objective, tone, CTA, and brand voice
- related product, marketplace capture, or Feature 115 handoff when available
- desired characters, cast, brand/product visual identity, and continuity requirements
- voiceover, dialogue, lipsync intent, sound, music, or silence strategy
- cinematic style, camera language, lighting, pacing, color, realism, and transition intent
- budget/credit guardrails and quality target

ProductionGoal must be edited through a visual goal canvas rather than a raw long form.

The canvas should use:

- Goal Summary Card for a one-sentence brief
- Output Type Cards for film, product review, ad, brand story, tutorial, UGC, customer journey, or custom
- Audience and Platform Chips for audience, language, platform, aspect ratio, and duration
- Product or Brand Card for product/shop/brand context, CTA, evidence readiness, and claim risk
- Characters and Cast Cards for roles, identity requirements, and reusable assets
- Voice, Audio, and Sound Cards for narrator, dialogue, voiceover, music, sound, or silence
- Visual Style Board with style cards, reference thumbnails, mood tags, camera/lens/lighting tags
- Story/Campaign Mini Timeline for hook, setup, proof/demo/escalation, payoff, and CTA
- Production Constraints Chips for avoid list, policy limits, budget guardrails, and quality target
- Readiness/Cost/Quality Strip for missing inputs, complexity, likely providers, and next action

The UI should hide raw provider terms and deep settings by default. Clicking a card opens focused editing for that domain. Advanced/debug mode can expose raw structured values, but normal users should read the goal as a creative brief.

The canvas is a presentation/editing layer over a complete structured `ProductionGoal`. It must not drop fields that the planner, QA, provider selection, audit, or Feature 115 handoff need.

Implementation should include this component map:

- `ProductionGoalCanvas`
- `GoalSummaryCard`
- `OutputTypeSelector`
- `AudiencePlatformChips`
- `ProductBrandContextCard`
- `CharacterVoiceCards`
- `VisualStyleBoard`
- `StoryArcMiniTimeline`
- `ConstraintsChips`
- `GoalReadinessStrip`
- `ProductionGoalTemplatePicker`
- `ProductionGoalRevisionDrawer`

Use starter templates for common production goals: product review short, TikTok Shop trend short, Shopee support video, cinematic brand story, UGC ad, tutorial/demo, customer journey campaign, and character dialogue scene. Template application should preview changed cards/fields and must not overwrite imported product evidence or selected assets without confirmation.

If the goal is materially incomplete, run a compact AI clarification step before planner execution. Ask only the decisions that change the plan, such as audience, product, platform, duration, CTA, voice strategy, budget, or policy-sensitive claims. Allow defaults when policy permits.

Persist a lightweight ProductionGoal revision trail:

- goal version
- changed card/field IDs
- actor
- timestamp
- optional reason/template
- affected scenes/assets/provider assumptions after replanning

The UI should show a concise diff when goal changes require storyboard or asset-plan changes.

Graphics are allowed only when they improve comprehension. Every icon, thumbnail, mood card, timeline marker, and badge must have text labels and accessible names.

After the goal is saved, the Production tab should run `media-production-storyboard-planner` and present the generated plan/storyboard for review before any batch execution.

The reviewable package should include:

- production goal interpretation
- production bible draft
- creative strategy
- storyboard outline
- scene timeline
- shot plan
- asset requirements
- provider candidate plan
- batch execution plan
- credit/time estimate
- risks and assumptions
- approval checklist

Users should be able to approve the package, revise all, revise selected scenes/shots/dialogue/product claims/asset requirements/provider plan/batch order, or lock approved parts while revising only the selected targets.

The Director workflow should produce a durable `ProductionRun` with:

- `productionRunId`
- `goal`
- `productionBible`
- `assetPlanId`
- `storyboardRunId`
- `finalProviderPlan`
- `qualityGateSummary`
- `budgetSummary`
- `status`
- `attempts`
- `contractVersion`

The `ProductionBible` becomes the creative source of truth for the run:

- objective and success criteria
- target audience and platform fit
- narrative arc and scene intent
- product truth and claim boundaries
- characters, cast, and identity rules
- voice/audio strategy
- visual style and cinematic continuity
- budget, policy, and quality constraints

The Production tab should not replace Image, Video, and Audio tabs. It should orchestrate them. Existing tabs remain standalone, while Production can open them with prefilled context for creating a missing image/keyframe, video reference, character asset, voice/audio asset, narration, or sound component.

The UX should make the workflow stages visible:

- goal
- plan/storyboard review
- asset readiness
- storyboard
- quality gate
- final render
- post-generation QA
- review/revision

Planning must never reserve final-render provider credits. Users should see readiness, quality status, cost estimate, and next action before provider submission.

Batch execution must not start while plan/storyboard status is draft, needs_revision, or rejected. Normal users cannot skip this approval gate.

## 9. Cross-modal asset orchestration

Add `ProductionAssetPlan` so the system can prepare all required assets before final generation.

Each asset node should represent:

- asset kind: image, product image, keyframe, reference video, character, voice, audio, TTS, sound, music, storyboard scene, video clip, or final render
- role in the story or campaign
- source: upload, library, marketplace capture, Feature 115 handoff, generated, provider asset, or manual confirmation
- provider/model candidates
- selected provider/model where decided
- dependencies
- expected output shape
- quality checks
- retry/revision policy
- estimated credits/cost
- provenance and evidence IDs

Provider selection must be capability-aware, not Gemini-only:

- image models can create keyframes, product scene references, mood frames, and thumbnails
- Gemini Omni Character can create reusable character assets when useful
- Gemini Omni Audio can create reusable voice/audio assets when useful
- existing TTS/audio systems can produce narration, sound, or voiceover inputs when better suited
- existing video models can produce draft clips, style references, or final clips when qualified
- Gemini Omni Video, Seedance 2, or another qualified model can be selected for final render based on capability, quality, cost, reference support, provider health, and policy

For marketplace product videos, asset orchestration must preserve product truth:

- selected product images match the product, variant, package, color, and intended role
- generated keyframes do not invent unsupported features or claims
- product claims link to Feature 115 evidence or user-approved evidence
- scene intent stays attached to customer journey stage
- unsupported claims or wrong-product images block final render before credit reservation

The UI should show an asset plan checklist/timeline with required assets, optional enhancement assets, readiness, owner/provider, quality status, cost, and next action.

Users should be able to approve, reject, replace, or regenerate planning assets before final render. Optional enhancement assets can be skipped; required assets block final render until resolved.

## 10. Production quality loop and final render

Add an end-to-end production quality loop that repeatedly plans, verifies, revises, and only then submits expensive final video generations.

The quality gate should aggregate:

- story alignment
- cinematic direction
- character consistency
- voice/audio fit
- product truth and claim support
- customer journey fit
- asset readiness
- provider fit
- safety/policy
- credit risk and budget status

The quality gate contract should include:

- `gateStatus`
- `confidenceScore`
- `expectedQualityScore`
- `creditRiskScore`
- `providerFitScore`
- `storyAlignmentScore`
- `productTruthScore`
- `assetReadinessScore`
- `blockingIssues`
- `revisionInstructions`
- `reviewerVerdicts`
- `allowedNextActions`
- `attemptCount`
- `maxAttemptsReached`
- `contractVersion`

The production loop should run:

1. User defines `ProductionGoal`.
2. Production Storyboard Planner creates a reviewable plan/storyboard package.
3. User approves, revises all, or requests targeted revisions until satisfied.
4. Director creates or revises `ProductionBible` and provider-ready prompt/asset plan from the approved package.
5. Cross-modal orchestration creates `ProductionAssetPlan`.
6. Required assets are generated, selected, imported, or confirmed.
7. Deterministic validators check schema, provider capabilities, asset readiness, pricing, product truth, and storyboard feasibility.
8. Reviewer roles inspect story continuity, cinematic quality, identity, voice/audio, product claims, customer journey, safety, and cost risk.
9. Quality gate returns pass, warning, revise, human review, or block.
10. Revisable issues trigger targeted revisions to the goal, bible, asset plan, prompt, scene, clip, voice line, or provider choice.
11. Final provider preflight validates credits, budget, concurrency, provider health, callback/polling readiness, and storage readiness.
12. Final generation submits to Gemini Omni Video, Seedance 2, or the selected qualified provider.
13. Post-generation QA compares output to the original production goal and asset plan.
14. Output routing creates or updates downstream projections for Storyboard Review and/or Video Edit.
15. Failed QA can loop back through targeted revision without regenerating unaffected approved assets/clips.

Credit reservation and final provider submission are blocked while the gate is `revise`, `human_review`, or `block`, or while budget/concurrency/provider health checks fail.

Batch asset generation, provider submission, final render, Storyboard Review render, and Video Edit export are blocked until the plan/storyboard approval status is `approved`, except for explicit internal/admin override paths that are audited and disabled for normal users.

Human override can allow specific warning states only when policy permits. Overrides must be audited and cannot bypass hard policy blocks, Feature 115 hard blocks, budget limits, or tenant restrictions.

Storyboard Review remains the human review and storyboard render surface. It can return approval, comments, targeted revision requests, imported replacement markers, render/composition outputs, and composition preferences. It must not directly mutate provider submission payloads, provider asset records, credit ledger records, or historical task metadata.

Video Edit is the manual post-production surface. It can return edited project IDs, timeline edits, trims/splits/reorders, overlays, captions, audio mix decisions, manual clip replacements, and exported media references. These edits are stored as edit-layer artifacts and must not mutate provider submission payloads, provider asset records, credit ledger records, QA/learning evidence, or historical generated task metadata.

The implementation should add an idempotent output projection mapping for each downstream surface:

- `productionRunId`
- `storyboardRunId`
- `surface`: storyboard_review or video_edit
- `surfaceRecordId`
- `projectionVersion`
- `sourceOutputHash`
- `lastSyncedAt`
- `status`

This mapping prevents duplicate editor projects/review records and lets later generation completion update downstream projections without overwriting user edits.

## 11. Rollout and regression verification

Ship in feature-flagged phases:

1. Foundation and persistence only: metadata, validation, pricing, provider asset records, production run/version records, feature flags, and readiness diagnostics.
2. Gemini Omni base video: prompt, reference images, one source video, corrected pricing, and existing task polling/re-hosting behavior.
3. Director skill and Prompt QA for Gemini Omni Video, with no new provider asset creation for broad users.
4. ProductionGoal canvas planning preview: users can define and save goals, templates, clarification answers, and revision history without reserving provider credits.
5. Production Storyboard Planner and Plan Verifier: users can review, revise, lock, and approve plan/storyboard packages, but normal-user batch execution stays disabled until approval records persist.
6. Gemini Omni Character/Audio asset creation for internal/admin users, then selection for broader users after asset RBAC, consent, retention, and reconciliation tests pass.
7. Cross-modal ProductionAssetPlan readiness: route users to existing Image, Video, and Audio tabs to prepare required assets; final render stays disabled.
8. Internal/admin batch execution with quality gate, budget/concurrency/provider preflight, post-generation QA, and targeted revision loop.
9. Dual output projections to Storyboard Review and Video Edit after projection mappings are idempotent and stale-write safe.
10. Marketplace/Feature 115 product storytelling after product evidence, claim map, image fidelity, and customer journey checks are verified.
11. Video QA summaries and learning recommendation surfacing after enough samples exist.
12. Optional Agency reviewer packs or LangGraph batch runtime only after the deterministic default workflow is stable.

Slice gate rules:

- each slice must have an off-state UI, rollback rule, and focused regression tests before the flag can be enabled
- later slices cannot enable normal-user batch execution unless persistence, planner, verifier, approval, quality gate, and budget/provider preflight flags are enabled
- planning-only slices must not reserve credits, submit provider jobs, create output projections, or mutate existing Image/Video/Audio tab behavior
- output projection slices must be disabled unless Storyboard Review and Video Edit mappings prevent duplicate records and stale overwrites
- optional runtime slices must be observable as implementation details only; normal users see plan status, warnings, revisions, and next actions

Before enabling production tenants:

- run migration verification and seed idempotency checks
- verify storage/public URL readiness
- verify provider health and Kie response contract fixtures
- verify production quality gate blocks credit reservation on failed validators/reviewer verdicts
- verify authorized human override is audited and cannot bypass budget/tenant policy
- verify helper scripts run offline and emit machine-readable gate states
- run visual/responsive/a11y checks for Media Studio Gemini Omni panel
- run skill contract verification scripts
- publish/update admin runbook and user help docs
- define stop/rollback thresholds for provider error rate, callback failures, re-host failures, credit refund anomalies, and queue lag
- define SLO/alert signals for provider submit success rate, terminal failure rate, callback duplicate rate, orphan reconciliation count, re-host failure rate, refund failure count, and storyboard partial failure rate
- verify all provider tests are mocked/fixture-based and live Kie smoke tests are opt-in only
- verify cancel behavior for queued, submitted, processing, completed, failed, and storyboard partial-complete states
- verify provider result size/type caps and temporary file cleanup in re-hosting tests

Regression areas:

- non-Gemini media generation
- reference image picker
- reference video picker
- generic model dynamic fields
- admin media model config editor
- pricing/credit reservation
- Kie provider video task behavior
- skill package loading and verification
- migrations and seed idempotency
- feature flag off-state
- provider asset tenant isolation
- prompt/video QA disabled fallback
- callback and polling terminal deduplication
- result re-hosting and provider URL redaction
- provider rate-limit/deferred retry behavior
- audit/log redaction
- RBAC for asset list/use/create/delete/restore
- rate-limit, concurrency, and budget denial
- retention/purge behavior
- consent/policy acknowledgement flow
- env/config readiness checks
- provider contract drift fixtures
- visual/responsive/a11y regression
- docs/runbook completeness
- skill unavailable/invalid-output fallback
- orphan/reconciliation lifecycle
- stable reason-code contract
- no-live-provider CI test isolation
- SLO/alert threshold coverage
- API contract/schema coverage
- state transition coverage
- learning aggregation threshold coverage
- historical generation asset snapshot coverage
- cancellation transition coverage
- media task compatibility/persistence envelope coverage
- result media size/content-type/temp-cleanup coverage
- rolling contract version compatibility
