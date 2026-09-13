# TDD implementation plan — Feature 185

Testing uses the existing `apps/web` Vitest configuration and Playwright setup. Tests are written before or alongside each implementation section, use mocked providers/media/credits in CI, and never spend real credits. Each test below is a required behavior stub, not an implementation.

## 1. Implementation objective

- Test the acceptance matrix for New Skill Framework without altering the existing New Blank flow.
- Test the complete 2–12 shot, 10-second, image-prompt/video-prompt, character-library, and interop contract through unit, service, API, component, and browser boundaries.

## 2. Non-negotiable contracts

- Accept N=2/9/12 and reject N=1/13/non-integer/negative/string.
- Accept only `shotDurationSec=10` and calculate `totalShots * 10`.
- Accept only `mime`, `dialogue`, `hybrid` and enforce each dialogue/audio rule.
- Preserve complete `generation_request` and exact prompt equality.
- Reject unsupported aspect ratio, quality, model, references, and skill capabilities.
- Assert one confirmation/idempotency key cannot reserve or enqueue twice.

## 3. Current system and integration strategy

- Component regression test: existing New Blank button still calls the current manual draft path and six-task behavior.
- Route test: `/storyboard-review/new/skill-framework` resolves before `/storyboard-review/:reviewId`.
- Projection compatibility test: legacy manual review data remains readable and new framework data maps to current task fields.
- Drama regression test: existing Character Stock Panel props/feature flags/actions remain behaviorally unchanged.

## 4. Proposed files and ownership

- Assert each new contract/service/router/UI file has focused tests in the same layer or its established `__tests__` location.
- Assert no test fixture imports real provider credentials or depends on unrelated dirty files.
- Add migration/schema test only for the feature-owned tables/indexes; do not rewrite existing schema tests.

## 5. Shared types and validation

- Boundary schema tests for every global input constraint and normalized default.
- Test stable confirmation fingerprint for equivalent input ordering and changed fingerprint for meaningful changes.
- Test redaction removes secrets/private URLs while retaining logical asset IDs.
- Test exact planner shot shape and structured `DialogueLine` validation.
- Test stage/status unions reject impossible transitions.

## 6. Durable persistence design

- Static migration tests assert all feature tables, owner columns, foreign keys, revision uniqueness, active project binding uniqueness, and idempotency indexes.
- Assert migration is additive/idempotent and contains no `DROP TABLE`, `TRUNCATE`, or destructive backfill.
- Repository/service tests assert project creation before run, one active run, archive retention, immutable revision insert, and source asset non-duplication.
- Test run/shot records retain original/effective generation requests, error metadata, dialogue, and model/schema snapshots.

## 7. Skill registry and dynamic schema

- List test returns only compatible visible skills and excludes invalid category/capability/schema bundles.
- Alias test maps Cute Child hyphen slug, underscore ID, package identity, and v3.0.0 consistently.
- Nested imported schema test resolves `imported/schemas/ui.schema.json` and `input.schema.json` deterministically.
- Schema hash changes when schema changes and is retained by a run.
- Dynamic form test excludes parent-owned idea/reference/aspect fields and renders allowed field types/dependencies.
- Test arbitrary component/script metadata is not executed.
- Canonical response tests require `success`, `generation_prompt`, and `generation_request.prompt`.

## 8. Project/run services and orchestration

### Project/draft

- Create/update/archive/get project and draft ownership tests.
- Idempotent create test returns the same project/run for a repeated key.
- Active-run guard test blocks concurrent runs and allows a new run only after terminal prior state.

### Planner

- Snapshot tests or contract tests cover every N=2 through N=12 mapping.
- Test exact shot numbering, no duplicate/missing shots, 10-second duration, continuity links, and story-type dialogue rules.
- Test planner failure prevents provider calls.

### Stage execution

- Test ordered stage progression planning → prompt → image → video prompt → projection.
- Test prompt call receives per-shot context and selected skill/version.
- Test the ImageGenerationCore handoff preserves full payload and prompt byte equality.
- Test bounded concurrency and result ordering by shot number.
- Test one shot failure does not rerun or erase other successful shots.

### Recovery

- Test worker restart/resume from persisted stage and duplicate delivery idempotency.
- Test cancellation before dispatch and cancel-request after dispatch.
- Test retry only failed stage/shot with a new attempt and no duplicate settlement.
- Test projection failure becomes `projection_pending`; rebuild creates no duplicate tasks.

