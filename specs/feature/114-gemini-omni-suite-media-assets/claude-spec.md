# Claude Spec - Feature 114 Gemini Omni Suite Media Assets

Date: 2026-05-21
Mode: self_review
Source files:

- `spec.md`
- `claude-research.md`
- `claude-interview.md`

## Objective

Implement Gemini Omni as a coherent Media Studio suite that accurately supports Kie.ai Gemini Omni Video, Character, and Audio while preserving the existing generic media model system.

The implementation should make Gemini Omni usable without exposing raw provider payload keys and should fix the current confusing locked reference-field UX.

## Capabilities

### Gemini Omni Video

Creates video from:

- prompt
- reference images
- one source video
- saved Gemini Omni character assets
- saved Gemini Omni audio assets
- duration
- resolution
- aspect ratio
- optional seed/style/result-type controls where supported

Validation:

- prompt is required
- reference units must total at most 7
- image reference = 1 unit
- source video = 2 units
- character asset = 1 unit
- source video maximum = 1
- character assets maximum = 3
- audio assets must be Gemini Omni Audio IDs
- character assets must be Gemini Omni Character IDs

### Gemini Omni Character

Creates and stores a reusable character asset.

Inputs:

- character name
- description
- exactly one reference image, max 20 MB
- optional Gemini Omni Audio asset

Stored output:

- provider `kie.ai`
- capability `gemini-omni-character`
- provider asset ID from `characterId`
- display metadata
- source image metadata
- tenant/user ownership metadata

### Gemini Omni Audio

Creates and stores a reusable audio/voice asset.

Inputs:

- optional audio ID slug when supported
- display name
- voice description
- example dialogue

Stored output:

- provider `kie.ai`
- capability `gemini-omni-audio`
- provider asset ID from `kieAudioId`
- prompt metadata
- tenant/user ownership metadata

## UX Requirements

Media Studio should show a Gemini Omni suite panel when `gemini-omni-video` is selected.

The panel should contain:

- Reference Images picker with quota status.
- Source Video picker allowing exactly one video.
- Saved Characters picker with create-inline dialog.
- Saved Audio picker with create-inline dialog.
- Delivery Mode selector:
  - single shot
  - multi-shot single video
  - storyboard multi-video
- QA status after Auto Prompt and after generation.
- Credit estimate and clear explanation of whether the source-video pricing branch is active.

The existing dynamic input panel may still show synced status, but it must not be the primary place where users try to select reference images or videos.

## Dual Output Integration Requirements

Gemini Omni storyboard and Production Director output must support two downstream routes:

- Storyboard Review for story review, approvals, revision requests, and final storyboard render.
- Video Edit for user-controlled timeline editing, trimming, ordering, overlays, captions, audio mixing, manual replacements, and export.

Both downstream surfaces receive projections of the source production/storyboard output. Neither surface becomes the source of truth for provider submission, credit reservation, retry, QA orchestration, provider asset snapshots, historical generation metadata, or learning.

### Storyboard Review Integration Requirements

Add a Gemini Omni to Storyboard Review handoff adapter that projects Gemini Omni storyboard clips into review tasks after prompts or media clips exist. The projection should include:

- `storyboardRunId`
- `clipId`
- clip order/index
- final prompt and optional shot list
- model, duration, aspect ratio, and resolution
- selected reference asset snapshots
- internal media task ID and provider task ID when available
- generated platform-hosted result URL and thumbnail when available
- Prompt QA and Video QA summary badges
- status and stable reason code
- source surface `gemini_omni_video`

Review tasks created before provider submission must remain review-only placeholders. They must not trigger provider jobs, reserve credits, or count as completed generation until a real backend media task/provider task is attached.

Storyboard Review comments, approvals, or revision requests should feed back into the Gemini Omni run as review feedback or a new revision request. They should not mutate provider asset records, stored asset snapshots, credit ledger entries, or historical generated task metadata directly.

Deep links from Media Studio should open Storyboard Review filtered to the Gemini Omni storyboard run and clip IDs. Returning to Media Studio should preserve the original Gemini Omni run state.

