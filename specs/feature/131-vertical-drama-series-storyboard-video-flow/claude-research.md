# Research: Feature 131 Vertical Drama Series Storyboard Video Flow

Date: 2026-07-03
Mode: self_review
Planning directory: `specs/feature/131-vertical-drama-series-storyboard-video-flow`

## Research Decision

Codebase research: yes. SmartSpecPro is an existing repository, and this feature must fit current Dashboard, Storyboard Review, Media Studio, skill registry, media model registry, Drizzle, and provider-routing patterns.

Web research: limited to the referenced GitHub guide. The external guide was verified at remote HEAD `e2dbef07d07447489d041112d862d994adeac5d4` from `https://github.com/naibarn/vertical-drama-video-flow.git`. General web research was not used because implementation must follow local codebase contracts and the pinned guide rather than chasing broad, unstable provider claims.

Testing research: existing setup. `apps/web` uses pnpm and Vitest for web/server/shared tests, with `pnpm test` and `pnpm check`. The root package manager is npm, but `apps/web/package.json` declares pnpm for the web app. Python backend tests use pytest only for provider/gateway paths that touch `python-backend`.

## Codebase Findings

### Feature 127 Is The Closest Local Pattern

Feature 127, Article To Storyboard Video Project, is the strongest local precedent. It creates Storyboard Review projects from a builder flow while preserving prompts, references, overlay metadata, audio strategy, model selection, and idempotency. Feature 131 should reuse the same mental model:

- upstream builder/workspace owns planning and prompt preparation;
- Storyboard Review owns paid generation, review, repair, replacement, final composition, and reopening;
- `StoryboardGenerationTask.prompt` stores only the video generation prompt;
- image prompts, overlay/subtitle/audio metadata, references, model selections, and source lineage live in `storyboardContext.extraParams` or related review metadata;
- handoff must be idempotent and must not silently create duplicate Storyboard Review projects.

Relevant precedents:

- `specs/feature/127-article-to-storyboard-video-project/claude-plan.md`
- `specs/feature/127-article-to-storyboard-video-project/sections/section-04-storyboard-handoff.md`
- `apps/web/server/routers/videoEditorProjects.ts`
- `apps/web/client/src/lib/storyboardReviewWorkspace.ts`

### Storyboard Review Persistence

Storyboard Review projects persist in `media_studio_storyboard_reviews`:

- `apps/web/drizzle/schema.ts`
- table: `mediaStudioStoryboardReviews`
- important columns: `userId`, `name`, `reviewData`, `status`, `videoEditorProjectId`, `clipCount`, `completedClipCount`, `thumbnailUrl`, timestamps

Feature 131 should create a new Vertical Drama service that writes compatible `reviewData` rather than duplicating Storyboard Review storage. Long-lived series state should live in new first-class Vertical Drama tables because 10-100 episode memory, character stock, and artifact ledgers are not suitable as only Storyboard Review JSON.

### Media Asset Persistence

Durable media files should use the existing `media_assets` registry:

- table: `mediaAssets`
- fields: `tenantId`, `userId`, `projectId`, `sourceType`, `status`, `storageKey`, `originalUrl`, `thumbnailUrl`, `mimeType`, dimensions, checksums

Generated character references, full contact sheets, cropped candidate frames, selected start frames, video clips, and final exports must be tenant-owned media assets. Feature-specific tables should reference these media asset IDs rather than storing raw signed URLs or provider temporary URLs.

### Feature Flags And Routes

Feature flags live in `apps/web/shared/featureFlags.ts`. The plan should add rollout-sensitive flags defaulted off, add allowlist/default coverage, and include admin grouping if the existing admin UI requires grouping tests.

Routes are registered in the client app route files and menu constants follow the shared menu pattern used by prior specs. The Vertical Drama feature should be hidden when flags are off and must not affect Article Video Builder or existing Storyboard Review routes.

### Media Model Registry And Provider Routing

The existing model stack already includes relevant image and video model definitions:

- `apps/web/server/services/modelRegistry.ts`
- `apps/web/scripts/seed-media-models-kie-ai.ts`
- `python-backend/app/llm_proxy/providers/kie_ai_provider.py`
- model alias fallback examples include Google Banana 2 Lite, Grok Imagine variants, Veo variants, Gemini Omni, and Seedance variants

Planning implication: Feature 131 must resolve image/video models through the registry and provider config. It must not hard-code a Veo-only path. The default image model for this workflow is `google-banana-2-lite`, but the UI and service must list every enabled compatible image model and video model from the registry.

### Skill Registry

The existing skill registry expects skill packages under `apps/web/skills`. Feature 131 needs eight skill folders:

- four imported/adapted from the GitHub guide;
- four SmartSpecPro-specific skills for script building, memory, product tie-in, and dialogue/audio.

Each package should include `SKILL.md`, legacy `skill.md`, schemas, examples, fixtures, verification script, help files, and contract docs. Imported GitHub schemas must round-trip upstream snake_case fields and enum values.

### Testing Setup

Web app:

- `cd apps/web && pnpm test` runs Vitest.
- `cd apps/web && pnpm check` runs TypeScript.
- Server tests commonly live under `apps/web/server/services/__tests__/` and `apps/web/server/routers/__tests__/`.
- Shared contract/helper tests can live under `apps/web/shared/**/__tests__/` or adjacent `*.test.ts`.
- Client component tests use jsdom via existing Vitest config.

Python backend:

- Use pytest only for provider/gateway changes in `python-backend`.
- Relevant provider surface is `python-backend/app/llm_proxy/providers/kie_ai_provider.py` if Feature 131 requires new provider payload support beyond registry/model config.

## GitHub Guide Findings

The pinned guide defines an end-to-end vertical drama flow with:

- character visual bible skill;
- storyboard shotgrid skill;
- shot start-frame render skill;
- video motion prompt pack skill;
- orchestrator workflow;
- validation, dry-run, approval checkpoints, provider gates, QC, repair loops, and final assembly artifacts.

Important guide defaults and parity terms:

- `default_flow`
- `duration_profile_default`
- `veo31_first_last_bridge_60s`
- `video_provider_default`
- `veo_3_1`
- `important_openai_video_note`
- `removed_active_video_providers`
- `openai_sora`
- `openai_videos`
- config keys such as `model_for_planning`, `image_provider`, `image_model`, `veo31_model`, `duration_profile`, and `video_prompt_skill_dir`

The guide removes OpenAI Sora/OpenAI Videos as active first/last-frame human-face bridge providers. SmartSpecPro should preserve that as a capability gate rather than re-enable those providers silently.

## Planning Implications

1. Use first-class Vertical Drama tables for series, episodes, runs, memory, character assets, approvals, and run artifacts.
2. Use existing `mediaAssets` for durable media references.
3. Use existing Storyboard Review persistence and metadata conventions for review handoff.
4. Keep generation prompt/model/provider payloads visible before paid generation.
5. Build the 3x3 contact-sheet flow as a selectable start-frame generation mode with batch counts such as 3 sheets -> 27 candidates and 6 sheets -> 54 candidates.
6. Keep feature flags default off and provide dry-run first.
7. Avoid storing secrets, signed URLs, or unredacted provider headers in series tables, run artifacts, or Storyboard Review metadata.
8. Prefer focused Vitest tests for shared contracts/services/routers/UI logic; use pytest only where Python provider behavior changes.

