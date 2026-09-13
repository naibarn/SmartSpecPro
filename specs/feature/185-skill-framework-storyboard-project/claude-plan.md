# Implementation plan — Feature 185: Skill Framework Storyboard Project

## 1. Implementation objective

Implement the supplied Feature 185 specification end-to-end in the existing SmartSpecPro web application. The result is a new Skill Framework project flow in Storyboard Review, a durable per-shot prompt/image/video-prompt pipeline, and a reusable Character Library with Drama Series interoperability. The implementation must preserve the existing manual/New Blank storyboard flow and existing Drama character behavior.

## 2. Non-negotiable contracts

1. `totalShots` is an integer from 2 through 12, default 9. `shotDurationSec` is always 10 in v1. Total duration is `totalShots * 10`.
2. Output aspect ratio is `9:16` in v1. Story types are `mime`, `dialogue`, and `hybrid`.
3. Only validated skills in canonical category `character_prompt_generation` and supporting `prompt_only`, schemas, references, and canonical output are selectable.
4. Cute Child resolves to `cute_child_image_generator`, version `3.0.0`, with `cute-child-image-generator` as display/package alias.
5. `generation_prompt` and the complete `generation_request`, especially `generation_request.prompt`, are preserved. The prompt is not rebuilt, split, shortened, or silently replaced.
6. User references are managed media asset IDs, optional, 0–5. Provider URL resolution occurs only in the media core.
7. Image model quality is rendered and accepted only when the selected model's `configJson.inputFields` exposes it. No silent model/provider fallback.
8. v1 generates images and video prompts, not actual video provider jobs.
9. One job-level credit confirmation precedes paid image calls. Retries are explicit, idempotent, and limited to failed stages.
10. Shared character data is canonical in a new library, with immutable revisions and explicit snapshot bindings. Existing Drama tables remain series-scoped.

## 3. Current system and integration strategy

### 3.1 Existing entry/review

- `apps/web/client/src/App.tsx` owns route registration. Add `/storyboard-review/new/skill-framework` before `/storyboard-review/:reviewId`.
- `apps/web/client/src/pages/StoryboardReviewPage.tsx` owns the existing manual New Project action and review UI. Add a menu/entry that routes to the new workflow; do not change `createManualStoryboardReviewProject`, its six-task draft, or existing review controls.
- `apps/web/server/routers/videoEditorProjects.ts` owns `saveStoryboardReview`. Keep it compatible with manual reviews and call it through a new idempotent projection service for framework runs.

### 3.2 Existing skill/media primitives

- Reuse `apps/web/client/src/components/media/DynamicSkillForm.tsx`, `ImageSourcePicker`, `ModelSelectorDialog`, `AuthenticatedMediaImage`, and `ImageLightbox`.
- Extend skill schema resolution in `apps/web/server/routers/skills.ts` or a focused service so nested `imported/schemas` bundles are normalized without weakening existing skill APIs.
- Reuse `apps/web/server/shared/skillCategoryMetadata.ts`, `apps/web/server/services/skillCatalog.ts`, and `skillRegistry.ts` for category/capability validation.
- Reuse `media.getModels` and model registry `configJson.inputFields`; do not introduce a second model catalog.

### 3.3 Existing character/media primitives

- `VerticalDramaCharacterStockPanel.tsx` is the behavior/parity baseline. Extract only the reusable controller/presentational boundaries needed for the second owner; preserve existing props, feature flags, tRPC calls, and UI behavior through a Drama adapter.
- `verticalDramaCharacters` router and `vertical_drama_*` tables remain compatibility surfaces. New Storyboard characters use library/project tables, not synthetic series rows.
- All generated/uploaded binary data continues to use `media_assets` and the existing managed asset resolver.

### 3.4 Async/billing/testing

- Follow Feature 161 durable job patterns and existing worker job/queue conventions discovered during implementation. Use persist-before-success, monotonic status transitions, worker resume, provider idempotency, and canonical credit services.
- Use `apps/web` Vitest for server/client/schema tests and existing Playwright setup for browser evidence. Do not add dependencies.