The adapter must be compatible with the current Storyboard Review task model while preserving Gemini Omni-specific context. Store Gemini Omni metadata in a typed envelope inside review task extra metadata, not as ad hoc provider fields:

- `generationExtraParams.geminiOmni`
- `generationExtraParams.geminiOmni.contractVersion`
- `generationExtraParams.geminiOmni.deliveryMode`
- `generationExtraParams.geminiOmni.storyboardRunId`
- `generationExtraParams.geminiOmni.clipId`
- `generationExtraParams.geminiOmni.shotList`
- `generationExtraParams.geminiOmni.referenceUnitUsage`
- `generationExtraParams.geminiOmni.assetSnapshot`
- `generationExtraParams.geminiOmni.qaSummary`

Storyboard Review regeneration controls must be safe for Gemini Omni. A review task with Gemini Omni metadata should either:

- disable direct regeneration and send the user back to Gemini Omni revision/generation flow, or
- call a Gemini Omni-specific regeneration adapter that reuses Gemini Omni validation, pricing, credit reservation, provider asset snapshots, QA, and learning.

It must never route Gemini Omni review tasks through the generic Storyboard Review video generation path in a way that loses source video, character, audio, pricing, or QA constraints.

Existing Storyboard Review actions that replace frames, upload replacement clips, reorder clips, select clips, create a video editor project, or render/compound selected clips may remain available when they operate only on review draft/output composition. For Gemini Omni source-of-truth data, those actions must create a review change/revision request or imported replacement marker instead of mutating the original Gemini Omni provider submission metadata.

### Video Edit Integration Requirements

Add a Gemini Omni/Production to Video Edit handoff adapter that creates or updates an editable project after reviewable prompts with media placeholders or generated clips exist.

The Video Edit projection should include:

- production run ID and/or storyboard run ID
- source surface and contract version
- scene and clip order
- generated clip media and thumbnails when available
- prompt and shot metadata
- selected reference asset snapshots
- voiceover/dialogue text
- audio/music/sound references where available
- captions/subtitle drafts when available
- product evidence and claim warnings when relevant
- Prompt QA and Video QA badges
- source provider/model metadata
- edit-safe provenance IDs

The implementation should reuse the existing Video Editor `VideoEditorProject` contract and the current storyboard project builder pattern (`buildStoryboardVideoProject`) unless a focused compatibility test proves the existing editor contract cannot represent the needed data. New Gemini Omni/Production metadata should be attached as edit-safe asset/project metadata, not as a parallel timeline schema.

If media is incomplete, the handoff must choose one of two safe states:

- create a draft project with explicit non-renderable placeholders if the editor UI can represent placeholders clearly, or
- disable `Open in Video Edit` until usable generated/imported media exists.

The handoff must not create a renderable editor project containing fake clip URLs or provider task IDs as media URLs.

Video Edit can return edited project ID, user timeline edits, trims/splits/reorders, overlays, captions, audio mix decisions, manual clip replacements, and exported media references.

Video Edit edits are edit-layer artifacts. They must not mutate original provider submission payloads, credit ledger records, provider asset records, historical generated media metadata, or QA/learning evidence. A future "learn from edited output" feature must be designed as a separate explicit action with consent/policy handling.

Media Studio should show `Review Storyboard` and `Open in Video Edit` as separate actions. Users may send the same output to both workspaces without duplicating provider jobs or reserving final provider credits again.

Storyboard Review render/compound and Video Edit export can use the existing render pipeline and may have separate queue/cost behavior. UI and billing must label those as render/export costs, distinct from provider generation credits and Gemini Omni/Seedance final-provider credits.

## Cinematic Storyboard Production Requirements

Add a cinematic production layer for Gemini Omni storyboard mode so Media Studio and Storyboard Review can manage a coherent short-film/story output instead of independent clips.

Media Studio must support a `Cinematic Storyboard` workflow with:

- story bible: premise, target audience, platform, tone, genre, continuity rules, visual language
- narrative arc: hook, setup, development/escalation, payoff, call-to-action
- cast map: selected Gemini Omni Character assets, role, visual continuity notes, allowed wardrobe/pose/motion changes
- voice map:
  - none
  - voiceover narration
  - character dialogue / audio-guided performance
  - mixed voiceover and dialogue
- audio map: selected Gemini Omni Audio assets, narrator/character assignment, timing intent, dialogue text, sound/music direction
- scene timeline: ordered scenes with emotional beat, objective, duration, shot list, references, transition intent
- provider plan: per-clip Gemini Omni payload summary with reference-unit usage, source video/image refs, character IDs, audio IDs, duration, resolution, and pricing branch

The Director skill must output a production-grade structured plan:

- global story continuity rules
- per-scene narrative purpose
- per-clip shot beats
- camera/lens/framing/movement direction
- lighting/color/production design notes
- voiceover/dialogue text per clip
- audio/lipsync intent metadata
- transition and pacing notes
- continuity dependencies between clips
- fallback prompts when assets exceed Gemini Omni quota

The system must not promise exact lipsync unless Kie/Gemini Omni exposes and the provider contract confirms a dedicated lipsync control. Until then, UI and metadata should label this as `audio-guided character dialogue/performance` while preserving `lipsyncIntent` for Prompt QA and Video QA.

Storyboard Review must gain a story timeline view for Gemini Omni handoffs:

- grouped scenes and clips in story order
- story arc overview
- per-clip cinematic intent and QA badges
- voiceover/dialogue/auditory intent preview
- continuity issue markers across adjacent clips
- approval states per clip and whole story
- revision request that targets a clip, scene, voice line, character continuity, or global story rule

Video QA must include cinematic/story checks:

- narrative continuity
- character consistency
- cinematic framing and camera motion
- lighting/color consistency
- pacing/duration fit
- voiceover/dialogue alignment
- audio-guided performance/lipsync intent when applicable
- transition continuity between clips
- platform/CTA fit

Learning signals should preserve issue categories at story level and clip level so repeated cinematic failures can improve the Gemini Omni Director, Prompt QA, and Video QA skills.

## Marketplace Product Storytelling Requirements

Gemini Omni must support marketplace product storytelling campaigns that use product images and structured product data from Marketplace Capture, including Shopee and TikTok Shop (`tiktok_shop`).

This workflow must reuse existing Marketplace Capture product/image integration in Media Studio and must bridge to Feature 115 local/server AI insights when available:

- `ProductBrief`
- `ReviewInsight`
- `TikTokShopTrendBrief`
- `VideoBrief`
- `MarketplaceStorytellingHandoff`
- `MarketplaceInsightRecord`
- `MarketplaceClaimResolution`
- confirmed marketplace product records
- selected marketplace product images
- product evidence IDs and provenance

The workflow should support professional product-grade content formats:

- product review
- sales/demo video
- brand awareness story
- before/after or use-case story when evidence supports it
- customer journey video
- TikTok Shop trend-style short
- Shopee product page support video
- UGC-style review script when allowed by policy and evidence
- cinematic brand/product story

Product correctness is mandatory. The Director and QA gates must not invent product features, specs, benefits, certifications, discounts, ratings, review claims, brand promises, or before/after results that are not present in confirmed product data, selected evidence, or approved user input.

Add a marketplace product evidence snapshot to Gemini Omni handoff metadata:

- platform: `shopee` or `tiktok_shop`
- marketplace product ID / capture product ID
- external shop ID and item ID when available
- source URL
- product name
- shop name
- category
- price/sold/rating/review text snapshots when available
- selected product images with evidence/source IDs
- selected ProductBrief/ReviewInsight/TikTokShopTrendBrief/VideoBrief IDs and schema versions
- evidence map for claims used in prompts, voiceover, captions, and on-screen text
- user edits/confirmed fields and their provenance
- Feature 115 handoff readiness: `ready_for_storytelling`, `ready_with_warnings`, `needs_user_review`, or `insufficient_evidence`
- Feature 115 customer journey stages and scene intent IDs
- Feature 115 allowed next actions
- claim resolution decisions and edited claim versions

