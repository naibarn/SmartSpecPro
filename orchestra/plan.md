# Orchestra Plan

## Task
Audit whether the `smartaihub.app` public tenant is SEO-ready and supports LLM/AI search discovery well.

## Classification
- scope: medium
- risk: low
- affected_domains: public site SEO, tenant SEO metadata, sitemap/robots, AI visibility
- estimated_file_count: 6
- chosen_route: installed-skill-flow
- task_summary: Read-only SEO/GEO/AEO audit for the public SmartAIHub tenant.
- bug_route: false

## Task Classification
- Scope: medium
- Risk: low
- Affected domains: public site SEO, tenant SEO metadata, sitemap/robots, AI visibility
- Estimated file count: 6
- Chosen route: installed-skill-flow using `seo-audit`
- Bug route: false
- Classification notes: The request is an audit/check rather than an implementation request. It spans code-level tenant SEO plumbing and production/public URL signals, but does not require code changes unless findings are later approved.

## Activation Decision
- Orchestra owns the workflow because the task requires repository discovery, external/public URL verification, and specialized SEO skill routing.
- `seo-audit` is the selected installed skill because the request specifically concerns SEO, GEO, AEO, and LLM search visibility.
- SocratiCode is active and was used before broad file reads.

## Discovery Notes
- SocratiCode status: green, indexed chunks available, watcher active.
- Candidate files/surfaces:
  - `apps/web/client/src/components/SEOHead.tsx`
  - `apps/web/server/routers/tenant.ts`
  - `apps/web/server/routers/publicSitemap.ts`
  - `apps/web/drizzle/schema.ts`
  - `apps/web/scripts/seed-smartaihub-public-pages.ts`
  - `specs/quick/021-smartaihub-content-factory/*`

## Blast Radius
- Directly changed files: none planned for product code.
- Dependent files/tests: none required for read-only audit.
- Risk-sensitive surfaces: public crawler access, tenant resolution by hostname, dynamic metadata rendering, sitemap completeness.
- Confidence: medium; production HTML and crawler-facing behavior still need URL checks.

---

## Task
Improve the Media History page UI immediately based on the prior review.

## Task Classification
- Scope: medium
- Risk: low
- Affected domains: frontend React UI, media history workflow, i18n copy
- Estimated file count: 3
- Chosen route: visual-ui-flow inline implementation
- Bug route: false
- Classification notes: The task is a user-facing UI workflow improvement. SocratiCode narrowed the blast radius to `MediaHistory.tsx` plus locale files; no backend contract change is planned.

## Activation Decision
- Explicit `$orchestra` invocation from Thai user request.
- Visual UI workflow applies because the request asks to improve the route-level UI and states.
- SocratiCode active: green index, 85645 chunks, watcher active.

## Impact Preflight
- Directly changed files:
  - `apps/web/client/src/pages/MediaHistory.tsx`
  - `apps/web/client/src/locales/en/media.json`
  - `apps/web/client/src/locales/th/media.json`
- Dependent files/tests:
  - `apps/web/client/src/pages/MediaHistory.compile.test.tsx`
  - app-wide TypeScript check
- Risk-sensitive surfaces: user-visible media task browsing only; no auth, tenant isolation, DB, tRPC router, or backend API shape changes.
- Least-impact option chosen: use existing `listTasks` limit/offset for pagination and client-side search on the loaded page rather than adding a new backend search contract.

---

## Task
Improve the Dashboard UI with useful, premium graphics and user-actionable signals.

## Task Classification
- Scope: medium
- Risk: low
- Affected domains: frontend React UI, analytics summary presentation, media task status presentation, i18n copy
- Estimated file count: 3
- Chosen route: orchestra inline implementation using existing Dashboard data
- Bug route: false
- Classification notes: The requested work is a UI/UX enhancement. The suitable solution is frontend-only because the Dashboard already has credit analytics, time-series usage, workflow, approval, and media task data available.

