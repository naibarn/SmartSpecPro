# Deep-plan research — Feature 185

## Research decision

- Codebase research: required. This is an existing git repository with React/TypeScript, tRPC, Drizzle/PostgreSQL, media providers, workers, and existing Storyboard Review/Drama Series surfaces.
- Web research: limited to primary documentation for Drizzle transaction/index patterns and Playwright accessibility/testing guidance. No provider-specific implementation was selected from web content.
- Testing: use the existing `apps/web` Vitest setup for unit/component/server tests, `apps/web/playwright.config.ts` for browser evidence, and the repository's existing `pnpm` scripts. Paid provider calls remain mocked in CI.
- SocratiCode: unavailable in the current tool session (`codebase_*` tools were not exposed); findings below were verified with targeted `rg` and bounded source reads. Do not treat broad repository assumptions as verified until implementation rechecks the changed paths.

## Codebase findings

### Storyboard Review entry and persistence

- `apps/web/client/src/App.tsx` currently registers `/storyboard-review/:reviewId` before `/storyboard-review`; there is no Skill Framework wizard route.
- `apps/web/client/src/pages/StoryboardReviewPage.tsx` owns the current New Project action and `createManualStoryboardReviewProject`. The manual draft path calls `videoEditorProjects.saveStoryboardReview`, writes a six-task manual draft, and redirects to `/storyboard-review/<id>`.
- The same page currently owns a large review UI and has existing video model/planner controls. The new flow must be a separate route/state machine and must not alter the manual draft contract.
- `apps/web/server/routers/videoEditorProjects.ts` `saveStoryboardReview` is user-scoped and normalizes canonical media links. It is suitable as a projection boundary, not as the source of truth for durable Skill Framework runs.

### Dynamic skill and schema loading

- `apps/web/client/src/components/media/DynamicSkillForm.tsx` already supports schema-driven sections/fields, dependencies, image/image-upload fields, model-search, effective field values, and excluded/parent-owned fields. Reuse it rather than adding skill-specific JSX.
- `apps/web/server/routers/skills.ts` exposes `listForWorkflow` and `getInputSchema`. The current schema lookup checks skill root/schema paths and hyphen/underscore variants but does not reliably resolve nested `imported/schemas` bundles.
- `apps/web/server/shared/skillCategoryMetadata.ts` is the canonical place for category semantics; `character_prompt_generation` is the requested filter category.
- `apps/web/server/services/skillCatalog.ts` and `skillRegistry.ts` already provide category/output mappings and filesystem registry boundaries. The new feature needs a validated compatibility adapter and a schema/version snapshot.

### Cute Child skill evidence

- `apps/web/skills/cute-child-image-generator/imported/skill.meta.json` identifies the v3 package as `cute_child_image_generator`, version `3.0.0`, with prompt-only/image modes, optional references up to five, schema-driven UI, and canonical fields `generation_prompt` and `generation_request`.
- The nested files `imported/schemas/input.schema.json` and `imported/schemas/ui.schema.json` contain the requested dynamic fields such as `age`, `gender_style`, `child_count`, `identity_lock_mode`, scene/style controls, activity/notes, and `aspect_ratio`.
- `imported/docs/skill-invocation-guide.md` requires `skill_version`, `execution_mode: prompt_only`, managed `{asset_id}` references, and says the two canonical prompt fields must not be rebuilt or split.
- Root skill metadata and imported v3 metadata are not identical. A canonical adapter must map the display slug `cute-child-image-generator`, execution ID `cute_child_image_generator`, and version `3.0.0`; the UI must not silently choose stale root metadata.

### Media model and attachment boundaries

- `apps/web/server/routers/media.ts` `getModels` returns enabled, provider-scoped image/video model rows and model config/capability fields.
- Model registry seed/config data uses `configJson.inputFields`; GPT Image 2.5 quality values can be exposed only when present in that config. Server validation must reject an unknown quality even if a client sends it.
- `ImageSourcePicker` and the existing media resolver provide upload, Library/History selection, previews, removal, and managed asset ownership. The new flow must pass asset IDs to the skill/core and resolve provider URLs only at the media boundary.
- `apps/web/client/src/components/media/ModelSelectorDialog.tsx` is a reusable selector surface; no new dependency is needed.