## 4. Proposed files and ownership

The implementer must confirm exact neighboring names before editing because the worktree is dirty. The following ownership map prevents overlap:

| area | new/modified files | owner |
|---|---|---|
| contracts/validation | `apps/web/server/services/storyboardSkillFrameworkContracts.ts`, related test | foundation section |
| skill registry | `apps/web/server/services/storyboardSkillRegistry.ts`, focused `skills.ts` integration, tests | registry section |
| DB | `apps/web/drizzle/schema.ts`, `apps/web/drizzle/0300_feature_185_skill_framework_storyboard.sql`, schema/migration tests, journal only if repo convention requires | persistence section, serial only |
| project/run services | `apps/web/server/services/storyboardSkillProjectService.ts`, `storyboardSkillRunService.ts` | orchestration section |
| prompt/image/video stages | `apps/web/server/services/storyboardSkillOrchestrator.ts`, `storyboardSkillProjection.ts`, focused stage tests | pipeline section |
| routers | `apps/web/server/routers/storyboardSkillFramework.ts`, `characterLibrary.ts`, `apps/web/server/routers.ts` registration and router tests | API section |
| shared character backend | `apps/web/server/services/characterLibraryService.ts`, interop tests | character backend section |
| shared character UI | extracted shared component/hooks plus Drama/Storyboard adapters, focused tests | character UI section |
| framework UI | `apps/web/client/src/pages/StoryboardSkillFrameworkPage.tsx` and focused components/tests | wizard UI section |
| review/project integration | `StoryboardReviewPage.tsx`, `App.tsx`, `client/src/locales/th/*.json`, `client/src/locales/en/*.json`, projection/browser tests | integration section |

Do not modify unrelated dirty files. Before touching a modified target, inspect its focused diff and preserve unrelated hunks. Do not run formatters over the whole repository.

## 5. Shared types and validation

Create one exported contract module used by routers, services, workers, and tests. It must define:

- normalized project draft/global input, model selection/options, story types, dialogue lines;
- skill compatibility/schema snapshot and parent-owned field mapping;
- planned shot, continuity, per-shot stage/status, canonical prompt response, original/effective generation request;
- run/project status, retry/attempt/error envelope, projection metadata;
- character library, look, asset, revision, binding, import/export manifest and conflict types.

Validation requirements:

- reject N outside 2–12, non-integer N, duration other than 10, unsupported aspect ratio, invalid story type, empty idea, oversized title/context, and duplicate/unknown IDs;
- enforce `dialogueLines=[]` for mime; validate speaker/text/language for dialogue/hybrid lines;
- validate dynamic input against the selected schema after parent binding and before confirmation;
- normalize aliases and persist skill/version/schema hash;
- validate models/options/reference count and ownership on the server;
- derive confirmation fingerprint from normalized snapshots, not raw client ordering/labels;
- ensure safe JSON/redaction boundaries for stored/logged values.

## 6. Durable persistence design

Add an additive Drizzle migration and corresponding schema exports. Use foreign keys/indexes/transactions consistent with existing `schema.ts` conventions.

### 6.1 Project

`storyboard_skill_projects` stores owner scope, title, project status, optional review ID, active run ID, timestamps, and latest character-binding revision. It is created before confirmation so the Characters tab and draft have stable identity. Archive is reversible; it retains review/run/snapshots and never deletes media/source library characters.

### 6.2 Runs and shots

`storyboard_skill_runs` stores project/owner, global brief, N/duration/aspect, story type, normalized skill/version/schema snapshot, model/options snapshot, reference snapshot, credit/fingerprint/idempotency data, lifecycle status, and safe error/timestamps.

`storyboard_skill_shots` stores exact shot number, beat/context/continuity, structured audio/dialogue, stage status/attempts, skill input and redacted response, canonical prompt fields, full original/effective generation requests, image asset/provider/QC metadata, video prompt/model/builder metadata, retry/error fields, and timestamps.

