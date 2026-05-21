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

Provider asset IDs must be unique per tenant/provider/capability unless the record is a soft-deleted duplicate intentionally restored by an admin flow.

Provider asset APIs must enforce a clear permission model:

- normal users can create/list/use their own assets when the tenant feature flag allows it
- tenant/domain admins can inspect tenant assets through sanitized admin surfaces
- system admins can inspect sanitized provider diagnostics
- delete/restore/permanent purge actions require owner or admin authorization according to existing tenant policy
- cross-tenant asset IDs must return not found or forbidden without leaking existence

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
