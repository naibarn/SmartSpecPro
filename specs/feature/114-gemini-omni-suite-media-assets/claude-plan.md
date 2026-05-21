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

The safest delivery strategy is foundation first, then provider assets, then skills, then UX, then QA/learning rollout.

## Plan Structure

1. Validation and metadata foundation
2. Provider asset data model and APIs
3. Kie provider asset contract
4. Gemini Omni skill packages
5. Admin presets, seed data, and pricing
6. Media Studio Gemini Omni UX
7. Generation, QA, and learning orchestration
8. Rollout and regression verification

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

The API should return picker-friendly records and never require users to see raw provider IDs unless in admin/debug context.

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

Likely files:

- `python-backend/app/llm_proxy/providers/kie_ai_provider.py`
- Python Kie provider tests
- Node media provider bridge/service tests

## 4. Gemini Omni skill packages

Create:

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

Skill execution costs must be explicit in the handoff plan. If prompt QA or video QA consumes credits/tokens, the UI and backend should account for that cost separately from provider video credits or mark it as included by tenant policy.

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

## 7. Generation, QA, and learning orchestration

Wire the Gemini Omni generation path:

1. User selects assets and delivery mode.
2. Director skill creates prompt package.
3. Prompt QA reviews package.
4. If pass, server validates and reserves credits.
5. Video task is submitted.
6. Video QA reviews result.
7. Learning signals are stored.
8. Recurring issues create `media-studio-auto-learning` recommendations.

The orchestration must define durable states for:

- prompt QA pending/pass/fail/revised
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

Retry defaults:

- prompt revision attempts: 2
- same-prompt regenerate attempts: 1
- max attempts per clip: 3
- human review after exhaustion

Storyboard mode should create one task per clip and retain shared run metadata for continuity and learning.

If a storyboard clip fails while other clips succeed, the system should preserve completed tasks, allow retry of failed clips, and avoid charging again for clips that are not retried.

Generated result URLs should follow the existing media pipeline: provider result URLs are transient inputs, and durable user-visible media should be re-hosted into platform storage where current media/library behavior expects that.

All lifecycle transitions should emit sanitized audit/log events with enough identifiers for support debugging without exposing prompts, provider tokens, signed URL query strings, or private media content.

Before launching multi-clip generation, orchestration must compute total planned cost and enforce:

- user credit balance
- tenant budget policy
- per-user concurrency limit
- per-tenant concurrency limit
- provider-specific backoff/deferred retry state

When limits are hit, no provider jobs should be submitted for clips that cannot be funded or scheduled.

## 8. Rollout and regression verification

Ship in feature-flagged phases:

1. Metadata, validation, and pricing fixes.
2. Video UX for prompt/images/source video.
3. Director skill and Prompt QA.
4. Character/Audio asset creation for internal users.
5. Character/Audio selection for broader users.
6. Video QA.
7. Learning recommendation surfacing.

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