Add a Product Truth and Claims QA gate before provider submission:

- verify product image selected for the video matches the product record
- verify every selling point, review claim, benefit, pain point, objection, trust signal, CTA, and on-screen text is grounded in evidence or approved user input
- verify generated story does not conflict with product category, variants, price/rating/sold text, shop identity, or selected image
- verify Shopee/TikTok Shop platform-specific language and CTA are appropriate
- verify the content follows the intended customer journey stage
- block or request revision when claims are unsupported, exaggerated, or mismatched to the image/product

Customer journey support must be explicit. The Director should structure marketplace campaigns around stages such as:

- awareness
- problem recognition
- consideration
- proof/review/demo
- objection handling
- trust building
- conversion / CTA
- retention or brand recall

Storyboard Review should display marketplace product evidence alongside Gemini Omni storyboard clips:

- product card summary
- selected marketplace images
- ProductBrief / ReviewInsight / TrendBrief / VideoBrief badges
- evidence-backed claim list
- unsupported-claim warnings
- customer journey stage per scene/clip
- product-image fidelity QA
- platform-specific CTA/readiness state

If Feature 115 local insights are unavailable or not synced, Gemini Omni should fall back to confirmed marketplace product fields and selected images. Missing insight records must not block basic product video creation, but advanced review/trend/storytelling modes should show reduced confidence and may require user confirmation.

Feature 114 must consume Feature 115 handoffs through typed retrieval, not by parsing free-form insight text. It should be able to load a `MarketplaceStorytellingHandoff` by:

- capture ID
- marketplace product ID
- insight ID
- imported AI Video Studio payload when present

Recommended Feature 115 read paths are:

- `GET /api/marketplace-captures/captures/:captureId/insights`
- `GET /api/marketplace-captures/products/:productId/insights`
- `GET /api/marketplace-captures/insights/:insightId`
- equivalent `marketplaceCapture` tRPC queries for web UI

Readiness behavior:

- `ready_for_storytelling`: allow Gemini Omni pre-generation quality gate.
- `ready_with_warnings`: allow only after user reviews warnings or an authorized policy accepts them.
- `needs_user_review`: open claim/image/evidence review, not provider generation.
- `insufficient_evidence`: route the user back to marketplace capture, image selection, server AI review, or manual product confirmation.

Claim resolution roundtrip:

- approve, edit, remove, or request-more-evidence decisions must update the product claims map before Gemini Omni Director planning.
- edited claims become new claim versions with provenance.
- removed claims must remove or revise every scene, caption, voiceover, CTA, or on-screen text that referenced them.
- request-more-evidence must deep-link to the marketplace capture/product evidence flow where possible.
- claim resolutions must be audited without storing raw page text or prompts.

## Skill Requirements

Add these skill packages:

- `apps/web/skills/gemini-omni-video-director`
- `apps/web/skills/gemini-omni-prompt-qa`
- `apps/web/skills/gemini-omni-video-quality-qa`

The director skill must output structured plans for:

- single-shot video
- multi-shot single-video prompt
- storyboard multi-video plan with per-clip multi-shot prompts

The QA skills must use structured issue categories so recurring problems can become `media-studio-auto-learning` recommendations.

## Data and API Requirements

Add a provider asset layer rather than storing Gemini Omni IDs only in raw JSON fields.

Required asset metadata:

- tenant ID
- owner user ID
- provider
- capability
- asset type
- provider asset ID
- display name
- status
- source library item ID when applicable
- provider metadata
- soft-delete timestamps

Server APIs must support:

- listing Gemini Omni provider assets
- creating character assets
- creating audio assets
- soft deleting assets
- validating selected provider assets before video generation
- idempotent asset creation requests
- explicit upload validation before provider calls
- optional linkage to source/result library items
- safe public URL validation for provider-fetchable media
- sanitized audit events for asset creation and generation lifecycle
- paginated/searchable/sortable asset list responses
- stable typed request/response contracts for client, Node services, and Python provider bridge

Provider asset IDs must be unique per tenant/provider/capability unless the record is a soft-deleted duplicate intentionally restored by an admin flow.

