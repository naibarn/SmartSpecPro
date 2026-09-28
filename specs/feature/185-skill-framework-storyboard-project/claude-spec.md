# Synthesized specification — Feature 185

## Objective

Add `New Project by Skill Framework` to the existing Storyboard Review product. A creator supplies one story idea, selects a registered character-prompt skill, optionally chooses 0–5 managed reference images, selects image/video models and conditional image quality, and receives a durable 2–12-shot vertical storyboard. The default is 9 shots, each 10 seconds, for a 90-second total. The system must preserve the selected skill's canonical prompt contract and make characters reusable across Skill Storyboard and Drama Series.

## Product boundaries

- Preserve the existing `New Blank Project` and manual Storyboard Review behavior.
- v1 supports `totalShots` 2–12, default 9; `shotDurationSec` is exactly 10; aspect ratio is `9:16`.
- Story types are `mime`, `dialogue`, and `hybrid`. Dialogue is structured and durable, not inferred from generated prompts.
- Only skills normalized to canonical category `character_prompt_generation`, with validated schema, `prompt_only`, reference capability, and canonical output contract, appear in the selector.
- `cute-child-image-generator` resolves to execution ID `cute_child_image_generator`, version `3.0.0`, with the hyphenated slug retained only as an alias/display identity.
- `generation_prompt` and `generation_request.prompt` are canonical. The complete `generation_request` is preserved and passed to Image Core without prompt rebuilding or field dropping.
- v1 generates images and video prompts; it does not automatically submit video generation.
- A single job-level credit confirmation precedes paid image calls. Retry is explicit and only retries failed stages/shots.

## Existing system fit

- `StoryboardReviewPage.tsx` currently owns manual project creation and the review UI. Add a separate full-screen route/state machine before the dynamic review route and keep manual draft creation unchanged.
- `videoEditorProjects.saveStoryboardReview` remains the compatibility projection boundary. New run/shot tables are canonical; projection must emit the existing task shape that the current review page reads.
- `DynamicSkillForm`, `ImageSourcePicker`, `ModelSelectorDialog`, managed media asset resolution, `media.getModels`, `skillRegistry`, and `skillCategoryMetadata` are the existing primitives to reuse.
- `VerticalDramaCharacterStockPanel` and `verticalDramaCharacters` are the parity baseline but are series-scoped. Do not create a synthetic series or nullable `seriesId` path.

## Architecture

1. `StoryboardProject` owns project identity, draft, Characters tab, bindings, and active run.
2. `StoryboardOrchestrator` normalizes input, plans exactly N shots, owns durable state, and projects into Review.
3. `SkillRegistryAdapter` normalizes skill aliases/version/category/capabilities and resolves nested bundle schemas.
4. `DynamicSkillForm` renders normalized skill fields; parent-owned fields are bound once and not rendered twice.
5. `SkillPromptRunner` validates per-shot skill input and calls `prompt_only`.
6. `ImageGenerationCore` validates model/options/references, resolves managed assets, executes the canonical generation request, and persists managed output.
7. `VideoPromptBuilder` uses shot context, structured dialogue, selected video model dialect, and generated image asset; it only produces a prompt result in v1.
8. `CharacterLibrary` stores reusable characters, looks, assets, aliases, immutable revisions, surface bindings, and project membership.
9. Shared `CharacterStockController`/panel uses Drama and Storyboard owner adapters so existing Drama feature flags and APIs remain compatible.

## Full-screen user flow

Recommended route: `/storyboard-review/new/skill-framework`, declared before `/storyboard-review/:reviewId`. Create a project draft before a run so the Characters tab works before confirmation. Tabs are `Storyboard`, `Characters`, and `Run details`.

Wizard steps:

1. Story brief: title, idea, story type, platform, language, product context.
2. Character skill: compatible skill, dynamic schema fields, 0–5 references, library characters/looks, and optional save-as-reusable-character choice.
3. Models: image model, quality only when model config exposes it, video model, aspect/reference capability warnings.
4. Review/confirmation: normalized settings, N, duration, refs, models, estimate, fingerprint, and one confirm action.
5. Run progress: per-shot status, stage, image, video prompt, errors, cancel, and retry failed stages.

Before confirmation, refresh/back/close preserves draft or asks about dirty state. Draft creation and estimate never call a paid provider. Project archive is reversible and never deletes source library characters or user media.

## Input and skill contracts

Global input includes `title?`, `idea`, `storyType`, `targetPlatform`, `totalShots`, fixed `shotDurationSec`, `outputAspectRatio`, `selectedSkillId`, `selectedSkillVersion`, image/video model selections, language, optional product context, managed reference IDs, project character/look selections, dynamic skill input, and idempotency key.

Server repeats all client validation and computes a normalized confirmation fingerprint. Parent bindings map idea, references, aspect ratio, and selected character snapshots into skill input. Other fields come from `input.schema.json` and `ui.schema.json`, including the current cute-child fields (`age`, gender, child count, identity lock, scene/style/outfit/hair/accessory/background, activity, notes, aspect ratio).