## Impact Preflight
- Directly changed files:
  - `apps/web/client/src/pages/Dashboard.tsx`
  - `apps/web/client/src/locales/en/dashboard.json`
  - `apps/web/client/src/locales/th/dashboard.json`
- Dependent files/tests:
  - `apps/web/client/src/pages/__tests__/Dashboard.test.tsx`
  - `apps/web/client/src/i18n/__tests__/wave1-dashboard-common.test.ts`
  - app-wide TypeScript check
- Risk-sensitive surfaces: authenticated Dashboard route only; no backend API, tenant, auth, DB, or analytics contract changes.
- Least-impact option chosen: upgrade the existing Trend & Health section into an executive signal panel using current data instead of adding a charting dependency or new backend aggregate endpoint.

---

## Task
Review completeness, recommended additions, and highest-security posture for the current uncommitted SmartAIHub changes.

## Task Classification
- Scope: medium
- Risk: high
- Affected domains: frontend UI, public SEO routes, prerender snapshots, static public assets, i18n, dependency/security posture, production headers
- Estimated file count: 20+
- Chosen route: installed-skill-flow using `security-audit`, `secret-scanner`, `health-check`, and inline Orchestra review
- Bug route: false
- Classification notes: The request is a broad audit and hardening review across existing uncommitted changes. Risk is high because security posture, public crawler routes, and production-facing headers are explicitly in scope, even though this pass is read-only unless remediation is separately requested.

## Review Preflight
- SocratiCode status: green, 85653 chunks, watcher active, code graph present.
- Dirty worktree is expected from prior SEO, Media History, Dashboard, and help work; this review will not revert or overwrite user changes.
- Security-sensitive surfaces to inspect:
  - `apps/web/server/routers/publicSitemap.ts`
  - `apps/web/server/services/publicSeoPrerender.ts`

---

## Task
Add an Article Builder mode that generates each slide as a full-slide image using the selected media image model, then imports image-only slides.

## Task Classification
- Scope: medium
- Risk: medium
- Affected domains: frontend React workflow, Article Builder persisted draft state, media generation prompts, presentation slide JSON import, i18n copy, editor tests
- Estimated file count: 4
- Chosen route: multi-agent-waves executed inline by Orchestra conductor
- Bug route: false
- Classification notes: Explicit `$orchestra` invocation. The task is a concrete user-facing feature in an existing flow, not a new standalone module. It spans UI state, media generation behavior, slide JSON construction, and tests/locales, but does not require a new backend API or database migration.

## Activation Decision
- Orchestra owns the workflow because the user explicitly invoked `$orchestra` and asked to implement end-to-end.
- Brainstorming/design preflight was already completed in the previous user turn; the user approved by saying to implement.
- SocratiCode is active and was used before broad source reads.

## Impact Preflight
- Directly changed files planned:
  - `apps/web/client/src/components/presentation/PresentationArticleGeneratorDialog.tsx`
  - `apps/web/client/src/locales/en/presentation.json`
  - `apps/web/client/src/locales/th/presentation.json`
  - `apps/web/client/src/pages/PresentationEditor.test.tsx`
- Dependent files/tests:
  - app-wide TypeScript check
  - targeted Presentation Editor Article Builder tests where harness permits
- Risk-sensitive surfaces: browser-visible workflow, media credit-consuming action, generated slide import payload. No auth, RBAC, tenant isolation, DB schema, or public API contract changes planned.
- Least-impact option chosen: implement full-slide image mode entirely in the existing Article Builder client workflow using the existing async media generation mutation and local generated slide JSON builder.
  - `apps/web/server/_core/vite.ts`
  - `apps/web/client/src/pages/MediaHistory.tsx`
  - `apps/web/client/src/pages/Dashboard.tsx`
  - `apps/web/docs/help/*/media-history.md`
  - static public discovery files under `apps/web/public/`