Provider asset APIs must enforce a clear permission model:

- normal users can create/list/use their own assets when the tenant feature flag allows it
- tenant/domain admins can inspect tenant assets through sanitized admin surfaces
- system admins can inspect sanitized provider diagnostics
- delete/restore/permanent purge actions require owner or admin authorization according to existing tenant policy
- cross-tenant asset IDs must return not found or forbidden without leaking existence

External provider operations must have reconciliation behavior:

- if provider asset creation succeeds but DB persistence fails, record enough safe evidence to reconcile or quarantine the orphan provider asset
- if DB reservation exists but provider submission never receives a durable provider ID, settle the reservation as failed/refunded according to billing policy
- if callback/polling sees an unknown provider task ID, route it through retry/DLQ diagnostics without creating cross-tenant records
- reconciliation jobs must be idempotent and safe to rerun

Generation requests must snapshot selected asset references at submission time. If a user later renames, deletes, or restores an asset, in-flight and completed generation records must retain the original provider ID, asset display name, owner, and sanitized metadata used for that request.

## Pricing Requirements

Gemini Omni Video pricing must use the supplied matrix:

- Without video input:
  - 720p/1080p: 4s 450, 6s 600, 8s 750, 10s 900 credits
  - 4K: 4s 1050, 6s 1200, 8s 1350, 10s 1500 credits
- With video input:
  - 720p/1080p: 1200 credits per generation
  - 4K: 1800 credits per generation

Credit estimation and reservation must use the same normalized selections.

Character and Audio asset creation credit costs are not finalized in the current plan. Implementation must add configurable pricing for these asset creation endpoints or keep normal-user asset creation behind a disabled feature flag until Kie/provider cost is confirmed.

Credit reservations must be refundable or voidable when validation passes but the provider call fails before a durable provider task/asset ID is returned.

Skill/QA costs must be accounted for separately from provider generation credits. The UI should either show that Auto Prompt/QA consumes additional credits or mark it as included when the tenant pricing policy says so.

## Rollout Requirements

Gate the suite with feature flags:

- suite UI
- asset creation
- director skill
- prompt QA
- video QA
- learning recommendations

Rollback must hide new panels without deleting stored provider assets.

Production readiness must include configuration validation for:

- Kie API key/provider readiness
- optional webhook secret and public callback URL
- public storage/R2 readiness for reference/result media
- feature flag state
- pricing readiness for Video and asset creation
- skill package availability and contract version

If optional callback configuration is missing, the system must fall back to polling/recovery instead of blocking generation.

## Privacy and Safety Requirements

- Do not store raw private media content in learning records.
- Redact provider headers, tokens, and private request payload fragments from errors and logs.
- Store voice/character prompt metadata only where tenant policy allows it.
- Provider asset pickers must enforce tenant ownership and soft-delete state.
- Any future sharing of character/audio assets must be explicit; MVP assets are private to the tenant/user scope already used by Media Studio.
- Validate reference and result URLs using existing public-media safety rules before server-side fetch/re-hosting.
- If callback routes are used, validate signature/timestamp/replay and cap request body size.
- Provider-hosted result URLs must be re-hosted to platform storage before being treated as durable user media unless an existing system policy explicitly allows provider URLs.
- Character and voice asset creation must include a policy/consent acknowledgment surface appropriate for the app's generated-media rules.
- Provider assets must have retention and purge behavior aligned with library/media deletion policy.

## Resource Control Requirements

- Apply per-user and per-tenant rate limits to asset creation and Gemini Omni video generation.
- Apply concurrency limits for storyboard multi-video generation so one storyboard cannot exhaust provider or worker capacity.
- Enforce tenant/user credit budget limits before launching multi-clip generation.
- Expose clear blocked/deferred states when limits are hit.

## Migration and Recovery Requirements

- Schema changes must be additive first.
- Migration must have verification checks for table/index/constraint existence.
- Seed/backfill must be idempotent and preserve unrelated admin edits.
- Rollback must prefer disabling flags and hiding new surfaces over dropping data.
- Existing provider assets and generated media must remain readable after rollback.
- A dry-run or preflight checklist must exist before enabling in production tenants.