The skill compatibility result includes `skillId`, `skillVersion`, `schemaHash`, normalized fields, parent-owned fields, execution modes, reference max, aspect ratios, canonical prompt field, direct payload field, and bundle source. UI component types are allowlisted; a skill package cannot execute arbitrary UI code.

## Story planner and execution

The planner creates all shot contexts before provider work. It returns exactly `N` ordered shots, each with beat, purpose, visual action, scene, continuity, audio mode, structured dialogue lines, and duration 10. It uses the canonical 2–12 narrative mapping in the source spec, with the 9-shot pattern as the default.

Per shot: validate skill input → call selected skill with `prompt_only` → validate/persist canonical response → pass the entire `generation_request` to Image Core → persist managed image → build/persist video prompt using image reference. Results render by shot number, not completion order. Concurrency is bounded by worker/provider/tenant quotas and defaults to one until configured.

`generation_request` is stored as `originalGenerationRequest` and may receive only transport-bound adaptation (model ID, quality, managed reference resolution) in `effectiveProviderRequest`; its prompt must remain byte-equivalent to the canonical request prompt.

Run statuses include `awaiting_confirmation`, `queued`, `planning`, `prompting`, `image_generating`, `video_prompting`, `projection_pending`, `partial_success`, `succeeded`, `failed`, `cancel_requested`, and `cancelled`. A run is not succeeded until its Review projection is persisted and readable. Projection failure is recoverable without rerunning image generation.

## Character library and interop

Add `character_library_characters`, `character_library_revisions`, `character_library_looks`, `character_library_assets`, aliases, bindings, `storyboard_skill_projects`, and `storyboard_skill_project_characters`. Use existing `media_assets` for binary identity; never duplicate provider/media bytes.

Characters support Drama parity: create/edit/delete/archive, mutable names with immutable keys, looks/variants, portrait/reference assets, primary portrait, candidate generation/selection/recovery, sheet/angle packs, QC/approval, identity DNA/lock, role/casting/speech/voice fields under existing flags, preview/lightbox, and twin/merge/relation review where supported.

New wizard characters can be saved as reusable library records before enqueue. Run shot images become candidates/story references and are never silently promoted to primary portrait. Direct Character tab generation uses the character's skill adapter and existing credit confirmation semantics.

Interop is explicit snapshot exchange: Drama publish to library, library use in project, library import to Drama, export manifest, and preview/apply sync. Store source surface/id/revision/assets/actor/time. Show conflicts as diffs, preserve local edits, do not overwrite or delete sources silently, and retain target snapshots when a source is archived/deleted. Cross-skill use only passes explicitly selected managed references when target capability and adapter mapping allow it.

## Persistence/API

`storyboard_skill_projects` is the project parent. `storyboard_skill_runs` references it and snapshots normalized skill/schema/model/input data. `storyboard_skill_shots` stores planned context, prompt response, complete generation request, image asset/provider/QC state, video prompt, dialogue, attempts, and errors. Project character rows reference immutable library revisions and selected looks.

Expose compatible-skill/schema, project/draft/run, estimate, confirm/start, poll, cancel, retry, projection rebuild, project archive, and project-character binding operations. Expose library CRUD, look/asset/candidate/generation operations, snapshot export, Drama publish/import, and sync diff/apply. Every procedure enforces tenant/user/surface/media ownership.

`reviewData.skillFramework` carries project/run/skill/schema/global/model metadata and ordered N tasks with current Review-compatible fields, image/thumbnail asset references, canonical prompt hashes/sources, video prompt metadata, dialogue lines, and run/shot extra params. Projection is idempotent and legacy manual reviews remain readable.

## Billing, safety, and rollout

Estimate and draft are free. Confirmation fingerprint, model access, provider readiness, reference count, quality/aspect/duration options, credit reservation, and idempotency are checked at `confirmAndStart`. Settlement follows persisted provider results. No fallback provider/model is silent. Child-image safety and managed media authorization remain enforced.

Use flags for framework entry, cute-child skill, library, and interop. Roll out schema/service first, then estimate-only, internal paid run, Characters tab, and gradual tenants. Deployment proof must separate migrations, typecheck/build, worker release, authenticated browser, provider, billing, and production health.

## UI and testing acceptance

UI must document and test target/JTBD, state matrix, component ownership, copy, mobile 390×844, tablet 768×1024, desktop 1440×900 plus small/wide variants, keyboard/focus/labels/contrast/reduced motion, and browser evidence. Use Vitest for schema/service/component contracts and Playwright/axe/manual keyboard checks for browser states. CI uses mocked providers and never spends real credits.

## Acceptance summary

The feature is complete only when the existing New Blank flow is unchanged, schema-driven cute-child v3 flow works, N=2/9/12 is proven, refs 0/5 and conditional quality are proven, all N prompts/images/video prompts and projection are durable/recoverable, dialogue survives updates, one confirmation/idempotency works, Characters tab has Drama parity, interop is snapshot-safe, tenant/security checks pass, and environment-specific migration/browser/provider/billing/worker gates are documented.
