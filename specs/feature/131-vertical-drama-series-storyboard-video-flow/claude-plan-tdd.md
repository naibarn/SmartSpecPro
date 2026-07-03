# TDD Plan: Feature 131 Vertical Drama Series Storyboard Video Flow

This file mirrors `claude-plan.md` and defines tests to write before implementation. Stubs are descriptions only, not full test implementations.

## 1. Purpose And Product Shape

Test stubs:

- Test: Vertical Drama feature is hidden when the feature flag is disabled.
- Test: creating a series shell does not create a Storyboard Review project until the handoff stage is approved.
- Test: existing Article Video Builder routes and metadata remain unchanged.

## 2. Architecture Overview

Test stubs:

- Test: shared `verticalDramaSeries` contracts export stable field-only types and validators.
- Test: server services keep series source state separate from Storyboard Review projection state.
- Test: media asset linkage uses durable media asset IDs rather than provider temporary URLs.

## 3. Data Model And Persistence

Test stubs:

- Test: Drizzle schema defines all required Vertical Drama tables with tenant/user ownership fields.
- Test: run artifacts persist stage, payload/media asset IDs, checksum, and created timestamp.
- Test: memory events are append-only and compact memory snapshots can be retrieved for later episode planning.
- Test: QC reports are persisted as searchable run/stage records, not only embedded in opaque artifact JSON.
- Test: required indexes exist for series list, episode uniqueness, character lookup, memory retrieval, artifact lookup, and QC lookup.
- Test: minimal input normalizes locale, title, duration, story brief, characters, tie-in, and age control into `input.normalized.json`.
- Test: cross-tenant rows and assets cannot be attached to another tenant's series.

## 4. Skill Packages

Test stubs:

- Test: skill registry loads all eight vertical-drama skill packages.
- Test: each skill package includes required files, schemas, examples, fixtures, and verify script.
- Test: imported GitHub skill manifests preserve name, display names, version, entry prompt, schemas, help files, examples, and capabilities.
- Test: imported input/output schema parity preserves upstream snake_case fields and enum values.
- Test: GitHub manifest parity preserves `veo31_first_last_bridge_60s`, `video_provider_default`, `veo_3_1`, `important_openai_video_note`, and removed OpenAI video providers.
- Test: app-safe `vdflow validate` equivalent runs verify scripts without live provider calls.
- Test: failing fixtures fail with expected validation reason.

## 5. Runtime Pipeline

Test stubs:

- Test: stage runner supports `dry_run`, `plan_only`, `render_images`, `render_video`, `full`, and `repair`.
- Test: every stage returns structured status, next action, artifact ID, warnings, and repair actions.
- Test: approval gates block paid generation until prompts, models, credit estimate, and payload previews are approved.
- Test: approval checkpoint artifacts preserve source artifact IDs, repair request IDs, approver/rejector IDs, state, and timestamps.
- Test: repairing a stage creates a new repair artifact/version and supersedes the previous candidate instead of overwriting the approved artifact.
- Test: app-safe `vdflow run` and `vdflow repair` equivalents call the same runner and repair contracts.
- Test: stale upstream state marks dependent downstream stages stale.

## 6. Contact-Sheet Start-Frame Flow

Test stubs:

- Test: image model resolver lists every enabled image model and preselects `google-banana-2-lite` when available.
- Test: unsupported image models surface incompatibility reasons.
- Test: 3 contact sheets create 27 cropped candidates.
- Test: 6 contact sheets create 54 cropped candidates.
- Test: generation job group tracks `parallelJobLimit`, per-sheet job IDs, expected/completed candidate counts, and terminal statuses.
- Test: app-safe `vdflow render-images` equivalent invokes the same character/start-frame image generation or import contracts.
- Test: all sheet-level, per-cell, and negative prompts are visible before paid generation.
- Test: crop metadata preserves source sheet, prompt set, shot, cell, crop box, and resulting media asset ID.
- Test: cropped candidates validate or crop/pad/resize to 9:16 before approval.
- Test: exactly one selected candidate per shot is persisted before Storyboard Review handoff.

## 7. Video Model Routing

Test stubs:

- Test: video model resolver lists every enabled compatible video model from the registry.
- Test: aliases resolve for Veo 3.1 Lite/Quality/Fast, Gemini Omni/Omni Flash, Grok Imagine 1.5, and Seedance labels.
- Test: unsupported aliases fail with a clear model-resolution error and suggested enabled models.
- Test: selected model changes mark provider payloads/prompts stale while preserving approved start frames.
- Test: provider payload preview redacts secrets and signed URL query strings.
- Test: first/last-frame bridge is selected only when model capabilities allow it.
- Test: default `veo31_first_last_bridge_60s` creates 8 provider jobs from 9 selected frames and preserves `8+8+8+8+8+8+8+4` timing.
- Test: provider job lifecycle covers create, poll, webhook, download/import, cancel, retry, stale, and repair states.
- Test: app-safe `vdflow render-video` equivalent invokes lifecycle only for approved clip requests.

## 8. Storyboard Review Handoff

Test stubs:

- Test: a 60-second episode creates ordered Storyboard Review tasks.
- Test: default bridge mode maps 9 source frames to 8 adjacent Storyboard Review clip tasks.
- Test: default bridge mode preserves `8+8+8+8+8+8+8+4` duration metadata.
- Test: task order matches shot/clip order.
- Test: `task.prompt` contains only video generation prompt text.
- Test: start and stop frames map to `storyboardContext.referenceImages` with `referenceFrameRoles`.
- Test: character and product references remain separate unless explicitly used as scene frames.
- Test: extra params round-trip series ID, episode ID, shot/clip IDs, model IDs, prompt set IDs, contact-sheet IDs, candidate IDs, audio/subtitle IDs, tie-in metadata, and continuity warnings.
- Test: idempotency key prevents duplicate Storyboard Review projects.
- Test: Storyboard Review metadata panels can show all prompts, frames, models, provider payloads, and candidate lineage before paid generation.

## 9. Dashboard UI/UX Contract

Test stubs:

- Test: menu entry is hidden when flag is off and visible when enabled.
- Test: canonical source-spec feature flags exist, default off, and map to any local aliases through one adapter.
- Test: routes require auth and feature access.
- Test: series list supports loading, empty, error, and success states.
- Test: episode workspace disables paid actions until approval and credit gates pass.
- Test: contact-sheet picker supports keyboard selection and visible selected state.
- Test: Thai and English copy keys exist for primary labels, warnings, errors, and empty/loading/success states.
- Test: browser evidence covers mobile, tablet, desktop, and extended laptop/wide desktop risk cases.

## 10. Audio, Dialogue, Subtitles, And Product Tie-In

Test stubs:

- Test: dialogue planner creates speaker-to-character mappings and voice continuity warnings.
- Test: separate TTS mode requires concrete voice IDs before TTS generation.
- Test: native audio mode is allowed only when selected video model supports requested language/audio capability.
- Test: subtitle cues include safe-area metadata.
- Test: product tie-in planner blocks unsupported regulated claims.
- Test: tie-in fatigue history prevents repetitive placement.
- Test: product references remain auditable and removable from prompts.

## 11. Artifacts, Assembly, And Memory

Test stubs:

- Test: artifact ledger records every required artifact name including `05a`, `05b`, and `05c`.
- Test: unchanged stage output keeps stable artifact hashes.
- Test: Storyboard Review clip outputs map back to assembly clips.
- Test: assembly manifest includes clips, concat plan, subtitle plan, audio/BGM plan, export settings, and final media asset ID when available.
- Test: assembly manifest preserves 8 clips from 9 frames and `8+8+8+8+8+8+8+4` timing for default bridge mode.
- Test: export completion creates a QC report, append-only memory event candidate, and pending memory update checkpoint rather than automatically mutating series memory.
- Test: app-safe `vdflow assemble` equivalent represents concat, subtitle, audio, export, and final output metadata.
- Test: failed assembly creates a repair action and does not corrupt memory.

## 12. Rollout And Verification

Test stubs:

- Test: feature flags default disabled.
- Test: dry-run works without provider credentials.
- Test: provider/model policy changes are audit logged.
- Test: focused suites can run independently by section.
- Test: `pnpm check` passes after implementation.