- Quality/security gates planned: typecheck, targeted tests from previous waves, dependency audit, bundled secret scan, OWASP pattern scan, production header/crawler probes where reachable.

---

## Task
Plan a practical fix for the Admin Skills maintenance apply failure shown for `intelligence-skill-creator`.

## Task Classification
- Scope: medium
- Risk: medium
- Affected domains: admin maintenance UI, tRPC skills router, skill upgrade applier, Skill Studio launch, ISC Python runtime, proposal application
- Estimated file count: 9
- Chosen route: quick-plan-chain
- Bug route: true
- Classification notes: The screenshot is an error report for a maintenance apply run. The fix is plan-worthy because the likely root cause crosses async task state, Python entrypoint path resolution, proposal format handling, and admin recovery UX.

## Activation Decision
- Explicit `$orchestra` invocation from Thai user request.
- `deep-plan-quick` applies because the user asked for an executable plan and the task is medium scope but not full feature-scale.
- SocratiCode active: green index, 85653 chunks, watcher active.

## Impact Preflight
- Directly planned files:
  - `apps/web/server/services/skillExecutor.ts`
  - `apps/web/server/services/skillStudioService.ts`
  - `apps/web/server/services/skillUpgradeApplier.ts`
  - `apps/web/server/routers/skills.ts`
  - `apps/web/client/src/pages/AdminSkills.tsx`
  - `apps/web/skills/intelligence-skill-creator/python/skill.py`
  - `apps/web/skills/intelligence-skill-creator/isc/runner.py`
- Dependent tests:
  - `apps/web/server/services/__tests__/skillExecutor.sandbox.test.ts`
  - `apps/web/server/services/__tests__/skillUpgradeApplier.test.ts`
  - `apps/web/server/routers/__tests__/skills.legacy-upgrade-queue.test.ts`
  - `apps/web/client/src/pages/__tests__/AdminSkills.test.tsx`
  - `apps/web/skills/intelligence-skill-creator/tests/test_runner_paths.py`
- Risk-sensitive surfaces: admin-only maintenance mutations, file path containment, proposal application, skill file writes, async run state.
- Least-impact option chosen: fix runtime path/proposal/state contracts first, then expose clearer admin recovery; do not redesign the maintenance lifecycle or mutate historical rows outside existing admin actions.

## Planning Artifact
- `specs/quick/024-skill-maintenance-apply-failure/request.md`
- `specs/quick/024-skill-maintenance-apply-failure/research-notes.md`
- `specs/quick/024-skill-maintenance-apply-failure/decision-log.md`
- `specs/quick/024-skill-maintenance-apply-failure/implementation-plan.md`
- `specs/quick/024-skill-maintenance-apply-failure/implementation-plan-tdd.md`
- `specs/quick/024-skill-maintenance-apply-failure/sections/index.md`

---

## Task
Implement the quick plan for the Admin Skills maintenance apply failure affecting `intelligence-skill-creator`.

## Task Classification
- Scope: medium
- Risk: medium
- Affected domains: admin maintenance UI, tRPC skills router, Skill Studio proposal apply, upgrade applier finalization, Python ISC workspace runner, Vitest setup
- Estimated file count: 15
- Chosen route: orchestra inline implementation from `specs/quick/024-skill-maintenance-apply-failure`
- Bug route: true
- Classification notes: The requested implementation crosses runtime path resolution, safe file writes, async task completion semantics, and admin diagnostics. The implementation keeps the existing maintenance lifecycle and adds narrow contract fixes rather than redesigning the flow.

## Implementation Waves
- Wave 1: Runtime path hygiene for `intelligence-skill-creator`, preventing copied workspace paths from becoming the active runtime root.
- Wave 2: Proposal and finalization contract fixes, including JSON proposal support, `.meta.json` exclusion, path containment checks, no-change completion handling, and workspace-root failure metadata.
- Wave 3: Admin recovery and verification, including diagnostics in the maintenance table, retry compatibility, targeted tests, and TypeScript checks.

