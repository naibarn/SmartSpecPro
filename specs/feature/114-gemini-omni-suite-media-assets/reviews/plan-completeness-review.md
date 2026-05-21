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

## Verdict

Ready for implementation starting at section 01. Do not skip section 01; later UX and backend work depend on the shared validation/metadata contract.
