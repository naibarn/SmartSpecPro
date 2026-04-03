<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-schema
section-02-safe-html-state
section-03-trpc-crud
section-04-skill-agency-selector
section-05-social-pickers
section-06-wizard-steps
section-07-composer-panel
section-08-generation-stream
section-09-publish
section-10-tests
END_MANIFEST -->

# Implementation Sections Index
## Feature 063 — Media Studio Content Composer

---

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-schema | — | 03, 08, 09 | Yes (start here) |
| section-02-safe-html-state | — | 04, 05, 06 | Yes (independent) |
| section-03-trpc-crud | 01 | 09 | No |
| section-04-skill-agency-selector | 02 | 06 | Yes |
| section-05-social-pickers | 02 | 06 | Yes |
| section-06-wizard-steps | 02, 04, 05 | 07 | No |
| section-07-composer-panel | 06 | 10 | No |
| section-08-generation-stream | 01, 03 | 10 | No |
| section-09-publish | 01, 03 | 10 | No |
| section-10-tests | 07, 08, 09 | — | No (final) |

---

## Execution Order (Batches)

**Batch 1** — No dependencies (parallel):
- section-01-schema
- section-02-safe-html-state

**Batch 2** — After Batch 1 (parallel):
- section-03-trpc-crud (after 01)
- section-04-skill-agency-selector (after 02)
- section-05-social-pickers (after 02)

**Batch 3** — After Batch 2 (parallel):
- section-06-wizard-steps (after 02, 04, 05)
- section-08-generation-stream (after 01, 03)
- section-09-publish (after 01, 03)

**Batch 4** — After Batch 3:
- section-07-composer-panel (after 06)

**Batch 5** — After all:
- section-10-tests (after 07, 08, 09)

---

## Section Summaries

### section-01-schema
Drizzle schema changes: new `content_composer_drafts` table + `mediaAttachments` JSON column on `blog_posts`. Generates and runs the migration. Includes the schema type exports used by all other sections.

**Key files:**
- `apps/web/drizzle/schema.ts` (add table and column)
- `apps/web/drizzle/XXXX_content_composer_drafts.sql` (generated migration)

### section-02-safe-html-state
Two independent items:
1. `SafeHtml` React component: DOMPurify wrapper with article + social profiles; URL scheme hook; memoized.
2. Composer `useReducer` state shape + pure reducer function: all state fields + action types.

**Key files:**
- `apps/web/client/src/components/ui/SafeHtml.tsx`
- `apps/web/client/src/components/media/composerReducer.ts`
- `apps/web/client/src/components/ui/__tests__/SafeHtml.test.tsx`
- `apps/web/client/src/components/media/__tests__/composerReducer.test.ts`

Also add DOMPurify to `apps/web/package.json` if not already present.

### section-03-trpc-crud
`contentComposer` tRPC router with: `listDrafts`, `getDraft`, `saveDraft`, `deleteDraft`. Includes `contentComposerProcedure` middleware (tenant resolution + feature flag check). Registers router in `apps/web/server/routers.ts`.

**Key files:**
- `apps/web/server/routers/contentComposer.ts` (new)
- `apps/web/server/routers.ts` (register new router)
- `apps/web/server/routers/__tests__/contentComposer.test.ts` (CRUD tests)

### section-04-skill-agency-selector
`SkillAgencySelector` component: skill/agency radio group with skill dropdown (filtered by chat_assistant + prompt_enhancement categories) and agency picker modal integration. Includes complexity banner.

**Key files:**
- `apps/web/client/src/components/media/composer/SkillAgencySelector.tsx`
- `apps/web/client/src/components/media/composer/__tests__/SkillAgencySelector.test.tsx`

### section-05-social-pickers
`SocialPlatformPicker` component: 4 platform icon pills (YouTube, Facebook, TikTok, Upload-Post) with connectivity checks.
`SocialAccountPicker` component: account list filtered by platform `provider`, with `publishingReady` badges and issue descriptions.

**Key files:**
- `apps/web/client/src/components/media/composer/SocialPlatformPicker.tsx`
- `apps/web/client/src/components/media/composer/SocialAccountPicker.tsx`
- `apps/web/client/src/components/media/composer/__tests__/SocialPlatformPicker.test.tsx`

### section-06-wizard-steps
Five step components + `ComposerStepper`. Each step is a presentation component that receives state via props and dispatches actions:
1. `ArticleSettingsStep` — topic, SkillAgencySelector, toggles, generate button
2. `ArticlePreviewStep` — streaming text preview via SafeHtml, stop/regenerate controls
3. `MediaAttachmentStep` — LibraryFilePicker multi-select (max 6), attachment cards
4. `DestinationStep` — role-filtered routing, sub-pickers, social caption
5. `ComposerReviewStep` — read-only summary, publish confirmation dialog
6. `ComposerStepper` — horizontal progress indicator

**Key files:**
- `apps/web/client/src/components/media/composer/ArticleSettingsStep.tsx`
- `apps/web/client/src/components/media/composer/ArticlePreviewStep.tsx`
- `apps/web/client/src/components/media/composer/MediaAttachmentStep.tsx`
- `apps/web/client/src/components/media/composer/DestinationStep.tsx`
- `apps/web/client/src/components/media/composer/ComposerReviewStep.tsx`
- `apps/web/client/src/components/media/composer/ComposerStepper.tsx`
- Test files for each step
- i18n keys added to `en.ts` and `th.ts`

### section-07-composer-panel
`ContentComposerPanel`: orchestrator that owns `useReducer` state, autosave logic, stream management. `ComposerDraftList`: draft list view with resume/delete. Connects all wizard steps. Adds the "Article Composer" tab to `MediaStudio.tsx`.

**Key files:**
- `apps/web/client/src/components/media/ContentComposerPanel.tsx`
- `apps/web/client/src/components/media/composer/ComposerDraftList.tsx`
- `apps/web/client/src/pages/MediaStudio.tsx` (tab addition only)
- `apps/web/client/src/components/media/__tests__/ContentComposerPanel.test.tsx`
- `apps/web/client/src/pages/__tests__/MediaStudio.articleComposer.test.tsx`

### section-08-generation-stream
Express streaming route `POST /api/content-composer/generate-stream` — follows same SSE pattern as the existing chat streaming route. Handles skill route (skill as system prompt) and agency route (agency orchestrator). Also implements `generateSocialCaption` tRPC procedure.

**Key files:**
- `apps/web/server/routes/contentComposerStream.ts` (new Express route)
- `apps/web/server/routers/contentComposer.ts` (add generateSocialCaption procedure)
- `apps/web/server/routes/__tests__/contentComposerStream.test.ts`

### section-09-publish
`publish` tRPC procedure: pre-publish validation (role, attachment ownership, articleBody non-null, stable refs), then fan-out to blog / docs / social / upload-post destination handlers. Updates draft status on success or failure.

**Key files:**
- `apps/web/server/routers/contentComposer.ts` (add publish procedure)
- `apps/web/server/services/contentComposerPublishService.ts` (new — fan-out logic)
- `apps/web/server/routers/__tests__/contentComposerPublish.test.ts`

### section-10-tests
Integration tests: end-to-end draft lifecycle (create → generate → attach → publish), attachment stable-ref validation, blog publish with mediaAttachments, social publish with mediaRefs. Also coverage gap closure for any sections below 80%.

**Key files:**
- `apps/web/server/services/__tests__/contentComposerPublish.integration.test.ts`
- Any gap-filling tests across sections 01–09
