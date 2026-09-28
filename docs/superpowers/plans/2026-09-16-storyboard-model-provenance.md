# Storyboard Model Provenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve selected image/video model identity across Skill Framework and Storyboard Review, use the right model for each generation type, and show auditable per-shot provenance.

**Architecture:** Add explicit requested/effective model metadata to the existing Storyboard Review draft/task contracts without replacing legacy fallbacks. Make the projection and workspace treat image and video models as separate values, then render a small provenance block from the same normalized task metadata used by generation.

**Tech Stack:** React, TypeScript, tRPC payloads, Vitest, existing Storyboard Review workspace and Skill Framework projection services.

**Spec:** `docs/portable-skill-pack/specs/2026-09-16-storyboard-model-provenance-design.md`

## Global Constraints

- Preserve unrelated dirty-worktree changes.
- Do not add dependencies.
- Do not use retired systems listed in AGENTS.md.
- Do not run `npm run typecheck`.
- Keep legacy Storyboard Review drafts readable.
- Requested and effective provider models must remain distinguishable.

### Task 1: Define and test model provenance metadata

**Files:**
- Modify: `apps/web/client/src/lib/storyboardReviewWorkspace.ts`
- Test: `apps/web/client/src/lib/storyboardReviewWorkspace.test.ts`

**Interfaces:**
- Add a normalized model provenance shape readable from a task/context.
- Add helpers that resolve image and video requested/effective model IDs without mixing the two media types.

- [ ] **Step 1: Write failing tests**

Add tests proving an image-only Skill Framework task exposes its image model and its separate `videoModelId`, and that applying video options creates/persists a video plan or equivalent draft metadata even when no non-image task exists.

- [ ] **Step 2: Run the focused tests and confirm the expected failure**

Run: `npm --workspace apps/web run test -- client/src/lib/storyboardReviewWorkspace.test.ts`

Expected: the new assertions fail because video metadata is currently ignored for image-only tasks.

- [ ] **Step 3: Implement the minimal normalized helpers and metadata persistence**

Use explicit context metadata first for the corresponding media type. Preserve the existing video-task fallback order for legacy data, and add a draft-level metadata path for image-only projections.

- [ ] **Step 4: Re-run the focused tests**

Run: `npm --workspace apps/web run test -- client/src/lib/storyboardReviewWorkspace.test.ts`

Expected: all tests pass.

### Task 2: Correct Skill Framework projection and generation provenance

**Files:**
- Modify: `apps/web/server/services/storyboardSkillFrameworkProjection.ts`
- Modify: `apps/web/server/services/storyboardSkillFrameworkWorker.ts`
- Modify: `apps/web/server/services/storyboardSkillFrameworkPipeline.ts`
- Test: `apps/web/server/services/__tests__/storyboardSkillFrameworkProjection.test.ts`
- Test: `apps/web/server/services/__tests__/storyboardSkillFrameworkPipeline.test.ts`

**Interfaces:**
- Projection tasks carry explicit image and video requested model metadata.
- Generation metadata can retain effective model/provider without changing the requested model.

- [ ] **Step 1: Write failing projection/pipeline tests**

Assert every projected shot contains the selected image model, selected video model, and media-specific provenance fields; assert image generation receives the image model and video prompt planning receives the video model.

- [ ] **Step 2: Run the server focused tests and confirm failures**

Run: `npm --workspace apps/web run test -- server/services/__tests__/storyboardSkillFrameworkProjection.test.ts server/services/__tests__/storyboardSkillFrameworkPipeline.test.ts`

Expected: the new provenance assertions fail before implementation.

- [ ] **Step 3: Implement projection metadata and preserve generation audit fields**

Keep image tasks typed as image tasks, add explicit requested model fields in `storyboardContext`/generation metadata, and ensure the existing selected model arguments remain the ones passed into image generation and video prompt planning.

- [ ] **Step 4: Run the focused server tests**

Run: `npm --workspace apps/web run test -- server/services/__tests__/storyboardSkillFrameworkProjection.test.ts server/services/__tests__/storyboardSkillFrameworkPipeline.test.ts`