## Observability Requirements

Record sanitized audit/log events for:

- asset create requested/succeeded/failed
- provider submit requested/succeeded/failed/deferred
- callback received/accepted/rejected/deduplicated
- polling recovery terminal state
- credit reserved/refunded/settled
- prompt QA and video QA decision
- learning recommendation created
- feature flag denial or fallback path
- rate-limit or budget denial
- asset delete/restore/purge
- orphan/reconciliation event
- provider contract drift or unknown response shape

The implementation should normalize errors into stable reason codes for UI, support, tests, and audit. Examples:

- `gemini_omni_provider_not_configured`
- `gemini_omni_pricing_not_configured`
- `gemini_omni_reference_quota_exceeded`
- `gemini_omni_asset_not_found`
- `gemini_omni_asset_forbidden`
- `gemini_omni_provider_rate_limited`
- `gemini_omni_provider_contract_drift`
- `gemini_omni_rehost_failed`
- `gemini_omni_skill_unavailable`
- `gemini_omni_budget_blocked`
- `gemini_omni_consent_required`

## Learning Requirements

- Learning aggregation must use explicit thresholds and time windows before creating skill-improvement recommendations.
- Learning records must store the skill version and contract version used for each run.
- Recommendations must point to issue categories from Prompt QA / Video QA, not free-form unbounded labels.
- Human review must remain the default for skill-changing recommendations until auto-apply is explicitly enabled.

## State Machine Requirements

Implementation must define a stable state transition contract for:

- provider assets: pending, submitted, ready, failed, deleted, purged, reconciliation pending
- video clips: planned, prompt QA pending, blocked, credit reserved, submitted, processing, re-hosting, completed, failed, retryable, human review required
- storyboard runs: planned, partially completed, completed, failed, cancelled

Invalid transitions must fail safely with stable reason codes.

Cancellation semantics must be explicit:

- cancelling before provider submission releases or voids reservations and marks local queued work cancelled
- cancelling after provider submission is best-effort when Kie has no supported remote cancel operation
- completed or terminal provider tasks cannot be locally marked as if remote provider work stopped
- cancelled storyboard runs preserve completed clips and settle pending or queued clips deterministically

## Persistence Compatibility Requirements

- Existing `media_tasks` records must remain readable.
- New Gemini Omni metadata stored in task parameters or result data must be additive and versioned.
- Persist internal task IDs, provider task IDs, provider asset IDs, storyboard run IDs, and clip IDs with unambiguous names.
- Store sanitized `submission`, `polling`, `rehosting`, `billing`, `qa`, `assetSnapshot`, and `storyboard` envelopes where applicable.
- UI and support tools must tolerate older tasks that do not have Gemini Omni envelopes.

## Result Media Requirements

- Provider result downloads must validate content type, extension, and maximum size before upload to platform storage.
- Temporary files and directories must be cleaned up on success and failure.
- Re-hosting must be idempotent and must not create duplicate final assets for repeated terminal handlers.
- Provider-hosted URLs may be retained only in redacted/debug metadata when needed.

## Contract Version Requirements

- Persist a `geminiOmniContractVersion` or equivalent version marker in API payloads, task metadata, skill handoff, and provider bridge metadata.
- Rolling deploys should tolerate current and previous contract versions where feasible.
- Unsupported contract versions must fail closed with a stable reason code.

## Documentation Requirements

- Add or update admin help/runbook documentation for Gemini Omni Suite readiness, feature flags, pricing, provider asset inspection, rollback, and common provider failures.
- Add user-facing guidance for Character/Audio assets in Media Studio without exposing raw provider field names.
- Document known limitations: Character/Audio creation pricing pending when disabled, callback optionality, and storyboard partial retry behavior.

## Test Isolation Requirements

- Unit, integration, and E2E tests must not call live Kie.ai endpoints.
- Provider tests must use fixtures/mocks for request and response contracts.
- Any live provider smoke test must be opt-in, clearly named, and skipped by default in CI.