Required idempotency uniqueness and stage-attempt keys must prevent duplicate project/run creation, provider submission, credit settlement, and projection tasks.

### 6.3 Character library

Add `character_library_characters`, `character_library_revisions`, `character_library_looks`, `character_library_assets`, aliases, and bindings. Revisions are immutable and uniquely numbered per character. Assets link to `media_assets` without binary duplication. Store skill input/DNA snapshots redacted and reference assets as logical IDs.

`storyboard_skill_project_characters` binds project to library character/look revision and stores display name/role snapshots. A run-local override is separate and never mutates project binding.

### 6.4 Migration safety

- migration is additive and idempotent according to repo migration conventions;
- no backfill of existing Drama characters in v1;
- include schema/migration static tests for tables, columns, FKs, owner indexes, idempotency indexes, no destructive SQL, and journal registration;
- if existing journal/manual-migration collision rules apply, follow the verified repository convention and document it in the section file.

## 7. Skill registry and dynamic schema

Implement a validated registry adapter that:

1. lists only visible, enabled, compatible character-prompt skills;
2. normalizes hyphen slug, underscore execution ID, package metadata, category, version, capability, and bundle root;
3. resolves `ui.schema.json` and `input.schema.json` from root and nested imported bundle paths in deterministic order;
4. rejects malformed/mismatched bundle identity, missing `prompt_only`, missing canonical outputs, unsupported references, or unsupported 9:16;
5. returns schema fields, parent-owned fields, capability metadata, and a hash suitable for snapshotting;
6. uses an allowlisted normalized field renderer, never arbitrary skill-provided component code.

For Cute Child v3, the adapter must produce `cute_child_image_generator`/`3.0.0`, preserve the guide's request/response shape, and map `idea`, references, identity lock, scene/activity/notes/style, and aspect ratio per shot. Parent-owned fields are not rendered twice by `DynamicSkillForm`.

Tests cover root/imported mismatch, alias mapping, schema hash changes, missing schemas/capabilities, field dependencies, parent exclusion, and canonical response validation.

## 8. Project/run services and orchestration

### 8.1 Project/draft service

Implement project create/get/update/archive, draft persistence, active-run guard, project character binding, and `createRunFromProject`. Create project/run/idempotency records atomically. A draft or project refresh must not cause a duplicate run.

### 8.2 Planner

Implement an exact-N planner service using the source spec's 2–12 beat table. It produces all planned shot contexts before provider work, preserves continuity, validates story-type/audio/dialogue constraints, and orders output by shot number. It may use the existing planning runtime where compatible but must return the typed contract.

### 8.3 Stage execution

Implement durable stage orchestration:

1. planning;
2. per-shot skill input validation and `prompt_only` call;
3. response validation and persistence before image call;
4. whole `generation_request` handoff to `ImageGenerationCore` with only transport-bound adaptation;
5. managed image persistence/QC;
6. video prompt construction from image asset and selected video model dialect;
7. idempotent Review projection;
8. final success only after projection is readable.

Use bounded concurrency defaulting to one, preserve shot-number ordering, enforce tenant/provider quotas, and continue independent shots after a single shot failure. Cancel queued work safely; do not destroy completed results.

### 8.4 Recovery

Implement monotonic run/shot transitions including `projection_pending`, stale worker recovery, cancel-request semantics, failed-stage retry, projection rebuild, duplicate delivery handling, and safe terminal errors. Retry uses the persisted snapshots and new attempt IDs; it does not overwrite completed prompt/image results.

## 9. Billing/model/media integration

Implement estimate/confirmation around the existing credit service:

- estimate is free and reports N, image model/quality, refs, and future video cost separately;
- `confirmAndStart` validates fingerprint, ownership, skill/model capability, provider access, credit availability, and idempotency before enqueue;
- one parent confirmation owns the image run; direct character actions retain their existing character confirmation;
- reserve/settle/refund follows existing billing primitives and is keyed by run/shot/attempt;
- unknown quality/options, unavailable models, too many refs, and invalid aspect/duration fail closed;
- no silent model/provider fallback.