Expected: all tests pass.

### Task 3: Initialize and persist Storyboard Review video model correctly

**Files:**
- Modify: `apps/web/client/src/pages/StoryboardReviewPage.tsx`
- Modify: `apps/web/client/src/lib/storyboardReviewWorkspace.ts`
- Test: `apps/web/client/src/lib/storyboardReviewWorkspace.test.ts`

**Interfaces:**
- Review video options initialize from explicit projected `videoModelId` before legacy fallbacks.
- Changing the video model persists even when all current tasks are images.
- Video regeneration resolves the selected video model; image regeneration continues resolving the image model.

- [ ] **Step 1: Write failing tests for initialization and generation routing**

Cover an image-only projected draft with `videoModelId`, assert the Review option value is that model, assert changing it changes the draft, and assert effective image/video model helpers return the correct media-specific IDs.

- [ ] **Step 2: Run the focused client tests and confirm failure**

Run: `npm --workspace apps/web run test -- client/src/lib/storyboardReviewWorkspace.test.ts`

Expected: the video option falls back to Veo and the image-only update returns the unchanged draft.

- [ ] **Step 3: Implement explicit video option precedence and image-only persistence**

Read `storyboardContext.videoModelId` for Skill Framework projections, persist the selected value in a draft-level video plan/metadata structure without fabricating a video task, and keep image-task regeneration on the image model path.

- [ ] **Step 4: Run client focused tests**

Run: `npm --workspace apps/web run test -- client/src/lib/storyboardReviewWorkspace.test.ts`

Expected: all tests pass.

### Task 4: Render per-shot model provenance in Storyboard Review

**Files:**
- Modify: `apps/web/client/src/components/media/StoryboardBatchReviewDialog.tsx`
- Modify: `apps/web/client/src/pages/StoryboardReviewPage.tsx` (only if the panel needs task display data)
- Modify: `apps/web/client/src/locales/en/media.json`
- Modify: `apps/web/client/src/locales/th/media.json`
- Test: existing focused Storyboard Review/component tests where applicable

**Interfaces:**
- Each shot card receives image/video requested/effective model metadata from the normalized task.
- Missing values render as an explicit unrecorded state.

- [ ] **Step 1: Add a failing component/data assertion for both labels**

Assert an image shot with separate image and video metadata renders both `Image model` and `Video model`, and does not display the image model as the video model.

- [ ] **Step 2: Run the focused component test and confirm failure**

Run: `npm --workspace apps/web run test -- client/src/components/media/__tests__/StoryboardBatchReviewDialog.sequentialSpareStrip.test.ts`

Expected: the new provenance assertion fails because the card has no model detail block.

- [ ] **Step 3: Implement the compact provenance block**

Render requested model IDs and optional effective/provider values using existing card styling and localization. Do not change the existing media generation buttons or task selection behavior.

- [ ] **Step 4: Run all focused regression suites**

Run: `npm --workspace apps/web run test -- server/services/__tests__/storyboardSkillFrameworkProjection.test.ts server/services/__tests__/storyboardSkillFrameworkPipeline.test.ts server/services/__tests__/storyboardSkillFrameworkContracts.test.ts client/src/lib/storyboardReviewWorkspace.test.ts client/src/components/media/__tests__/StoryboardBatchReviewDialog.sequentialSpareStrip.test.ts`

Expected: all selected suites pass with zero failures.

### Task 5: Final verification and diff audit

**Files:**
- Verify only; no additional production files unless a test exposes a direct gap.

- [ ] **Step 1: Inspect the targeted diff**

Run: `git diff --stat -- <planned files>` and inspect only the planned hunks, ensuring unrelated dirty changes are untouched.

- [ ] **Step 2: Re-run the full focused suite**

Use the command from Task 4 and record the exact pass count.

- [ ] **Step 3: Verify no prohibited commands/systems were introduced**

Run: `rg -n "Agency|work/request|workpacks|OpenSandbox|sandbox_jobs" <planned files>` and confirm no new references were added.