## Impact Preflight
- SocratiCode status: green, watcher active.
- SocratiCode impact for `apps/web/server/services/skillStudioService.ts` found direct dependents in `skills.ts`, `workpack.ts`, `liveBrowserGateway.ts`, `skillUpgradeApplier.ts`, and `workpackLearningService.ts`; impacted targeted tests were included in verification.
- Existing dirty worktree contained unrelated SEO, dashboard, media, and security changes; this implementation did not revert or rewrite unrelated changes.

## Quality Gates
- Python ISC runner path tests.
- Targeted Vitest suites for Skill Studio proposal apply, upgrade applier finalization, skills legacy upgrade queue, Admin Skills UI, and skill executor sandbox behavior.
- Combined targeted Vitest gate for the main changed surfaces.
- `npm --prefix apps/web run check`.

---

## Task
Improve the Admin Skills maintenance page after user reported remaining error visibility, missing timestamps, unclear pending skill status, and incomplete UI.

## Task Classification
- Scope: medium
- Risk: medium
- Affected domains: Admin Skills maintenance UI, i18n copy, frontend tests
- Estimated file count: 4
- Chosen route: orchestra inline UI/bug refinement
- Bug route: true
- Classification notes: The remaining issue is primarily operator experience around historical failed apply runs and maintenance queue visibility. The backend already returns timestamps and diagnostic fields, so the least-impact path is to expose them clearly in the maintenance UI and harden display defaults.

## Impact Preflight
- SocratiCode status: green, watcher active.
- SocratiCode narrowed the main surface to `apps/web/client/src/pages/AdminSkills.tsx` with supporting locale and test files.
- SocratiCode impact for `AdminSkills.tsx`: no downstream callers.
- SocratiCode impact for `apps/web/server/routers/skills.ts`: one directly impacted router test; no backend code change was needed in this pass.

## Implementation Plan
- Add a maintenance overview row showing pending skills, safe actions ready, queued/running apply jobs, attention-needed items, and latest activity time.
- Add explicit date/time columns to the maintenance recommendation table and queued apply-run monitor.
- Keep workspace-root failures visible as retryable historical diagnostics rather than hiding or normalizing them as no-change success.
- Normalize partial apply-run count objects to zero defaults so the UI never renders `NaN`.
- Update bilingual copy and AdminSkills tests.

---

## Task
Evaluate feasibility of a non-default Presentation Builder option that generates each slot as two layers: a realistic/background image layer and a green-screen text overlay layer suitable for video compositing.

## Task Classification
- Scope: medium
- Risk: low
- Affected domains: Presentation Builder UX, media generation prompt planning, slide JSON/import, Presentation Editor render pipeline, MP4 export pipeline
- Estimated file count: 0 changed / 8-12 likely affected if implemented
- Chosen route: orchestra read-only feasibility analysis
- Bug route: false
- Classification notes: The user explicitly requested analysis only, with no code changes. The feature is cross-domain but can be evaluated against existing primitive slide elements and export paths.

## Impact Preflight
- SocratiCode status: green, watcher active.
- Candidate implementation surfaces:
  - `apps/web/client/src/components/presentation/PresentationArticleGeneratorDialog.tsx`
  - `apps/web/shared/presentation/contracts.ts`
  - `apps/web/shared/presentation/generatedSlideImportability.ts`
  - `apps/web/client/src/pages/PresentationEditor.tsx`
  - `apps/web/server/routes/slideRender.ts`
  - `apps/web/server/services/presentationPlaybackExport.ts`
  - `apps/web/server/services/presentationExportDegradation.ts`
  - `python-backend/app/tasks/presentation_render.py`
- Current architecture already supports layered `image`, `text`, `rect`, and `video` primitives plus MP4 dynamic capture, so the feasibility risk is mostly product/output-quality rather than data-model feasibility.