`ImageGenerationCore` receives the complete canonical generation payload and resolves managed asset references at the provider boundary. It persists original/effective request metadata with redaction. Reference count is checked against both skill and selected model. The effective prompt must equal `generation_request.prompt`.

The new tRPC surface should include the following behavior-compatible procedures (names may follow local router conventions): `listCompatibleSkills`, `getSkillSchema`, `estimate`, `createDraft`, `createRunFromProject`, `confirmAndStart`, `getProject`, `updateDraft`, `getRun`, `cancel`, `retryShots`, `rebuildReviewProjection`, `archiveProject`, `getProjectCharacters`, `bindProjectCharacter`, and `unbindProjectCharacter`. Draft/run creation returns `{ projectId, runId, status: "awaiting_confirmation", normalizedSnapshot }`; confirmation is fingerprinted and idempotent.

## 10. Review projection and existing Storyboard compatibility

Create a projection service that maps canonical run/shot rows to the current `media_studio_storyboard_reviews`/`StoryboardReviewPage` task shape. Include project/run/skill/schema/model metadata, N ordered tasks, image/thumbnail asset references, image prompt source/hash, video prompt source/model, dialogue lines, and extra params for repair/retry.

Projection must be idempotent, upsert by run/shot identity, preserve legacy manual review data, and support `rebuildReviewProjection`. A projection failure leaves the run recoverable rather than claiming success. Add tests that open 2/9/12-task projections through current normalization and do not duplicate tasks on rebuild.

## 11. Character Library backend and interoperability

Implement owner-scoped library CRUD, naming, revisions, looks/variants, assets/primary portrait, candidates, sheet/angle-pack, QC/approval, and skill-driven generation. Direct generation calls the character's validated skill adapter in `prompt_only` mode and uses the existing credit boundary.

Implement explicit:

- Drama → Library publish snapshot;
- Library → Storyboard project bind;
- Library → Drama import via existing Drama owner-scoped CRUD/link APIs;
- export snapshot manifest with authorization checks;
- preview/apply sync diff with conflict resolutions.

No operation silently mutates source, deletes target on source deletion, duplicates binary media, or spends credits for asset-only import. Cross-skill use passes only explicitly selected managed references when the target adapter supports it; otherwise block with a compatibility explanation.

## 12. Shared character UI and Drama parity

Extract a shared `CharacterStockController`/presentational panel or equivalent shared hooks from `VerticalDramaCharacterStockPanel.tsx` without changing Drama's public behavior. Add owner adapters:

- `DramaSeriesCharacterOwnerAdapter`: existing series tRPC and flags;
- `SkillStoryboardCharacterOwnerAdapter`: library/project APIs and revision bindings.

The new Characters tab must expose the same capability set as the Drama surface when enabled: search/select/create/edit name/profile/DNA/role, archive/delete/dependent checks, looks/variants, asset/reference/primary portrait, candidates, generation/regeneration, sheets/angle packs, lightbox, QC/approval, casting/speech/voice fields under flags, and twin/merge/relation review where supported.

New wizard character flow creates a reusable library record from identity-relevant input when selected; resulting storyboard images remain candidate/story references until explicit promotion. Auto names are deterministic and editable without changing `characterKey`.

## 13. Full-screen wizard UI

Create `StoryboardSkillFrameworkPage` and focused components for:

- project type menu/route entry;
- brief/story type form;
- compatible skill picker/schema loading;
- dynamic skill form with parent field bindings;
- managed reference picker 0–5;
- image/video model selection and conditional quality;
- project character/library selection and save-new-character choice;
- estimate/one-confirmation summary;
- run progress, per-shot states, cancel/retry;
- project tabs and Run details.

Use existing design tokens/components and current Storyboard Review visual language. Do not add an Astryx reset globally. Use i18n keys in both Thai and English locales; no hardcoded user-facing copy in new components.