## 9. Billing/model/media integration

- Estimate test proves no paid provider call.
- Confirmation test validates fingerprint, model access, tenant/media ownership, quality/options, reference cap, and credits before enqueue.
- Test exactly one job-level confirmation for an image run; direct character generation uses its existing separate action boundary.
- Test reserve/settle/refund keys by run/shot/attempt and duplicate confirmation is a no-op.
- Test GPT Image 2.5 quality appears only when configured, including xhigh; unsupported quality is rejected server-side.
- Test provider URL resolution accepts managed asset IDs only and rejects local/private/unowned references.

## 10. Review projection and existing Storyboard compatibility

- Test projection creates 2, 9, and 12 current-compatible tasks with ordered image/video/dialogue fields.
- Test rebuild/upsert is idempotent and does not overwrite fresher manual/task data outside the feature namespace.
- Test `reviewData.skillFramework` carries project/run/skill/schema/model metadata and extra params for retries.
- Test a projection failure leaves run recoverable and manual review routes unchanged.

## 11. Character Library backend and interoperability

- CRUD/name/auto-name/alias tests, including immutable `characterKey`.
- Look/variant/asset/primary portrait/candidate/sheet/angle/QC tests.
- Direct character generation test routes through the selected skill adapter and existing credit boundary.
- Revision test proves updates append immutable revision snapshots.
- Drama publish, library use, Drama import, export manifest, sync preview/apply, conflict, source archive/delete, and cross-skill mismatch tests.
- Assert imports link existing `media_assets` and never invoke generation or overwrite the source.
- Assert every procedure rejects cross-tenant/user/project/series/media access.

## 12. Shared character UI and Drama parity

- Drama adapter regression covers existing CRUD, looks, assets, candidates, sheet/angle, flags, polling, credit dialog, and merge/recovery behavior.
- Storyboard adapter covers the same available capability surface and project binding revision display.
- Test name edit changes display name only; character key/lineage stay stable.
- Test wizard-created shot image is candidate/story reference, not automatic approved primary portrait.
- Test import conflict dialog is keyboard accessible and does not mutate before resolution.

## 13. Full-screen wizard UI

- Route/menu test proves New Blank remains unchanged and framework opens full-screen.
- Dynamic schema fixture test covers loading/error/required/dependency/disabled states.
- Attachment test covers 0–5, upload progress, removal, invalid files, lightbox, and model reference cap.
- Model test covers image/video selector, conditional quality, unavailable capability, and summary.
- Shot selector test covers 2/9/12 and total-duration math.
- Story type test covers mime/dialogue/hybrid and dialogue persistence after image/task updates.
- Confirmation/progress test covers one confirmation, polling, per-shot partial failure, cancel, and failed-only retry.
- Characters tab test covers pre-run availability, search, create/edit/look/candidate/asset/import/export.
- Browser/a11y tests cover 390×844, 768×1024, 1366×768, 1440×900, 1920×1080, 320×800, keyboard/focus, labels, live status, contrast, and reduced motion.

## 14. Test plan by implementation section

- Before closing a section, run its focused Vitest command and record exact test files/results in the section doc.
- After sections 03–06, run server/schema/projection focused suites together.
- After sections 08–09, run Drama regression and UI tests together.
- Before finalization, run `pnpm test` from `apps/web`, `pnpm check`, and relevant Playwright/browser evidence if runtime/credentials permit; classify baseline noise separately.

## 15. Feature flags and rollout

- Flag-off test proves no new entry is visible and manual/Drama paths remain available.
- Cohort/estimate-only test ensures no paid action before enablement/confirmation.
- Rollback test disables only the new action while existing reviews/characters remain readable.

## 16. Implementation order and section dependencies

- Section 01 tests are the shared contract fixtures used by later sections.
- Section 02 tests registry/schema/model prerequisites.
- Section 03 migration tests must pass before services import new tables.
- Sections 04–06 use section 01–03 fixtures/contracts.
- Sections 07–09 use persistence/contracts and must add their own owner/feature tests.
- Section 10 runs the complete cross-section suite and browser/rollout gates.

## 17. Definition of done

- Every test stub above is implemented or explicitly documented as environment-gated.
- No import-error-only test result, skipped MUST_FIX, real credit spend, or silent fallback.
- Focused suites, typecheck/build, migration, browser, provider, billing, and deployment evidence are reported separately.