### Drama Series character baseline

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx` is the existing full character surface. Its props and feature flags include series ownership, voice chain, character profiles, and video-safe start-frame capability.
- The panel currently covers character CRUD, name/profile/DNA editing, looks/variants, assets/primary portrait, candidate generation/selection/recovery, character image/sheet/angle-pack generation, lightbox/reference selection, QC/status, casting/speech fields, and twin/merge-related behavior where enabled.
- `apps/web/server/routers/verticalDramaCharacters.ts` procedures are series-scoped and enforce tenant/user/series ownership. `vertical_drama_characters`, `vertical_drama_character_assets`, and aliases in `apps/web/drizzle/schema.ts` are not suitable for an orphan Storyboard character without weakening existing constraints.
- Safest design is a new shared library with explicit snapshot bindings and owner adapters. Existing Drama CRUD/generation APIs remain the compatibility adapter for Drama; the Storyboard adapter owns library/project records.

### Async, billing, and testing conventions

- Feature 161 sections provide the repository pattern for durable typed jobs, monotonic status transitions, persist-before-success, idempotent retries, selected-model passthrough, and canonical billing boundaries.
- Existing `apps/web/package.json` scripts include `pnpm test`, `pnpm check`/`typecheck`, `pnpm build`, and browser scripts. `apps/web/vitest.config.ts` covers server, drizzle, client, and shared tests with jsdom for client tests.
- The new feature is user-facing and security-sensitive because it involves uploads, provider references, tenant isolation, and paid generation. Tests must include ownership failures, capability fail-closed behavior, no-provider preview, one confirmation, duplicate delivery, partial retries, and projection recovery.

## Plan-specific design conclusions

1. Add a `storyboard_skill_projects` parent before a run so the Characters tab works before confirmation and can retain multiple historical runs.
2. Keep `storyboard_skill_runs` and `storyboard_skill_shots` canonical; use `media_studio_storyboard_reviews` only as an idempotent projection into the current Review UI.
3. Create shared character library tables plus immutable revisions, assets linked to `media_assets`, project bindings, and explicit Drama/library import/export lineage.
4. Use one queue/job orchestration pipeline: planner → per-shot prompt-only skill call → canonical whole-object image handoff → image asset → video prompt → Review projection.
5. Use bounded concurrency with deterministic shot ordering and no silent fallback/provider substitution.
6. Extract shared character presentation/controller behavior behind `DramaSeriesCharacterOwnerAdapter` and `SkillStoryboardCharacterOwnerAdapter`; preserve existing Drama feature flags and credit prompts.
7. Use an additive Drizzle migration and existing transaction/index conventions. Drizzle's official transaction guidance supports atomic project/run/revision changes, and its index API supports owner, lookup, and unique-index constraints.
8. Use existing Vitest patterns for contracts and mocked media providers; use Playwright plus axe where browser access is available, supplemented by manual keyboard/focus review because automated accessibility scans are not exhaustive.

## Primary external references

- Drizzle transactions: https://orm.drizzle.team/docs/transactions
- Drizzle indexes and constraints: https://orm.drizzle.team/docs/indexes-constraints
- Playwright accessibility testing: https://playwright.dev/docs/accessibility-testing
- Playwright best practices: https://playwright.dev/docs/best-practices

## Research risks to carry into the plan

- Existing relevant source files are dirty in the worktree. Implementation must inspect focused diffs first and avoid reverting unrelated user changes.
- Actual skill registry path/version normalization must be implemented and tested before enabling the selector; a UI-only alias is insufficient.
- Schema migration and worker/provider integration require environment gates. Local typecheck/build/test results must be reported separately from authenticated browser, real model access, billing, migration, and deployment proof.