### UI/UX contract

- Target user/JTBD: creator turns one idea into a continuous vertical storyboard and reuses a recognizable character.
- States: loading/empty/disabled/selected/invalid/dirty/queued/running/succeeded/partial/failed/retry/conflict/source-unavailable.
- Responsive: 390×844 mobile, 768×1024 tablet, 1366×768 laptop, 1440×900 desktop, 1920×1080 wide desktop, and 320×800 small mobile.
- Accessibility: labels/error association, keyboard stepper/select/upload/tabs/dialogs, focus trap/restore, `aria-live` progress, non-color status, WCAG AA contrast, reduced motion.
- Copy: Thai-first labels for 2–12, 10 seconds, optional 0–5 refs, conditional quality, one confirmation, stage status, retry, and snapshot import semantics; English fallback keys required.
- Browser evidence: New Blank regression, wizard route, dynamic Cute Child fields, 0/5 refs, quality hidden/shown, N=2/9/12, three story types, one confirmation, partial retry, Characters parity/interop, and responsive/a11y surfaces.

## 14. Test plan by implementation section

Every section writes tests before implementation where practical and leaves no import-error-only failures.

- Contracts: boundary validation, normalization, exact-N, story/dialogue, redaction, fingerprints.
- Registry: compatible filter, aliases/version, nested schemas, parent field exclusion, canonical output.
- Persistence: migration static/schema tests, owner/index/FK/idempotency constraints, revision immutability.
- Services/orchestrator: planner mappings, stage transitions, bounded concurrency, worker resume, cancel, retries, projection recovery.
- API/billing: auth/tenant/media ownership, preview has no provider call, one confirmation, model quality allowlist, duplicate request, settlement.
- Character backend: CRUD/look/assets/candidates/generation, auto-name, revision/binding, import/export/conflict/source deletion.
- Character UI: Drama regression, Storyboard parity, flags, candidate promotion, name editing, import conflict.
- Wizard/review: route order, dynamic form, uploads, model quality, N counts, story types, progress, current Review task compatibility.
- Browser: Playwright user-visible selectors plus axe scan where available and manual focus/keyboard evidence.

## 15. Feature flags and rollout

Use the flags in the source spec. Roll out additive schema/services first, then registry/schema read, estimate-only wizard, internal paid run, Characters tab, interop, and gradual tenant enablement. Keep a kill switch that disables only the new action while manual Storyboard and Drama remain available.

## 16. Implementation order and section dependencies

1. Section 01 — shared contracts and test fixtures.
2. Section 02 — skill registry/schema/model capability adapters.
3. Section 03 — additive database schema/migration and persistence repositories (serial DB writer).
4. Section 04 — project/draft/run lifecycle and durable stage state.
5. Section 05 — planner, skill runner, Image Core handoff, video prompt builder.
6. Section 06 — Review projection and existing route/task compatibility.
7. Section 07 — Character Library backend/revisions/interop.
8. Section 08 — shared character UI extraction and Drama adapter regression.
9. Section 09 — Skill Framework wizard/project tabs/progress UI and localization.
10. Section 10 — cross-section integration, browser evidence, rollout gates, and final repair.

Sections 01–02 can be read/planned independently but implementation is kept sequential in the standard light runtime. Section 03 must not run in parallel with another schema writer. Sections 04–06 depend on 01–03. Sections 07–09 depend on contracts and persistence; 08 must preserve Drama before 09 exposes the new tab. Section 10 is final integration.

## 17. Definition of done

- all ten implementation sections complete and documentation updated;
- focused tests pass for each section; relevant app typecheck/build and test results recorded separately;
- browser evidence meets §13 UI contract where credentials/runtime permit;
- migration and worker/provider/billing gates are explicitly passed or named as external residual gates;
- implementation/spec audit runs at least 20 rounds after all fixes, with no unresolved MUST_FIX gap;
- no unrelated dirty-worktree changes reverted and no commit made unless requested.
